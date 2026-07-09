import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BRANDS } from "@astro/brands";
import { callLLM } from "@astro/reading-core";
import { ApiError, sendApiError } from "../lib/http-errors";
import { enforceRateLimit } from "../lib/rate-limit";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000)
});

const ChatBodySchema = z.object({
  brandId: z.enum(["jupiterseek", "saturnseer", "saturnleo", "maleficme", "oracleveil"]),
  messages: z.array(MessageSchema).min(1).max(12)
});

const ChatUiSchema = z.object({
  mood: z.enum(["wonder", "clarity", "devotion", "discipline", "revelation"]).catch("wonder"),
  palette: z.enum(["dawn", "ember", "nocturne", "verdant", "gold"]).catch("dawn"),
  motion: z.enum(["still", "pulse", "orbit"]).catch("pulse"),
  density: z.enum(["focused", "layered", "deep"]).catch("layered"),
  activeCapability: z
    .enum(["rassy-chat", "birth-chart", "human-guide", "esoterica-memory", "weekly-grimoire", "compatibility", "source-trace"])
    .catch("rassy-chat")
});

const ChatResponseSchema = z.object({
  reply: z.string().min(1),
  ui: ChatUiSchema,
  quickActions: z.array(z.string().min(1).max(90)).max(4).catch([])
});

const CAPABILITIES = [
  "rassy-chat: conversational guide, reflection, and practical next steps",
  "birth-chart: date, time, place chart calculation with signs, houses, aspects, retrogrades",
  "human-guide: source-grounded long-form internal map from the chart",
  "esoterica-memory: retrieval from the app's indexed spiritual and astrology corpus",
  "weekly-grimoire: saved chart, saved readings, and recurring follow-up writing",
  "compatibility: two-chart relational analysis",
  "source-trace: visible model/provider metadata and provenance-aware behavior"
].join("\n");

const fallbackReply = (brandName: string, prompt: string) => ({
  reply:
    `I am listening through ${brandName}. The live RassyGPT route is warming up, so I will keep the thread grounded for a moment.\n\n` +
    `You asked: "${prompt.slice(0, 240)}"${prompt.length > 240 ? "..." : ""}\n\n` +
    "The useful next move is to give me either your birth data, a chart question, or a life-pattern question. I can move from conversation into the birth chart, Human Guide, esoterica memory, weekly grimoire, or compatibility work without making you leave the thread.",
  ui: {
    mood: "clarity" as const,
    palette: "dawn" as const,
    motion: "pulse" as const,
    density: "focused" as const,
    activeCapability: "rassy-chat" as const
  },
  quickActions: [
    "Help me start with my birth data.",
    "Explain what my chart can reveal.",
    "Show me the Human Guide path."
  ]
});

const buildPrompt = (brandId: keyof typeof BRANDS, messages: Array<{ role: "user" | "assistant"; content: string }>) => {
  const brand = BRANDS[brandId];
  const transcript = messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");

  return [
    `Brand: ${brand.name}`,
    `Brand tone keywords: ${brand.toneKeywords.join(", ")}`,
    `Avoid: ${brand.tabooList.join(", ")}`,
    "",
    "Available RassyGPT/RassyCodex capabilities:",
    CAPABILITIES,
    "",
    "Conversation:",
    transcript,
    "",
    "Respond as the visible RassyGPT/RassyCodex guide inside an astrology platform. Keep it personal, vivid, practical, and spiritually thoughtful without promising certainty. If the user is ready for chart work, guide them toward birth data. If they ask a reflective question, answer directly. Always make the chat feel like the central interface.",
    "",
    "Return only JSON in this shape:",
    `{"reply":"2-5 short paragraphs","ui":{"mood":"wonder|clarity|devotion|discipline|revelation","palette":"dawn|ember|nocturne|verdant|gold","motion":"still|pulse|orbit","density":"focused|layered|deep","activeCapability":"rassy-chat|birth-chart|human-guide|esoterica-memory|weekly-grimoire|compatibility|source-trace"},"quickActions":["short next action", "..."]}`
  ].join("\n");
};

export const rassyChatRoutes = async (app: FastifyInstance) => {
  app.post("/", async (request, reply) => {
    const limited = await enforceRateLimit({
      request,
      reply,
      scope: "rassy-chat",
      max: Number(process.env.RASSY_CHAT_RATE_LIMIT_MAX ?? 30),
      windowMs: Number(process.env.RASSY_CHAT_RATE_LIMIT_WINDOW_MS ?? 60_000)
    });
    if (limited) return limited;

    const parsed = ChatBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(
        reply,
        request.id,
        new ApiError("BAD_REQUEST", "Invalid chat payload.", {
          statusCode: 400,
          issues: parsed.error.issues
        }),
        request.log
      );
    }

    request.brandId = parsed.data.brandId;
    const brand = BRANDS[parsed.data.brandId];
    const latestUserMessage = [...parsed.data.messages].reverse().find((message) => message.role === "user");
    const system =
      "You are RassyGPT/RassyCodex as a warm, agentic astrology guide. You control a small set of UI atmosphere knobs through structured JSON. You are not a fortune teller; you are a reflective interface for chart calculation, source-grounded guidance, memory retrieval, and practical self-inquiry.";

    try {
      const llm = await callLLM(system, buildPrompt(parsed.data.brandId, parsed.data.messages), {
        maxTokens: 900,
        temperature: 0.8,
        timeoutMs: Number(process.env.RASSY_CHAT_LLM_TIMEOUT_MS ?? 12_000)
      });

      if (!llm.content) {
        return {
          ...fallbackReply(brand.name, latestUserMessage?.content ?? ""),
          meta: {
            provider: llm.provider,
            model: llm.model,
            usedFallback: true
          },
          requestId: request.id
        };
      }

      const raw = JSON.parse(llm.content);
      const safe = ChatResponseSchema.parse(raw);
      return {
        ...safe,
        meta: {
          provider: llm.provider,
          model: llm.model,
          usedFallback: false
        },
        requestId: request.id
      };
    } catch (error) {
      request.log.warn({ error, requestId: request.id }, "Rassy chat response fell back.");
      return {
        ...fallbackReply(brand.name, latestUserMessage?.content ?? ""),
        meta: {
          provider: "fallback",
          model: "fallback",
          usedFallback: true
        },
        requestId: request.id
      };
    }
  });
};
