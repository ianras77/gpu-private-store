import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

export const REPORT_TYPES = ["analyst", "system", "stepparentpath"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

const MAX_REPORT_BYTES = 1024 * 1024;
const MAX_REPORTS = 2000;
const MAX_IMPORTED_REPORTS_PER_SOURCE = 500;
const safeName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.md$/;

export type ReportFile = {
  id: string;
  type: ReportType;
  relativePath: string;
  sha256: string;
  markdown: string;
  bytes: number;
};

export const reportRoot = () =>
  path.resolve(process.env.RASSY_REPORTS_ROOT || "/reports");
export const reportId = (relativePath: string) =>
  createHash("sha256").update(relativePath).digest("hex");

export type OpenFangReportRoots = {
  analyst?: string;
  system?: string;
};

const openFangRootsFromEnvironment = (): OpenFangReportRoots => ({
  analyst: process.env.OPENFANG_ANALYST_REPORTS_PATH,
  system: process.env.OPENFANG_SYSTEM_REPORTS_PATH,
});

async function safeRegularFile(
  root: string,
  relativePath: string,
): Promise<string | null> {
  const fullPath = path.join(root, relativePath);
  const stat = await lstat(fullPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_REPORT_BYTES)
    return null;
  const actual = await realpath(fullPath);
  if (!actual.startsWith(`${root}${path.sep}`)) return null;
  return fullPath;
}

export async function listReportFiles(
  root = reportRoot(),
  openFangRoots: OpenFangReportRoots = openFangRootsFromEnvironment(),
): Promise<ReportFile[]> {
  let rootStat;
  try {
    rootStat = await lstat(root);
  } catch {
    return [];
  }
  if (
    !rootStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    (await realpath(root)) !== root
  ) {
    throw new Error("invalid_reports_root");
  }
  const files: ReportFile[] = [];
  const knownReportBytes = new Set<string>();
  for (const type of REPORT_TYPES) {
    const typePath = path.join(root, type);
    let years;
    try {
      years = await readdir(typePath, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const year of years) {
      if (
        !year.isDirectory() ||
        year.isSymbolicLink() ||
        !/^20\d{2}$/.test(year.name)
      )
        continue;
      const yearPath = path.join(typePath, year.name);
      for (const month of await readdir(yearPath, { withFileTypes: true })) {
        if (
          !month.isDirectory() ||
          month.isSymbolicLink() ||
          !/^(0[1-9]|1[0-2])$/.test(month.name)
        )
          continue;
        const monthPath = path.join(yearPath, month.name);
        for (const entry of await readdir(monthPath, { withFileTypes: true })) {
          if (files.length >= MAX_REPORTS) return files;
          if (
            !entry.isFile() ||
            entry.isSymbolicLink() ||
            !safeName.test(entry.name)
          )
            continue;
          const relativePath = [type, year.name, month.name, entry.name].join(
            "/",
          );
          const fullPath = await safeRegularFile(root, relativePath);
          if (!fullPath) continue;
          const bytes = await readFile(fullPath);
          if (bytes.length > MAX_REPORT_BYTES) continue;
          let markdown: string;
          try {
            markdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            continue;
          }
          if (!markdown.trim() || markdown.includes("\0")) continue;
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          files.push({
            id: reportId(relativePath),
            type,
            relativePath,
            sha256,
            markdown,
            bytes: bytes.length,
          });
          knownReportBytes.add(`${type}:${sha256}`);
        }
      }
    }
  }

  const importedSources = [
    {
      type: "analyst" as const,
      root: openFangRoots.analyst,
      name: /^\d{8}T\d{6}Z-analyst-rassy-(?:watch|daily|deep-dive|db-summary)\.md$/,
    },
    {
      type: "system" as const,
      root: openFangRoots.system,
      name: /^\d{8}T\d{6}Z-openfang-system-integration-sweep\.md$/,
    },
  ];

  for (const source of importedSources) {
    if (!source.root) continue;
    let sourceRoot: string;
    try {
      const stat = await lstat(source.root);
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
      sourceRoot = await realpath(source.root);
      if (sourceRoot !== source.root) continue;
    } catch {
      continue;
    }

    let entries;
    try {
      entries = await readdir(sourceRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    const eligible = entries
      .filter(
        (entry) =>
          entry.isFile() && !entry.isSymbolicLink() && source.name.test(entry.name),
      )
      .sort((left, right) => right.name.localeCompare(left.name))
      .slice(0, MAX_IMPORTED_REPORTS_PER_SOURCE);

    for (const entry of eligible) {
      const match = entry.name.match(/^(\d{4})(\d{2})\d{2}T\d{6}Z-/);
      if (!match) continue;
      const [, year, month] = match;
      const relativePath = [source.type, year, month, `openfang-${entry.name}`].join(
        "/",
      );
      const fullPath = path.join(sourceRoot, entry.name);
      let safePath: string | null = null;
      try {
        safePath = await safeRegularFile(sourceRoot, entry.name);
      } catch {
        continue;
      }
      if (!safePath || safePath !== fullPath) continue;

      const bytes = await readFile(safePath);
      if (bytes.length > MAX_REPORT_BYTES || !bytes.length) continue;
      let markdown: string;
      try {
        markdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        continue;
      }
      if (!markdown.trim() || markdown.includes("\0")) continue;
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const dedupeKey = `${source.type}:${sha256}`;
      if (knownReportBytes.has(dedupeKey)) continue;
      files.push({
        id: reportId(relativePath),
        type: source.type,
        relativePath,
        sha256,
        markdown,
        bytes: bytes.length,
      });
      knownReportBytes.add(dedupeKey);
      if (files.length >= MAX_REPORTS) return files;
    }
  }

  return files;
}
