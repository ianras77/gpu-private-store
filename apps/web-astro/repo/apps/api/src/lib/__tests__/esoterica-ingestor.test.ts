import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildChunkId,
  chunkTextForIngest,
  planEsotericaIngest,
  readEsotericaIngestStatus,
  runEsotericaIngest,
  scanSupportedFiles,
  withSuppressedPdfWarnings
} from "../esoterica-ingestor";

describe("esoterica ingestor", () => {
  let tmpDir: string;
  let sourceDir: string;
  let indexDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "astro-ingestor-"));
    sourceDir = path.join(tmpDir, "source");
    indexDir = path.join(tmpDir, "index");
    await fs.mkdir(path.join(sourceDir, "nested"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("recursively scans supported source files in stable order", async () => {
    await fs.writeFile(path.join(sourceDir, "b.pdf"), "pdf", "utf-8");
    await fs.writeFile(path.join(sourceDir, "a.txt"), "text", "utf-8");
    await fs.writeFile(path.join(sourceDir, "nested", "c.epub"), "epub", "utf-8");
    await fs.writeFile(path.join(sourceDir, "nested", "d.markdown"), "markdown", "utf-8");
    await fs.writeFile(path.join(sourceDir, "ignored.png"), "png", "utf-8");

    const files = await scanSupportedFiles(sourceDir);

    expect(files.map((file) => path.relative(sourceDir, file))).toEqual([
      "a.txt",
      "b.pdf",
      path.join("nested", "c.epub"),
      path.join("nested", "d.markdown")
    ]);
  });

  it("chunks text deterministically with overlap", () => {
    const chunks = chunkTextForIngest("one two three four five six seven eight", 4, 1);

    expect(chunks).toEqual(["one two three four", "four five six seven", "seven eight"]);
  });

  it("builds stable chunk ids from source path, content hash, and chunk index", () => {
    expect(buildChunkId("book.txt", "abc", 0)).toBe(buildChunkId("book.txt", "abc", 0));
    expect(buildChunkId("book.txt", "abc", 0)).not.toBe(buildChunkId("book.txt", "abc", 1));
    expect(buildChunkId("book.txt", "abc", 0)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("suppresses known noisy PDF parser warnings without hiding other logs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await withSuppressedPdfWarnings(async () => {
      console.warn("Warning: Ran out of space in font private use area.");
      console.log("Warning: Ran out of space in font private use area.");
      console.warn("different parser warning");
      return "done";
    });

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("different parser warning");
    expect(log).not.toHaveBeenCalled();
  });

  it("dry-runs files and estimated chunks without embedding or Qdrant upserts", async () => {
    await fs.writeFile(path.join(sourceDir, "hermes.txt"), "Hermes teaches above and below.", "utf-8");
    const embedTexts = vi.fn(async () => [[1, 0]]);
    const upsertPoints = vi.fn(async () => undefined);

    const result = await runEsotericaIngest({
      sourceDir,
      indexPath: indexDir,
      dryRun: true,
      embedTexts,
      upsertPoints
    });

    expect(result.dryRun).toBe(true);
    expect(result.filesDiscovered).toBe(1);
    expect(result.filesPlanned).toBe(1);
    expect(result.chunksPlanned).toBe(1);
    expect(result.chunksEmbedded).toBe(0);
    expect(embedTexts).not.toHaveBeenCalled();
    expect(upsertPoints).not.toHaveBeenCalled();
  });

  it("skips unchanged files recorded in the manifest", async () => {
    await fs.writeFile(path.join(sourceDir, "saturn.md"), "Saturn asks for patience and form.", "utf-8");
    const firstEmbedTexts = vi.fn(async () => [[1, 0]]);

    const first = await runEsotericaIngest({
      sourceDir,
      indexPath: indexDir,
      embedTexts: firstEmbedTexts
    });

    const secondEmbedTexts = vi.fn(async () => [[1, 0]]);
    const second = await runEsotericaIngest({
      sourceDir,
      indexPath: indexDir,
      embedTexts: secondEmbedTexts
    });

    expect(first.filesChanged).toBe(1);
    expect(first.chunksEmbedded).toBe(1);
    expect(firstEmbedTexts).toHaveBeenCalledOnce();
    expect(second.filesSkipped).toBe(1);
    expect(second.chunksEmbedded).toBe(0);
    expect(secondEmbedTexts).not.toHaveBeenCalled();
  });

  it("upserts Qdrant payloads with provenance fields and writes status", async () => {
    await fs.writeFile(path.join(sourceDir, "astrology.txt"), "Birth chart planet house aspect.", "utf-8");
    const upsertPoints = vi.fn(async () => undefined);
    const ensureCollection = vi.fn(async () => undefined);

    const result = await runEsotericaIngest({
      sourceDir,
      indexPath: indexDir,
      qdrantUrl: "http://qdrant.test",
      qdrantCollection: "esoterica",
      embedTexts: async () => [[0.5, 0.25]],
      upsertPoints,
      ensureCollection
    });

    expect(result.filesChanged).toBe(1);
    expect(result.chunksEmbedded).toBe(1);
    expect(ensureCollection).toHaveBeenCalledWith("http://qdrant.test", "esoterica", 2);
    expect(upsertPoints).toHaveBeenCalledOnce();
    const points = (((upsertPoints as any).mock.calls[0]?.[2] ?? []) as any[]);
    expect(points).toMatchObject([
      {
        vector: [0.5, 0.25],
        payload: {
          source: path.join(sourceDir, "astrology.txt"),
          sourcePath: "astrology.txt",
          title: "astrology",
          text: "Birth chart planet house aspect.",
          tags: expect.any(Array),
          chunkIndex: 0
        }
      }
    ]);
    expect(points[0]?.payload.tags).toContain("source:astrology");
    expect(points[0]?.payload.contentHash).toEqual(expect.any(String));

    const status = await readEsotericaIngestStatus({ indexPath: indexDir });
    expect(status?.lastResult.chunksEmbedded).toBe(1);
    expect(status?.lastResult.collection).toBe("esoterica");
  });

  it("plans changed files from manifest state", async () => {
    await fs.writeFile(path.join(sourceDir, "guide.txt"), "A guide to the inner sky.", "utf-8");

    const initialPlan = await planEsotericaIngest({ sourceDir, indexPath: indexDir });
    await runEsotericaIngest({
      sourceDir,
      indexPath: indexDir,
      embedTexts: async () => [[1, 0]]
    });
    const unchangedPlan = await planEsotericaIngest({ sourceDir, indexPath: indexDir });

    expect(initialPlan.filesPlanned).toBe(1);
    expect(unchangedPlan.filesPlanned).toBe(0);
    expect(unchangedPlan.filesSkipped).toBe(1);
  });
});
