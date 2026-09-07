import { z } from 'zod';

export const researchRequest = z.object({ directive: z.string().min(1).max(4000), maxSources: z.number().int().min(1).max(20).default(10) });
export const researchPacket = z.object({ id: z.string(), generatedAt: z.string(), directive: z.string(), sources: z.array(z.object({ id: z.string(), title: z.string(), url: z.string().url() })), weakEvidenceWarnings: z.array(z.string()) });
export type ResearchPacket = z.infer<typeof researchPacket>;
