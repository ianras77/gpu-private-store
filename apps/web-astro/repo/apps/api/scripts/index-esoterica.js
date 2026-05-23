"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const openai_1 = __importDefault(require("openai"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const epub2_1 = require("epub2");
const esoterica_taxonomy_1 = require("../src/lib/esoterica-taxonomy");
const SUPPORTED_EXTENSIONS = new Set([".txt", ".md", ".markdown", ".pdf", ".epub"]);
const resolveIndexPath = (input) => {
    if (!input) {
        return node_path_1.default.resolve(process.cwd(), "..", "..", ".esoterica-index", "index.jsonl");
    }
    if (input.endsWith(".jsonl"))
        return input;
    return node_path_1.default.join(input, "index.jsonl");
};
const walkFiles = async (dir) => {
    const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = node_path_1.default.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await walkFiles(fullPath)));
        }
        else if (entry.isFile()) {
            files.push(fullPath);
        }
    }
    return files;
};
const cleanText = (text) => {
    return text.replace(/\s+/g, " ").replace(/\u0000/g, "").trim();
};
const chunkText = (text, maxWords = 850, overlap = 140) => {
    const words = text.split(/\s+/);
    if (words.length <= maxWords)
        return [words.join(" ")];
    const chunks = [];
    let start = 0;
    while (start < words.length) {
        const end = Math.min(start + maxWords, words.length);
        chunks.push(words.slice(start, end).join(" "));
        if (end >= words.length)
            break;
        start = Math.max(0, end - overlap);
    }
    return chunks;
};
const extractTextFromEpub = (filePath) => {
    return new Promise((resolve, reject) => {
        const epub = new epub2_1.EPub(filePath);
        const sections = [];
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
const extractText = async (filePath) => {
    const ext = node_path_1.default.extname(filePath).toLowerCase();
    if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
        return cleanText(await promises_1.default.readFile(filePath, "utf-8"));
    }
    if (ext === ".pdf") {
        const buffer = await promises_1.default.readFile(filePath);
        const result = await (0, pdf_parse_1.default)(buffer);
        return cleanText(result.text ?? "");
    }
    if (ext === ".epub") {
        const text = await extractTextFromEpub(filePath);
        return cleanText(text);
    }
    return "";
};
const embedBatch = async (client, model, inputs) => {
    const response = await client.embeddings.create({
        model,
        input: inputs
    });
    return response.data.map((item) => item.embedding);
};
const qdrantHeaders = () => {
    const headers = { "Content-Type": "application/json" };
    const apiKey = process.env.QDRANT_API_KEY;
    if (apiKey)
        headers["api-key"] = apiKey;
    return headers;
};
const ensureQdrantCollection = async (url, collection, size) => {
    const response = await fetch(`${url}/collections/${collection}`, {
        headers: qdrantHeaders()
    });
    if (response.ok)
        return;
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
const upsertQdrant = async (url, collection, points) => {
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
    const client = new openai_1.default({ apiKey, baseURL });
    const embedModel = process.env.ESOTERICA_EMBED_MODEL ?? "rassy-embed";
    const outPath = resolveIndexPath(process.env.ESOTERICA_INDEX_PATH);
    const outDir = node_path_1.default.dirname(outPath);
    const writeJsonl = process.env.ESOTERICA_WRITE_JSONL === "1";
    if (writeJsonl) {
        await promises_1.default.mkdir(outDir, { recursive: true });
    }
    const qdrantUrl = process.env.QDRANT_URL;
    const qdrantCollection = process.env.QDRANT_COLLECTION ?? "esoterica";
    const files = (await walkFiles(sourceDir)).filter((file) => SUPPORTED_EXTENSIONS.has(node_path_1.default.extname(file).toLowerCase()));
    const outStream = writeJsonl ? node_fs_1.default.createWriteStream(outPath, { flags: "w" }) : null;
    let totalChunks = 0;
    let dimension = 0;
    for (const file of files) {
        const rawText = await extractText(file);
        if (!rawText)
            continue;
        const chunks = chunkText(rawText);
        const batchSize = 8;
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const embeddings = await embedBatch(client, embedModel, batch);
            const points = [];
            embeddings.forEach((embedding, idx) => {
                dimension = embedding.length;
                const chunkTextValue = batch[idx];
                const id = node_crypto_1.default
                    .createHash("sha256")
                    .update(`${file}:${i + idx}:${chunkTextValue.slice(0, 64)}`)
                    .digest("hex");
                const title = node_path_1.default.basename(file).replace(node_path_1.default.extname(file), "");
                const tags = (0, esoterica_taxonomy_1.inferTags)(chunkTextValue);
                const chunk = {
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
    if (outStream)
        outStream.end();
    const meta = {
        model: embedModel,
        dimensions: dimension,
        createdAt: new Date().toISOString(),
        chunks: totalChunks
    };
    if (writeJsonl) {
        await promises_1.default.writeFile(outPath.replace(/\.jsonl$/, ".meta.json"), JSON.stringify(meta, null, 2));
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
