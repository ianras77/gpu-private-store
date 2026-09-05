import { z } from "zod";

export const LifeHandbookSectionSchema = z.object({
  key: z.string(), title: z.string(), group: z.enum(["orientation", "natal", "framework", "biography", "application", "forecast", "appendix"]),
  requiredFactCategories: z.array(z.enum(["placement", "angle", "house", "aspect", "dominant", "ruler", "configuration", "uncertainty", "transit", "synastry"])), requiredContext: z.boolean(), requiredFrameworks: z.array(z.string()), order: z.number().int()
});
export type LifeHandbookSection = z.infer<typeof LifeHandbookSectionSchema>;
export const LifeHandbookPlanSchema = z.object({ planVersion: z.literal("life-handbook-v1"), depth: z.literal("handbook"), sections: z.array(LifeHandbookSectionSchema), omissions: z.array(z.string()) });

const Claim = z.object({ text: z.string().min(1), factRefs: z.array(z.string()), loreRefs: z.array(z.string()).default([]), claimType: z.enum(["astronomical", "interpretive", "practical", "uncertainty"]), confidence: z.enum(["exact", "high", "conditional"]) });
const Section = z.object({ key: z.string(), title: z.string(), body: z.array(z.string()), claims: z.array(Claim).default([]), factRefs: z.array(z.string()), loreRefs: z.array(z.string()).default([]), confidence: z.enum(["exact", "high", "conditional"]), uncertaintyNotes: z.array(z.string()).default([]), status: z.enum(["complete", "fallback", "partial"]) });
export const AstrologyReportArtifactSchema = z.object({
  schemaVersion: z.string(), reportVersion: z.string(), reportId: z.string(), runId: z.string(), kind: z.enum(["natal", "compatibility", "weekly", "focused"]), depth: z.enum(["quick", "standard", "deep", "handbook"]), brandId: z.string(),
  chart: z.object({ chartHash: z.string(), calculationVersion: z.string(), analysisVersion: z.string(), astrologyProfile: z.string(), timeConfidence: z.enum(["exact", "unknown", "approximate"]) }), cover: z.object({ title: z.string(), subtitle: z.string(), excerpt: z.string(), archetype: z.string().optional() }), navigation: z.array(z.object({ key: z.string(), title: z.string(), group: z.string(), order: z.number().int() })), sections: z.array(Section), practicalIntegration: z.object({ reflections: z.array(z.string()), practices: z.array(z.string()), questions: z.array(z.string()) }), provenance: z.object({ chartFactGraphVersion: z.string(), workflowVersion: z.string(), brandVoiceVersion: z.string(), loreIndexVersion: z.string().optional(), generatedAt: z.string(), models: z.array(z.string()), traceId: z.string().optional(), sourceContextIds: z.array(z.string()).default([]), frameworkIds: z.array(z.string()).default([]) }), disclaimer: z.string()
});
export type AstrologyReportArtifact = z.infer<typeof AstrologyReportArtifactSchema>;
