import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const { listReportFiles, reportId } =
  await import("../src/lib/report-files.ts");
const root = await mkdtemp(path.join(tmpdir(), "rassys-report-files-"));
const analystRoot = path.join(root, "openfang-analyst");
const systemRoot = path.join(root, "openfang-system");
const month = path.join(root, "analyst", "2026", "09");
await mkdir(month, { recursive: true });
const valid = Buffer.from("# Public report\n\nA dated, sourced finding.\n");
await writeFile(path.join(month, "report.md"), valid);
await symlink(path.join(month, "report.md"), path.join(month, "linked.md"));
await writeFile(path.join(month, "bad name.md"), "# Invalid path");
await writeFile(path.join(month, "empty.md"), "  \n");
await mkdir(path.join(root, "system", "2026"), { recursive: true });
await symlink(month, path.join(root, "system", "2026", "09"));
await mkdir(analystRoot, { recursive: true });
await mkdir(systemRoot, { recursive: true });
const importedAnalyst = Buffer.from(
  "# OpenFang analyst report\n\nReviewed source feed.\n",
);
const importedSystem = Buffer.from("# OpenFang system report\n\nHealth notes.\n");
await writeFile(
  path.join(analystRoot, "20261004T120000Z-analyst-rassy-watch.md"),
  importedAnalyst,
);
const mirroredMonth = path.join(root, "analyst", "2026", "10");
await mkdir(mirroredMonth, { recursive: true });
await writeFile(
  path.join(mirroredMonth, "20261004T120000Z-analyst-rassy-watch.md"),
  importedAnalyst,
);
await writeFile(
  path.join(systemRoot, "20261004T120000Z-openfang-system-integration-sweep.md"),
  importedSystem,
);
await writeFile(path.join(analystRoot, "summary.md"), "# Not an approved report");
await symlink(
  path.join(analystRoot, "20261004T120000Z-analyst-rassy-watch.md"),
  path.join(analystRoot, "20261004T120001Z-analyst-rassy-watch.md"),
);

const rows = await listReportFiles(root, {
  analyst: analystRoot,
  system: systemRoot,
});
assert.equal(rows.length, 3);
const original = rows.find((row) => row.relativePath === "analyst/2026/09/report.md");
assert.equal(original?.id, reportId("analyst/2026/09/report.md"));
assert.equal(original?.sha256, createHash("sha256").update(valid).digest("hex"));
assert.equal(original?.markdown, valid.toString("utf8"));
const analyst = rows.find((row) => row.type === "analyst" && row !== original);
assert.equal(analyst?.type, "analyst");
assert.equal(analyst?.sha256, createHash("sha256").update(importedAnalyst).digest("hex"));
assert.equal(
  rows.find((row) => row.type === "system")?.sha256,
  createHash("sha256").update(importedSystem).digest("hex"),
);
console.log(
  "Report containment, symlink rejection, OpenFang source indexing, duplicate suppression, and byte hashes passed",
);
