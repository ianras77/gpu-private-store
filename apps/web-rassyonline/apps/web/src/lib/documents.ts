import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { ensureSchema, getPool } from "@/lib/db";

export type AppDocument = {
  id: string;
  userId: string;
  title: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: "pending" | "ready" | "failed";
  active: boolean;
  error: string | null;
  chunkCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type DocumentRow = {
  id: string;
  user_id: string;
  title: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: "pending" | "ready" | "failed";
  active: boolean;
  error: string | null;
  chunk_count: number;
  created_at: Date;
  updated_at: Date;
};

function mapDocument(row: DocumentRow): AppDocument {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    active: row.active,
    error: row.error,
    chunkCount: row.chunk_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listDocumentsForUser(userId: string): Promise<AppDocument[]> {
  await ensureSchema();
  const result = await getPool().query<DocumentRow>(
    `select id, user_id, title, filename, mime_type, size_bytes, status, active, error, chunk_count, created_at, updated_at
     from documents
     where user_id = $1
     order by created_at desc`,
    [userId]
  );
  return result.rows.map(mapDocument);
}

export async function createPendingDocument(input: {
  userId: string;
  title: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  checksum: string;
}): Promise<AppDocument> {
  await ensureSchema();
  const id = randomUUID();
  const result = await getPool().query<DocumentRow>(
    `insert into documents (id, user_id, title, filename, mime_type, size_bytes, storage_path, checksum)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, user_id, title, filename, mime_type, size_bytes, status, active, error, chunk_count, created_at, updated_at`,
    [id, input.userId, input.title, input.filename, input.mimeType, input.sizeBytes, input.storagePath, input.checksum]
  );
  return mapDocument(result.rows[0]);
}

export async function insertDocumentChunks(input: {
  userId: string;
  documentId: string;
  chunks: Array<{ id: string; index: number; text: string }>;
}): Promise<void> {
  await ensureSchema();
  for (const chunk of input.chunks) {
    await getPool().query(
      `insert into document_chunks (id, document_id, user_id, chunk_index, text_preview)
       values ($1, $2, $3, $4, $5)`,
      [chunk.id, input.documentId, input.userId, chunk.index, chunk.text.slice(0, 500)]
    );
  }
}

export async function markDocumentReady(userId: string, documentId: string, chunkCount: number): Promise<AppDocument> {
  await ensureSchema();
  const result = await getPool().query<DocumentRow>(
    `update documents
     set status = 'ready', error = null, chunk_count = $3, updated_at = now()
     where user_id = $1 and id = $2
     returning id, user_id, title, filename, mime_type, size_bytes, status, active, error, chunk_count, created_at, updated_at`,
    [userId, documentId, chunkCount]
  );
  if (!result.rows[0]) throw new Error("document_not_found");
  return mapDocument(result.rows[0]);
}

export async function markDocumentFailed(userId: string, documentId: string, error: string): Promise<AppDocument | null> {
  await ensureSchema();
  const result = await getPool().query<DocumentRow>(
    `update documents
     set status = 'failed', error = $3, updated_at = now()
     where user_id = $1 and id = $2
     returning id, user_id, title, filename, mime_type, size_bytes, status, active, error, chunk_count, created_at, updated_at`,
    [userId, documentId, error.slice(0, 1000)]
  );
  return result.rows[0] ? mapDocument(result.rows[0]) : null;
}

export async function setDocumentActive(userId: string, documentId: string, active: boolean): Promise<AppDocument> {
  await ensureSchema();
  const result = await getPool().query<DocumentRow>(
    `update documents
     set active = $3, updated_at = now()
     where user_id = $1 and id = $2
     returning id, user_id, title, filename, mime_type, size_bytes, status, active, error, chunk_count, created_at, updated_at`,
    [userId, documentId, active]
  );
  if (!result.rows[0]) throw new Error("document_not_found");
  return mapDocument(result.rows[0]);
}

export async function getReadyDocumentIdsForUser(userId: string, requestedIds: string[]): Promise<string[]> {
  await ensureSchema();
  if (requestedIds.length === 0) return [];
  const result = await getPool().query<{ id: string }>(
    `select id from documents
     where user_id = $1 and status = 'ready' and active = true and id = any($2::text[])`,
    [userId, requestedIds]
  );
  return result.rows.map((row) => row.id);
}

export async function deleteDocumentForUser(userId: string, documentId: string): Promise<{ storagePath: string } | null> {
  await ensureSchema();
  const result = await getPool().query<{ storage_path: string }>(
    "delete from documents where user_id = $1 and id = $2 returning storage_path",
    [userId, documentId]
  );
  const storagePath = result.rows[0]?.storage_path;
  if (!storagePath) return null;
  await unlink(storagePath).catch(() => undefined);
  return { storagePath };
}
