import { z } from 'zod';

export const reportArtifact = z.object({
  schemaVersion: z.literal('1'), id: z.string(), kind: z.string().min(1), title: z.string().min(1),
  subtitle: z.string().optional(), dek: z.string().optional(), executiveSummary: z.string(), keyFindings: z.array(z.string()),
  timeline: z.array(z.object({ date: z.string(), event: z.string(), sourceIds: z.array(z.string()) })).default([]),
  chapters: z.array(z.object({ id: z.string(), title: z.string(), thesis: z.string(), bodyMarkdown: z.string(), sourceIds: z.array(z.string()) })),
  sourceIds: z.array(z.string()), sourceNotes: z.array(z.object({ sourceId: z.string(), title: z.string(), url: z.string().url() })).default([]), generatedAt: z.string(), runId: z.string(),
  factCheck: z.object({ passed: z.boolean(), confidence: z.number().min(0).max(1), requiredFixes: z.array(z.string()) }),
});
export type ReportArtifact = z.infer<typeof reportArtifact>;
