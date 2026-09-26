import { dmQuery } from "./dm/db";
import { listReportFiles, type ReportFile, type ReportType } from "./report-files";

export type IndexedReport = ReportFile & {
  title: string;
  approvedAt: string | null;
  approvedBy: string | null;
};

const titleFor = (file: ReportFile) =>
  file.markdown.match(/^#\s+(.+)$/m)?.[1]?.trim().slice(0, 240) || file.relativePath.split("/").at(-1) || "Untitled report";

export const isPublicReport = (report: IndexedReport) =>
  report.type === "analyst" && Boolean(report.approvedAt);

export async function listIndexedReports(admin: boolean, type?: ReportType): Promise<IndexedReport[]> {
  const files = await listReportFiles();
  const selected = type ? files.filter((file) => file.type === type) : files;
  if (!selected.length) return [];

  await dmQuery(
    `INSERT INTO rassy_report_versions (report_id, sha256, relative_path, report_type, title)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
     ON CONFLICT DO NOTHING`,
    [selected.map((file) => file.id), selected.map((file) => file.sha256),
      selected.map((file) => file.relativePath), selected.map((file) => file.type), selected.map(titleFor)],
  );

  const ids = selected.map((file) => file.id);
  const rows = await dmQuery<{ report_id: string; sha256: string; title: string; approved_at: Date | null; approved_by: string | null }>(
    `SELECT report_id, sha256, title, approved_at, approved_by FROM rassy_report_versions WHERE report_id = ANY($1::text[])`,
    [ids],
  );
  const versionRows = new Map(rows.rows.map((row) => [`${row.report_id}:${row.sha256}`, row]));
  return selected.flatMap((file) => {
    const row = versionRows.get(`${file.id}:${file.sha256}`);
    if (!row) return [];
    const report: IndexedReport = {
      ...file,
      title: row.title,
      approvedAt: row.approved_at?.toISOString() ?? null,
      approvedBy: row.approved_by,
    };
    return admin || isPublicReport(report) ? [report] : [];
  }).sort((a, b) => b.relativePath.localeCompare(a.relativePath));
}

export async function getIndexedReport(id: string, admin: boolean): Promise<IndexedReport | null> {
  if (!/^[a-f0-9]{64}$/.test(id)) return null;
  const reports = await listIndexedReports(admin);
  return reports.find((report) => report.id === id) ?? null;
}

export async function approveAnalystReport(id: string, sha256: string, approvedBy: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(id) || !/^[a-f0-9]{64}$/.test(sha256)) return false;
  const report = await getIndexedReport(id, true);
  if (!report || report.type !== "analyst" || report.sha256 !== sha256) return false;
  const result = await dmQuery(
    `UPDATE rassy_report_versions SET approved_at=now(), approved_by=$3
     WHERE report_id=$1 AND sha256=$2 AND report_type='analyst'`,
    [id, sha256, approvedBy],
  );
  return result.rowCount === 1;
}
