import { promises as fs } from "fs";
import path from "path";
import type { WorkspaceFileEntry } from "@/lib/workspace/types";

const ROOT = process.cwd();
const MAX_ENTRIES = 500;
const MAX_FILE_BYTES = 180_000;

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "out",
  ".turbo",
  "coverage"
]);

const ALLOWED_ROOT_DIRS = new Set([
  "app",
  "components",
  "lib",
  "prisma",
  "public",
  "tests",
  "docker"
]);

const ALLOWED_ROOT_FILES = new Set([
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next.config.js",
  "tailwind.config.ts",
  "postcss.config.js",
  "vitest.config.ts",
  "docker-compose.yml",
  "Dockerfile"
]);

function isHidden(name: string) {
  return name.startsWith(".");
}

function isPathInsideRoot(resolvedPath: string) {
  const normalizedRoot = path.resolve(ROOT) + path.sep;
  return resolvedPath.startsWith(normalizedRoot);
}

export async function listWorkspaceFiles(): Promise<WorkspaceFileEntry[]> {
  const entries: WorkspaceFileEntry[] = [];

  const rootEntries = await fs.readdir(ROOT, { withFileTypes: true });
  const sorted = rootEntries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of sorted) {
    if (entries.length >= MAX_ENTRIES) break;
    if (isHidden(entry.name) || EXCLUDED_DIRS.has(entry.name)) continue;

    if (entry.isDirectory()) {
      if (!ALLOWED_ROOT_DIRS.has(entry.name)) continue;
      entries.push({ path: entry.name, type: "folder", depth: 0 });
      await walkDirectory(entry.name, 1, entries);
    } else if (entry.isFile()) {
      if (!ALLOWED_ROOT_FILES.has(entry.name)) continue;
      entries.push({ path: entry.name, type: "file", depth: 0 });
    }
  }

  return entries;
}

async function walkDirectory(relativeDir: string, depth: number, entries: WorkspaceFileEntry[]) {
  if (entries.length >= MAX_ENTRIES) return;

  const absDir = path.join(ROOT, relativeDir);
  const dirEntries = await fs.readdir(absDir, { withFileTypes: true });
  const sorted = dirEntries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of sorted) {
    if (entries.length >= MAX_ENTRIES) break;
    if (isHidden(entry.name)) continue;

    const relPath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      entries.push({ path: relPath, type: "folder", depth });
      await walkDirectory(relPath, depth + 1, entries);
    } else if (entry.isFile()) {
      entries.push({ path: relPath, type: "file", depth });
    }
  }
}

export async function readWorkspaceFile(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.includes("..")) {
    throw new Error("Invalid path");
  }

  const absPath = path.resolve(ROOT, normalized);
  if (!isPathInsideRoot(absPath)) {
    throw new Error("Invalid path");
  }

  const stats = await fs.stat(absPath);
  if (!stats.isFile()) {
    throw new Error("Not a file");
  }

  const file = await fs.open(absPath, "r");
  try {
    const length = Math.min(stats.size, MAX_FILE_BYTES);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, 0);
    const content = buffer.toString("utf8");
    return { content, truncated: stats.size > MAX_FILE_BYTES };
  } finally {
    await file.close();
  }
}
