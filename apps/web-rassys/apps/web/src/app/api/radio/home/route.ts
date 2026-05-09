import { NextResponse } from "next/server";
import { fetchRadio } from "../../../../lib/radio-api";
import { normalizeRadioNotes, type RadioNote } from "../../../../lib/radio-notes";
import { rateLimit } from "../../../../lib/rate-limit";
import { getClientIp } from "../../../../lib/request";
import { createVolatileCache } from "../../../../lib/stale-cache";

const homeCache = createVolatileCache<Record<string, unknown>>();

const staleHeaders = (ageMs: number) => ({
  "Cache-Control": "no-store",
  "X-Rassy-Stale": "1",
  "X-Rassy-Stale-Age": String(Math.max(0, Math.round(ageMs)))
});

const settledValue = <T,>(result: PromiseSettledResult<T>, fallback: T): T =>
  result.status === "fulfilled" ? result.value : fallback;

export async function GET() {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:radio:home:${ip}`, 40, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate limit" }, { status: 429 });
  }

  try {
    const [statusResult, djResult, notesResult] = await Promise.allSettled([
      fetchRadio<Record<string, unknown>>("/status", undefined, {
        timeoutMs: Number(process.env.RADIO_HOME_TIMEOUT_MS ?? 5000),
        retries: Number(process.env.RADIO_HOME_RETRIES ?? 0),
        retryDelayMs: Number(process.env.RADIO_HOME_RETRY_DELAY_MS ?? 150)
      }),
      fetchRadio<Record<string, unknown>>("/public/dj", undefined, {
        timeoutMs: Number(process.env.RADIO_HOME_TIMEOUT_MS ?? 5000),
        retries: Number(process.env.RADIO_HOME_RETRIES ?? 0),
        retryDelayMs: Number(process.env.RADIO_HOME_RETRY_DELAY_MS ?? 150)
      }),
      fetchRadio<{ notes?: RadioNote[] }>("/public/notes?limit=5", undefined, {
        timeoutMs: Number(process.env.RADIO_HOME_NOTES_TIMEOUT_MS ?? 6500),
        retries: Number(process.env.RADIO_HOME_NOTES_RETRIES ?? 0),
        retryDelayMs: Number(process.env.RADIO_HOME_RETRY_DELAY_MS ?? 150)
      })
    ]);

    const notes = normalizeRadioNotes(
      settledValue(notesResult, { notes: [] }).notes ?? []
    );
    const payload = {
      available: true,
      status: settledValue<Record<string, unknown> | null>(statusResult, null),
      dj: settledValue<Record<string, unknown> | null>(djResult, null),
      latestNote: notes[0] ?? null,
      notes,
      fetchedAt: new Date().toISOString()
    };

    homeCache.write(payload);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch {
    const cached = homeCache.read(
      Number(process.env.RADIO_HOME_STALE_TTL_MS ?? 2 * 60 * 1000)
    );
    if (cached) {
      return NextResponse.json(cached.value, {
        headers: staleHeaders(Date.now() - cached.at)
      });
    }
    return NextResponse.json({ error: "radio_unavailable" }, { status: 502 });
  }
}
