#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packageRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const vendoredRoot = packageRoot;
const canonicalRoot = process.env.ASTRO_CANONICAL_REPO || "/data/apps/2-Migrated/web-astrology";
const generated = /(^|\/)(node_modules|\.next|\.vitest|dist|coverage|\.turbo|\.git)(\/|$)/;
const git = (cwd, args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
const files = (cwd) => git(cwd, ["ls-files", "-z"]).split("\0").filter((file) => file && !generated.test(file));
if (!existsSync(canonicalRoot)) { console.error(`Canonical repository not found: ${canonicalRoot}`); process.exit(2); }
const canonicalFiles = new Set(files(canonicalRoot));
const vendoredFiles = new Set(files(vendoredRoot));
const missing = [...canonicalFiles].filter((file) => !vendoredFiles.has(file));
const extra = [...vendoredFiles].filter((file) => !canonicalFiles.has(file));
const changed = [...canonicalFiles].filter((file) => vendoredFiles.has(file) && !readFileSync(join(canonicalRoot, file)).equals(readFileSync(join(vendoredRoot, file))));
const result = { canonicalRoot, canonicalSha: git(canonicalRoot, ["rev-parse", "HEAD"]), vendoredSha: git(vendoredRoot, ["rev-parse", "HEAD"]), missing, extra, changed, clean: missing.length === 0 && extra.length === 0 && changed.length === 0 };
if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
else { console.log(`canonical: ${result.canonicalSha}`); console.log(`vendored:  ${result.vendoredSha}`); console.log(`missing=${missing.length} extra=${extra.length} changed=${changed.length}`); }
process.exit(result.clean ? 0 : 1);
