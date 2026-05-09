import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, "..");
const dataRoot = path.join(webRoot, "data");
const libraryPath = process.argv[2] || path.join(dataRoot, "dm-library.json");
const outputPath = process.argv[3] || path.join(dataRoot, "dm-chunks.jsonl");

const chunkSize = Number.parseInt(process.argv[4] ?? "1200", 10);
const enableOcr = process.env.DM_OCR === "1";
const ocrDpi = Number.parseInt(process.env.DM_OCR_DPI ?? "220", 10);
const useOcrCache = process.env.DM_OCR_CACHE === "1";
const ocrCacheDir = process.env.DM_OCR_CACHE_DIR || path.join(dataRoot, "ocr-cache");

const hasPdfToText = async () => {
  try {
    await execFileAsync("pdftotext", ["-v"]);
    return true;
  } catch {
    return false;
  }
};

const hasTesseract = async () => {
  try {
    await execFileAsync("tesseract", ["--version"]);
    return true;
  } catch {
    return false;
  }
};

const ocrPdf = async (sourcePath) => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "dm-ocr-"));
  const prefix = path.join(tmpDir, "page");
  await execFileAsync("pdftoppm", ["-r", String(ocrDpi), "-png", sourcePath, prefix]);
  const files = (await fs.readdir(tmpDir))
    .filter((file) => file.endsWith(".png"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  let combined = "";
  for (const file of files) {
    const input = path.join(tmpDir, file);
    const outputBase = path.join(tmpDir, path.basename(file, ".png"));
    await execFileAsync("tesseract", [input, outputBase, "-l", "eng"], {
      maxBuffer: 1024 * 1024 * 20
    });
    try {
      const pageText = await fs.readFile(`${outputBase}.txt`, "utf-8");
      combined += `${pageText}\n\n\f\n\n`;
    } catch {
      // skip unreadable pages
    }
  }

  return combined;
};

const getCacheKey = async (filePath) => {
  const stat = await fs.stat(filePath);
  const seed = `${filePath}:${stat.size}:${stat.mtimeMs}`;
  return crypto.createHash("sha1").update(seed).digest("hex");
};

const chunkText = (text) => {
  const clean = text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const chunks = [];
  let current = "";
  for (const line of clean.split("\n")) {
    if ((current + line).length > chunkSize) {
      if (current.trim()) chunks.push(current.trim());
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
};

const main = async () => {
  if (!(await hasPdfToText())) {
    console.error("pdftotext is not installed. Install poppler-utils to ingest manuals.");
    process.exit(1);
  }
  if (enableOcr && !(await hasTesseract())) {
    console.error("tesseract-ocr is not installed. Install it or disable DM_OCR.");
    process.exit(1);
  }

  const libraryRaw = await fs.readFile(libraryPath, "utf-8");
  const library = JSON.parse(libraryRaw);
  const root = library.root;

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, "");

  let totalChunks = 0;

  for (const system of library.systems) {
    for (const manual of system.manuals) {
      const fullPath = path.join(root, manual.path);
      try {
        let text = "";
        const { stdout } = await execFileAsync("pdftotext", ["-layout", fullPath, "-"], {
          maxBuffer: 1024 * 1024 * 50
        });
        text = stdout;
        const meaningfulChars = text.replace(/[\f\s]/g, "").length;

        if (enableOcr && meaningfulChars < 1000) {
          let cached = null;
          if (useOcrCache) {
            const cacheKey = await getCacheKey(fullPath);
            const cachePath = path.join(ocrCacheDir, `${cacheKey}.txt`);
            try {
              cached = await fs.readFile(cachePath, "utf-8");
            } catch {
              cached = null;
            }
            if (cached) {
              text = cached;
              console.log(`Loaded OCR cache for ${manual.title}`);
            } else {
              await fs.mkdir(ocrCacheDir, { recursive: true });
              console.log(`OCR: ${manual.title}`);
              text = await ocrPdf(fullPath);
              await fs.writeFile(cachePath, text);
            }
          } else {
            console.log(`OCR: ${manual.title}`);
            text = await ocrPdf(fullPath);
          }
        }

        if (!text.trim()) {
          console.warn(`Skipped (no text): ${manual.title}`);
          continue;
        }

        const chunks = chunkText(text);
        const entries = chunks.map((chunk, index) =>
          JSON.stringify({
            systemId: system.id,
            systemName: system.name,
            manual: manual.title,
            category: manual.category,
            path: manual.path,
            index,
            text: chunk
          })
        );
        await fs.appendFile(outputPath, entries.join("\n") + "\n");
        totalChunks += entries.length;
        console.log(`Ingested ${manual.title} (${entries.length} chunks)`);
      } catch (error) {
        console.error(`Failed to ingest ${manual.title}:`, error.message);
      }
    }
  }

  console.log(`Done. Wrote ${totalChunks} chunks to ${outputPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
