import "server-only";
import { access, lstat, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { LearningModule, moduleSlugPattern } from "./schema";
import {
  parseLearningModuleFile,
  LearningValidationError,
  ParsedLearningModule,
} from "./parse";

const CATALOG_TTL_MS = 30_000;
export class LearningStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LearningStorageError";
  }
}

type CatalogModule = Pick<LearningModule, "metadata" | "estimatedMinutes">;
let catalogCache: { expiresAt: number; modules: CatalogModule[] } | null = null;
let catalogRefresh: Promise<CatalogModule[]> | null = null;

export async function learningStoragePath() {
  const configuredPath = process.env.LEARNING_STORAGE_PATH?.trim();
  if (configuredPath) {
    if (!path.isAbsolute(configuredPath))
      throw new LearningStorageError(
        "LEARNING_STORAGE_PATH must be an absolute path",
      );
    return path.resolve(configuredPath);
  }
  if (process.env.NODE_ENV === "production") {
    throw new LearningStorageError(
      "Learning content is not mounted. Set LEARNING_STORAGE_PATH to the read-only learning folder.",
    );
  }

  const fromCwd = [
    path.resolve(process.cwd(), "examples/learning"),
    path.resolve(process.cwd(), "apps/web/examples/learning"),
  ];
  for (const candidate of fromCwd) {
    try {
      const info = await lstat(candidate);
      if (info.isDirectory() && !info.isSymbolicLink()) return candidate;
    } catch {
      // Keep checking the known locations; report the selected default below.
    }
  }
  return fromCwd[0]!;
}

async function verifyRoot(rootPath: string) {
  try {
    const info = await lstat(rootPath);
    if (!info.isDirectory())
      throw new LearningStorageError(
        "The configured learning path is not a directory.",
      );
    await access(rootPath, constants.R_OK | constants.X_OK);
  } catch (error) {
    if (error instanceof LearningStorageError) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT")
      throw new LearningStorageError(
        "The configured learning folder is missing.",
      );
    if (code === "EACCES" || code === "EPERM")
      throw new LearningStorageError(
        "The configured learning folder cannot be read.",
      );
    throw new LearningStorageError(
      "The configured learning folder is unavailable.",
    );
  }
}

async function scanModules(): Promise<
  Array<{ parsed: ParsedLearningModule; directory: string }>
> {
  const root = await learningStoragePath();
  await verifyRoot(root);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM")
      throw new LearningStorageError(
        "The configured learning folder cannot be read.",
      );
    throw new LearningStorageError(
      "The configured learning folder could not be scanned.",
    );
  }

  const parsedModules: Array<{
    parsed: ParsedLearningModule;
    directory: string;
  }> = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    if (!entry.isDirectory() || !moduleSlugPattern.test(entry.name)) continue;
    const directory = path.join(root, entry.name);
    try {
      const folderInfo = await lstat(directory);
      if (!folderInfo.isDirectory() || folderInfo.isSymbolicLink()) continue;
      const parsed = await parseLearningModuleFile(entry.name, directory);
      parsedModules.push({ parsed, directory });
    } catch (error) {
      const detail =
        error instanceof LearningValidationError
          ? error.issues.join("; ")
          : (error as NodeJS.ErrnoException).code === "ENOENT"
            ? "module.md is missing"
            : "module could not be read";
      console.warn(`[learning] Ignoring ${entry.name}/module.md: ${detail}`);
    }
  }

  const knownSlugs = new Set(
    parsedModules.map(({ parsed }) => parsed.module.metadata.slug),
  );
  return parsedModules.filter(({ parsed }) => {
    const references = [
      ...(parsed.module.metadata.related ?? []),
      ...parsed.referencedSlugs,
    ];
    const missing = references.filter(
      (reference) => !knownSlugs.has(reference),
    );
    if (missing.length) {
      console.warn(
        `[learning] Ignoring ${parsed.module.metadata.slug}/module.md: referenced module does not exist (${[...new Set(missing)].join(", ")})`,
      );
      return false;
    }
    return true;
  });
}

async function refreshCatalog() {
  if (catalogRefresh) return catalogRefresh;
  catalogRefresh = scanModules()
    .then((entries) =>
      entries
        .filter(({ parsed }) => parsed.module.metadata.status === "published")
        .map(({ parsed }) => ({
          metadata: parsed.module.metadata,
          estimatedMinutes: parsed.module.estimatedMinutes,
        }))
        .sort((left, right) =>
          left.metadata.title.localeCompare(right.metadata.title),
        ),
    )
    .then((modules) => {
      catalogCache = { modules, expiresAt: Date.now() + CATALOG_TTL_MS };
      return modules;
    })
    .finally(() => {
      catalogRefresh = null;
    });
  return catalogRefresh;
}

export async function listPublishedLearningModules() {
  if (catalogCache && catalogCache.expiresAt > Date.now())
    return catalogCache.modules;
  return refreshCatalog();
}

export async function getPublishedLearningModule(
  slug: string,
): Promise<LearningModule | null> {
  if (!moduleSlugPattern.test(slug)) return null;
  const entries = await scanModules();
  return (
    entries.find(
      ({ parsed }) =>
        parsed.module.metadata.slug === slug &&
        parsed.module.metadata.status === "published",
    )?.parsed.module ?? null
  );
}
