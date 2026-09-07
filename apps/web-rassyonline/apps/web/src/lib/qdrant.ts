import type { TextChunk } from "./document-memory";

export type QdrantFilter = {
  must: Array<{ key: string; match: { value: string } | { any: string[] } }>;
};

export type QdrantPoint = {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
};

export type QdrantSearchResult = {
  id: string;
  score: number;
  payload?: {
    user_id?: string;
    document_id?: string;
    document_title?: string;
    chunk_id?: string;
    chunk_index?: number;
    text?: string;
  };
};

export function getUserCollectionName(userId: string): string {
  return `rassy_online_${userId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

export function buildQdrantFilter(userId: string, documentIds: string[]): QdrantFilter {
  return {
    must: [
      { key: "user_id", match: { value: userId } },
      { key: "document_id", match: { any: documentIds } }
    ]
  };
}

function getQdrantUrl(path: string): string {
  const baseUrl = process.env.QDRANT_URL ?? "http://rassy-online-qdrant:6333";
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function qdrantFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(getQdrantUrl(path), {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(15_000),
    headers: {
      "content-type": "application/json",
      ...(process.env.QDRANT_API_KEY ? { "api-key": process.env.QDRANT_API_KEY } : {}),
      ...init.headers
    }
  });
}

export async function ensureUserCollection(userId: string, vectorSize: number): Promise<string> {
  const collection = getUserCollectionName(userId);
  const existing = await qdrantFetch(`/collections/${collection}`, { method: "GET" });
  if (existing.ok) return collection;
  if (existing.status !== 404) {
    throw new Error(`Qdrant collection check failed: ${existing.status}`);
  }

  const created = await qdrantFetch(`/collections/${collection}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: {
        size: vectorSize,
        distance: "Cosine"
      }
    })
  });
  if (!created.ok) {
    throw new Error(`Qdrant collection create failed: ${created.status} ${await created.text()}`);
  }
  return collection;
}

export async function upsertDocumentChunks(input: {
  userId: string;
  documentId: string;
  documentTitle: string;
  chunks: Array<TextChunk & { id: string }>;
  embeddings: number[][];
}): Promise<void> {
  const vectorSize = input.embeddings[0]?.length;
  if (!vectorSize) throw new Error("No embeddings returned for document");
  const collection = await ensureUserCollection(input.userId, vectorSize);
  const points: QdrantPoint[] = input.chunks.map((chunk, index) => ({
    id: chunk.id,
    vector: input.embeddings[index] ?? [],
    payload: {
      user_id: input.userId,
      document_id: input.documentId,
      document_title: input.documentTitle,
      chunk_id: chunk.id,
      chunk_index: chunk.index,
      text: chunk.text
    }
  }));

  const response = await qdrantFetch(`/collections/${collection}/points?wait=true`, {
    method: "PUT",
    body: JSON.stringify({ points })
  });
  if (!response.ok) {
    throw new Error(`Qdrant upsert failed: ${response.status} ${await response.text()}`);
  }
}

export async function searchUserDocuments(input: {
  userId: string;
  documentIds: string[];
  vector: number[];
  limit?: number;
}): Promise<QdrantSearchResult[]> {
  if (input.documentIds.length === 0) return [];
  const limit = Math.max(1, Math.min(input.limit ?? 6, 20));
  const collection = getUserCollectionName(input.userId);
  const response = await qdrantFetch(`/collections/${collection}/points/search`, {
    method: "POST",
    body: JSON.stringify({
      vector: input.vector,
      limit,
      with_payload: true,
      filter: buildQdrantFilter(input.userId, input.documentIds)
    })
  });
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`Qdrant search failed: ${response.status} ${await response.text()}`);
  }
  const parsed = (await response.json()) as { result?: QdrantSearchResult[] };
  return parsed.result ?? [];
}

export async function deleteDocumentVectors(userId: string, documentId: string): Promise<void> {
  const collection = getUserCollectionName(userId);
  const response = await qdrantFetch(`/collections/${collection}/points/delete?wait=true`, {
    method: "POST",
    body: JSON.stringify({
      filter: buildQdrantFilter(userId, [documentId])
    })
  });
  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(`Qdrant delete failed: ${response.status} ${await response.text()}`);
  }
}
