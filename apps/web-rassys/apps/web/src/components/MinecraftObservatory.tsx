"use client";

import useSWR from "swr";
import { useState } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { formatTimeAgo } from "../lib/utils";
import {
  normalizeMinecraftServerHost,
  resolveMinecraftMapBaseUrl,
} from "../lib/minecraft-map";

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`request_failed_${response.status}`);
  }

  return (await response.json()) as T;
};

type MinecraftEvent = {
  id?: string;
  ts?: string;
  bot?: string;
  type?: string;
  action?: string;
  detail?: string;
  message?: string;
  coords?: {
    x?: number;
    y?: number;
    z?: number;
  };
};

type LivePlayer = {
  uuid?: string;
  name: string;
  foreign?: boolean;
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation?: {
    yaw?: number;
  };
};

type LivePlayersPayload = {
  players?: LivePlayer[];
};

type MapSettingsPayload = {
  maps?: string[];
};

type TroupeBotStatus = {
  name: string;
  reachable?: boolean;
  state?: string;
  detail?: string;
  guidance?: string;
  authMode?: string;
  authError?: string;
  authPending?: boolean;
  authRetryAt?: string;
  reconnectPauseMs?: number;
  currentGoal?: string;
  currentSubgoal?: string;
  loginIdentity?: string;
  runtimeUsername?: string;
  updatedAt?: string;
  error?: string;
  home?: {
    x?: number;
    y?: number;
    z?: number;
  } | null;
};

type TroupeStatusPayload = {
  bots?: TroupeBotStatus[];
  summary?: {
    configured?: number;
    reachable?: number;
    live?: number;
    authFailed?: number;
    authPending?: number;
  };
};

const BOT_STATE_LABELS: Record<string, string> = {
  auth_failed: "needs verified login",
  auth_pending: "waiting for sign-in",
  connecting: "connecting",
  disconnected: "offline",
  reconnecting: "reconnecting",
  kicked: "kicked",
  spawned: "in world",
  logged_in: "in world",
  idle: "standing by",
  acting: "working",
  brain_error: "brain hiccup",
};

const truncateMessage = (value: string, max = 180) => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
};

const roundCoord = (value?: number) =>
  typeof value === "number" ? Math.round(value) : 0;

const describeCoords = (coords?: { x?: number; y?: number; z?: number } | null) =>
  coords
    ? `x${roundCoord(coords.x)} y${roundCoord(coords.y)} z${roundCoord(coords.z)}`
    : "";

const describeBotState = (bot?: TroupeBotStatus | null) => {
  const state = String(bot?.state ?? "").trim();
  if (!state) return "standing by";
  return BOT_STATE_LABELS[state] ?? state.replace(/_/g, " ");
};

const describeBotNote = (bot: TroupeBotStatus) =>
  truncateMessage(
    String(
      bot.detail ||
        bot.guidance ||
        bot.currentGoal ||
        "Standing by for the next move.",
    ),
    132,
  );

const formatRetryText = (iso?: string) => {
  const target = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(target)) return "";

  const deltaMs = target - Date.now();
  if (deltaMs <= 1000) return "Retrying now";

  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) return "Retrying in under a minute";
  if (minutes < 60) return `Retrying in ${minutes}m`;

  const hours = Math.round(minutes / 60);
  return `Retrying in ${hours}h`;
};

export function MinecraftObservatory({
  mode = "home",
}: {
  mode?: "home" | "page";
}) {
  const { data: events } = useSWR<MinecraftEvent[]>(
    "/api/minecraft/events",
    fetchJson,
    {
      refreshInterval: 5000,
    },
  );
  const { data: troupeData } = useSWR<TroupeStatusPayload>(
    "/api/minecraft/troupe-status",
    fetchJson,
    {
      refreshInterval: 5000,
    },
  );
  const publicMapUrl = resolveMinecraftMapBaseUrl(
    process.env.NEXT_PUBLIC_MINECRAFT_MAP_URL,
    process.env.NEXT_PUBLIC_MINECRAFT_SERVER_ADDRESS,
  );
  const publicMapEntryUrl = publicMapUrl
    ? `${publicMapUrl.replace(/\/$/, "")}/index.html`
    : "";
  const relayAddress = normalizeMinecraftServerHost(
    process.env.NEXT_PUBLIC_MINECRAFT_SERVER_ADDRESS,
  );
  const [copied, setCopied] = useState(false);

  const { data: playersData, error: playersError } = useSWR<LivePlayersPayload>(
    publicMapUrl ? "/mc-troupe-map/maps/world/live/players.json" : null,
    fetchJson,
    { refreshInterval: 5000 },
  );
  const { data: mapSettings, error: mapSettingsError } =
    useSWR<MapSettingsPayload>(
      publicMapUrl ? "/mc-troupe-map/settings.json" : null,
      fetchJson,
      { refreshInterval: 60000 },
    );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(relayAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const botStatuses = Array.isArray(troupeData?.bots) ? troupeData.bots : [];
  const reachableBots = botStatuses.filter((bot) => bot.reachable);
  const authFailedBots = reachableBots.filter(
    (bot) => bot.state === "auth_failed" || Boolean(bot.authError),
  );
  const botStatusByName = new Map(
    reachableBots.map((bot) => [String(bot.name ?? "").trim().toLowerCase(), bot]),
  );

  const rawFeed = Array.isArray(events) ? events.slice(0, 30) : [];
  const feed = rawFeed
    .filter((event, index) => {
      const botKey = String(event.bot ?? "").trim().toLowerCase();
      const botStatus = botKey ? botStatusByName.get(botKey) : null;

      if (
        event.action === "disconnect" &&
        botStatus &&
        (botStatus.state === "auth_failed" || Boolean(botStatus.authError))
      ) {
        return false;
      }

      const previous = rawFeed[index - 1];
      if (!previous) return true;

      return (
        previous.bot !== event.bot ||
        previous.action !== event.action ||
        previous.message !== event.message ||
        previous.detail !== event.detail
      );
    })
    .slice(0, 30);

  const latestEvent = feed[0];
  const primaryBotStatus = authFailedBots[0] ?? reachableBots[0];
  const players = Array.isArray(playersData?.players) ? playersData.players : [];
  const activeBots = Array.from(
    new Set(
      [
        ...reachableBots.map((bot) => String(bot.name ?? "").trim()),
        ...feed.map((event) => String(event?.bot ?? "").trim()),
      ].filter(Boolean),
    ),
  );
  const botPreview = activeBots.slice(0, 3);
  const latestSignal = latestEvent
    ? `${latestEvent.bot ?? latestEvent.type ?? "Signal"} ${formatTimeAgo(latestEvent.ts)}`
    : primaryBotStatus
      ? `${primaryBotStatus.name} ${describeBotState(primaryBotStatus)}`
      : "Bridge listening for the first troupe pulse.";
  const latestCoords = latestEvent?.coords
    ? describeCoords(latestEvent.coords)
    : primaryBotStatus?.home
      ? `home ${describeCoords(primaryBotStatus.home)}`
      : publicMapUrl && (playersError || mapSettingsError)
        ? "BlueMap is offline right now, but the troupe status is still live here."
        : "Coordinates will land here when the next event arrives.";
  const mapAvailable =
    Boolean(publicMapUrl) &&
    ((!playersError && Boolean(playersData)) ||
      (!mapSettingsError && Boolean(mapSettings)));
  const mapUnavailable =
    Boolean(publicMapUrl) && !mapAvailable && Boolean(playersError || mapSettingsError);
  const mapLinkUrl = mapAvailable ? publicMapEntryUrl || publicMapUrl : "";
  const worldCount = Array.isArray(mapSettings?.maps) ? mapSettings.maps.length : 0;
  const troupeMarkers = reachableBots
    .filter(
      (bot) =>
        typeof bot.home?.x === "number" && typeof bot.home?.z === "number",
    )
    .map((bot) => ({
      key: `${bot.name}-home`,
      label: bot.name,
      x: Number(bot.home?.x ?? 0),
      z: Number(bot.home?.z ?? 0),
      y: Number(bot.home?.y ?? 0),
      kind: "bot" as const,
    }));
  const signalPoints = [
    ...players.map((player, index) => ({
      key: player.uuid ?? `${player.name}-${index}`,
      label: player.name,
      x: Number(player.position?.x ?? 0),
      z: Number(player.position?.z ?? 0),
      y: Number(player.position?.y ?? 0),
      kind: "player" as const,
    })),
    ...troupeMarkers,
    ...feed
      .slice(0, 8)
      .filter(
        (event) =>
          typeof event?.coords?.x === "number" &&
          typeof event?.coords?.z === "number",
      )
      .map((event, index) => ({
        key: event.id ?? `${event.ts ?? "event"}-${index}`,
        label: event.bot ?? event.type ?? "Signal",
        x: Number(event.coords?.x ?? 0),
        z: Number(event.coords?.z ?? 0),
        y: Number(event.coords?.y ?? 0),
        kind: "event" as const,
      })),
  ];

  const fallbackCenterX =
    typeof latestEvent?.coords?.x === "number"
      ? Number(latestEvent.coords.x)
      : troupeMarkers[0]?.x ?? players[0]?.position?.x ?? 0;
  const fallbackCenterZ =
    typeof latestEvent?.coords?.z === "number"
      ? Number(latestEvent.coords.z)
      : troupeMarkers[0]?.z ?? players[0]?.position?.z ?? 0;
  const xValues = signalPoints.map((point) => point.x);
  const zValues = signalPoints.map((point) => point.z);
  const minXRaw = xValues.length ? Math.min(...xValues) : fallbackCenterX - 16;
  const maxXRaw = xValues.length ? Math.max(...xValues) : fallbackCenterX + 16;
  const minZRaw = zValues.length ? Math.min(...zValues) : fallbackCenterZ - 16;
  const maxZRaw = zValues.length ? Math.max(...zValues) : fallbackCenterZ + 16;
  const paddingX = Math.max(12, (maxXRaw - minXRaw) * 0.28 || 12);
  const paddingZ = Math.max(12, (maxZRaw - minZRaw) * 0.28 || 12);
  const minX = minXRaw - paddingX;
  const maxX = maxXRaw + paddingX;
  const minZ = minZRaw - paddingZ;
  const maxZ = maxZRaw + paddingZ;
  const xRange = Math.max(1, maxX - minX);
  const zRange = Math.max(1, maxZ - minZ);
  const authSummary =
    authFailedBots.length > 0
      ? `${authFailedBots.length} troupe bot${authFailedBots.length === 1 ? "" : "s"} waiting on verified Minecraft login.`
      : reachableBots.length > 0
        ? `${reachableBots.length} troupe bot${reachableBots.length === 1 ? "" : "s"} reporting in here.`
        : "The observatory will surface the troupe state as soon as their endpoints answer.";

  const toLeft = (x: number) => ((x - minX) / xRange) * 100;
  const toTop = (z: number) => 100 - ((z - minZ) / zRange) * 100;

  return (
    <section id="troupe" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-16">
      <div className="mb-8 flex flex-col gap-3">
        <h2 className="section-title text-3xl">
          <span className="magical-text">mc_troupe</span> Observatory
        </h2>
        <p className="text-cloud/80">
          This is the page where I keep an eye on my Minecraft world: who is
          moving, what the troupe is doing, and whether the bots are actually
          online.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="overflow-hidden p-0">
          <div className="grid md:grid-cols-[1.08fr_0.92fr]">
            <div className="relative border-b border-white/8 md:border-b-0 md:border-r md:border-white/8">
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(66,245,255,0.15),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,79,216,0.14),transparent_34%),linear-gradient(160deg,rgba(8,12,27,0.95),rgba(11,32,35,0.86))]"
                aria-hidden="true"
              />
              <div className="relative flex h-full flex-col p-5 md:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.32em] text-cloud/60">
                      World Snapshot
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      World at a glance
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.24em] text-cloud/60">
                    <span className="rave-chip rounded-full px-3 py-1">
                      {feed.length} recent moments
                    </span>
                    <span className="rave-chip rounded-full px-3 py-1">
                      {reachableBots.length} troupe bots
                    </span>
                    {mapAvailable && (
                      <span className="rave-chip rounded-full px-3 py-1">
                        {players.length} live players
                      </span>
                    )}
                    {mapUnavailable && (
                      <span className="rave-chip rounded-full px-3 py-1">
                        BlueMap offline
                      </span>
                    )}
                    {authFailedBots.length > 0 && (
                      <span className="rave-chip rounded-full px-3 py-1">
                        {authFailedBots.length} need sign-in
                      </span>
                    )}
                    {worldCount > 0 && (
                      <span className="rave-chip rounded-full px-3 py-1">
                        {worldCount} worlds online
                      </span>
                    )}
                  </div>
                </div>

                <p className="mt-3 max-w-xl text-sm leading-6 text-cloud/78">
                  A lighter live check-in built from player positions, troupe
                  status, and recent bridge events.
                </p>

                <div className="relative mt-5 min-h-[280px] overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,13,26,0.92),rgba(6,17,20,0.92))]">
                  <div
                    className="absolute inset-0 opacity-40"
                    aria-hidden="true"
                  >
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={`h-${index}`}
                        className="absolute left-0 right-0 border-t border-dashed border-white/8"
                        style={{ top: `${20 + index * 15}%` }}
                      />
                    ))}
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={`v-${index}`}
                        className="absolute bottom-0 top-0 border-l border-dashed border-white/8"
                        style={{ left: `${18 + index * 16}%` }}
                      />
                    ))}
                  </div>
                  <div
                    className="absolute bottom-0 left-1/2 top-0 border-l border-white/8"
                    aria-hidden="true"
                  />
                  <div
                    className="absolute left-0 right-0 top-1/2 border-t border-white/8"
                    aria-hidden="true"
                  />
                  <div className="absolute left-4 top-4 text-[10px] uppercase tracking-[0.24em] text-cloud/45">
                    z+
                  </div>
                  <div className="absolute bottom-4 right-4 text-[10px] uppercase tracking-[0.24em] text-cloud/45">
                    x+
                  </div>

                  {signalPoints.length ? (
                    signalPoints.map((point, index) => (
                      <div
                        key={point.key}
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: `${toLeft(point.x)}%`,
                          top: `${toTop(point.z)}%`,
                        }}
                      >
                        <div
                          className={`relative flex items-center justify-center ${
                            point.kind === "player" ? "h-4 w-4" : "h-3 w-3"
                          }`}
                        >
                          <div
                            className={`absolute rounded-full ${
                              point.kind === "player"
                                ? "h-8 w-8 bg-glow/20 blur-md"
                                : point.kind === "bot"
                                  ? "h-7 w-7 bg-comet/18 blur-md"
                                  : index === 0
                                    ? "h-7 w-7 bg-aurora/15 blur-md"
                                    : "h-5 w-5 bg-white/5 blur-sm"
                            }`}
                          />
                          <div
                            className={`relative rounded-full border ${
                              point.kind === "player"
                                ? "h-4 w-4 border-white/70 bg-glow shadow-[0_0_18px_rgba(255,241,128,0.42)]"
                                : point.kind === "bot"
                                  ? "h-3 w-3 border-white/55 bg-comet shadow-[0_0_14px_rgba(255,79,216,0.35)]"
                                  : index === 0
                                    ? "h-3 w-3 border-white/50 bg-aurora"
                                    : "h-3 w-3 border-white/25 bg-white/35"
                            }`}
                          />
                        </div>
                        <div className="mt-2 whitespace-nowrap rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-cloud/72">
                          {point.label}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex h-full min-h-[280px] items-center justify-center px-6 text-center text-sm text-cloud/70">
                      {mapUnavailable
                        ? "BlueMap is down right now. The troupe relay and join address are still live below."
                        : reachableBots.length
                          ? "Waiting for live map coordinates. The troupe status cards below are still current."
                          : "Waiting for live coordinates from BlueMap and the bridge."}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/60">
                  {mapAvailable && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-glow shadow-[0_0_14px_rgba(255,230,109,0.45)]" />
                      live players
                    </span>
                  )}
                  {troupeMarkers.length > 0 && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-comet shadow-[0_0_14px_rgba(255,79,216,0.35)]" />
                      troupe markers
                    </span>
                  )}
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-aurora shadow-[0_0_14px_rgba(66,245,255,0.4)]" />
                    recent events
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 p-5 md:p-6">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-cloud/55">
                    World Pulse
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-cloud/45">
                    {authFailedBots.length > 0 ? "auth checkpoint" : "bridge live"}
                  </span>
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {latestSignal}
                </div>
                <div className="mt-1 text-xs text-cloud/60">{latestCoords}</div>
                <p className="mt-3 text-sm leading-6 text-cloud/72">
                  {mapAvailable
                    ? "The preview above follows player positions, troupe markers, and recent events, while the full BlueMap stays one click away when I want the whole world."
                    : "The bot relay is still live here even while the public BlueMap view is unavailable, so I can still see what the troupe is trying to do."}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/50">
                    Join Address
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {relayAddress}
                  </div>
                  <div className="mt-2 text-xs text-cloud/60">
                    Join the same server I am watching here.
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/50">
                    Troupe Status
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {botPreview.length ? botPreview.join(", ") : "Waiting on troupe status"}
                  </div>
                  <div className="mt-2 text-xs text-cloud/60">{authSummary}</div>
                </div>
              </div>

              <div className="grid gap-3">
                {reachableBots.length ? (
                  reachableBots.slice(0, 4).map((bot) => (
                    <div
                      key={bot.name}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">
                          {bot.name}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/50">
                          {describeBotState(bot)}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-cloud/65">
                        {describeBotNote(bot)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-cloud/50">
                        {bot.home && <span>{describeCoords(bot.home)}</span>}
                        {bot.currentSubgoal && <span>{bot.currentSubgoal}</span>}
                        {formatRetryText(bot.authRetryAt) && (
                          <span>{formatRetryText(bot.authRetryAt)}</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : players.length ? (
                  players.slice(0, 4).map((player) => (
                    <div
                      key={player.uuid ?? player.name}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">
                          {player.name}
                        </div>
                        <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/50">
                          y{roundCoord(player.position.y)}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-cloud/65">
                        x{roundCoord(player.position.x)} z
                        {roundCoord(player.position.z)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-cloud/68">
                    No live troupe status yet. As soon as the bot endpoints or
                    the world feed answer, this section fills in.
                  </div>
                )}
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={handleCopy}>
                  {copied ? "Copied" : "Copy address"}
                </Button>
                {mapLinkUrl ? (
                  <Button
                    asChild
                    variant="ghost"
                    className="px-4 py-2 text-xs sm:text-sm"
                  >
                    <a href={mapLinkUrl} target="_blank" rel="noreferrer">
                      Open full BlueMap
                    </a>
                  </Button>
                ) : (
                  <span className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs uppercase tracking-[0.24em] text-cloud/60">
                    BlueMap offline
                  </span>
                )}
                {mode === "home" && (
                  <a className="text-sm font-semibold text-glow" href="/mc">
                    Observatory page
                  </a>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.3em] text-cloud/60">
              World Feed
            </div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-cloud/60">
              <span className="glow-dot h-2 w-2 rounded-full" />
              Live
            </div>
          </div>
          <p className="text-sm text-cloud/70">
            Chat, movement, and bot health all land here, so I can tell the
            difference between a quiet world and a broken connection.
          </p>
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.24em] text-cloud/60">
            <span className="rave-chip rounded-full px-3 py-1">
              {feed.length} recent events
            </span>
            <span className="rave-chip rounded-full px-3 py-1">
              {activeBots.length} named bots
            </span>
            {authFailedBots.length > 0 && (
              <span className="rave-chip rounded-full px-3 py-1">
                {authFailedBots.length} auth issues
              </span>
            )}
          </div>
          <div
            className="rave-chip max-h-[420px] overflow-y-auto rounded-2xl p-3"
            aria-live="polite"
          >
            {feed.length ? (
              <div className="flex flex-col gap-3">
                {feed.map((event, index) => {
                  const title = event.bot ?? event.type ?? "Event";
                  const rawMessage =
                    event.message ?? event.detail ?? event.action ?? "ping";
                  const message = truncateMessage(String(rawMessage));
                  const truncated = message !== String(rawMessage);
                  const key =
                    event.id ?? `${event.ts ?? "event"}-${title}-${index}`;
                  return (
                    <div
                      key={key}
                      className="flex items-start gap-3 border-b border-white/5 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="w-14 shrink-0 text-[10px] uppercase tracking-[0.2em] text-cloud/50">
                        {formatTimeAgo(event.ts)}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-white/90">
                          {title}
                        </div>
                        <div
                          className="magical-text text-xs"
                          title={truncated ? String(rawMessage) : undefined}
                        >
                          {message}
                        </div>
                        {event.coords && (
                          <div className="mt-1 text-[10px] text-cloud/50">
                            {describeCoords(event.coords)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : reachableBots.length ? (
              <div className="flex flex-col gap-3">
                {reachableBots.map((bot) => (
                  <div
                    key={bot.name}
                    className="flex items-start gap-3 border-b border-white/5 pb-3 last:border-b-0 last:pb-0"
                  >
                    <div className="w-14 shrink-0 text-[10px] uppercase tracking-[0.2em] text-cloud/50">
                      {bot.updatedAt ? formatTimeAgo(bot.updatedAt) : "live"}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-white/90">
                        {bot.name}
                      </div>
                      <div className="magical-text text-xs">
                        {describeBotState(bot)}
                      </div>
                      <div className="mt-1 text-[10px] text-cloud/50">
                        {truncateMessage(
                          String(
                            bot.guidance ||
                              bot.detail ||
                              bot.currentGoal ||
                              "Listening for the next move.",
                          ),
                          180,
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-cloud/70">
                <div>Waiting for the first troupe update...</div>
                <div className="max-w-xs text-center text-xs text-cloud/55">
                  The bridge is listening, and the status endpoints are ready as
                  soon as the world starts talking back.
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {mode === "page" && (
        <Card className="mt-6 grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-cloud/55">
              {mapLinkUrl ? "Full Map" : "World Map"}
            </div>
            <div className="mt-2 text-xl font-semibold text-white">
              {mapLinkUrl
                ? "Open BlueMap in its own tab."
                : "BlueMap is offline right now."}
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-cloud/76">
              {mapLinkUrl
                ? "When I want the whole world at once, I open the full BlueMap view in its own tab and keep this page for the lighter day-to-day pulse."
                : "The public BlueMap origin is not answering right now, but the observatory still keeps the troupe status and bridge feed visible here until the map comes back."}
            </p>
          </div>
          <div className="grid gap-3">
            {mapLinkUrl ? (
              <a
                className="rave-chip inline-flex items-center justify-between rounded-[24px] px-4 py-4 text-left transition hover:-translate-y-0.5 hover:text-white"
                href={mapLinkUrl}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  <span className="block text-[10px] uppercase tracking-[0.24em] text-cloud/55">
                    Open live map
                  </span>
                  <span className="mt-2 block text-sm font-semibold text-white">
                    Launch the full 3D BlueMap view
                  </span>
                </span>
                <span className="text-xs font-semibold text-glow">New tab</span>
              </a>
            ) : (
              <div className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-cloud/70">
                <span className="block text-[10px] uppercase tracking-[0.24em] text-cloud/55">
                  Join the world
                </span>
                <span className="mt-2 block text-sm font-semibold text-white">
                  {relayAddress}
                </span>
                <span className="mt-2 block text-xs text-cloud/60">
                  The server address is still live even while the public map is
                  down.
                </span>
              </div>
            )}
            <div className="rounded-[24px] border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-cloud/70">
              {authSummary} Keep this page open for bot status, coordinates,
              and world chatter.
            </div>
          </div>
        </Card>
      )}
    </section>
  );
}
