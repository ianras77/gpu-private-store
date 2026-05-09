import { NextResponse } from "next/server";
import { fetchRadio } from "../../../../lib/radio-api";
import { rateLimit } from "../../../../lib/rate-limit";
import { getClientIp } from "../../../../lib/request";
import { createVolatileCache } from "../../../../lib/stale-cache";

const statusCache = createVolatileCache<Record<string, unknown>>();

const staleHeaders = (ageMs: number) => ({
  "Cache-Control": "no-store",
  "X-Rassy-Stale": "1",
  "X-Rassy-Stale-Age": String(Math.max(0, Math.round(ageMs)))
});

export async function GET() {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:radio:status:${ip}`, 30, 60);
  if (!allowed) return NextResponse.json({ error: "rate limit" }, { status: 429 });
  try {
    const data = await fetchRadio<Record<string, unknown>>("/status", undefined, {
      timeoutMs: Number(process.env.RADIO_STATUS_TIMEOUT_MS ?? 3500),
      retries: Number(process.env.RADIO_STATUS_RETRIES ?? 0),
      retryDelayMs: Number(process.env.RADIO_STATUS_RETRY_DELAY_MS ?? 150)
    });
    statusCache.write(data ?? {});
    return NextResponse.json(data ?? {}, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch {
    const cached = statusCache.read(Number(process.env.RADIO_STATUS_STALE_TTL_MS ?? 2 * 60 * 1000));
    if (cached) {
      return NextResponse.json(cached.value, {
        headers: staleHeaders(Date.now() - cached.at)
      });
    }
    return NextResponse.json({ error: "radio_unavailable" }, { status: 502 });
  }
}
