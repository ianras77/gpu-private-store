import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

export const REPORT_TYPES = ["analyst", "system", "stepparentpath"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

const MAX_REPORT_BYTES = 1024 * 1024;
const MAX_REPORTS = 2000;
const safeName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.md$/;

export type ReportFile = {
  id: string;
  type: ReportType;
  relativePath: string;
  sha256: string;
  markdown: string;
  bytes: number;
};

export const reportRoot = () => path.resolve(process.env.RASSY_REPORTS_ROOT || "/reports");
export const reportId = (relativePath: string) => createHash("sha256").update(relativePath).digest("hex");

async function safeRegularFile(root: string, relativePath: string): Promise<string | null> {
  const fullPath = path.join(root, relativePath);
  const stat = await lstat(fullPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_REPORT_BYTES) return null;
  const actual = await realpath(fullPath);
  if (!actual.startsWith(`${root}${path.sep}`)) return null;
  return fullPath;
}

export async function listReportFiles(root = reportRoot()): Promise<ReportFile[]> {
  let rootStat;
  try { rootStat = await lstat(root); } catch { return []; }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || (await realpath(root)) !== root) {
    throw new Error("invalid_reports_root");
  }
  const files: ReportFile[] = [];
  for (const type of REPORT_TYPES) {
    const typePath = path.join(root, type);
    let years;
    try { years = await readdir(typePath, { withFileTypes: true }); } catch { continue; }
    for (const year of years) {
      if (!year.isDirectory() || year.isSymbolicLink() || !/^20\d{2}$/.test(year.name)) continue;
      const yearPath = path.join(typePath, year.name);
      for (const month of await readdir(yearPath, { withFileTypes: true })) {
        if (!month.isDirectory() || month.isSymbolicLink() || !/^(0[1-9]|1[0-2])$/.test(month.name)) continue;
        const monthPath = path.join(yearPath, month.name);
        for (const entry of await readdir(monthPath, { withFileTypes: true })) {
          if (files.length >= MAX_REPORTS) return files;
          if (!entry.isFile() || entry.isSymbolicLink() || !safeName.test(entry.name)) continue;
          const relativePath = [type, year.name, month.name, entry.name].join("/");
          const fullPath = await safeRegularFile(root, relativePath);
          if (!fullPath) continue;
          const bytes = await readFile(fullPath);
          if (bytes.length > MAX_REPORT_BYTES) continue;
          let markdown: string;
          try { markdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { continue; }
          if (!markdown.trim() || markdown.includes("\0")) continue;
          files.push({
            id: reportId(relativePath), type, relativePath,
            sha256: createHash("sha256").update(bytes).digest("hex"),
            markdown, bytes: bytes.length,
          });
        }
      }
    }
  }
  return files;
}
