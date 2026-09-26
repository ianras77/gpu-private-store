import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { requireAdmin } from "../../../lib/admin-auth";
import { getIndexedReport, type IndexedReport } from "../../../lib/report-index";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function ReportReadingPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  let report: IndexedReport | null;
  try { report = await getIndexedReport((await params).id, admin); }
  catch { return <main className="mx-auto max-w-3xl px-4 py-16 text-cloud/70" role="alert">This report is unavailable right now. <Link href="/reports" className="text-glow">Back to reports</Link></main>; }
  if (!report) notFound();
  return <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-14">
    <Link href="/reports" className="text-xs uppercase tracking-[0.2em] text-glow">← All reports</Link>
    <header className="mt-6 rounded-[30px] border border-white/10 bg-white/[0.04] p-6 sm:p-10">
      <div className="eyebrow">{report.type.toUpperCase()} · {report.relativePath.split("/").slice(1, 3).join("/")}</div>
      <h1 className="section-title mt-3 text-3xl leading-tight sm:text-5xl">{report.title}</h1>
      <p className="mt-5 text-xs text-cloud/60">{report.approvedAt ? `Approved ${new Date(report.approvedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}` : "Private draft"} · Version SHA-256 {report.sha256.slice(0, 16)}…</p>
      {admin && report.type === "system" && <p className="mt-2 text-xs text-amber-200">Admin-only diagnostics. Keep this page private.</p>}
    </header>
    <article className="mt-7 overflow-x-auto rounded-[30px] border border-white/10 bg-[#120e1c] p-6 text-sm leading-8 text-cloud/85 sm:p-10 [&_a]:break-all [&_a]:text-glow [&_blockquote]:border-l-2 [&_blockquote]:border-glow/40 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_h1]:mt-8 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-black/35 [&_pre]:p-4 [&_table]:my-6 [&_table]:min-w-full [&_td]:border-b [&_td]:border-white/10 [&_td]:p-2 [&_th]:border-b [&_th]:border-white/20 [&_th]:p-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={["img", "iframe", "script", "style"]}>{report.markdown}</ReactMarkdown>
    </article>
  </main>;
}
