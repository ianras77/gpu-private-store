import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import {
  parseLearningModuleFile,
  LearningValidationError,
  type ParsedLearningModule,
} from "../src/lib/learning/parse";
import { moduleSlugPattern } from "../src/lib/learning/schema";

const requestedRoot =
  process.argv[2] || process.env.LEARNING_STORAGE_PATH || "examples/learning";
const root = path.resolve(requestedRoot);

async function main() {
  let entries;
  try {
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("path is not a regular directory");
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    console.error(
      `Cannot read learning folder '${requestedRoot}': ${error instanceof Error ? error.message : "unavailable"}`,
    );
    process.exitCode = 1;
    return;
  }

  const parsed: Array<{ slug: string; value: ParsedLearningModule }> = [];
  let invalidCount = 0;
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    if (!entry.isDirectory() || !moduleSlugPattern.test(entry.name)) continue;
    try {
      const info = await lstat(path.join(root, entry.name));
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error("module folders cannot be symlinks");
      const value = await parseLearningModuleFile(
        entry.name,
        path.join(root, entry.name),
      );
      parsed.push({ slug: entry.name, value });
    } catch (error) {
      invalidCount += 1;
      const detail =
        error instanceof LearningValidationError
          ? error.issues.join("; ")
          : error instanceof Error
            ? error.message
            : "invalid module";
      console.error(`${entry.name}/module.md: ${detail}`);
    }
  }

  const validSlugs = new Set(parsed.map(({ slug }) => slug));
  const invalidSlugs = new Set<string>();
  for (const { slug, value } of parsed) {
    const references = [
      ...(value.module.metadata.related ?? []),
      ...value.referencedSlugs,
    ];
    const missing = [
      ...new Set(references.filter((reference) => !validSlugs.has(reference))),
    ];
    if (missing.length) {
      invalidSlugs.add(slug);
      console.error(
        `${slug}/module.md: referenced module does not exist (${missing.join(", ")})`,
      );
    }
  }

  invalidCount += invalidSlugs.size;
  const validModules = parsed.filter(({ slug }) => !invalidSlugs.has(slug));
  const validCount = validModules.length;
  const publishedCount = validModules.filter(
    ({ value }) => value.module.metadata.status === "published",
  ).length;
  const draftCount = validModules.filter(
    ({ value }) => value.module.metadata.status === "draft",
  ).length;
  console.log(
    `Validated ${validCount} module(s): ${publishedCount} published, ${draftCount} draft, ${invalidCount} invalid.`,
  );
  if (invalidCount) process.exitCode = 1;
}

await main();
