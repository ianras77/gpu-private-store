import * as SecureStore from "expo-secure-store";
import type { WorkoutCreatePayload } from "@jogmania/api-client";
import { SECURE_STORE_OPTIONS } from "./auth";

const INDEX_KEY = "jm-offline-runs-index";
const RUN_PREFIX = "jm-offline-run";
const CHUNK_SIZE = 1700;
const MAX_PAYLOAD_CHARS = 600_000;

type RunManifest = {
  id: string;
  chunks: number;
  ownerId: string | null;
  savedAt: string;
  courseName: string;
  distanceM: number;
  pointCount: number;
};

export type QueuedRun = RunManifest & { payload: WorkoutCreatePayload };

function keyFor(id: string, part: string) {
  return `${RUN_PREFIX}:${id}:${part}`;
}

async function readIndex(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY, SECURE_STORE_OPTIONS);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function writeIndex(ids: string[]) {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify([...new Set(ids)]), SECURE_STORE_OPTIONS);
}

export function ownerIdFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) return null;
    const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(globalThis.atob(normalized)) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function queueOfflineRun(payload: WorkoutCreatePayload, ownerId: string | null): Promise<RunManifest> {
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_PAYLOAD_CHARS) {
    throw new Error("This run has too many route points to save safely on this phone.");
  }

  const id = `${Date.parse(payload.started_at).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const chunks: string[] = [];
  for (let offset = 0; offset < serialized.length; offset += CHUNK_SIZE) {
    chunks.push(serialized.slice(offset, offset + CHUNK_SIZE));
  }

  const manifest: RunManifest = {
    id,
    chunks: chunks.length,
    ownerId,
    savedAt: new Date().toISOString(),
    courseName: String(payload.raw_payload_json?.course_name ?? "Adventure course"),
    distanceM: payload.distance_m,
    pointCount: payload.gps_points.length,
  };
  const index = await readIndex();
  await writeIndex([...index, id]);
  try {
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      await SecureStore.setItemAsync(keyFor(id, `part-${chunkIndex}`), chunks[chunkIndex], SECURE_STORE_OPTIONS);
    }
    // The manifest is the commit marker: readers ignore incomplete writes.
    await SecureStore.setItemAsync(keyFor(id, "manifest"), JSON.stringify(manifest), SECURE_STORE_OPTIONS);
    return manifest;
  } catch (error) {
    await Promise.all(chunks.map((_, chunkIndex) =>
      SecureStore.deleteItemAsync(keyFor(id, `part-${chunkIndex}`), SECURE_STORE_OPTIONS).catch(() => undefined)
    ));
    await writeIndex(index.filter((queuedId) => queuedId !== id)).catch(() => undefined);
    throw error;
  }
}

async function readManifest(id: string): Promise<RunManifest | null> {
  const raw = await SecureStore.getItemAsync(keyFor(id, "manifest"), SECURE_STORE_OPTIONS);
  if (!raw) return null;
  try {
    const manifest = JSON.parse(raw) as RunManifest;
    return manifest.id === id && Number.isInteger(manifest.chunks) && manifest.chunks > 0 ? manifest : null;
  } catch {
    return null;
  }
}

export async function listQueuedRuns(): Promise<RunManifest[]> {
  const ids = await readIndex();
  const manifests = await Promise.all(ids.map(readManifest));
  return manifests.filter((manifest): manifest is RunManifest => manifest !== null);
}

export async function readQueuedRunsForOwner(ownerId: string | null): Promise<QueuedRun[]> {
  const ids = await readIndex();
  const result: QueuedRun[] = [];
  for (const id of ids) {
    const manifest = await readManifest(id);
    if (!manifest || (manifest.ownerId && ownerId !== manifest.ownerId) || !ownerId) continue;
    const parts: string[] = [];
    for (let index = 0; index < manifest.chunks; index += 1) {
      const part = await SecureStore.getItemAsync(keyFor(id, `part-${index}`), SECURE_STORE_OPTIONS);
      if (part === null) {
        parts.length = 0;
        break;
      }
      parts.push(part);
    }
    if (!parts.length) continue;
    try {
      result.push({ ...manifest, payload: JSON.parse(parts.join("")) as WorkoutCreatePayload });
    } catch {
      // Keep a damaged queue record for inspection rather than silently deleting user data.
    }
  }
  return result;
}

export async function removeQueuedRun(id: string) {
  const manifest = await readManifest(id);
  if (manifest) {
    await Promise.all(Array.from({ length: manifest.chunks }, (_, chunkIndex) =>
      SecureStore.deleteItemAsync(keyFor(id, `part-${chunkIndex}`), SECURE_STORE_OPTIONS)
    ));
    await SecureStore.deleteItemAsync(keyFor(id, "manifest"), SECURE_STORE_OPTIONS);
  }
  await writeIndex((await readIndex()).filter((queuedId) => queuedId !== id));
}
