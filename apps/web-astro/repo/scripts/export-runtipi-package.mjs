#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const targetRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const canonicalRoot = process.env.ASTRO_CANONICAL_REPO || "/data/apps/2-Migrated/web-astrology";
const apply = process.argv.includes("--apply");
if (!existsSync(canonicalRoot)) throw new Error(`Canonical repository not found: ${canonicalRoot}`);

const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const sha = git(canonicalRoot, ["rev-parse", "HEAD"]);
if (!apply) {
  console.log(`Dry run only. Canonical source: ${canonicalRoot}`);
  console.log(`Would export commit: ${sha}`);
  console.log("Deployment-only vendored files are preserved; no files are deleted.");
  console.log("Re-run with --apply to copy canonical tracked files into repo/.");
  process.exit(0);
}

execFileSync("rsync", ["-a", "--exclude", ".git/", "--exclude", "node_modules/", "--exclude", ".next/", "--exclude", ".vitest/", "--exclude", "dist/", `${canonicalRoot}/`, `${targetRoot}/`], { stdio: "inherit" });
const treeHash = createHash("sha256").update(git(canonicalRoot, ["ls-files", "-s"])).digest("hex");
const provenance = { sourceRepository: "ianras77/web-astrology", sourceCommit: sha, sourceTreeHash: treeHash, exportedAt: new Date().toISOString(), deploymentOnlyFilesPreserved: true };
writeFileSync(join(targetRoot, ".source-provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`Exported canonical commit ${sha} into ${targetRoot}`);
