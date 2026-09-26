import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { dmQuery, withDmTransaction } from "./dm/db";
import type { IndexedReport } from "./report-index";

export const REPORT_FEEDBACK_COOKIE = "rassy_report_reader";
const MAX_QUOTE = 1000;
const MAX_NOTE = 600;
const RATE_WINDOW_SECONDS = 300;
const RATE_MAX = 12;

const secret = () => {
  const value = process.env.DM_JWT_SECRET || process.env.ADMIN_JWT_SECRET;
  if (!value || value.length < 32) throw new Error("Report feedback identity secret is unavailable");
  return value;
};
const signature = (id: string) => createHmac("sha256", secret()).update(`report-feedback:${id}`).digest("base64url");

export function readReportReaderIdentity(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const match = /^([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(cookie);
  if (!match) return null;
  const expected = Buffer.from(signature(match[1]));
  const actual = Buffer.from(match[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? match[1] : null;
}

export function createReportReaderIdentity() {
  const id = randomUUID();
  return { id, cookie: `${id}.${signature(id)}` };
}

const plainText = (value: unknown, max: number) => {
  if (typeof value !== "string") return null;
  const normalized = Array.from(value.normalize("NFC"), (character) => {
    const code = character.charCodeAt(0);
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127) ? character : "";
  }).join("").trim();
  return normalized.length && normalized.length <= max ? normalized : null;
};

export type SubmittedFeedback = {
  reaction: "useful" | "question";
  quote: string;
  note: string | null;
  blockId: string | null;
  start: number | null;
  end: number | null;
};

export function parseSubmittedFeedback(body: unknown): SubmittedFeedback | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const reaction = record.reaction === "useful" || record.reaction === "question" ? record.reaction : null;
  const quote = plainText(record.quote, MAX_QUOTE);
  const note = record.note === undefined || record.note === "" ? null : plainText(record.note, MAX_NOTE);
  const blockId = record.blockId === undefined || record.blockId === "" ? null : plainText(record.blockId, 120);
  const start = Number.isInteger(record.start) && Number(record.start) >= 0 ? Number(record.start) : null;
  const end = Number.isInteger(record.end) && Number(record.end) >= 0 ? Number(record.end) : null;
  return reaction && quote && (record.note === undefined || record.note === "" || note !== null) && (record.blockId === undefined || record.blockId === "" || blockId !== null)
    ? { reaction, quote, note, blockId, start, end }
    : null;
}

const locateQuote = (markdown: string, quote: string, start: number | null, end: number | null) => {
  if (start !== null && end !== null && end > start && markdown.slice(start, end) === quote) return { start, end };
  const first = markdown.indexOf(quote);
  if (first < 0 || markdown.indexOf(quote, first + quote.length) >= 0) return null;
  return { start: first, end: first + quote.length };
};

export async function createReportFeedback(report: IndexedReport, readerId: string, feedback: SubmittedFeedback) {
  const located = locateQuote(report.markdown, feedback.quote, feedback.start, feedback.end);
  if (!located) return { ok: false as const, reason: "quote_not_unique" as const };
  const prefix = report.markdown.slice(Math.max(0, located.start - 160), located.start);
  const suffix = report.markdown.slice(located.end, located.end + 160);
  const id = randomUUID();
  const result = await withDmTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [readerId]);
    const recent = await client.query<{ count: string }>(
      "SELECT count(*) FROM rassy_report_feedback WHERE reader_id=$1 AND created_at > now() - ($2::int * interval '1 second')",
      [readerId, RATE_WINDOW_SECONDS],
    );
    if (Number(recent.rows[0]?.count ?? 0) >= RATE_MAX) return false;
    await client.query(
      `INSERT INTO rassy_report_feedback (id, report_id, report_sha256, reaction, quote_text, quote_prefix, quote_suffix, block_id, quote_start, quote_end, note, reader_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, report.id, report.sha256, feedback.reaction, feedback.quote, prefix, suffix, feedback.blockId, located.start, located.end, feedback.note, readerId],
    );
    return true;
  });
  return result ? { ok: true as const, id } : { ok: false as const, reason: "rate_limited" as const };
}

export type ReportFeedbackRow = {
  id: string; reportId: string; reportSha256: string; reaction: "useful" | "question"; quoteText: string; quotePrefix: string; quoteSuffix: string;
  blockId: string | null; quoteStart: number; quoteEnd: number; note: string | null; readerId: string; moderationState: "pending" | "accepted" | "rejected"; createdAt: string; moderatedAt: string | null; moderatedBy: string | null;
};
const feedbackRow = (row: Record<string, unknown>): ReportFeedbackRow => ({
  id: String(row.id), reportId: String(row.report_id), reportSha256: String(row.report_sha256), reaction: row.reaction as ReportFeedbackRow["reaction"], quoteText: String(row.quote_text), quotePrefix: String(row.quote_prefix), quoteSuffix: String(row.quote_suffix), blockId: row.block_id ? String(row.block_id) : null, quoteStart: Number(row.quote_start), quoteEnd: Number(row.quote_end), note: row.note ? String(row.note) : null, readerId: String(row.reader_id), moderationState: row.moderation_state as ReportFeedbackRow["moderationState"], createdAt: new Date(String(row.created_at)).toISOString(), moderatedAt: row.moderated_at ? new Date(String(row.moderated_at)).toISOString() : null, moderatedBy: row.moderated_by ? String(row.moderated_by) : null,
});

export async function listReportFeedback(state?: "pending" | "accepted" | "rejected", limit = 100) {
  const result = await dmQuery<Record<string, unknown>>(
    `SELECT * FROM rassy_report_feedback ${state ? "WHERE moderation_state=$1" : ""} ORDER BY created_at DESC LIMIT $${state ? 2 : 1}`,
    state ? [state, Math.min(limit, 200)] : [Math.min(limit, 200)],
  );
  return result.rows.map(feedbackRow);
}

export async function moderateReportFeedback(id: string, state: "accepted" | "rejected", admin: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return false;
  const result = await dmQuery("UPDATE rassy_report_feedback SET moderation_state=$2, moderated_at=now(), moderated_by=$3 WHERE id=$1", [id, state, admin]);
  return result.rowCount === 1;
}
