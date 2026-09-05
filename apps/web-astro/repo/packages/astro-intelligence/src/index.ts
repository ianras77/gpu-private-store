import { z } from "zod";
import type { ChartFactGraph } from "@astro/astro-analysis";

export const LifeContextItemSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  source: z.enum(["user-provided", "uploaded-document", "application-record"]),
  sensitivity: z.enum(["ordinary", "sensitive", "highly-sensitive"]).default("ordinary"),
  approvedForSynthesis: z.boolean().default(false)
});
export const InterpretiveFrameworkSchema = z.object({
  id: z.string(), name: z.string(), status: z.enum(["astronomical", "symbolic-reflective", "user-supplied"]), version: z.string(), claims: z.array(z.string()).default([])
});
export type LifeContextItem = z.infer<typeof LifeContextItemSchema>;
export type InterpretiveFramework = z.infer<typeof InterpretiveFrameworkSchema>;

export const ReportClaimSchema = z.object({ text: z.string().min(1), factRefs: z.array(z.string()), loreRefs: z.array(z.string()).default([]), claimType: z.enum(["astronomical", "interpretive", "practical", "uncertainty"]), confidence: z.enum(["exact", "high", "conditional"]) });
export type ReportClaim = z.infer<typeof ReportClaimSchema>;
export const ReportSectionSchema = z.object({
  key: z.string(), title: z.string(), body: z.array(z.string()), claims: z.array(ReportClaimSchema).default([]), factRefs: z.array(z.string()), loreRefs: z.array(z.string()).default([]),
  confidence: z.enum(["exact", "high", "conditional"]), uncertaintyNotes: z.array(z.string()).default([]), status: z.enum(["complete", "fallback", "partial"])
});
export const AstrologyReportArtifactSchema = z.object({
  schemaVersion: z.string(), reportVersion: z.string(), reportId: z.string(), runId: z.string(), kind: z.enum(["natal", "compatibility", "weekly", "focused"]), depth: z.enum(["quick", "standard", "deep", "handbook"]), brandId: z.string(),
  chart: z.object({ chartHash: z.string(), calculationVersion: z.string(), analysisVersion: z.string(), astrologyProfile: z.string(), timeConfidence: z.enum(["exact", "unknown", "approximate"]) }),
  cover: z.object({ title: z.string(), subtitle: z.string(), excerpt: z.string(), archetype: z.string().optional() }),
  navigation: z.array(z.object({ key: z.string(), title: z.string(), group: z.string(), order: z.number().int() })), sections: z.array(ReportSectionSchema),
  practicalIntegration: z.object({ reflections: z.array(z.string()), practices: z.array(z.string()), questions: z.array(z.string()) }),
  provenance: z.object({ chartFactGraphVersion: z.string(), workflowVersion: z.string(), brandVoiceVersion: z.string(), loreIndexVersion: z.string().optional(), generatedAt: z.string(), models: z.array(z.string()), traceId: z.string().optional(), sourceContextIds: z.array(z.string()).default([]), frameworkIds: z.array(z.string()).default([]) }), disclaimer: z.string()
});
export type AstrologyReportArtifact = z.infer<typeof AstrologyReportArtifactSchema>;

export const LifeHandbookSectionSchema = z.object({
  key: z.string(), title: z.string(), group: z.enum(["orientation", "natal", "framework", "biography", "application", "forecast", "appendix"]),
  requiredFactCategories: z.array(z.enum(["placement", "angle", "house", "aspect", "dominant", "ruler", "configuration", "uncertainty", "transit", "synastry"])), requiredContext: z.boolean(), requiredFrameworks: z.array(z.string()), order: z.number().int()
});
export type LifeHandbookSection = z.infer<typeof LifeHandbookSectionSchema>;
export const LifeHandbookPlanSchema = z.object({
  planVersion: z.literal("life-handbook-v1"), depth: z.literal("handbook"), sections: z.array(LifeHandbookSectionSchema), omissions: z.array(z.string())
});
export type LifeHandbookPlan = z.infer<typeof LifeHandbookPlanSchema>;

const HANDBOOK_SECTIONS: LifeHandbookSection[] = [
  { key: "how-to-use", title: "How to use this handbook", group: "orientation", requiredFactCategories: [], requiredContext: false, requiredFrameworks: [], order: 10 },
  { key: "technical-frame", title: "Birth data and technical frame", group: "natal", requiredFactCategories: ["placement", "angle"], requiredContext: false, requiredFrameworks: [], order: 20 },
  { key: "central-thesis", title: "The central sentence", group: "natal", requiredFactCategories: ["placement", "aspect"], requiredContext: false, requiredFrameworks: [], order: 30 },
  { key: "chart-architecture", title: "Chart architecture", group: "natal", requiredFactCategories: ["placement", "house", "dominant", "ruler"], requiredContext: false, requiredFrameworks: [], order: 40 },
  { key: "house-atlas", title: "The twelve houses", group: "natal", requiredFactCategories: ["house"], requiredContext: false, requiredFrameworks: [], order: 50 },
  { key: "planet-characters", title: "The planets as living characters", group: "natal", requiredFactCategories: ["placement"], requiredContext: false, requiredFrameworks: [], order: 60 },
  { key: "aspect-wiring", title: "The aspect chart", group: "natal", requiredFactCategories: ["aspect"], requiredContext: false, requiredFrameworks: [], order: 70 },
  { key: "framework-integration", title: "Additional symbolic frameworks", group: "framework", requiredFactCategories: [], requiredContext: false, requiredFrameworks: ["human-design"], order: 80 },
  { key: "life-narrative", title: "How the chart has unfolded", group: "biography", requiredFactCategories: ["placement", "aspect"], requiredContext: true, requiredFrameworks: [], order: 90 },
  { key: "applied-handbook", title: "The applied handbook", group: "application", requiredFactCategories: ["placement", "aspect"], requiredContext: false, requiredFrameworks: [], order: 100 },
  { key: "year-ahead", title: "The year ahead", group: "forecast", requiredFactCategories: ["transit"], requiredContext: false, requiredFrameworks: [], order: 110 },
  { key: "operating-card", title: "The operating card", group: "application", requiredFactCategories: ["placement", "aspect"], requiredContext: false, requiredFrameworks: [], order: 120 },
  { key: "method-and-limits", title: "Method, sources, and limits", group: "appendix", requiredFactCategories: [], requiredContext: false, requiredFrameworks: [], order: 130 }
];
export function planLifeHandbook(options: { graph: ChartFactGraph; context: LifeContextItem[]; frameworks?: InterpretiveFramework[] }): LifeHandbookPlan {
  const categories = new Set(options.graph.facts.map((fact) => fact.category));
  const contextApproved = options.context.some((item) => item.approvedForSynthesis);
  const frameworks = new Set((options.frameworks ?? []).map((framework) => framework.id));
  const omissions: string[] = [];
  const sections = HANDBOOK_SECTIONS.filter((section) => {
    if (section.requiredContext && !contextApproved) { omissions.push(`${section.key}: no approved life context`); return false; }
    const missingCategory = section.requiredFactCategories.find((category) => !categories.has(category));
    if (missingCategory) { omissions.push(`${section.key}: missing ${missingCategory} facts`); return false; }
    const missingFramework = section.requiredFrameworks.find((framework) => !frameworks.has(framework));
    if (missingFramework) { omissions.push(`${section.key}: ${missingFramework} source not supplied`); return false; }
    return true;
  });
  return LifeHandbookPlanSchema.parse({ planVersion: "life-handbook-v1", depth: "handbook", sections, omissions });
}

export const RassyMindLaneSchema = z.enum(["rassy-fast", "rassy-mind", "rassy-utility", "rassy-embed", "rassy-rerank"]);
export type RassyMindLane = z.infer<typeof RassyMindLaneSchema>;
export const RassyMindCapabilitySchema = z.object({ chat: z.boolean(), structuredOutput: z.boolean(), tools: z.boolean(), streaming: z.boolean() });
export type RassyMindCapability = z.infer<typeof RassyMindCapabilitySchema>;
export const RassyMindConfig = z.object({ baseUrl: z.string().url(), apiKey: z.string().min(1), lanes: z.object({ fast: RassyMindLaneSchema, mind: RassyMindLaneSchema, utility: RassyMindLaneSchema, embed: RassyMindLaneSchema, rerank: RassyMindLaneSchema }) });
export function readRassyMindConfig(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = (env.RASSYMIND_BASE_URL ?? "http://127.0.0.1:8844/v1").replace(/\/+$/, "");
  return RassyMindConfig.parse({ baseUrl, apiKey: env.RASSYMIND_API_KEY, lanes: { fast: env.ASTRO_RASSYMIND_FAST_MODEL ?? "rassy-fast", mind: env.ASTRO_RASSYMIND_MIND_MODEL ?? "rassy-mind", utility: env.ASTRO_RASSYMIND_UTILITY_MODEL ?? "rassy-utility", embed: env.ASTRO_RASSYMIND_EMBED_MODEL ?? "rassy-embed", rerank: env.ASTRO_RASSYMIND_RERANK_MODEL ?? "rassy-rerank" } });
}
export function readRassyMindCapabilities(env: NodeJS.ProcessEnv = process.env): Record<string, RassyMindCapability> {
  const raw = env.RASSYMIND_CAPABILITIES_JSON;
  if (!raw) return {};
  const parsed = z.record(RassyMindCapabilitySchema).safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("Invalid RASSYMIND_CAPABILITIES_JSON");
  return parsed.data;
}
export function requireRassyMindCapability(lane: RassyMindLane, capability: keyof RassyMindCapability, env: NodeJS.ProcessEnv = process.env) {
  const capabilities = readRassyMindCapabilities(env);
  const model = { "rassy-fast": env.ASTRO_RASSYMIND_FAST_MODEL ?? "rassy-fast", "rassy-mind": env.ASTRO_RASSYMIND_MIND_MODEL ?? "rassy-mind", "rassy-utility": env.ASTRO_RASSYMIND_UTILITY_MODEL ?? "rassy-utility", "rassy-embed": env.ASTRO_RASSYMIND_EMBED_MODEL ?? "rassy-embed", "rassy-rerank": env.ASTRO_RASSYMIND_RERANK_MODEL ?? "rassy-rerank" }[lane];
  if (!capabilities[model]?.[capability]) throw new Error(`RassyMind lane ${model} is not qualified for ${capability}`);
  return model;
}
export function selectFactSlice(graph: ChartFactGraph, ids: string[]) { const wanted = new Set(ids); return graph.facts.filter((fact) => wanted.has(fact.id)); }
export * from "./mastra";
export * from "./rassymind";
export * from "./grounding";
export * from "./workflow";
export * from "./variant-workflows";
export * from "./legacy-adapter";
