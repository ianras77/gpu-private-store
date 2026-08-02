import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type { BrandConfig } from "@astro/brands";
import type { NatalChart } from "@astro/astro-core";
import { buildChartFacts, chartFactsToString } from "@astro/reading-core";
import { getSeasonalPrompt, inferTags, type Season } from "./esoterica-taxonomy";

export type EsotericaChunk = {
  id: string;
  source: string;
  title?: string;
  author?: string;
  location?: string;
  text: string;
  embedding: number[];
  tags?: string[];
};

export type SourcePolicy = {
  includeTags: string[];
  excludeTags: string[];
};

export const HUMAN_GUIDE_SOURCE_POLICY: SourcePolicy = {
  includeTags: [
    "source:hermetic",
    "source:astrology",
    "source:contemplative",
    "source:human-design",
    "source:myth"
  ],
  excludeTags: ["source:excluded-occult"]
};

type EsotericaMeta = {
  model: string;
  dimensions: number;
  createdAt: string;
};

type EsotericaIndex = {
  chunks: EsotericaChunk[];
  meta?: EsotericaMeta;
};

let cachedIndex: EsotericaIndex | null = null;

const defaultIndexPath = (): string => {
  return path.resolve(process.cwd(), "..", "..", ".esoterica-index", "index.jsonl");
};

const defaultAuditPath = (): string => {
  return path.resolve(process.cwd(), "..", "..", ".esoterica-index", "lore-audit.jsonl");
};

const resolveIndexPath = (input?: string): string => {
  if (!input) return defaultIndexPath();
  if (input.endsWith(".jsonl")) return input;
  return path.join(input, "index.jsonl");
};

const resolveAuditPath = (input?: string): string => {
  if (!input) return defaultAuditPath();
  if (input.endsWith(".jsonl")) return input;
  return path.join(input, "lore-audit.jsonl");
};

const trimToWords = (text: string, maxWords: number): string => {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
};

const cosineSimilarity = (a: number[], b: number[]): number => {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length && i < b.length; i += 1) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const seasonForDate = (date: Date): Season => {
  const month = date.getUTCMonth() + 1;
  if ([12, 1, 2].includes(month)) return "winter";
  if ([3, 4, 5].includes(month)) return "spring";
  if ([6, 7, 8].includes(month)) return "summer";
  return "autumn";
};

const dayOfYear = (date: Date): number => {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const now = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((now - start) / 86400000);
};

const loadIndex = async (): Promise<EsotericaIndex | null> => {
  if (cachedIndex) return cachedIndex;
  const indexPath = resolveIndexPath(process.env.ESOTERICA_INDEX_PATH);
  try {
    const raw = await fs.readFile(indexPath, "utf-8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const chunks: EsotericaChunk[] = lines.map((line) => JSON.parse(line));
    const metaPath = indexPath.replace(/\.jsonl$/, ".meta.json");
    let meta: EsotericaMeta | undefined;
    try {
      meta = JSON.parse(await fs.readFile(metaPath, "utf-8")) as EsotericaMeta;
    } catch {
      meta = undefined;
    }
    cachedIndex = { chunks, meta };
    return cachedIndex;
  } catch {
    return null;
  }
};

const embedQuery = async (query: string): Promise<number[] | null> => {
  const baseURL = process.env.ESOTERICA_EMBED_BASE_URL || process.env.OPENAI_BASE_URL;
  const apiKey = process.env.OPENAI_API_KEY || (baseURL ? "rassymind-internal" : undefined);
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey, baseURL });
  const model = process.env.ESOTERICA_EMBED_MODEL ?? "rassy-embed";
  const response = await client.embeddings.create({
    model,
    input: query
  });
  return response.data[0]?.embedding ?? null;
};

const qdrantHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = process.env.QDRANT_API_KEY;
  if (apiKey) headers["api-key"] = apiKey;
  return headers;
};

const qdrantSearch = async (
  vector: number[],
  limit: number,
  brandTag?: string
): Promise<EsotericaChunk[]> => {
  const qdrantUrl = process.env.QDRANT_URL;
  const collection = process.env.QDRANT_COLLECTION ?? "esoterica";
  if (!qdrantUrl) return [];
  const filter = brandTag
    ? {
        must: [
          {
            key: "tags",
            match: { value: brandTag }
          }
        ]
      }
    : undefined;
  const response = await fetch(`${qdrantUrl}/collections/${collection}/points/search`, {
    method: "POST",
    headers: qdrantHeaders(),
    body: JSON.stringify({
      vector,
      limit,
      filter,
      with_payload: true,
      with_vectors: false
    })
  });
  if (!response.ok) return [];
  const data = await response.json();
  const points = data.result ?? [];
  return points.map((point: any) => ({
    id: String(point.id),
    source: point.payload?.source ?? "unknown",
    title: point.payload?.title,
    author: point.payload?.author,
    location: point.payload?.location,
    text: point.payload?.text ?? "",
    embedding: [],
    tags: point.payload?.tags ?? []
  }));
};

const sourceTextForChunk = (chunk: EsotericaChunk): string => {
  return [chunk.title, chunk.author, chunk.location, chunk.source, chunk.text].filter(Boolean).join("\n");
};

const tagsForChunk = (chunk: EsotericaChunk): string[] => {
  const tags = chunk.tags ?? [];
  return Array.from(new Set([...tags, ...inferTags(sourceTextForChunk(chunk))]));
};

const withResolvedTags = (chunk: EsotericaChunk): EsotericaChunk => ({
  ...chunk,
  tags: tagsForChunk(chunk)
});

const applySourcePolicy = (chunks: EsotericaChunk[], policy?: SourcePolicy): EsotericaChunk[] => {
  if (!policy) return chunks;
  return chunks.map(withResolvedTags).filter((chunk) => {
    const tags = chunk.tags ?? [];
    if (tags.some((tag) => policy.excludeTags.includes(tag))) return false;
    return policy.includeTags.length === 0 || tags.some((tag) => policy.includeTags.includes(tag));
  });
};

export const buildLoreQuery = (chart: NatalChart, brand: BrandConfig): string => {
  const facts = buildChartFacts(chart);
  const placements = facts.placements.slice(0, 5).join("; ");
  const aspects = facts.aspects.slice(0, 4).join("; ");
  const chartFacts = chartFactsToString(chart, brand);
  const season = seasonForDate(new Date());
  const seasonalPrompt = getSeasonalPrompt(brand.id, season);
  return [
    `Brand tone: ${brand.toneKeywords.join(", ")}`,
    `Season: ${season}`,
    seasonalPrompt ? `Seasonal prompt: ${seasonalPrompt}` : "",
    `Big Three: ${facts.bigThree.sun} | ${facts.bigThree.moon} | ${facts.bigThree.rising ?? ""}`.trim(),
    placements ? `Key placements: ${placements}` : "",
    aspects ? `Key aspects: ${aspects}` : "",
    `Element balance: ${Object.entries(facts.elementCounts)
      .map(([key, value]) => `${key} ${value}`)
      .join(", ")}`,
    `Modality balance: ${Object.entries(facts.modalityCounts)
      .map(([key, value]) => `${key} ${value}`)
      .join(", ")}`,
    chartFacts
  ]
    .filter(Boolean)
    .join("\n");
};

export const retrieveEsotericaLore = async (
  query: string,
  topK = 4,
  brandTag?: string,
  sourcePolicy?: SourcePolicy
): Promise<EsotericaChunk[]> => {
  const embedding = await embedQuery(query);
  if (!embedding) return [];
  const rotate = process.env.ESOTERICA_ROTATE_DAILY === "1";
  const policyPoolSize = sourcePolicy ? Math.max(topK * 3, 8) : topK;
  const poolSize = rotate ? Math.max(topK * 3, 8) : policyPoolSize;
  const strictBrand = process.env.ESOTERICA_STRICT_BRAND_FILTER === "1";
  if (process.env.QDRANT_URL) {
    const branded = brandTag ? await qdrantSearch(embedding, poolSize, brandTag) : [];
    let results = branded;
    if ((!brandTag || branded.length < topK) && !strictBrand) {
      const fallback = await qdrantSearch(embedding, poolSize);
      const merged = [...branded, ...fallback].reduce<EsotericaChunk[]>((acc, chunk) => {
        if (acc.find((item) => item.id === chunk.id)) return acc;
        acc.push(chunk);
        return acc;
      }, []);
      results = merged;
    }
    const policyResults = applySourcePolicy(results, sourcePolicy);
    if (!rotate) return policyResults.slice(0, topK);
    const seed = dayOfYear(new Date());
    if (!policyResults.length) return [];
    const offset = seed % policyResults.length;
    const rotated = [...policyResults.slice(offset), ...policyResults.slice(0, offset)];
    return rotated.slice(0, topK);
  }
  const index = await loadIndex();
  if (!index) return [];
  const enriched = index.chunks.map((chunk) => ({
    chunk,
    score: cosineSimilarity(embedding, chunk.embedding),
    tags: tagsForChunk(chunk)
  }));
  const filtered = brandTag ? enriched.filter((item) => item.tags.includes(brandTag)) : enriched;
  const scored = (filtered.length || process.env.ESOTERICA_STRICT_BRAND_FILTER === "1" ? filtered : enriched)
    .sort((a, b) => b.score - a.score);
  const results = applySourcePolicy(
    scored.slice(0, poolSize).map((item) => ({ ...item.chunk, tags: item.tags })),
    sourcePolicy
  );
  if (!rotate) return results.slice(0, topK);
  if (!results.length) return [];
  const seed = dayOfYear(new Date());
  const offset = seed % results.length;
  const rotated = [...results.slice(offset), ...results.slice(0, offset)];
  return rotated.slice(0, topK);
};

export const renderLoreContext = (chunks: EsotericaChunk[]): string => {
  if (!chunks.length) return "";
  return chunks
    .map((chunk, index) => {
      const title = chunk.title ? `${chunk.title}` : path.basename(chunk.source);
      const author = chunk.author ? ` by ${chunk.author}` : "";
      const location = chunk.location ? ` (${chunk.location})` : "";
      const excerpt = trimToWords(chunk.text, 160);
      return [
        `Source ${index + 1}: ${title}${author}${location}`,
        `Excerpt: ${excerpt}`
      ].join("\n");
    })
    .join("\n\n");
};

export const buildAuditEntry = (params: {
  brandId: string;
  chartHash: string;
  query: string;
  chunks: EsotericaChunk[];
}) => {
  return {
    ts: new Date().toISOString(),
    brandId: params.brandId,
    chartHash: params.chartHash,
    query: params.query,
    sources: params.chunks.map((chunk) => ({
      id: chunk.id,
      source: chunk.source,
      title: chunk.title,
      location: chunk.location
    }))
  };
};

export const appendLoreAudit = async (entry: Record<string, unknown>) => {
  if (process.env.ESOTERICA_AUDIT_LOG !== "1") return;
  const auditPath = resolveAuditPath(process.env.ESOTERICA_AUDIT_LOG_PATH);
  try {
    await fs.mkdir(path.dirname(auditPath), { recursive: true });
    await fs.appendFile(auditPath, `${JSON.stringify(entry)}\n`, "utf-8");
  } catch {
    // Ignore audit logging errors
  }
};
