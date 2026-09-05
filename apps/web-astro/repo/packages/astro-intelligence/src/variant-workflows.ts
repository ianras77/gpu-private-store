import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { SynastryFactGraphSchema, TimingFactGraphSchema } from "@astro/astro-analysis";
import { AstrologyReportArtifactSchema, type AstrologyReportArtifact } from "./workflow-schemas";
import { callRassyMind } from "./rassymind";

const BaseInput = z.object({ reportId: z.string(), runId: z.string(), brandId: z.string(), sessionId: z.string(), chartHash: z.string(), astrologyProfile: z.string().default("modern-reflective") });
const CompatibilityInput = BaseInput.extend({ synastry: SynastryFactGraphSchema });
const WeeklyInput = BaseInput.extend({ timing: TimingFactGraphSchema, weekLabel: z.string().min(1) });

const artifact = (input: z.infer<typeof BaseInput>, kind: "compatibility" | "weekly", title: string, body: string, refs: string[], workflowVersion: string): AstrologyReportArtifact => AstrologyReportArtifactSchema.parse({
  schemaVersion: "1.0.0", reportVersion: workflowVersion, reportId: input.reportId, runId: input.runId, kind, depth: "standard", brandId: input.brandId,
  chart: { chartHash: input.chartHash, calculationVersion: "0.2.0", analysisVersion: "1.0.0", astrologyProfile: input.astrologyProfile, timeConfidence: "exact" },
  cover: { title, subtitle: "A grounded interpretation of deterministic astrology facts", excerpt: body.slice(0, 240) },
  navigation: [{ key: "synthesis", title, group: kind, order: 0 }],
  sections: [{ key: "synthesis", title, body: [body], factRefs: refs, loreRefs: [], confidence: "conditional", uncertaintyNotes: [], status: "complete" }],
  practicalIntegration: { reflections: [], practices: [], questions: [] },
  provenance: { chartFactGraphVersion: "1.0.0", workflowVersion, brandVoiceVersion: "1.0.0", generatedAt: new Date().toISOString(), models: ["rassy-mind"] },
  disclaimer: "Astrology is a symbolic language for reflection, not a deterministic scientific claim."
});

const compatibilityStep = createStep({ id: "compatibility-synthesis", inputSchema: CompatibilityInput, outputSchema: AstrologyReportArtifactSchema, execute: async ({ inputData }) => {
  const refs = inputData.synastry.facts.slice(0, 24).map((fact) => fact.id);
  try {
    const response = await callRassyMind({ lane: "rassy-mind", sessionId: inputData.sessionId, system: "Interpret only supplied synastry facts. Preserve Person A/Person B direction. Never declare destiny, abuse, betrayal, or guaranteed outcomes. Return concise reflective prose.", prompt: JSON.stringify({ task: "balanced compatibility synthesis", personOrder: "Person A then Person B", facts: inputData.synastry.facts }), deadlineMs: 45_000 });
    return artifact(inputData, "compatibility", "Relationship pattern", response.text, refs, "compatibility-v1");
  } catch { return artifact(inputData, "compatibility", "Relationship pattern", "The relationship facts are available for a grounded interpretation when the model service is available.", refs, "compatibility-v1"); }
}});

const weeklyStep = createStep({ id: "weekly-transit-synthesis", inputSchema: WeeklyInput, outputSchema: AstrologyReportArtifactSchema, execute: async ({ inputData }) => {
  const refs = inputData.timing.activations.map((activation) => activation.id);
  try {
    const response = await callRassyMind({ lane: "rassy-mind", sessionId: inputData.sessionId, system: "Interpret only supplied transit facts and dates. Do not invent dates or claim certainty. Return reflective weekly guidance.", prompt: JSON.stringify({ task: "weekly transit reflection", week: inputData.weekLabel, timingFacts: inputData.timing.activations }), deadlineMs: 45_000 });
    return artifact(inputData, "weekly", `Week of ${inputData.weekLabel}`, response.text, refs, "weekly-transit-v1");
  } catch { return artifact(inputData, "weekly", `Week of ${inputData.weekLabel}`, "The deterministic transit window is available for a grounded interpretation when the model service is available.", refs, "weekly-transit-v1"); }
}});

export const compatibilityV1Workflow = createWorkflow({ id: "compatibility-v1", description: "Synthesize deterministic synastry facts without changing Person A/Person B ordering.", inputSchema: CompatibilityInput, outputSchema: AstrologyReportArtifactSchema }).then(compatibilityStep).commit();
export const weeklyTransitV1Workflow = createWorkflow({ id: "weekly-transit-v1", description: "Interpret a deterministic transit window with date and uncertainty grounding.", inputSchema: WeeklyInput, outputSchema: AstrologyReportArtifactSchema }).then(weeklyStep).commit();
