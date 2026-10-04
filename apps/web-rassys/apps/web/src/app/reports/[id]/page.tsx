import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../lib/admin-auth";
import {
  getIndexedReport,
  type IndexedReport,
} from "../../../lib/report-index";
import { ReportQuoteFeedback } from "../../../components/ReportQuoteFeedback";
import { RassyMarkdown } from "../../../components/RassyMarkdown";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function ReportReadingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  let report: IndexedReport | null;
  try {
    report = await getIndexedReport((await params).id, admin);
  } catch {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-cloud/70" role="alert">
        This report is unavailable right now.{" "}
        <Link href="/reports" className="text-glow">
          Back to reports
        </Link>
      </main>
    );
  }
  if (!report) notFound();
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-14">
      <Link
        href="/reports"
        className="text-xs uppercase tracking-[0.2em] text-glow"
      >
        ← All reports
      </Link>
      <header className="mt-6 rounded-[30px] border border-white/10 bg-white/[0.04] p-6 sm:p-10">
        <div className="eyebrow">
          {report.type.toUpperCase()} ·{" "}
          {report.relativePath.split("/").slice(1, 3).join("/")}
        </div>
        <h1 className="section-title mt-3 text-3xl leading-tight sm:text-5xl">
          {report.title}
        </h1>
        <p className="mt-5 text-xs text-cloud/60">
          {report.approvedAt
            ? `Approved ${new Date(report.approvedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}`
            : "Private draft"}{" "}
          · Version SHA-256 {report.sha256.slice(0, 16)}…
        </p>
        {admin && report.type === "system" && (
          <p className="mt-2 text-xs text-amber-200">
            Admin-only diagnostics. Keep this page private.
          </p>
        )}
      </header>
      <ReportQuoteFeedback reportId={report.id} markdown={report.markdown}>
        <article className="rassy-report-reading mt-7 overflow-hidden rounded-[30px] border border-white/10 bg-[#120e1c] p-6 text-sm text-cloud/85 sm:p-10">
          <RassyMarkdown markdown={report.markdown} variant="editorial" />
        </article>
      </ReportQuoteFeedback>
    </main>
  );
}
