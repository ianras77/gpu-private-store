import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: {
      create: vi.fn(async () => ({
        data: [{ embedding: [1, 0] }]
      }))
    }
  }))
}));

const ENV_KEYS = [
  "ESOTERICA_INDEX_PATH",
  "ESOTERICA_ROTATE_DAILY",
  "ESOTERICA_STRICT_BRAND_FILTER",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "QDRANT_URL",
  "ESOTERICA_EMBED_BASE_URL"
] as const;

const envSnapshot = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]])) as Record<string, string | undefined>;

const restoreEnv = () => {
  for (const key of ENV_KEYS) {
    const value = envSnapshot[key];
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json"
    }
  });

describe("esoterica retrieval", () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.resetModules();
    restoreEnv();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "astro-esoterica-"));
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.QDRANT_URL;
    delete process.env.ESOTERICA_ROTATE_DAILY;
    delete process.env.ESOTERICA_STRICT_BRAND_FILTER;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    restoreEnv();
  });

  it("applies source policy to local chunks and preserves inferred source-family tags", async () => {
    const indexPath = path.join(tmpDir, "index.jsonl");
    await fs.writeFile(
      indexPath,
      [
        JSON.stringify({
          id: "hermetic",
          source: "hermes.pdf",
          title: "Hermetic Source",
          text: "Hermes teaches the kinship of microcosm and macrocosm.",
          embedding: [1, 0]
        }),
        JSON.stringify({
          id: "excluded",
          source: "curse.pdf",
          title: "Excluded Source",
          text: "A necromancer curse from the sworn book.",
          embedding: [0.95, 0]
        }),
        JSON.stringify({
          id: "untagged",
          source: "plain.pdf",
          title: "Plain Source",
          text: "A practical note without source family keywords.",
          embedding: [0.9, 0]
        })
      ].join("\n"),
      "utf-8"
    );
    process.env.ESOTERICA_INDEX_PATH = indexPath;

    const { HUMAN_GUIDE_SOURCE_POLICY, retrieveEsotericaLore } = await import("../esoterica");

    const chunks = await retrieveEsotericaLore("hermetic astrology", 8, undefined, HUMAN_GUIDE_SOURCE_POLICY);

    expect(chunks.map((chunk) => chunk.id)).toEqual(["hermetic"]);
    expect(chunks[0]?.tags).toContain("source:hermetic");
    expect(chunks[0]?.tags).not.toContain("source:excluded-occult");
  });

  it("infers missing or empty Qdrant source-family tags before applying source policy", async () => {
    process.env.QDRANT_URL = "http://qdrant.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          result: [
            {
              id: "astrology-missing-tags",
              payload: {
                source: "qdrant-astrology.pdf",
                title: "Birth Chart Source",
                text: "A birth chart uses planet, house, and aspect patterns."
              }
            },
            {
              id: "human-design-empty-tags",
              payload: {
                source: "qdrant-bodygraph.pdf",
                title: "Bodygraph Source",
                text: "Human design bodygraph centers and authority are mapped here.",
                tags: []
              }
            },
            {
              id: "excluded-missing-tags",
              payload: {
                source: "qdrant-curse.pdf",
                title: "Sworn Book Source",
                text: "A necromancer curse from the sworn book."
              }
            }
          ]
        })
      )
    );

    const { HUMAN_GUIDE_SOURCE_POLICY, retrieveEsotericaLore } = await import("../esoterica");

    const chunks = await retrieveEsotericaLore("birth chart human design", 8, undefined, HUMAN_GUIDE_SOURCE_POLICY);

    expect(chunks.map((chunk) => chunk.id)).toEqual(["astrology-missing-tags", "human-design-empty-tags"]);
    expect(chunks[0]?.tags).toContain("source:astrology");
    expect(chunks[1]?.tags).toContain("source:human-design");
    expect(chunks.flatMap((chunk) => chunk.tags ?? [])).not.toContain("source:excluded-occult");
  });
});
