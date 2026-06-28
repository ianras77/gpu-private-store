import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import { EPub } from "epub2";
import { inferTags } from "./esoterica-taxonomy";

export const SUPPORTED_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".pdf", ".epub"]);

export type EsotericaIngestPoint = {
  id: string;
  vector: number[];
  payload: {
    source: string;
    sourcePath: string;
    title: string;
    text: string;
    tags: string[];
    contentHash: string;
    chunkIndex: number;
    ingestedAt: string;
  };
};

export type EsotericaIngestResult = {
  dryRun: boolean;
  sourceDir: string;
  indexPath: string;
  manifestPath: string;
  statusPath: string;
  collection: string;
  model: string;
  startedAt: string;
  completedAt: string;
  filesDiscovered: number;
  filesPlanned: number;
  filesChanged: number;
  filesSkipped: number;
  filesFailed: number;
  chunksPlanned: number;
  chunksEmbedded: number;
  chunksUpserted: number;
  errors: Array<{ sourcePath: string; message: string }>;
};

export type EsotericaIngestStatus = {
  updatedAt: string;
  lastResult: EsotericaIngestResult;
};

type ManifestEntry = {
  relativePath: string;
  source: string;
  size: number;
  mtimeMs: number;
  contentHash: string;
  chunks: number;
  updatedAt: string;
};

type Manifest = {
  version: 1;
  sourceDir: string;
  updatedAt: string;
  files: Record<string, ManifestEntry>;
};

type PlannedFile = {
  absolutePath: string;
  relativePath: string;
  size: number;
  mtimeMs: number;
  contentHash: string;
  changed: boolean;
};

export type EsotericaIngestPlan = {
  sourceDir: string;
  indexPath: string;
  manifestPath: string;
  statusPath: string;
  filesDiscovered: number;
  filesPlanned: number;
  filesSkipped: number;
  files: PlannedFile[];
};

export type EsotericaIngestOptions = {
  sourceDir?: string;
  indexPath?: string;
  dryRun?: boolean;
  writeJsonl?: boolean;
  embedModel?: string;
  qdrantUrl?: string;
  qdrantCollection?: string;
  embedTexts?: (inputs: string[]) => Promise<number[][]>;
  extractText?: (filePath: string) => Promise<string>;
  ensureCollection?: (url: string, collection: string, size: number) => Promise<void>;
  upsertPoints?: (url: string, collection: string, points: EsotericaIngestPoint[]) => Promise<void>;
};

const defaultIndexPath = (): string => path.resolve(process.cwd(), "..", "..", ".esoterica-index", "index.jsonl");

const resolveIndexPath = (input?: string): string => {
  if (!input) return defaultIndexPath();
  if (input.endsWith(".jsonl")) return input;
  return path.join(input, "index.jsonl");
};

const pathsForIndex = (input?: string) => {
  const indexPath = resolveIndexPath(input ?? process.env.ESOTERICA_INDEX_PATH);
  const indexDir = path.dirname(indexPath);
  return {
    indexPath,
    manifestPath: path.join(indexDir, "ingest-manifest.json"),
    statusPath: path.join(indexDir, "ingest-status.json")
  };
};

export const scanSupportedFiles = async (dir: string): Promise<string[]> => {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await scanSupportedFiles(fullPath)));
    } else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
};

export const cleanTextForIngest = (text: string): string => text.replace(/\s+/g, " ").replace(/\u0000/g, "").trim();

export const chunkTextForIngest = (text: string, maxWords = 850, overlap = 140): string[] => {
  const words = cleanTextForIngest(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (words.length <= maxWords) return [words.join(" ")];
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
};

export const buildChunkId = (sourcePath: string, contentHash: string, chunkIndex: number): string => {
  const hash = crypto.createHash("sha256").update(`${sourcePath}:${contentHash}:${chunkIndex}`).digest("hex");
  const variant = ((Number.parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(
    18,
    20
  )}-${hash.slice(20, 32)}`;
};

const NOISY_PDF_WARNINGS = ["Ran out of space in font private use area"];

export const withSuppressedPdfWarnings = async <T>(fn: () => Promise<T>): Promise<T> => {
  const originalWarn = console.warn;
  const originalLog = console.log;
  const shouldSuppress = (args: unknown[]) =>
    args.some((arg) => typeof arg === "string" && NOISY_PDF_WARNINGS.some((warning) => arg.includes(warning)));
  console.warn = (...args: unknown[]) => {
    if (shouldSuppress(args)) return;
    originalWarn(...args);
  };
  console.log = (...args: unknown[]) => {
    if (shouldSuppress(args)) return;
    originalLog(...args);
  };
  try {
    return await fn();
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }
};

const readManifest = async (manifestPath: string): Promise<Manifest> => {
  try {
    return JSON.parse(await fsp.readFile(manifestPath, "utf-8")) as Manifest;
  } catch {
    return {
      version: 1,
      sourceDir: "",
      updatedAt: new Date(0).toISOString(),
      files: {}
    };
  }
};

const writeJson = async (filePath: string, value: unknown) => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
};

const contentHashForFile = async (filePath: string): Promise<string> => {
  const buffer = await fsp.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

export const planEsotericaIngest = async (options: EsotericaIngestOptions = {}): Promise<EsotericaIngestPlan> => {
  const sourceDir = path.resolve(options.sourceDir ?? process.env.ESOTERICA_SOURCE_DIR ?? "");
  if (!sourceDir || sourceDir === path.parse(sourceDir).root) {
    throw new Error("Missing ESOTERICA_SOURCE_DIR.");
  }
  const indexPaths = pathsForIndex(options.indexPath);
  const manifest = await readManifest(indexPaths.manifestPath);
  const discovered = await scanSupportedFiles(sourceDir);
  const files: PlannedFile[] = [];
  let skipped = 0;
  for (const absolutePath of discovered) {
    const stat = await fsp.stat(absolutePath);
    const relativePath = path.relative(sourceDir, absolutePath);
    const contentHash = await contentHashForFile(absolutePath);
    const previous = manifest.files[relativePath];
    const changed =
      !previous ||
      previous.size !== stat.size ||
      previous.mtimeMs !== stat.mtimeMs ||
      previous.contentHash !== contentHash;
    if (!changed) skipped += 1;
    files.push({
      absolutePath,
      relativePath,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      contentHash,
      changed
    });
  }
  return {
    sourceDir,
    ...indexPaths,
    filesDiscovered: discovered.length,
    filesPlanned: files.filter((file) => file.changed).length,
    filesSkipped: skipped,
    files
  };
};

const extractTextFromEpub = (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath);
    const sections: string[] = [];
    epub.on("error", reject);
    epub.on("end", () => {
      const flow = epub.flow ?? [];
      let pending = flow.length;
      if (pending === 0) {
        resolve("");
        return;
      }
      flow.forEach((chapter) => {
        if (!chapter.id) {
          pending -= 1;
          if (pending === 0) resolve(sections.join(" "));
          return;
        }
        epub.getChapter(chapter.id, (err, text) => {
          if (!err && text) sections.push(text.replace(/<[^>]*>/g, " "));
          pending -= 1;
          if (pending === 0) resolve(sections.join(" "));
        });
      });
    });
    epub.parse();
  });
};

const extractTextFromFile = async (filePath: string): Promise<string> => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
    return cleanTextForIngest(await fsp.readFile(filePath, "utf-8"));
  }
  if (ext === ".pdf") {
    const result = await withSuppressedPdfWarnings(async () => pdfParse(await fsp.readFile(filePath)));
    return cleanTextForIngest(result.text ?? "");
  }
  if (ext === ".epub") {
    return cleanTextForIngest(await extractTextFromEpub(filePath));
  }
  return "";
};

const createEmbedder = (model: string): ((inputs: string[]) => Promise<number[][]>) => {
  const baseURL = process.env.ESOTERICA_EMBED_BASE_URL || process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY || (baseURL ? "rassygpt-internal" : undefined);
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY or ESOTERICA_EMBED_BASE_URL/OPENAI_BASE_URL env var.");
  }
  const client = new OpenAI({ apiKey, baseURL });
  return async (inputs: string[]) => {
    const response = await client.embeddings.create({ model, input: inputs });
    return response.data.map((item) => item.embedding);
  };
};

const qdrantHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.QDRANT_API_KEY;
  if (apiKey) headers["api-key"] = apiKey;
  return headers;
};

const ensureQdrantCollection = async (url: string, collection: string, size: number): Promise<void> => {
  const existing = await fetch(`${url}/collections/${collection}`, { headers: qdrantHeaders() });
  if (existing.ok) return;
  const created = await fetch(`${url}/collections/${collection}`, {
    method: "PUT",
    headers: qdrantHeaders(),
    body: JSON.stringify({ vectors: { size, distance: "Cosine" } })
  });
  if (!created.ok) {
    throw new Error(`Failed to create Qdrant collection ${collection}: ${created.status}`);
  }
};

const upsertQdrantPoints = async (
  url: string,
  collection: string,
  points: EsotericaIngestPoint[]
): Promise<void> => {
  const response = await fetch(`${url}/collections/${collection}/points?wait=true`, {
    method: "PUT",
    headers: qdrantHeaders(),
    body: JSON.stringify({ points })
  });
  if (!response.ok) {
    throw new Error(`Failed to upsert Qdrant points: ${response.status}`);
  }
};

const titleForFile = (filePath: string): string => path.basename(filePath).replace(path.extname(filePath), "");

export const runEsotericaIngest = async (options: EsotericaIngestOptions = {}): Promise<EsotericaIngestResult> => {
  const startedAt = new Date().toISOString();
  const plan = await planEsotericaIngest(options);
  const model = options.embedModel ?? process.env.ESOTERICA_EMBED_MODEL ?? "rassy-embed";
  const qdrantUrl = options.qdrantUrl ?? process.env.QDRANT_URL;
  const collection = options.qdrantCollection ?? process.env.QDRANT_COLLECTION ?? "esoterica";
  const dryRun = options.dryRun ?? process.env.ESOTERICA_DRY_RUN === "1";
  const writeJsonl = options.writeJsonl ?? process.env.ESOTERICA_WRITE_JSONL === "1";
  const extractText = options.extractText ?? extractTextFromFile;
  const embedTexts = options.embedTexts ?? (dryRun ? undefined : createEmbedder(model));
  const ensureCollection = options.ensureCollection ?? ensureQdrantCollection;
  const upsertPoints = options.upsertPoints ?? upsertQdrantPoints;
  const manifest = await readManifest(plan.manifestPath);
  const nextManifest: Manifest = {
    version: 1,
    sourceDir: plan.sourceDir,
    updatedAt: startedAt,
    files: { ...manifest.files }
  };
  const outStream = writeJsonl && !dryRun ? fs.createWriteStream(plan.indexPath, { flags: "w" }) : null;
  const batchSize = 8;
  let filesChanged = 0;
  let filesFailed = 0;
  let chunksPlanned = 0;
  let chunksEmbedded = 0;
  let chunksUpserted = 0;
  let collectionEnsured = false;
  const errors: EsotericaIngestResult["errors"] = [];

  try {
    for (const file of plan.files.filter((item) => item.changed)) {
      try {
        const text = await extractText(file.absolutePath);
        const chunks = chunkTextForIngest(text);
        chunksPlanned += chunks.length;
        filesChanged += 1;
        if (dryRun) continue;
        const title = titleForFile(file.absolutePath);
        const ingestedAt = new Date().toISOString();
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          if (!batch.length) continue;
          if (!embedTexts) throw new Error("Embedding function is not configured.");
          const embeddings = await embedTexts(batch);
          const points = embeddings.map((embedding, idx) => {
            const chunkIndex = i + idx;
            const textValue = batch[idx] ?? "";
            const tags = inferTags([title, file.relativePath, textValue].join("\n"));
            return {
              id: buildChunkId(file.relativePath, file.contentHash, chunkIndex),
              vector: embedding,
              payload: {
                source: file.absolutePath,
                sourcePath: file.relativePath,
                title,
                text: textValue,
                tags,
                contentHash: file.contentHash,
                chunkIndex,
                ingestedAt
              }
            };
          });
          if (outStream) {
            points.forEach((point) => {
              outStream.write(
                `${JSON.stringify({
                  id: point.id,
                  source: point.payload.source,
                  title: point.payload.title,
                  text: point.payload.text,
                  embedding: point.vector,
                  tags: point.payload.tags
                })}\n`
              );
            });
          }
          if (qdrantUrl && points.length) {
            if (!collectionEnsured) {
              await ensureCollection(qdrantUrl, collection, points[0]?.vector.length ?? 0);
              collectionEnsured = true;
            }
            await upsertPoints(qdrantUrl, collection, points);
            chunksUpserted += points.length;
          }
          chunksEmbedded += points.length;
        }
        nextManifest.files[file.relativePath] = {
          relativePath: file.relativePath,
          source: file.absolutePath,
          size: file.size,
          mtimeMs: file.mtimeMs,
          contentHash: file.contentHash,
          chunks: chunks.length,
          updatedAt: new Date().toISOString()
        };
      } catch (error: any) {
        filesFailed += 1;
        errors.push({
          sourcePath: file.relativePath,
          message: error?.message ?? String(error)
        });
      }
    }
  } finally {
    if (outStream) outStream.end();
  }

  const result: EsotericaIngestResult = {
    dryRun,
    sourceDir: plan.sourceDir,
    indexPath: plan.indexPath,
    manifestPath: plan.manifestPath,
    statusPath: plan.statusPath,
    collection,
    model,
    startedAt,
    completedAt: new Date().toISOString(),
    filesDiscovered: plan.filesDiscovered,
    filesPlanned: plan.filesPlanned,
    filesChanged,
    filesSkipped: plan.filesSkipped,
    filesFailed,
    chunksPlanned,
    chunksEmbedded,
    chunksUpserted,
    errors
  };

  if (!dryRun) {
    await writeJson(plan.manifestPath, nextManifest);
  }
  await writeJson(plan.statusPath, {
    updatedAt: result.completedAt,
    lastResult: result
  } satisfies EsotericaIngestStatus);

  return result;
};

export const readEsotericaIngestStatus = async (
  options: Pick<EsotericaIngestOptions, "indexPath"> = {}
): Promise<EsotericaIngestStatus | null> => {
  const { statusPath } = pathsForIndex(options.indexPath);
  try {
    return JSON.parse(await fsp.readFile(statusPath, "utf-8")) as EsotericaIngestStatus;
  } catch {
    return null;
  }
};
