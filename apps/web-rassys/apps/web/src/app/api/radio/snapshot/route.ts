import { NextResponse } from "next/server";
import { fetchRadio } from "../../../../lib/radio-api";
import { rateLimit } from "../../../../lib/rate-limit";
import { getClientIp, getPublicBaseUrl } from "../../../../lib/request";
import { normalizeRadioNotes, type RadioNote } from "../../../../lib/radio-notes";
import { radioApiLinks } from "../../../../lib/radio-links";
import { serverConfig } from "../../../../lib/server-config";
import { fetchUpstreamJson } from "../../../../lib/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RadioSnapshot = {
  available: boolean;
  now: Record<string, unknown> | null;
  status: Record<string, unknown> | null;
  dj: Record<string, unknown> | null;
  hears: Record<string, unknown> | null;
  latestNote: RadioNote | null;
  notes: RadioNote[];
  featured: Record<string, unknown>[];
  endpoints: {
    stream: string;
    artwork: string;
    channelM3u: string;
    channelXspf: string;
    streams: {
      mp3: string;
      lossless: string;
    };
    channels: {
      mp3: {
        m3u: string;
        xspf: string;
        pls: string;
      };
      lossless: {
        m3u: string;
        xspf: string;
        pls: string;
      };
    };
  };
  fetchedAt: string;
};

const toAbsoluteUrl = (baseUrl: string, path: string) => {
  return new URL(path, baseUrl).toString();
};

const settledValue = <T,>(
  result: PromiseSettledResult<T>,
  fallback: T,
): T => (result.status === "fulfilled" ? result.value : fallback);

export async function GET(request: Request) {
  const ip = await getClientIp();
  const baseUrl = await getPublicBaseUrl(request);
  const { allowed } = await rateLimit(`rl:radio:snapshot:${ip}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limit" }, { status: 429 });
  }

  const controllerBase = serverConfig.RADIO_CONTROLLER_URL.replace(/\/$/, "");

  const [
    nowResult,
    statusResult,
    djResult,
    hearsResult,
    notesResult,
    featuredResult,
  ] = await Promise.allSettled([
    fetchRadio<Record<string, unknown>>("/public/now"),
    fetchRadio<Record<string, unknown>>("/status"),
    fetchRadio<Record<string, unknown>>("/public/dj"),
    fetchUpstreamJson<Record<string, unknown>>(
      `${controllerBase}/public/hears`,
      {},
      {
        timeoutMs: Number(process.env.RADIO_HEARS_TIMEOUT_MS ?? 18000),
        retries: Number(process.env.RADIO_HEARS_RETRIES ?? 1),
        retryDelayMs: Number(process.env.RADIO_HEARS_RETRY_DELAY_MS ?? 400),
      },
    ),
    fetchRadio<{ notes?: RadioNote[] }>("/public/notes?limit=4"),
    fetchRadio<{ items?: Record<string, unknown>[] }>("/public/featured"),
  ]);

  const notes = normalizeRadioNotes(settledValue(notesResult, { notes: [] }).notes ?? []);
  const featured = settledValue(featuredResult, { items: [] }).items ?? [];
  const now = settledValue<Record<string, unknown> | null>(nowResult, null);
  const status = settledValue<Record<string, unknown> | null>(statusResult, null);
  const dj = settledValue<Record<string, unknown> | null>(djResult, null);
  const hears = settledValue<Record<string, unknown> | null>(hearsResult, null);
  const directMp3Stream =
    process.env.NEXT_PUBLIC_STREAM_URL?.trim() ||
    toAbsoluteUrl(baseUrl, radioApiLinks.stream.mp3);
  const directLosslessStream =
    process.env.NEXT_PUBLIC_STREAM_LOSSLESS_URL?.trim() ||
    toAbsoluteUrl(baseUrl, radioApiLinks.stream.lossless);

  const payload: RadioSnapshot = {
    available: Boolean(now || status || dj || hears || notes.length || featured.length),
    now,
    status,
    dj,
    hears,
    latestNote: notes[0] ?? null,
    notes,
    featured,
    endpoints: {
      stream: directMp3Stream,
      artwork: toAbsoluteUrl(baseUrl, "/api/radio/artwork"),
      channelM3u: toAbsoluteUrl(baseUrl, radioApiLinks.channel.m3u.mp3),
      channelXspf: toAbsoluteUrl(baseUrl, radioApiLinks.channel.xspf.mp3),
      streams: {
        mp3: directMp3Stream,
        lossless: directLosslessStream,
      },
      channels: {
        mp3: {
          m3u: toAbsoluteUrl(baseUrl, radioApiLinks.channel.m3u.mp3),
          xspf: toAbsoluteUrl(baseUrl, radioApiLinks.channel.xspf.mp3),
          pls: toAbsoluteUrl(baseUrl, radioApiLinks.channel.pls.mp3),
        },
        lossless: {
          m3u: toAbsoluteUrl(baseUrl, radioApiLinks.channel.m3u.lossless),
          xspf: toAbsoluteUrl(baseUrl, radioApiLinks.channel.xspf.lossless),
          pls: toAbsoluteUrl(baseUrl, radioApiLinks.channel.pls.lossless),
        },
      },
    },
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
