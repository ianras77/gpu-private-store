import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/sessions";
import { getUserForSessionToken, writeAuditEvent } from "@/lib/auth/users";
import { chunkText, getUploadLimitBytes, isSupportedTextFile, sanitizeFilename } from "@/lib/document-memory";
import {
  createPendingDocument,
  insertDocumentChunks,
  listDocumentsForUser,
  markDocumentFailed,
  markDocumentReady
} from "@/lib/documents";
import { deleteDocumentVectors, upsertDocumentChunks } from "@/lib/qdrant";
import { embedTexts } from "@/lib/rassycodex";

export const dynamic = "force-dynamic";

function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export async function GET(request: NextRequest) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return json({ ok: false, error: "auth_required" }, { status: 401 });
  return json({ ok: true, documents: await listDocumentsForUser(user.id) });
}

export async function POST(request: NextRequest) {
  const user = await getUserForSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return json({ ok: false, error: "auth_required" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return json({ ok: false, error: "file_required" }, { status: 400 });

  const limitBytes = getUploadLimitBytes(process.env.RASSY_ONLINE_UPLOAD_LIMIT_MB ?? process.env.RASSY_ONLINE_UPLOAD_MAX_MB);
  if (file.size > limitBytes) return json({ ok: false, error: "file_too_large" }, { status: 413 });
  if (!isSupportedTextFile(file.name, file.type || "text/plain")) {
    return json({ ok: false, error: "unsupported_file_type" }, { status: 415 });
  }

  const safeFilename = sanitizeFilename(file.name);
  const title = String(formData.get("title") || safeFilename).trim().slice(0, 180) || safeFilename;
  const buffer = Buffer.from(await file.arrayBuffer());
  const text = buffer.toString("utf8");
  const chunks = chunkText(text);
  if (chunks.length === 0) return json({ ok: false, error: "empty_document" }, { status: 400 });

  const uploadRoot = process.env.RASSY_ONLINE_UPLOAD_ROOT ?? "/app-data/uploads";
  const documentId = randomUUID();
  const userDir = path.join(uploadRoot, user.id);
  const storagePath = path.join(userDir, `${documentId}-${safeFilename}`);
  await mkdir(userDir, { recursive: true });
  await writeFile(storagePath, buffer);

  const document = await createPendingDocument({
    userId: user.id,
    title,
    filename: safeFilename,
    mimeType: file.type || "text/plain",
    sizeBytes: file.size,
    storagePath,
    checksum: createHash("sha256").update(buffer).digest("hex")
  });

  const chunkRecords = chunks.map((chunk) => ({ ...chunk, id: randomUUID() }));

  try {
    const embeddings = await embedTexts(chunkRecords.map((chunk) => chunk.text));
    await upsertDocumentChunks({
      userId: user.id,
      documentId: document.id,
      documentTitle: document.title,
      chunks: chunkRecords,
      embeddings
    });
    await insertDocumentChunks({ userId: user.id, documentId: document.id, chunks: chunkRecords });
    const readyDocument = await markDocumentReady(user.id, document.id, chunkRecords.length);
    await writeAuditEvent(user.id, "document.upload", document.id, { chunks: chunkRecords.length });
    return json({ ok: true, document: readyDocument }, { status: 201 });
  } catch (error) {
    await deleteDocumentVectors(user.id, document.id).catch(() => undefined);
    const message = error instanceof Error ? error.message : "indexing_failed";
    const failedDocument = await markDocumentFailed(user.id, document.id, message);
    return json({ ok: false, error: "indexing_failed", document: failedDocument }, { status: 502 });
  }
}
