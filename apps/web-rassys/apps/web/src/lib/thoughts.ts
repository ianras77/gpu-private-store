import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";

const thoughtImageSchema = z.object({
  src: z.string(),
  alt: z.string(),
  caption: z.string().optional(),
});
const thoughtAssetSchema = z.object({
  src: z.string(),
  name: z.string(),
  type: z.string(),
  kind: z.enum(["image", "audio", "video", "document", "file"]),
});

const thoughtSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  excerpt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  source: z.string().optional(),
  images: z.array(thoughtImageSchema).optional(),
  assets: z.array(thoughtAssetSchema).optional(),
  assetBasePath: z.string().optional(),
});

export type Thought = z.infer<typeof thoughtSchema>;
export type ThoughtImage = z.infer<typeof thoughtImageSchema>;
export type ThoughtAsset = z.infer<typeof thoughtAssetSchema>;

type ThoughtFrontMatter = {
  title?: string;
  summary?: string;
  excerpt?: string;
  description?: string;
  slug?: string;
  publishedAt?: string;
  updatedAt?: string;
  source?: string;
};

const storagePath =
  process.env.BLOG_STORAGE_PATH ??
  path.join(process.cwd(), "content", "thoughts");
const mediaPath = path.join(storagePath, "media");
const markdownExtensions = new Set([".md", ".markdown"]);
const thoughtAssetExtensions = new Set([
  ".avif",
  ".gif",
  ".heic",
  ".heif",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".mp3",
  ".mp4",
  ".ogg",
  ".pdf",
  ".png",
  ".svg",
  ".wav",
  ".webm",
  ".webp",
]);

const imageExtensionByMime: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

const heicImageExtensionByMime: Record<string, string> = {
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/heic-sequence": ".heic",
  "image/heif-sequence": ".heif",
};

const supportedUploadExtensions = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".heic",
  ".heif",
]);
const supportedAssetExtensions = new Set([
  ...thoughtAssetExtensions,
  ".txt", ".md", ".markdown", ".json", ".csv", ".doc", ".docx",
]);

const ensureStorage = async () => {
  await fs.mkdir(storagePath, { recursive: true });
  await fs.mkdir(mediaPath, { recursive: true });
};

const readThought = async (filePath: string) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = thoughtSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const slugify = (value: string) => {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : "thought";
};

const cleanText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeRelativePath = (value: string) => value.replace(/\\/g, "/");

const humanizeName = (value: string) => {
  const base = value
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!base) return "Untitled Thought";
  return base.replace(/\b\w/g, (match) => match.toUpperCase());
};

const stripLeadingDate = (value: string) =>
  value.replace(/^\d{4}-\d{2}-\d{2}[-_]+/, "").trim();

const isMarkdownFile = (fileName: string) =>
  markdownExtensions.has(path.extname(fileName).toLowerCase());

const naturalCompare = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

const parseScalar = (value: string): unknown => {
  const trimmed = value.trim();

  if (!trimmed) return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => String(parseScalar(item)));
  }

  return trimmed;
};

const parseFrontMatter = (source: string) => {
  if (!source.startsWith("---")) {
    return { data: {} as ThoughtFrontMatter, content: source.trim() };
  }

  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    return { data: {} as ThoughtFrontMatter, content: source.trim() };
  }

  const frontMatterLines: string[] = [];
  let index = 1;

  while (index < lines.length && lines[index]?.trim() !== "---") {
    frontMatterLines.push(lines[index] ?? "");
    index += 1;
  }

  if (index >= lines.length) {
    return { data: {} as ThoughtFrontMatter, content: source.trim() };
  }

  const data: Record<string, unknown> = {};
  let activeListKey: string | null = null;

  for (const rawLine of frontMatterLines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("- ") && activeListKey) {
      const list = Array.isArray(data[activeListKey])
        ? (data[activeListKey] as unknown[])
        : [];
      list.push(parseScalar(trimmed.slice(2)));
      data[activeListKey] = list;
      continue;
    }

    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) {
      activeListKey = null;
      continue;
    }

    const [, key, rawValue = ""] = match;
    if (!rawValue.trim()) {
      data[key] = [];
      activeListKey = key;
      continue;
    }

    data[key] = parseScalar(rawValue);
    activeListKey = null;
  }

  return {
    data: data as ThoughtFrontMatter,
    content: lines.slice(index + 1).join("\n").trim(),
  };
};

const stripMarkdown = (value: string) =>
  value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/[_*~]/g, "")
    .replace(/\r/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildExcerpt = (value: string) => {
  const cleaned = stripMarkdown(value).replace(/\s+/g, " ").trim();
  if (cleaned.length <= 180) return cleaned;
  const cut = cleaned.slice(0, 180);
  return `${cut.replace(/\s+\S*$/, "")}...`;
};

const thoughtFileExists = async (candidate: string) => {
  for (const ext of [".json", ".md", ".markdown"]) {
    try {
      await fs.stat(path.join(storagePath, `${candidate}${ext}`));
      return true;
    } catch {
      continue;
    }
  }

  return false;
};

const uniqueId = async (base: string) => {
  let candidate = base;
  let counter = 1;
  while (true) {
    if (await thoughtFileExists(candidate)) {
      candidate = `${base}-${counter}`;
      counter += 1;
      continue;
    }

    return candidate;
  }
};

const safeReaddir = async (dirPath: string) => {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
};

const walkMarkdownThoughtFiles = async (
  root: string,
  current = "",
): Promise<string[]> => {
  const dirPath = current ? path.join(root, current) : root;
  const entries = await safeReaddir(dirPath);
  const files: string[] = [];

  for (const entry of entries.sort((left, right) =>
    naturalCompare(left.name, right.name),
  )) {
    if (entry.name.startsWith(".")) continue;

    const relativePath = current ? path.join(current, entry.name) : entry.name;

    if (entry.isDirectory()) {
      files.push(...(await walkMarkdownThoughtFiles(root, relativePath)));
      continue;
    }

    if (!entry.isFile() || !isMarkdownFile(entry.name)) continue;
    if (/^readme\.markdown?$/i.test(entry.name)) continue;

    files.push(normalizeRelativePath(relativePath));
  }

  return files;
};

const toIsoDateOrFallback = (value: string, fallbackDate: Date) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallbackDate.toISOString();
  }
  return parsed.toISOString();
};

const resolveCreatedAt = (
  fileName: string,
  frontMatter: ThoughtFrontMatter,
  stat: Awaited<ReturnType<typeof fs.stat>>,
) => {
  const fallbackDate =
    stat.birthtime.getTime() > 0 ? stat.birthtime : stat.mtime;
  const publishedAt = cleanText(frontMatter.publishedAt);
  if (publishedAt) {
    return toIsoDateOrFallback(publishedAt, fallbackDate);
  }

  const datedPrefix = fileName.match(/^(\d{4}-\d{2}-\d{2})[-_]/)?.[1];
  if (datedPrefix) {
    return toIsoDateOrFallback(datedPrefix, fallbackDate);
  }

  return fallbackDate.toISOString();
};

const resolveUpdatedAt = (
  createdAt: string,
  frontMatter: ThoughtFrontMatter,
  stat: Awaited<ReturnType<typeof fs.stat>>,
) => {
  const updatedAt = cleanText(frontMatter.updatedAt);
  if (updatedAt) {
    return toIsoDateOrFallback(updatedAt, stat.mtime);
  }

  const fallback = stat.mtime.toISOString();
  return fallback !== createdAt ? fallback : undefined;
};

const buildThoughtAssetBasePath = (relativePath: string) => {
  const normalized = normalizeRelativePath(relativePath);
  const directory = path.posix.dirname(normalized);
  if (!directory || directory === ".") {
    return "/api/thoughts/assets/";
  }

  return `/api/thoughts/assets/${directory.replace(/\/+$/, "")}/`;
};

const readMarkdownThought = async (relativePath: string) => {
  try {
    const normalizedPath = normalizeRelativePath(relativePath);
    const filePath = path.join(storagePath, relativePath);
    const [raw, stat] = await Promise.all([
      fs.readFile(filePath, "utf8"),
      fs.stat(filePath),
    ]);
    const { data, content } = parseFrontMatter(raw);
    const baseName = path.basename(normalizedPath).replace(/\.[^.]+$/, "");
    const createdAt = resolveCreatedAt(path.basename(normalizedPath), data, stat);
    const updatedAt = resolveUpdatedAt(createdAt, data, stat);

    return {
      id: `md-${slugify(normalizedPath.replace(/\.[^.]+$/, "").replace(/\//g, "-"))}`,
      title:
        cleanText(data.title) ||
        humanizeName(stripLeadingDate(path.basename(baseName))),
      body: content,
      excerpt:
        cleanText(data.excerpt) ||
        cleanText(data.summary) ||
        cleanText(data.description) ||
        buildExcerpt(content),
      createdAt,
      updatedAt,
      source: cleanText(data.source) || `markdown:${normalizedPath}`,
      assetBasePath: buildThoughtAssetBasePath(normalizedPath),
    } satisfies Thought;
  } catch {
    return null;
  }
};

export const listThoughts = async (limit?: number) => {
  await ensureStorage();
  const [entries, markdownFiles] = await Promise.all([
    safeReaddir(storagePath),
    walkMarkdownThoughtFiles(storagePath),
  ]);
  const thoughts = await Promise.all([
    ...entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readThought(path.join(storagePath, entry.name))),
    ...markdownFiles.map((relativePath) => readMarkdownThought(relativePath)),
  ]);
  const filtered = thoughts.filter((item): item is Thought => Boolean(item));
  filtered.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return typeof limit === "number" ? filtered.slice(0, limit) : filtered;
};

export const createThought = async (input: {
  title: string;
  body: string;
  excerpt?: string;
  source?: string;
  images?: ThoughtImage[];
  assets?: ThoughtAsset[];
}) => {
  await ensureStorage();
  const now = new Date();
  const datePrefix = now.toISOString().slice(0, 10);
  const base = `${datePrefix}-${slugify(input.title)}`;
  const id = await uniqueId(base);
  const thought: Thought = {
    id,
    title: input.title,
    body: input.body,
    excerpt: input.excerpt ?? buildExcerpt(input.body),
    createdAt: now.toISOString(),
    source: input.source,
    images: input.images ?? [],
    assets: input.assets ?? [],
  };
  await fs.writeFile(
    path.join(storagePath, `${id}.json`),
    JSON.stringify(thought, null, 2),
  );
  return thought;
};

const sanitizeAssetBaseName = (value: string) =>
  value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 48) || "thought-image";

const normalizeImageExtension = (value: string) =>
  value === ".jpeg" ? ".jpg" : value;

export const isSupportedThoughtImageFile = (
  file: Pick<File, "type" | "name">,
) => {
  const ext = normalizeImageExtension(
    path.extname(file.name || "").toLowerCase(),
  );
  return Boolean(
    imageExtensionByMime[file.type] ||
    heicImageExtensionByMime[file.type] ||
    supportedUploadExtensions.has(ext),
  );
};

export const isSupportedThoughtAssetFile = (file: Pick<File, "name">) =>
  supportedAssetExtensions.has(path.extname(file.name || "").toLowerCase());

const assetKind = (file: File): ThoughtAsset["kind"] => {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "application/pdf" || /document|word|text|json|csv|markdown/.test(file.type)) return "document";
  return "file";
};

export const saveThoughtAssets = async (files: File[], title?: string) => {
  await ensureStorage();
  const assets: ThoughtAsset[] = [];
  for (const [index, file] of files.entries()) {
    if (!isSupportedThoughtAssetFile(file)) throw new Error(`Unsupported asset type for ${file.name || `asset-${index + 1}`}`);
    const base = sanitizeAssetBaseName(file.name || title || "thought-asset");
    const ext = path.extname(file.name || "").toLowerCase();
    const filename = `${base}-${randomUUID().slice(0, 8)}${ext}`;
    await fs.writeFile(path.join(mediaPath, filename), Buffer.from(await file.arrayBuffer()));
    assets.push({ src: `/api/thoughts/assets/${filename}`, name: file.name || filename, type: file.type || "application/octet-stream", kind: assetKind(file) });
  }
  return assets;
};

const extensionFromFile = (file: File) => {
  if (imageExtensionByMime[file.type]) return imageExtensionByMime[file.type];
  if (heicImageExtensionByMime[file.type])
    return heicImageExtensionByMime[file.type];
  const ext = normalizeImageExtension(
    path.extname(file.name || "").toLowerCase(),
  );
  return supportedUploadExtensions.has(ext) ? ext : null;
};

export const saveThoughtImages = async (
  files: File[],
  options?: {
    alt?: string;
    caption?: string;
    title?: string;
  },
) => {
  await ensureStorage();

  const images: ThoughtImage[] = [];
  for (const [index, file] of files.entries()) {
    const ext = extensionFromFile(file);
    if (!ext) {
      throw new Error(
        `Unsupported image type for ${file.name || `image-${index + 1}`}`,
      );
    }

    const base = sanitizeAssetBaseName(
      file.name || options?.title || "thought-image",
    );
    const filename = `${base}-${randomUUID().slice(0, 8)}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(mediaPath, filename), buffer);

    const defaultAlt =
      options?.alt?.trim() || options?.title?.trim() || "Thought image";
    images.push({
      src: `/api/thoughts/assets/${filename}`,
      alt: files.length > 1 ? `${defaultAlt} ${index + 1}` : defaultAlt,
      ...(index === 0 && options?.caption?.trim()
        ? { caption: options.caption.trim() }
        : {}),
    });
  }

  return images;
};

export const readThoughtAsset = async (filename: string) => {
  await ensureStorage();
  const segments = normalizeRelativePath(filename)
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (
    !segments.length ||
    segments.some(
      (segment) =>
        segment === "." || segment === ".." || segment.startsWith("."),
    )
  ) {
    throw new Error("invalid_asset_path");
  }

  const normalized = segments.join("/");
  const ext = path.extname(normalized).toLowerCase();
  if (!thoughtAssetExtensions.has(ext)) {
    throw new Error("unsupported_asset_type");
  }

  const rootPath = path.resolve(storagePath);
  const directPath = path.resolve(storagePath, normalized);
  if (
    directPath !== rootPath &&
    !directPath.startsWith(`${rootPath}${path.sep}`)
  ) {
    throw new Error("invalid_asset_path");
  }

  let filePath = directPath;
  try {
    const directStat = await fs.stat(directPath);
    if (!directStat.isFile()) {
      throw new Error("not_a_file");
    }
  } catch {
    if (segments.length !== 1) {
      throw new Error("asset_not_found");
    }

    const legacyPath = path.resolve(mediaPath, segments[0]);
    if (
      legacyPath !== rootPath &&
      !legacyPath.startsWith(`${rootPath}${path.sep}`)
    ) {
      throw new Error("invalid_asset_path");
    }

    const legacyStat = await fs.stat(legacyPath);
    if (!legacyStat.isFile()) {
      throw new Error("asset_not_found");
    }
    filePath = legacyPath;
  }

  const contentType =
    {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".avif": "image/avif",
      ".heic": "image/heic",
      ".heif": "image/heif",
      ".svg": "image/svg+xml",
      ".pdf": "application/pdf",
      ".mp3": "audio/mpeg",
      ".m4a": "audio/mp4",
      ".ogg": "audio/ogg",
      ".wav": "audio/wav",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
    }[ext] ?? "application/octet-stream";

  const body = await fs.readFile(filePath);
  return { body, contentType };
};
