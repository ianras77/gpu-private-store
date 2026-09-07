import Link from "next/link";
import { apiGet, safeDate } from "@/lib/api";

type Report = { id: string; slug: string; status: string; kind: string; title: string; created_at?: string };

export default async function ReportsPage() {
  let reports: Report[] = [];
  try { reports = await apiGet<Report[]>("/api/v1/reports"); } catch { reports = []; }
  return <main className="site-main"><p className="eyebrow">Research desk</p><h1>Reports</h1><p className="lede">Long-form dossiers with visible receipts, timelines, and editorial review.</p>{reports.length === 0 ? <p>No reports are ready yet.</p> : <div className="story-grid">{reports.filter((r) => r.status === "published").map((report) => <article key={report.id}><p className="eyebrow">{report.kind} · {safeDate(report.created_at)}</p><h2><Link href={`/reports/${report.slug}`}>{report.title}</Link></h2></article>)}</div>}</main>;
}
