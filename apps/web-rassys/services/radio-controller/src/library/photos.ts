import { createHash } from "crypto";
import type { Dirent } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { PhotoMedia } from "./types";

const IMAGE_MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".heif": "image/heif"
};

const VIDEO_MIME_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".webm": "video/webm"
};

const MEDIA_EXTENSIONS = new Set([
  ...Object.keys(IMAGE_MIME_TYPES),
  ...Object.keys(VIDEO_MIME_TYPES)
]);

const hashId = (value: string) =>
  createHash("sha1").update(value).digest("hex").slice(0, 16);

const toRelativePath = (root: string, file: string) =>
  path.relative(root, file).split(path.sep).join("/");

const humanizeTitle = (file: string) => {
  const basename = path.basename(file, path.extname(file)).trim();
  return basename
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Family moment";
};

const inferLocalCollection = (relativePath: string) => {
  const directory = path.posix.dirname(relativePath);
  return directory && directory !== "." ? directory : "Local drop";
};

const assertDirectory = async (root: string) => {
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) {
    throw new Error(`not_a_directory:${root}`);
  }
};

const isMediaFile = (filepath: string) =>
  MEDIA_EXTENSIONS.has(path.extname(filepath).toLowerCase());

const getMediaMimeType = (filepath: string) => {
  const ext = path.extname(filepath).toLowerCase();
  return IMAGE_MIME_TYPES[ext] ?? VIDEO_MIME_TYPES[ext] ?? "application/octet-stream";
};

const getMediaKind = (filepath: string): PhotoMedia["kind"] =>
  Object.prototype.hasOwnProperty.call(VIDEO_MIME_TYPES, path.extname(filepath).toLowerCase())
    ? "video"
    : "image";

const collectMediaFiles = async (root: string) => {
  await assertDirectory(root);

  const files: string[] = [];
  const seenFiles = new Set<string>();
  const seenDirectories = new Set<string>();
  const pendingDirectories = [root];

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop();
    if (!currentDirectory) continue;

    let resolvedDirectory: string;
    try {
      resolvedDirectory = await fs.realpath(currentDirectory);
    } catch {
      continue;
    }

    if (seenDirectories.has(resolvedDirectory)) continue;
    seenDirectories.add(resolvedDirectory);

    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(currentDirectory, {
        encoding: "utf8",
        withFileTypes: true
      });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(fullPath);
        continue;
      }

      if (entry.isFile()) {
        if (!isMediaFile(fullPath) || seenFiles.has(fullPath)) continue;
        seenFiles.add(fullPath);
        files.push(fullPath);
        continue;
      }

      if (!entry.isSymbolicLink()) continue;

      let targetStat: Awaited<ReturnType<typeof fs.stat>>;
      try {
        targetStat = await fs.stat(fullPath);
      } catch {
        continue;
      }

      if (targetStat.isDirectory()) {
        pendingDirectories.push(fullPath);
        continue;
      }

      if (!targetStat.isFile() || !isMediaFile(fullPath) || seenFiles.has(fullPath)) continue;
      seenFiles.add(fullPath);
      files.push(fullPath);
    }
  }

  return files;
};

const toPhotoMedia = async (file: string, root: string): Promise<PhotoMedia> => {
  const stat = await fs.stat(file);
  const capturedAt =
    Number.isFinite(stat.birthtimeMs) && stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs;

  return {
    id: hashId(file),
    path: file,
    relativePath: toRelativePath(root, file),
    title: humanizeTitle(file),
    kind: getMediaKind(file),
    extension: path.extname(file).toLowerCase(),
    mimeType: getMediaMimeType(file),
    fileSize: stat.size,
    capturedAt: new Date(capturedAt).toISOString(),
    updatedAt: stat.mtime.toISOString(),
    source: "local",
    sourceLabel: "Local library",
    collection: inferLocalCollection(toRelativePath(root, file))
  };
};

export const sortPhotoMedia = (items: PhotoMedia[]) =>
  items.sort((left, right) => {
    const updatedDiff = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    if (updatedDiff !== 0) return updatedDiff;
    return left.relativePath.localeCompare(right.relativePath);
  });

export const scanPhotos = async (photosPath: string) => {
  const files = await collectMediaFiles(photosPath);
  const items = await Promise.all(files.map((file) => toPhotoMedia(file, photosPath)));
  return sortPhotoMedia(items);
};

export const scanPhotosQuick = async (photosPath: string) => scanPhotos(photosPath);

export const isBrowserSafeImage = (item: Pick<PhotoMedia, "kind" | "extension">) =>
  item.kind === "image" &&
  [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"].includes(item.extension);
