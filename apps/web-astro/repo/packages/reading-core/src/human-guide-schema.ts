import { z } from "zod";

export const SourceUseSchema = z.object({
  title: z.string(),
  source: z.string(),
  tags: z.array(z.string()).default([]),
  sections: z.array(z.string()).default([])
});

export const SourceProvenanceSchema = z.array(SourceUseSchema).min(1);

export const GuideSectionSchema = z.object({
  title: z.string(),
  body: z.string(),
  chartBasis: z.array(z.string()).default([]),
  sourceBasis: z.array(z.string()).default([]),
  practice: z.string().optional()
});

export const MapNodeSchema = z.object({
  name: z.string(),
  theme: z.string(),
  gift: z.string(),
  distortion: z.string(),
  practice: z.string(),
  mantra: z.string(),
  chartBasis: z.array(z.string()).default([]),
  sourceBasis: z.array(z.string()).default([]),
  guide: z.string()
});

export const MapPathSchema = z.object({
  from: z.string(),
  to: z.string(),
  tension: z.string(),
  medicine: z.string(),
  practice: z.string(),
  chartBasis: z.array(z.string()).default([]),
  sourceBasis: z.array(z.string()).default([]),
  guide: z.string().optional()
});

export const HumanGuideSchema = z.object({
  title: z.string(),
  subtitle: z.string(),
  metaFrame: z.object({
    world: z.literal("living-cosmos"),
    orientation: z.string(),
    wisdomTeacherFrame: z.string(),
    tone: z.array(z.string()).min(1)
  }),
  sourceProvenance: SourceProvenanceSchema,
  overview: z.array(GuideSectionSchema).min(3),
  internalMap: z.object({
    root: MapNodeSchema,
    heartChamber: MapNodeSchema,
    voiceAndMind: MapNodeSchema,
    crownAndStar: MapNodeSchema,
    shadowGate: MapNodeSchema,
    serviceGate: MapNodeSchema,
    inspirationGate: MapNodeSchema,
    paths: z.array(MapPathSchema).default([])
  }),
  practices: z.array(GuideSectionSchema).min(3),
  disclaimer: z.string()
});

export type HumanGuide = z.infer<typeof HumanGuideSchema>;
export type SourceUse = z.infer<typeof SourceUseSchema>;
