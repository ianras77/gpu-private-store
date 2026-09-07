import { notFound } from "next/navigation";
import { apiGet, safeDate } from "@/lib/api";

type Report = { title: string; status: string; kind: string; created_at?: string; artifact: { executiveSummary: string; keyFindings: string[]; chapters: Array<{ id: string; title: string; bodyMarkdown: string; sourceIds: string[] }>; sourceNotes: Array<{ sourceId: string; title: string; url: string }> } };

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let report: Report;
  try { report = await apiGet<Report>(`/api/v1/reports/slug/${encodeURIComponent(slug)}`); } catch { notFound(); }
  if (report.status !== "published") notFound();
  return <main className="site-main report-page"><p className="eyebrow">{report.kind} · {safeDate(report.created_at)}</p><h1>{report.title}</h1><p className="lede">{report.artifact.executiveSummary}</p><h2>Key findings</h2><ul>{report.artifact.keyFindings.map((finding) => <li key={finding}>{finding}</li>)}</ul>{report.artifact.chapters.map((chapter) => <section key={chapter.id}><h2>{chapter.title}</h2><p>{chapter.bodyMarkdown}</p></section>)}<h2>Sources</h2><ol>{report.artifact.sourceNotes.map((source) => <li key={source.sourceId}><a href={source.url} rel="noreferrer">{source.title}</a></li>)}</ol></main>;
}
