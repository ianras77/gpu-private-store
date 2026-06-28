import { describe, expect, it } from "vitest";
import {
  buildDocumentContextMessage,
  chunkText,
  getUploadLimitBytes,
  isSupportedTextFile,
  sanitizeFilename
} from "./document-memory";

describe("document memory helpers", () => {
  it("chunks text with stable indexes and bounded overlap", () => {
    const text = ["alpha ".repeat(180), "beta ".repeat(180), "gamma ".repeat(180)].join("\n\n");
    const chunks = chunkText(text, { maxChars: 700, overlapChars: 80 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toMatchObject({ index: 0 });
    expect(chunks.every((chunk) => chunk.text.length <= 780)).toBe(true);
    expect(chunks[1]?.text.startsWith(chunks[0]?.text.slice(-80) ?? "")).toBe(true);
  });

  it("sanitizes filenames and allows only readable text files in this stage", () => {
    expect(sanitizeFilename("../Moon Plan.md")).toBe("Moon_Plan.md");
    expect(isSupportedTextFile("notes.md", "text/markdown")).toBe(true);
    expect(isSupportedTextFile("report.pdf", "application/pdf")).toBe(false);
  });

  it("formats retrieved chunks as a bounded system context", () => {
    const message = buildDocumentContextMessage([
      { documentTitle: "Runbook", text: "Restart the worker with the profile script.", score: 0.82 },
      { documentTitle: "Notes", text: "Use the private gateway for model access.", score: 0.64 }
    ]);

    expect(message?.role).toBe("system");
    expect(message?.content).toContain("Runbook");
    expect(message?.content).toContain("private gateway");
  });

  it("uses a conservative default upload limit", () => {
    expect(getUploadLimitBytes(undefined)).toBe(25 * 1024 * 1024);
    expect(getUploadLimitBytes("1")).toBe(1024 * 1024);
  });
});
