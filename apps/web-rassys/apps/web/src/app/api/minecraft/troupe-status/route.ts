import { NextResponse } from "next/server";
import { rateLimit } from "../../../../lib/rate-limit";
import { resolveMinecraftMapBaseUrl } from "../../../../lib/minecraft-map";
import { getClientIp } from "../../../../lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_BOT_NAMES = ["Oak", "Flint", "Juniper"];
const DEFAULT_BOT_PORT = Number(process.env.MINECRAFT_TROUPE_BOT_PORT ?? 3000);
const DEFAULT_TIMEOUT_MS = Number(
  process.env.MINECRAFT_TROUPE_STATUS_TIMEOUT_MS ?? 2500,
);

type RemoteStatusPayload = {
  bots?: [string, Record<string, unknown>][];
};

type LivePlayer = {
  name?: string;
  foreign?: boolean;
};

type LivePlayersPayload = {
  players?: LivePlayer[];
};

type BotStatus = {
  name: string;
  host: string;
  port: number;
  reachable: boolean;
  state: string;
  detail: string;
  guidance: string;
  authMode: string;
  authError: string;
  authPending: boolean;
  authRetryAt: string;
  reconnectPauseMs: number;
  currentGoal: string;
  currentSubgoal: string;
  loginIdentity: string;
  runtimeUsername: string;
  updatedAt: string;
  home: {
    x?: number;
    y?: number;
    z?: number;
  } | null;
  error: string;
};

const parseBotNames = () => {
  const configured = process.env.MINECRAFT_TROUPE_BOT_NAMES?.trim() ?? "";
  const names = (configured || DEFAULT_BOT_NAMES.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return names.length ? names : DEFAULT_BOT_NAMES;
};

const slugifyBotName = (value: string) => {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "bot";
};

const normalizeBotKey = (value: string) => value.trim().toLowerCase();

const readString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const readBoolean = (value: unknown) => value === true;

const readNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const readCoords = (value: unknown) => {
  if (!value || typeof value !== "object") return null;

  const coords = value as Record<string, unknown>;
  const x =
    typeof coords.x === "number" && Number.isFinite(coords.x)
      ? coords.x
      : undefined;
  const y =
    typeof coords.y === "number" && Number.isFinite(coords.y)
      ? coords.y
      : undefined;
  const z =
    typeof coords.z === "number" && Number.isFinite(coords.z)
      ? coords.z
      : undefined;

  if (
    typeof x !== "number" &&
    typeof y !== "number" &&
    typeof z !== "number"
  ) {
    return null;
  }

  return { x, y, z };
};

const fetchJsonWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`status_${response.status}`);
    }

    return (await response.json()) as RemoteStatusPayload;
  } finally {
    clearTimeout(timer);
  }
};

const buildUnreachableStatus = (
  name: string,
  host: string,
  port: number,
  error: string,
): BotStatus => ({
  name,
  host,
  port,
  reachable: false,
  state: "",
  detail: "",
  guidance: "",
  authMode: "",
  authError: "",
  authPending: false,
  authRetryAt: "",
  reconnectPauseMs: 0,
  currentGoal: "",
  currentSubgoal: "",
  loginIdentity: "",
  runtimeUsername: "",
  updatedAt: "",
  home: null,
  error,
});

const sanitizePublicStatus = (status: BotStatus): BotStatus => {
  if (status.state !== "auth_pending") {
    return status;
  }

  return {
    ...status,
    detail: "Microsoft sign-in is waiting in the private bot console.",
    guidance: "Complete the Microsoft sign-in flow privately to let this bot back into the world.",
  };
};

const readBotStatus = (
  name: string,
  host: string,
  port: number,
  payload: RemoteStatusPayload,
): BotStatus => {
  const entry = payload.bots?.find(([botName]) => botName === name)?.[1] ?? null;

  if (!entry || typeof entry !== "object") {
    return buildUnreachableStatus(name, host, port, "missing_status");
  }

  return sanitizePublicStatus({
    name,
    host,
    port,
    reachable: true,
    state: readString(entry.state ?? entry.status),
    detail: readString(entry.detail),
    guidance: readString(entry.guidance),
    authMode: readString(entry.auth_mode),
    authError: readString(entry.auth_error),
    authPending: readBoolean(entry.auth_pending),
    authRetryAt: readString(entry.auth_retry_at),
    reconnectPauseMs: readNumber(entry.reconnect_pause_ms),
    currentGoal: readString(entry.goal ?? entry.current_goal),
    currentSubgoal: readString(entry.subgoal ?? entry.current_subgoal),
    loginIdentity: readString(entry.login_identity),
    runtimeUsername: readString(entry.runtime_username),
    updatedAt: readString(entry.updatedAt ?? entry.updated_at),
    home: readCoords(entry.home),
    error: "",
  });
};

const fetchBotStatus = async (name: string) => {
  const host = `bots-${slugifyBotName(name)}`;
  const port = DEFAULT_BOT_PORT;
  const url = `http://${host}:${port}/status`;

  try {
    const payload = await fetchJsonWithTimeout(url, DEFAULT_TIMEOUT_MS);
    return readBotStatus(name, host, port, payload);
  } catch (error) {
    const message =
      error instanceof Error ? readString(error.message) : "fetch_failed";
    return buildUnreachableStatus(name, host, port, message || "fetch_failed");
  }
};

const fetchLivePlayers = async () => {
  const mapBaseUrl = resolveMinecraftMapBaseUrl(
    process.env.NEXT_PUBLIC_MINECRAFT_MAP_URL,
    process.env.NEXT_PUBLIC_MINECRAFT_SERVER_ADDRESS,
  );
  const url = `${mapBaseUrl.replace(/\/$/, "")}/maps/world/live/players.json`;

  try {
    const payload = (await fetchJsonWithTimeout(
      url,
      Math.min(DEFAULT_TIMEOUT_MS, 2000),
    )) as LivePlayersPayload;

    const livePlayers = new Set(
      (payload.players ?? [])
        .filter(
          (player) =>
            player &&
            !player.foreign &&
            typeof player.name === "string" &&
            player.name.trim().length > 0,
        )
        .map((player) => normalizeBotKey(String(player.name))),
    );

    return livePlayers;
  } catch {
    return new Set<string>();
  }
};

const buildMapFallbackStatus = (status: BotStatus): BotStatus => ({
  ...status,
  reachable: true,
  state: status.state || "spawned",
  detail:
    status.detail ||
    "Visible on the live world map while the direct bot status endpoint is unavailable.",
  guidance:
    status.guidance ||
    "Reconnect mc_troupe to the active web-rassys Docker network to restore richer bot telemetry.",
  updatedAt: status.updatedAt || new Date().toISOString(),
});

export async function GET() {
  const ip = await getClientIp();
  const { allowed } = await rateLimit(`rl:mc:troupe:${ip}`, 30, 60);

  if (!allowed) {
    return NextResponse.json({ error: "rate limit" }, { status: 429 });
  }

  const botNames = parseBotNames();
  const initialBots = await Promise.all(botNames.map((name) => fetchBotStatus(name)));
  const hasUnreachableBots = initialBots.some((bot) => !bot.reachable);
  const livePlayers = hasUnreachableBots ? await fetchLivePlayers() : new Set<string>();
  const bots = initialBots.map((bot) => {
    if (bot.reachable) return bot;
    if (!livePlayers.has(normalizeBotKey(bot.name))) return bot;
    return buildMapFallbackStatus(bot);
  });

  return NextResponse.json({
    bots,
    summary: {
      configured: botNames.length,
      reachable: bots.filter((bot) => bot.reachable).length,
      live: bots.filter((bot) =>
        ["spawned", "logged_in", "idle", "acting"].includes(bot.state),
      ).length,
      authFailed: bots.filter(
        (bot) => bot.state === "auth_failed" || Boolean(bot.authError),
      ).length,
      authPending: bots.filter((bot) => bot.authPending).length,
    },
  });
}
