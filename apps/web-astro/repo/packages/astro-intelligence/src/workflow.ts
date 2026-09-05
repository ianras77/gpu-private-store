import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { ChartFactGraphSchema } from "@astro/astro-analysis";
import { AstrologyReportArtifactSchema, LifeHandbookPlanSchema, type AstrologyReportArtifact, type LifeHandbookSection } from "./workflow-schemas";
import { callRassyMind } from "./rassymind";
import { SectionDraftSchema, validateSectionDraft } from "./grounding";

const InputSchema = z.object({ graph: ChartFactGraphSchema, plan: LifeHandbookPlanSchema, reportId: z.string(), runId: z.string(), brandId: z.string(), chartHash: z.string(), sessionId: z.string(), depth: z.enum(["quick", "standard", "deep", "handbook"]).default("handbook"), astrologyProfile: z.string().default("modern-reflective"), contextSummary: z.string().max(20_000).default("") });
const OutputSchema = AstrologyReportArtifactSchema;
export type NatalReportWorkflowInput = z.infer<typeof InputSchema>;

const relevantFacts = (section: LifeHandbookSection, graph: z.infer<typeof ChartFactGraphSchema>) => {
  const selected = graph.facts.filter((fact) => section.requiredFactCategories.includes(fact.category));
  return (selected.length ? selected : graph.facts).slice(0, section.key === "house-atlas" ? 24 : 12);
};

const fallbackDraft = (section: LifeHandbookSection, graph: z.infer<typeof ChartFactGraphSchema>) => {
  const facts = relevantFacts(section, graph);
  const factRefs = facts.map((fact) => fact.id);
  const uncertaintyNotes = graph.facts.filter((fact) => fact.confidence === "unknown").map((fact) => fact.humanText);
  const opening = facts.length
    ? `${section.title} is grounded in ${facts.slice(0, 4).map((fact) => fact.humanText).join("; ")}.`
    : `${section.title} is a reflective chapter in the report.`;
  const context = facts.length > 4
    ? ` The wider pattern includes ${facts.slice(4, 8).map((fact) => fact.humanText).join("; ")}.`
    : " The interpretation should remain proportionate to the available chart evidence.";
  return { key: section.key, title: section.title, body: [opening + context, "Use this chapter as a question for reflection rather than a fixed description of identity or fate."], claims: [], factRefs, uncertaintyNotes, confidence: "conditional" as const };
};

const parseDraft = (text: string, section: LifeHandbookSection, graph: z.infer<typeof ChartFactGraphSchema>) => {
  try { const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text); return validateSectionDraft(SectionDraftSchema.parse(json), graph); } catch { return fallbackDraft(section, graph); }
};

const generateSection = async (section: LifeHandbookSection, inputData: NatalReportWorkflowInput) => {
  const facts = relevantFacts(section, inputData.graph);
  try {
    const response = await callRassyMind({ lane: section.group === "natal" || section.group === "biography" ? "rassy-mind" : "rassy-fast", sessionId: `${inputData.sessionId}:${section.key}`, system: "You are a grounded astrology editor writing a substantial handbook chapter. Return JSON only with key, title, body, claims, factRefs, uncertaintyNotes, and confidence. Write 3-6 developed paragraphs in body, specific to the supplied facts. Each claim must include text, factRefs, claimType, and confidence. Use only supplied fact IDs. Never calculate astronomy, invent biography, diagnose, predict guaranteed events, or treat symbolism as scientific causation.", prompt: JSON.stringify({ section, facts, contextSummary: inputData.contextSummary, writingBrief: `Explain the chapter's central pattern, its constructive expression, its likely distortion, and one reflective integration question. Keep uncertainty visible.` }), structuredOutput: true, deadlineMs: 45_000 });
    const draft = parseDraft(response.text, section, inputData.graph);
    return { ...draft, loreRefs: [], status: draft.body.length ? "complete" as const : "fallback" as const };
  } catch {
    const draft = fallbackDraft(section, inputData.graph);
    return { ...draft, loreRefs: [], status: "fallback" as const };
  }
};

const generateArtifactStep = createStep({
  id: "generate-and-ground-sections",
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  execute: async ({ inputData }) => {
    const sections = [];
    const concurrency = Math.max(1, Math.min(3, Number(process.env.ASTRO_REPORT_MAX_PARALLEL_STEPS ?? 2)));
    for (let offset = 0; offset < inputData.plan.sections.length; offset += concurrency) {
      const batch = inputData.plan.sections.slice(offset, offset + concurrency);
      sections.push(...await Promise.all(batch.map((section) => generateSection(section, inputData))));
    }
    const central = sections.find((section) => section.key === "central-thesis")?.body[0] ?? "A grounded, sectioned reading of the chart.";
    const artifact: AstrologyReportArtifact = { schemaVersion: "1.0.0", reportVersion: "natal-report-v2", reportId: inputData.reportId, runId: inputData.runId, kind: "natal", depth: inputData.depth, brandId: inputData.brandId, chart: { chartHash: inputData.chartHash, calculationVersion: "0.2.0", analysisVersion: inputData.graph.analysisVersion, astrologyProfile: inputData.astrologyProfile, timeConfidence: inputData.graph.facts.some((fact) => fact.id === "uncertainty:birth-time") ? "unknown" : "exact" }, cover: { title: "Your Astrology Atlas", subtitle: "A grounded reading of the chart", excerpt: central }, navigation: sections.map((item, order) => ({ key: item.key, title: item.title, group: inputData.plan.sections.find((candidate) => candidate.key === item.key)?.group ?? "natal", order })), sections, practicalIntegration: { reflections: ["Which pattern in this chapter feels most recognizable without becoming a fixed label?"], practices: ["Return to the cited chart facts before making a practical interpretation."], questions: ["What would a proportionate, chosen response to this pattern look like?"] }, provenance: { chartFactGraphVersion: inputData.graph.schemaVersion, workflowVersion: "natal-report-v2", brandVoiceVersion: "1.0.0", generatedAt: new Date().toISOString(), models: ["rassy-fast", "rassy-mind"], sourceContextIds: [], frameworkIds: [] }, disclaimer: "Astrology is a symbolic language for reflection, not a deterministic scientific claim." };
    return OutputSchema.parse(artifact);
  }
});

export const natalReportV2Workflow = createWorkflow({ id: "natal-report-v2", description: "Generate a grounded, sectioned natal report from deterministic chart facts.", inputSchema: InputSchema, outputSchema: OutputSchema }).then(generateArtifactStep).commit();
