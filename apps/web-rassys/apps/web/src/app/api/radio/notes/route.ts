import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchRadio } from "../../../../lib/radio-api";
import { rateLimit } from "../../../../lib/rate-limit";
import { getClientIp } from "../../../../lib/request";
import { normalizeRadioNotes, type RadioNote } from "../../../../lib/radio-notes";
import { createVolatileCache } from "../../../../lib/stale-cache";

const notesCache = createVolatileCache<Record<string, unknown> & { notes: RadioNote[] }>();

const staleHeaders = (ageMs: number) => ({
  "Cache-Control": "no-store",
  "X-Rassy-Stale": "1",
  "X-Rassy-Stale-Age": String(Math.max(0, Math.round(ageMs)))
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).optional()
});

export async function GET(request: Request) {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:radio:notes:${ip}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: "rate limit" }, { status: 429 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const limit = parsed.data.limit ?? 3;

  try {
    const data = await fetchRadio<{ notes?: RadioNote[] }>(`/public/notes?limit=${limit}`, undefined, {
      timeoutMs: Number(process.env.RADIO_NOTES_TIMEOUT_MS ?? 5000),
      retries: Number(process.env.RADIO_NOTES_RETRIES ?? 0),
      retryDelayMs: Number(process.env.RADIO_NOTES_RETRY_DELAY_MS ?? 200)
    });
    const payload = {
      ...data,
      notes: normalizeRadioNotes(data.notes ?? [])
    };
    notesCache.write(payload);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch {
    const cached = notesCache.read(Number(process.env.RADIO_NOTES_STALE_TTL_MS ?? 10 * 60 * 1000));
    if (cached) {
      return NextResponse.json(cached.value, {
        headers: staleHeaders(Date.now() - cached.at)
      });
    }
    return NextResponse.json({ error: "radio_unavailable" }, { status: 502 });
  }
}
