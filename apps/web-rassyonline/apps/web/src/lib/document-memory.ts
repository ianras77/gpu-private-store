export type TextChunk = {
  index: number;
  text: string;
};

export type RetrievedDocumentChunk = {
  documentTitle: string;
  text: string;
  score: number;
};

export type DocumentContextMessage = {
  role: "system";
  content: string;
};

const SUPPORTED_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".json", ".csv", ".log", ".yaml", ".yml"]);
const SUPPORTED_MIME_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/x-yaml"
]);

export function sanitizeFilename(filename: string): string {
  const basename = filename.split(/[\\/]/).filter(Boolean).pop() ?? "document.txt";
  return basename.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+/, "") || "document.txt";
}

export function isSupportedTextFile(filename: string, mimeType: string): boolean {
  const lower = filename.toLowerCase();
  const extension = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
  return SUPPORTED_MIME_TYPES.has(mimeType) || SUPPORTED_EXTENSIONS.has(extension);
}

export function getUploadLimitBytes(value: string | undefined): number {
  const megabytes = Number(value ?? "25");
  const safeMegabytes = Number.isFinite(megabytes) && megabytes > 0 ? megabytes : 25;
  return Math.floor(safeMegabytes * 1024 * 1024);
}

export function chunkText(text: string, options?: { maxChars?: number; overlapChars?: number }): TextChunk[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n").trim();
  if (!normalized) return [];

  const maxChars = options?.maxChars ?? 1800;
  const overlapChars = options?.overlapChars ?? 180;
  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < normalized.length) {
    const hardEnd = Math.min(start + maxChars, normalized.length);
    const paragraphBreak = normalized.lastIndexOf("\n\n", hardEnd);
    const softEnd = paragraphBreak > start + Math.floor(maxChars * 0.45) ? paragraphBreak : hardEnd;
    const textSlice = normalized.slice(start, softEnd).trim();

    if (textSlice) {
      chunks.push({ index: chunks.length, text: textSlice });
    }

    if (softEnd >= normalized.length) break;
    start = Math.max(0, softEnd - overlapChars);
  }

  return chunks;
}

export function buildDocumentContextMessage(chunks: RetrievedDocumentChunk[]): DocumentContextMessage | null {
  if (chunks.length === 0) return null;
  const content = chunks
    .slice(0, 6)
    .map((chunk, index) => {
      const trimmed = chunk.text.trim().slice(0, 1800);
      return `Source ${index + 1}: ${chunk.documentTitle} (score ${chunk.score.toFixed(3)})\n${trimmed}`;
    })
    .join("\n\n");

  return {
    role: "system",
    content: `Use the following user-enabled document context when it is relevant. If the context is not relevant, answer normally and say what is missing.\n\n${content}`
  };
}
