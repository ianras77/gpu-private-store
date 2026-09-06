import { serverConfig } from "../../../../lib/server-config";

const mp3StreamUrl =
  process.env.STREAM_PROXY_URL ||
  process.env.STREAM_HEALTHCHECK_URL ||
  process.env.STREAM_URL ||
  process.env.NEXT_PUBLIC_STREAM_URL ||
  "http://icecast:8000/live.mp3";

const losslessStreamUrl =
  process.env.STREAM_LOSSLESS_PROXY_URL ||
  process.env.STREAM_LOSSLESS_URL ||
  process.env.NEXT_PUBLIC_STREAM_LOSSLESS_URL ||
  "http://icecast:8000/live-lossless.ogg";
const hiresStreamUrl =
  process.env.STREAM_HIRES_PROXY_URL ||
  process.env.STREAM_HIRES_URL ||
  process.env.NEXT_PUBLIC_STREAM_HIRES_URL ||
  "http://icecast:8000/live-hires.ogg";

const radioBaseUrl = serverConfig.RADIO_CONTROLLER_URL.replace(/\/$/, "");

type StreamProbe = {
  ok: boolean;
  status: number;
  checkedWith: "head" | "range" | "error";
  error?: string;
};

type ControllerStatusPayload = {
  queueDepth?: number;
  libraryTracks?: number;
  nowPlaying?: unknown;
};

const withTimeout = async <T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const readJson = async <T,>(response: Response): Promise<T | null> =>
  response.json().catch(() => null);

const probeStream = async (url: string): Promise<StreamProbe> => {
  try {
    const response = await withTimeout(
      (signal) =>
        fetch(url, {
          method: "HEAD",
          cache: "no-store",
          signal,
        }),
      5000,
    );

    const shouldTryRange =
      response.status === 405 ||
      response.status === 501 ||
      response.status >= 400;

    if (!shouldTryRange) {
      response.body?.cancel();
      return {
        ok: response.status < 400,
        status: response.status,
        checkedWith: "head",
      };
    }

    response.body?.cancel();
    const rangeResponse = await withTimeout(
      (signal) =>
        fetch(url, {
          method: "GET",
          cache: "no-store",
          headers: {
            Range: "bytes=0-0",
          },
          signal,
        }),
      5000,
    );
    rangeResponse.body?.cancel();

    return {
      ok: rangeResponse.status < 400,
      status: rangeResponse.status,
      checkedWith: "range",
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      checkedWith: "error",
      error: error instanceof Error ? error.message : "request_failed",
    };
  }
};

const probeController = async () => {
  try {
    const [readyResponse, statusResponse] = await Promise.all([
      withTimeout(
        (signal) =>
          fetch(`${radioBaseUrl}/readyz`, {
            method: "GET",
            cache: "no-store",
            signal,
          }),
        4000,
      ),
      withTimeout(
        (signal) =>
          fetch(`${radioBaseUrl}/status`, {
            method: "GET",
            cache: "no-store",
            signal,
          }),
        4000,
      ),
    ]);

    const readyPayload = await readJson<{ ok?: boolean }>(readyResponse);
    const statusPayload = await readJson<ControllerStatusPayload>(statusResponse);
    const queueDepth =
      typeof statusPayload?.queueDepth === "number"
        ? statusPayload.queueDepth
        : null;
    const libraryTracks =
      typeof statusPayload?.libraryTracks === "number"
        ? statusPayload.libraryTracks
        : null;

    return {
      ok: readyResponse.ok && readyPayload?.ok !== false,
      statusOk: statusResponse.ok,
      queueDepth,
      libraryTracks,
      streamActive:
        statusPayload !== null
          ? Boolean(statusPayload?.nowPlaying) || (queueDepth ?? 0) > 0
          : null,
    };
  } catch (error) {
    return {
      ok: false,
      statusOk: false,
      queueDepth: null,
      libraryTracks: null,
      streamActive: null,
      error: error instanceof Error ? error.message : "controller_unavailable",
    };
  }
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [mp3, lossless, hires, controller] = await Promise.all([
    probeStream(mp3StreamUrl),
    probeStream(losslessStreamUrl),
    probeStream(hiresStreamUrl),
    probeController(),
  ]);

  const liveOk = controller.ok && (controller.streamActive ?? true);
  const mp3Ok = mp3.ok;
  const losslessOk = lossless.ok;
  const ok = mp3Ok || losslessOk;

  return Response.json(
    {
      ok,
      ts: Date.now(),
      live: {
        ok: liveOk,
        controllerReady: controller.ok,
        controllerStatusOk: controller.statusOk,
        streamActive: controller.streamActive,
        queueDepth: controller.queueDepth,
        libraryTracks: controller.libraryTracks,
        ...(controller.error ? { error: controller.error } : {}),
      },
      qualities: {
        mp3: {
          ...mp3,
          ok: mp3Ok,
        },
        lossless: {
          ...lossless,
          ok: losslessOk,
        },
        hires: {
          ...hires,
          ok: hires.ok,
        },
      },
    },
    { status: ok ? 200 : 503 },
  );
}
