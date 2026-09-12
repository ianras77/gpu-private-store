import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool } from "./db";

const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
const root = () => path.resolve(process.env.APP_DATA_DIR ?? "/app-data", "artifacts");

export type Artifact = { id: string; userId: string; runId: string | null; projectId: string | null; contentHash: string; mimeType: string; sizeBytes: number; classification: string; createdAt: string; expiresAt: string | null };
function mapArtifact(row: Record<string, unknown>): Artifact { return { id: String(row.id), userId: String(row.user_id), runId: row.run_id ? String(row.run_id) : null, projectId: row.project_id ? String(row.project_id) : null, contentHash: String(row.content_hash), mimeType: String(row.mime_type), sizeBytes: Number(row.size_bytes), classification: String(row.classification), createdAt: new Date(String(row.created_at)).toISOString(), expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null }; }

export async function createArtifact(input: { userId: string; runId?: string; projectId?: string; mimeType: string; content: Uint8Array; classification?: string; sourceIds?: string[]; expiresAt?: Date }): Promise<Artifact> {
  if (input.content.byteLength > MAX_ARTIFACT_BYTES) throw new Error("artifact_too_large");
  const id = randomUUID();
  const contentHash = createHash("sha256").update(input.content).digest("hex");
  const directory = root();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const storagePath = path.join(directory, id);
  await writeFile(storagePath, input.content, { mode: 0o600, flag: "wx" });
  try {
    const result = await getPool().query(`insert into agent_artifacts(id,user_id,run_id,project_id,content_hash,mime_type,size_bytes,storage_path,classification,source_ids,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`, [id, input.userId, input.runId ?? null, input.projectId ?? null, contentHash, input.mimeType.slice(0, 160), input.content.byteLength, storagePath, input.classification ?? "private", JSON.stringify(input.sourceIds ?? []), input.expiresAt ?? null]);
    return mapArtifact(result.rows[0]);
  } catch (error) { await import("node:fs/promises").then(({ unlink }) => unlink(storagePath)).catch(() => undefined); throw error; }
}

export async function readArtifact(id: string, userId: string): Promise<{ artifact: Artifact; content: Buffer } | null> {
  const result = await getPool().query("select * from agent_artifacts where id=$1 and user_id=$2 and (expires_at is null or expires_at>now())", [id, userId]);
  if (!result.rows[0]) return null;
  const artifact = mapArtifact(result.rows[0]);
  const file = path.resolve(String(result.rows[0].storage_path));
  if (file !== path.join(root(), id)) throw new Error("artifact_path_invalid");
  const info = await stat(file);
  if (info.size !== artifact.sizeBytes || info.size > MAX_ARTIFACT_BYTES) throw new Error("artifact_integrity_failed");
  return { artifact, content: await readFile(file) };
}
