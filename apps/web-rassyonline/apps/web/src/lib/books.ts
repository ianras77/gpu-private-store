import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
// pdf-parse has no bundled declaration in the version used here.
// @ts-expect-error package exposes a callable CommonJS parser.
import pdfParse from "pdf-parse";
import { chunkText } from "./document-memory";
import { ensureSchema, getPool } from "./db";
import { createLibraryDocument, findLibraryDocument, getLibraryChecksum, listLibraryDocuments, insertDocumentChunks, markDocumentFailed, markDocumentReady } from "./documents";
import { deleteDocumentVectors, upsertDocumentChunks } from "./qdrant";
import { embedTexts } from "./rassymind";

const BOOK_ROOT = path.resolve(process.env.RASSY_ONLINE_BOOKS_ROOT ?? "/books");
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const MAX_TEXT_CHARS = 4_000_000;
const EXTENSIONS = new Set([".pdf", ".epub", ".txt", ".md", ".markdown", ".rst", ".adoc", ".html", ".htm"]);
let syncPromise: Promise<BookSyncResult> | null = null;
let intervalStarted = false;

export type BookSyncResult = { scanned: number; indexed: number; unchanged: number; failed: number; removed: number };

async function booksOwnerId() {
  await ensureSchema();
  const result = await getPool().query<{ id: string }>("select id from users where status='active' order by (role='admin') desc, created_at asc limit 1");
  return result.rows[0]?.id ?? null;
}

async function filesUnder(directory: string, result: string[] = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await filesUnder(full, result);
    else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name).toLowerCase())) result.push(full);
  }
  return result;
}

function htmlText(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
}

async function extractEpub(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((name) => /\.(xhtml|html?|htm)$/i.test(name)).sort();
  if (names.length > 500) throw new Error("epub_too_many_sections");
  const parts: string[] = [];
  for (const name of names) {
    const file = zip.files[name];
    if (!file.dir) parts.push(htmlText(await file.async("string")));
  }
  return parts.join("\n\n").slice(0, MAX_TEXT_CHARS);
}

async function extract(file: string, buffer: Buffer) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".pdf") return String((await pdfParse(buffer)).text ?? "").slice(0, MAX_TEXT_CHARS);
  if (extension === ".epub") return extractEpub(buffer);
  return extension === ".html" || extension === ".htm" ? htmlText(buffer.toString("utf8")).slice(0, MAX_TEXT_CHARS) : buffer.toString("utf8").slice(0, MAX_TEXT_CHARS);
}

async function indexBook(ownerId: string, file: string, sourceKey: string, checksum: string, buffer: Buffer, result: BookSyncResult) {
  const current = await findLibraryDocument(ownerId, sourceKey);
  if (current?.status === "ready" && (await getLibraryChecksum(ownerId, sourceKey)) === checksum) { result.unchanged++; return; }
  const text = await extract(file, buffer);
  const chunks = chunkText(text, { maxChars: 2200, overlapChars: 240 });
  if (!chunks.length) throw new Error("empty_book");
  if (current) { await deleteDocumentVectors(ownerId, current.id).catch(() => undefined); await getPool().query("delete from documents where id=$1", [current.id]); }
  const title = path.basename(file, path.extname(file)).replace(/[._-]+/g, " ").trim() || path.basename(file);
  const document = await createLibraryDocument({ userId: ownerId, title, filename: sourceKey, mimeType: path.extname(file).toLowerCase() === ".pdf" ? "application/pdf" : path.extname(file).toLowerCase() === ".epub" ? "application/epub+zip" : "text/plain", sizeBytes: buffer.byteLength, storagePath: file, checksum, sourceKey, });
  try {
    const records = chunks.map((chunk) => ({ ...chunk, id: randomUUID() }));
    await upsertDocumentChunks({ userId: ownerId, documentId: document.id, documentTitle: title, chunks: records, embeddings: await embedTexts(records.map((chunk) => chunk.text)) });
    await insertDocumentChunks({ userId: ownerId, documentId: document.id, chunks: records });
    await markDocumentReady(ownerId, document.id, records.length);
    result.indexed++;
  } catch (error) { await deleteDocumentVectors(ownerId, document.id).catch(() => undefined); await markDocumentFailed(ownerId, document.id, error instanceof Error ? error.message : "index_failed"); throw error; }
}

export async function syncBooks(): Promise<BookSyncResult> {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    const result: BookSyncResult = { scanned: 0, indexed: 0, unchanged: 0, failed: 0, removed: 0 };
    const ownerId = await booksOwnerId();
    if (!ownerId) return result;
    let files: string[] = [];
    try { files = await filesUnder(BOOK_ROOT); } catch { return result; }
    const seen = new Set<string>();
    for (const file of files) {
      result.scanned++;
      const relative = path.relative(BOOK_ROOT, file).split(path.sep).join("/");
      seen.add(relative);
      try { const info = await stat(file); if (info.size > MAX_FILE_BYTES) throw new Error("book_too_large"); const buffer = await readFile(file); await indexBook(ownerId, file, relative, createHash("sha256").update(buffer).digest("hex"), buffer, result); } catch { result.failed++; }
    }
    for (const document of await listLibraryDocuments(ownerId)) if (document.sourceKey && !seen.has(document.sourceKey)) { await deleteDocumentVectors(ownerId, document.id).catch(() => undefined); await getPool().query("delete from documents where id=$1", [document.id]); result.removed++; }
    return result;
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}

export function ensureBooksSyncStarted() {
  if (intervalStarted || process.env.NODE_ENV === "test") return;
  intervalStarted = true;
  void syncBooks();
  setInterval(() => void syncBooks(), Math.max(60_000, Number(process.env.RASSY_ONLINE_BOOKS_SYNC_MS ?? 300_000))).unref();
}

export async function getBooksOwnerId() { return booksOwnerId(); }
