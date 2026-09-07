import Link from "next/link";
import { apiGet, safeDate } from "@/lib/api";

type Report = { id: string; slug: string; status: string; kind: string; title: string; created_at?: string };
export default async function AdminReportsPage() {
  let reports: Report[] = [];
  try { reports = await apiGet<Report[]>("/api/v1/reports"); } catch { reports = []; }
  return <section><p className="eyebrow">Editorial control room</p><h1>Reports</h1><p>Review report runs, source coverage, and publication state.</p><div className="story-grid">{reports.map((report) => <article key={report.id}><p className="eyebrow">{report.status} · {safeDate(report.created_at)}</p><h2>{report.title}</h2><Link href={`/reports/${report.slug}`}>Open public view</Link></article>)}</div></section>;
}
