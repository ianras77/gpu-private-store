import { NextResponse } from "next/server";
import { dmQuery } from "../../../lib/dm/db";
import { serverConfig } from "../../../lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckStatus = {
  ok: boolean;
  latencyMs: number;
  error?: string;
  details?: Record<string, unknown>;
};

const withTimeout = async <T>(timeoutMs: number, work: (signal: AbortSignal) => Promise<T>) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
};

const checkHttp = async (url: string, timeoutMs = 2500): Promise<CheckStatus> => {
  const started = Date.now();
  try {
    const response = await withTimeout(timeoutMs, (signal) =>
      fetch(url, {
        method: "GET",
        cache: "no-store",
        signal
      })
    );

    return {
      ok: response.ok,
      latencyMs: Date.now() - started,
      ...(response.ok ? {} : { error: `http_${response.status}` })
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "request_failed"
    };
  }
};

const checkDatabase = async (): Promise<CheckStatus> => {
  const started = Date.now();
  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: "database_url_missing"
    };
  }

  try {
    const ping = await dmQuery<{ ready: number }>(`SELECT 1::int AS ready`);
    return {
      ok: Number(ping.rows[0]?.ready ?? 0) === 1,
      latencyMs: Date.now() - started,
      details: { ready: true }
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : "database_unavailable"
    };
  }
};

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  if (!deep) {
    return NextResponse.json(
      {
        ok: true,
        ts: Date.now(),
        service: "web",
      },
      { status: 200 },
    );
  }

  const intelligenceBase = (process.env.RASSY_INTELLIGENCE_URL ?? "http://rassy-intelligence:1866").replace(/\/$/, "");
  const radioBase = serverConfig.RADIO_CONTROLLER_URL.replace(/\/$/, "");
  const minecraftBase = serverConfig.MINECRAFT_BRIDGE_URL.replace(/\/$/, "");

  const [database, intelligence, radioController, minecraftBridge] = await Promise.all([
    checkDatabase(),
    checkHttp(`${intelligenceBase}/readyz`, 5000),
    checkHttp(`${radioBase}/readyz`, 4000),
    checkHttp(`${minecraftBase}/readyz`, 4000)
  ]);

  const aiRuntime = {
    ok: intelligence.ok,
    mode: intelligence.ok ? "rassy-intelligence" : "unavailable",
    latencyMs: intelligence.latencyMs,
  };
  const ok = [database, radioController, minecraftBridge, aiRuntime].every((check) => check.ok);

  return NextResponse.json(
    {
      ok,
      ts: Date.now(),
      mode: "deep",
      checks: {
        database,
        intelligence,
        aiRuntime,
        radioController,
        minecraftBridge
      }
    },
    { status: ok ? 200 : 503 }
  );
}
