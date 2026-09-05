import { randomUUID } from "crypto";
import { z } from "zod";
import { dmQuery, toJson } from "./dm/db";

const rassyArtifactSchema = z.object({
  id: z.string(), channelId: z.string(), kind: z.string(),
  status: z.enum(["draft", "review", "published", "private", "archived"]),
  ownerResourceId: z.string().optional(), title: z.string(), summary: z.string().optional(),
  bodyMarkdown: z.string().optional(), bodyJson: z.unknown().optional(),
  sourceRefs: z.array(z.object({ type: z.string(), id: z.string() })), runId: z.string().optional(),
  createdAt: z.string(), updatedAt: z.string(), publishedAt: z.string().optional(),
});
type RassyArtifact = z.infer<typeof rassyArtifactSchema>;

export const saveRassyArtifact = async (input: Omit<RassyArtifact, "id" | "createdAt" | "updatedAt"> & { id?: string }) => {
  const now = new Date().toISOString();
  const artifact = rassyArtifactSchema.parse({ ...input, id: input.id ?? `artifact_${randomUUID()}`, createdAt: now, updatedAt: now });
  await dmQuery(
    `INSERT INTO rassy_artifacts (id, channel_id, kind, status, owner_resource_id, title, summary, body_markdown, body_json, source_refs, run_id, created_at, updated_at, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14)
     ON CONFLICT (id) DO UPDATE SET status=$4, title=$6, summary=$7, body_markdown=$8, body_json=$9::jsonb, source_refs=$10::jsonb, run_id=$11, updated_at=$13, published_at=$14`,
    [artifact.id, artifact.channelId, artifact.kind, artifact.status, artifact.ownerResourceId ?? null, artifact.title, artifact.summary ?? null, artifact.bodyMarkdown ?? null, artifact.bodyJson ? toJson(artifact.bodyJson) : null, toJson(artifact.sourceRefs), artifact.runId ?? null, artifact.createdAt, artifact.updatedAt, artifact.publishedAt ?? null],
  );
  return artifact;
};

export const listRassyArtifacts = async (channelId: string, status?: RassyArtifact["status"]) => {
  const result = await dmQuery<Record<string, unknown>>(
    `SELECT id, channel_id AS "channelId", kind, status, owner_resource_id AS "ownerResourceId", title, summary, body_markdown AS "bodyMarkdown", body_json AS "bodyJson", source_refs AS "sourceRefs", run_id AS "runId", created_at AS "createdAt", updated_at AS "updatedAt", published_at AS "publishedAt" FROM rassy_artifacts WHERE channel_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY updated_at DESC LIMIT 100`,
    [channelId, status ?? null],
  );
  return result.rows.map((row) => rassyArtifactSchema.parse({ ...row, createdAt: new Date(String(row.createdAt)).toISOString(), updatedAt: new Date(String(row.updatedAt)).toISOString(), publishedAt: row.publishedAt ? new Date(String(row.publishedAt)).toISOString() : undefined }));
};
