import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { listReportFiles, reportId } = await import("../src/lib/report-files.ts");
const root = await mkdtemp(path.join(tmpdir(), "rassys-report-files-"));
const month = path.join(root, "analyst", "2026", "09");
await mkdir(month, { recursive: true });
const valid = Buffer.from("# Public report\n\nA dated, sourced finding.\n");
await writeFile(path.join(month, "report.md"), valid);
await symlink(path.join(month, "report.md"), path.join(month, "linked.md"));
await writeFile(path.join(month, "bad name.md"), "# Invalid path");
await writeFile(path.join(month, "empty.md"), "  \n");
await mkdir(path.join(root, "system", "2026"), { recursive: true });
await symlink(month, path.join(root, "system", "2026", "09"));

const rows = await listReportFiles(root);
assert.equal(rows.length, 1);
assert.equal(rows[0].id, reportId("analyst/2026/09/report.md"));
assert.equal(rows[0].sha256, createHash("sha256").update(valid).digest("hex"));
assert.equal(rows[0].markdown, valid.toString("utf8"));
console.log("Report containment, symlink rejection and byte hash passed");
