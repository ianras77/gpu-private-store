import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { moduleSlugPattern } from "./schema";

export const MAX_LEARNING_ASSET_BYTES = 10 * 1024 * 1024;
const allowedExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".gif",
]);
const contentTypes: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
};

export class LearningAssetError extends Error {
  constructor(
    public readonly code:
      "invalid_path" | "not_found" | "not_image" | "too_large",
  ) {
    super(code);
    this.name = "LearningAssetError";
  }
}

const validRelativeAssetPath = (value: string) => {
  if (
    !value ||
    value.includes("\\") ||
    value.includes("%") ||
    value.startsWith("/") ||
    value.includes("\0")
  )
    return false;
  const parts = value.split("/");
  return (
    parts.length >= 2 &&
    parts[0] === "assets" &&
    parts.every(
      (part) => part && part !== "." && part !== ".." && !part.startsWith("."),
    )
  );
};

export async function resolveLearningAssetPath(
  rootPath: string,
  slug: string,
  relativePath: string,
) {
  if (!moduleSlugPattern.test(slug) || !validRelativeAssetPath(relativePath)) {
    throw new LearningAssetError("invalid_path");
  }
  const extension = path.extname(relativePath).toLowerCase();
  if (!allowedExtensions.has(extension))
    throw new LearningAssetError("not_image");

  const moduleRoot = path.resolve(rootPath, slug);
  const candidate = path.resolve(moduleRoot, relativePath);
  if (!candidate.startsWith(`${moduleRoot}${path.sep}`))
    throw new LearningAssetError("invalid_path");

  try {
    const moduleStat = await lstat(moduleRoot);
    if (!moduleStat.isDirectory() || moduleStat.isSymbolicLink())
      throw new LearningAssetError("not_found");
    let current = moduleRoot;
    const segments = relativePath.split("/");
    for (const [index, segment] of segments.entries()) {
      current = path.join(current, segment);
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new LearningAssetError("invalid_path");
      if (index < segments.length - 1 && !info.isDirectory())
        throw new LearningAssetError("not_found");
      if (index === segments.length - 1 && !info.isFile())
        throw new LearningAssetError("not_found");
      if (index === segments.length - 1 && info.size > MAX_LEARNING_ASSET_BYTES)
        throw new LearningAssetError("too_large");
    }
    const [rootReal, candidateReal] = await Promise.all([
      realpath(moduleRoot),
      realpath(candidate),
    ]);
    if (!candidateReal.startsWith(`${rootReal}${path.sep}`))
      throw new LearningAssetError("invalid_path");
    return { filePath: candidateReal, contentType: contentTypes[extension] };
  } catch (error) {
    if (error instanceof LearningAssetError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new LearningAssetError("not_found");
    throw error;
  }
}

export async function readLearningRasterAsset(
  rootPath: string,
  slug: string,
  relativePath: string,
) {
  const resolved = await resolveLearningAssetPath(rootPath, slug, relativePath);
  const file = await open(
    resolved.filePath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new LearningAssetError("not_image");
    if (stat.size > MAX_LEARNING_ASSET_BYTES)
      throw new LearningAssetError("too_large");
    const bytes = await file.readFile();
    if (!hasRasterSignature(bytes, resolved.contentType))
      throw new LearningAssetError("not_image");
    return { body: bytes, contentType: resolved.contentType };
  } finally {
    await file.close();
  }
}

function hasRasterSignature(bytes: Buffer, contentType: string) {
  if (contentType === "image/png")
    return (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  if (contentType === "image/jpeg")
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  if (contentType === "image/gif")
    return (
      bytes
        .subarray(0, 6)
        .toString("ascii")
        .match(/^GIF8[79]a$/) !== null
    );
  if (contentType === "image/webp")
    return (
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    );
  if (contentType === "image/avif")
    return (
      bytes.length >= 12 &&
      bytes.toString("ascii", 4, 8) === "ftyp" &&
      /^(avif|avis)$/.test(bytes.toString("ascii", 8, 12))
    );
  return false;
}
