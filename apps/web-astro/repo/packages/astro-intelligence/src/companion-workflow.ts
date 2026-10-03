import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { ChartFactGraphSchema } from "@astro/astro-analysis";
import { getChartFactsTool } from "./fact-tools";
import { callRassyMind } from "./rassymind";

const TurnSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8_000) });
const InputSchema = z.object({
  graph: ChartFactGraphSchema,
  question: z.string().min(1).max(10_000),
  history: z.array(TurnSchema).max(12).default([]),
  brandId: z.string().min(1),
  sessionId: z.string().min(1)
});
const OutputSchema = z.object({
  answer: z.string().trim().min(1).max(6_000),
  factRefs: z.array(z.string()),
  toolCalls: z.array(z.string()),
  mode: z.enum(["model", "grounded-fallback"]),
  model: z.string().optional(),
  latencyMs: z.number().optional(),
  traceId: z.string().optional()
});

const brandVoices: Record<string, string> = {
  jupiterseek: "generous, curious, and practically optimistic",
  saturnseer: "patient, clear, and steady",
  saturnleo: "warm, composed, and creatively confident",
  maleficme: "candid, direct, and humane",
  oracleveil: "intimate, image-rich, and grounded"
};

const fallbackAnswer = (facts: Array<{ id: string; humanText: string }>) => {
  const details = facts.slice(0, 5).map((fact) => fact.humanText);
  return details.length
    ? `I can ground this in what your chart actually shows: ${details.join("; ")}. The symbolism can offer a useful question to sit with, but it cannot decide what these patterns mean in your life. Which part would you like to look at more closely?`
    : "I could not find chart facts that answer that yet. Try asking about a planet, an aspect, or a house shown in your chart.";
};

export function parseGroundedCompanionReply(text: string, availableFactRefs: string[]) {
  try {
    const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text) as { answer?: unknown; factRefs?: unknown };
    if (typeof parsed.answer !== "string" || !parsed.answer.trim() || parsed.answer.length > 6_000 || !Array.isArray(parsed.factRefs)) return null;
    const factRefs = [...new Set(parsed.factRefs.filter((id): id is string => typeof id === "string" && availableFactRefs.includes(id)))];
    if (!factRefs.length) return null;
    return { answer: parsed.answer.trim(), factRefs };
  } catch {
    return null;
  }
}

const companionStep = createStep({
  id: "chart-companion-grounded-answer",
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ inputData }) => {
    const tool = getChartFactsTool.execute;
    if (!tool) throw new Error("Chart fact tool is not executable.");
    const contextForRetrieval = [...inputData.history.filter((turn) => turn.role === "user").slice(-3).map((turn) => turn.content), inputData.question].join(" ");
    const evidenceResult = await tool({ graph: inputData.graph, query: contextForRetrieval }, {} as any) as { facts: Array<{ id: string; humanText: string }>; analysisVersion: string };
    const facts = evidenceResult.facts;
    const factRefs = facts.map((fact) => fact.id);
    if (!facts.length) return OutputSchema.parse({ answer: fallbackAnswer(facts), factRefs: [], toolCalls: ["get-chart-facts"], mode: "grounded-fallback" });
    const system = `You are Ask Your Chart, a personal astrology companion. Your tone is ${brandVoices[inputData.brandId] ?? "warm, precise, and humane"}. Answer the user's latest question using only the deterministic chart facts supplied by the get-chart-facts tool and the user's own recent conversation. Use the conversation to understand what they mean and what they have already said, never to invent chart facts. Be specific, emotionally intelligent, and concise. Treat astrology as symbolic reflection, never as science, diagnosis, or fixed fate. Never claim guaranteed events, infer sensitive traits, or expose birth details. If the evidence does not answer the question, say so and ask one useful follow-up. Return JSON only: {"answer": string, "factRefs": string[]}. Every reference must be selected from supplied fact IDs.`;
    try {
      const response = await callRassyMind({
        lane: "rassy-mind",
        sessionId: inputData.sessionId,
        system,
        prompt: JSON.stringify({
          question: inputData.question,
          recentConversation: inputData.history.slice(-10),
          selectedChartFacts: facts,
          analysisVersion: evidenceResult.analysisVersion
        }),
        deadlineMs: 45_000,
        maxTokens: 512,
        structuredOutput: false
      });
      const grounded = parseGroundedCompanionReply(response.text, factRefs);
      if (!grounded) throw new Error("The model reply did not include valid chart fact references.");
      return OutputSchema.parse({ ...grounded, toolCalls: ["get-chart-facts"], mode: "model", model: response.model, latencyMs: response.latencyMs, traceId: response.traceId });
    } catch {
      return OutputSchema.parse({ answer: fallbackAnswer(facts), factRefs: factRefs.slice(0, 8), toolCalls: ["get-chart-facts"], mode: "grounded-fallback" });
    }
  }
});

export const chartCompanionV1Workflow = createWorkflow({
  id: "chart-companion-v1",
  description: "Answer a user's chart question with deterministic fact retrieval and bounded, private conversation context.",
  inputSchema: InputSchema,
  outputSchema: OutputSchema
}).then(companionStep).commit();
