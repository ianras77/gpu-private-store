import "dotenv/config";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import { EPub } from "epub2";
import { inferTags } from "../src/lib/esoterica-taxonomy";

type Chunk = {
  id: string;
  source: string;
  title?: string;
  author?: string;
  location?: string;
  text: string;
  embedding: number[];
  tags?: string[];
};

const SUPPORTED_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".pdf", ".epub"]);

const resolveIndexPath = (input?: string): string => {
  if (!input) {
    return path.resolve(process.cwd(), "..", "..", ".esoterica-index", "index.jsonl");
  }
  if (input.endsWith(".jsonl")) return input;
  return path.join(input, "index.jsonl");
};

const walkFiles = async (dir: string): Promise<string[]> => {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
};

const cleanText = (text: string): string => {
  return text.replace(/\s+/g, " ").replace(/\u0000/g, "").trim();
};

const chunkText = (text: string, maxWords = 850, overlap = 140): string[] => {
  const words = text.split(/\s+/);
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
        epub.getChapter(chapter.id, (err, text) => {
          if (!err && text) {
            sections.push(text.replace(/<[^>]*>/g, " "));
          }
          pending -= 1;
          if (pending === 0) {
            resolve(sections.join(" "));
          }
        });
      });
    });
    epub.parse();
  });
};

const extractText = async (filePath: string): Promise<string> => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
    return cleanText(await fsp.readFile(filePath, "utf-8"));
  }
  if (ext === ".pdf") {
    const buffer = await fsp.readFile(filePath);
    const result = await pdfParse(buffer);
    return cleanText(result.text ?? "");
  }
  if (ext === ".epub") {
    const text = await extractTextFromEpub(filePath);
    return cleanText(text);
  }
  return "";
};

const embedBatch = async (client: OpenAI, model: string, inputs: string[]) => {
  const response = await client.embeddings.create({
    model,
    input: inputs
  });
  return response.data.map((item) => item.embedding);
};

const qdrantHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.QDRANT_API_KEY;
  if (apiKey) headers["api-key"] = apiKey;
  return headers;
};

const ensureQdrantCollection = async (url: string, collection: string, size: number) => {
  const response = await fetch(`${url}/collections/${collection}`, {
    headers: qdrantHeaders()
  });
  if (response.ok) return;
  await fetch(`${url}/collections/${collection}`, {
    method: "PUT",
    headers: qdrantHeaders(),
    body: JSON.stringify({
      vectors: {
        size,
        distance: "Cosine"
      }
    })
  });
};

const upsertQdrant = async (url: string, collection: string, points: any[]) => {
  await fetch(`${url}/collections/${collection}/points?wait=true`, {
    method: "PUT",
    headers: qdrantHeaders(),
    body: JSON.stringify({ points })
  });
};

const main = async () => {
  const sourceDir = process.env.ESOTERICA_SOURCE_DIR;
  if (!sourceDir) {
    throw new Error("Missing ESOTERICA_SOURCE_DIR env var.");
  }
  const baseURL = process.env.ESOTERICA_EMBED_BASE_URL || process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY || (baseURL ? "rassygpt-internal" : undefined);
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY or ESOTERICA_EMBED_BASE_URL/OPENAI_BASE_URL env var.");
  }

  const client = new OpenAI({ apiKey, baseURL });
  const embedModel = process.env.ESOTERICA_EMBED_MODEL ?? "rassy-embed";
  const outPath = resolveIndexPath(process.env.ESOTERICA_INDEX_PATH);
  const outDir = path.dirname(outPath);
  const writeJsonl = process.env.ESOTERICA_WRITE_JSONL === "1";
  if (writeJsonl) {
    await fsp.mkdir(outDir, { recursive: true });
  }

  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantCollection = process.env.QDRANT_COLLECTION ?? "esoterica";

  const files = (await walkFiles(sourceDir)).filter((file) =>
    SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase())
  );

  const outStream = writeJsonl ? fs.createWriteStream(outPath, { flags: "w" }) : null;
  let totalChunks = 0;
  let dimension = 0;

  for (const file of files) {
    const rawText = await extractText(file);
    if (!rawText) continue;
    const chunks = chunkText(rawText);
    const batchSize = 8;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const embeddings = await embedBatch(client, embedModel, batch);
      const points: any[] = [];
      embeddings.forEach((embedding, idx) => {
        dimension = embedding.length;
        const chunkTextValue = batch[idx];
        const id = crypto
          .createHash("sha256")
          .update(`${file}:${i + idx}:${chunkTextValue.slice(0, 64)}`)
          .digest("hex");
        const title = path.basename(file).replace(path.extname(file), "");
        const tags = inferTags(chunkTextValue);
        const chunk: Chunk = {
          id,
          source: file,
          title,
          text: chunkTextValue,
          embedding,
          tags: tags.length ? tags : undefined
        };
        if (writeJsonl && outStream) {
          outStream.write(`${JSON.stringify(chunk)}\n`);
        }
        if (qdrantUrl) {
          points.push({
            id,
            vector: embedding,
            payload: {
              source: chunk.source,
              title: chunk.title,
              text: chunk.text,
              tags: chunk.tags ?? []
            }
          });
        }
        totalChunks += 1;
      });
      if (qdrantUrl && points.length) {
        if (totalChunks === points.length) {
          await ensureQdrantCollection(qdrantUrl, qdrantCollection, dimension);
        }
        await upsertQdrant(qdrantUrl, qdrantCollection, points);
      }
    }
  }

  if (outStream) outStream.end();

  const meta = {
    model: embedModel,
    dimensions: dimension,
    createdAt: new Date().toISOString(),
    chunks: totalChunks
  };
  if (writeJsonl) {
    await fsp.writeFile(outPath.replace(/\.jsonl$/, ".meta.json"), JSON.stringify(meta, null, 2));
  }

  console.log(`Indexed ${totalChunks} chunks from ${files.length} files.`);
  if (writeJsonl) {
    console.log(`Index written to ${outPath}`);
  }
  if (qdrantUrl) {
    console.log(`Qdrant upserted to ${qdrantUrl} collection ${qdrantCollection}.`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
