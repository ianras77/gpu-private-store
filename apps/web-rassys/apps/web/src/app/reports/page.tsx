import Link from "next/link";
import { requireAdmin } from "../../lib/admin-auth";
import { listIndexedReports, type IndexedReport } from "../../lib/report-index";
import { REPORT_TYPES, type ReportType } from "../../lib/report-files";

export const dynamic = "force-dynamic";

const labels: Record<ReportType, string> = { analyst: "Analyst", system: "System", stepparentpath: "Step Parent Path" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const { q = "", type = "" } = await searchParams;
  const filterType = REPORT_TYPES.find((value) => value === type);
  const query = q.trim().toLowerCase().slice(0, 100);
  const admin = await requireAdmin();
  let reports: IndexedReport[];
  let unavailable = false;
  try { reports = await listIndexedReports(admin, filterType); }
  catch { reports = []; unavailable = true; }
  const visible = reports.filter((report) => !query || `${report.title} ${report.type}`.toLowerCase().includes(query));

  return <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
    <header className="glass-panel rounded-[30px] p-6 sm:p-10">
      <div className="eyebrow">RASSY’S // REPORTS</div>
      <h1 className="section-title mt-3 text-4xl sm:text-6xl">Read with the evidence close.</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-cloud/70">Research and editorial work, kept in Markdown and opened only after review. Each version has its own exact-byte fingerprint.</p>
      {admin && <p className="mt-3 text-xs text-glow">Admin view includes private drafts and system diagnostics.</p>}
    </header>
    <form method="get" className="mt-6 flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.035] p-4 sm:flex-row">
      <label className="flex-1 text-xs text-cloud/65">Search reports
        <input name="q" defaultValue={q.slice(0, 100)} placeholder="Title or report type" className="mt-2 w-full rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-sm text-white outline-none focus:border-glow" />
      </label>
      <label className="text-xs text-cloud/65">Type
        <select name="type" defaultValue={filterType ?? ""} className="mt-2 w-full rounded-xl border border-white/15 bg-[#160e22] px-4 py-3 text-sm text-white sm:w-48">
          <option value="">All types</option>
          {REPORT_TYPES.filter((value) => admin || value === "analyst").map((value) => <option key={value} value={value}>{labels[value]}</option>)}
        </select>
      </label>
      <button type="submit" className="self-end rounded-xl bg-glow px-5 py-3 text-sm font-semibold text-black">Find reports</button>
    </form>
    {unavailable ? <p role="alert" className="mt-8 rounded-2xl border border-amber-300/25 p-6 text-cloud/75">The report library is unavailable right now. Please try again shortly.</p>
      : visible.length ? <div className="mt-6 grid gap-4 sm:grid-cols-2">{visible.map((report) => <Link key={`${report.id}:${report.sha256}`} href={`/reports/${report.id}`} className="group rounded-3xl border border-white/10 bg-white/[0.035] p-6 transition hover:border-glow/50 hover:bg-white/[0.06]">
        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-glow"><span>{labels[report.type]}</span><span className="text-cloud/40">·</span><span>{report.relativePath.split("/").slice(1, 3).join("/")}</span></div>
        <h2 className="mt-4 text-xl font-semibold leading-snug text-white group-hover:text-glow">{report.title}</h2>
        <div className="mt-5 flex justify-between text-xs text-cloud/55"><span>{report.approvedAt ? "Approved version" : "Private draft"}</span><span>Read report →</span></div>
      </Link>)}</div>
      : <p className="mt-8 rounded-2xl border border-white/10 p-6 text-cloud/65">No reports match this view. Approved reports will appear here after review.</p>}
  </main>;
}
