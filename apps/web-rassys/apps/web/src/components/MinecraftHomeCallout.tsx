"use client";

import Link from "next/link";
import useSWR from "swr";
import { Bot, Copy, MapPinned, Swords } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { formatTimeAgo } from "../lib/utils";
import {
  normalizeMinecraftServerHost,
  resolveMinecraftMapBaseUrl,
} from "../lib/minecraft-map";

type MinecraftEvent = {
  id?: string;
  ts?: string;
  bot?: string;
  type?: string;
  detail?: string;
  message?: string;
  coords?: {
    x?: number;
    z?: number;
  };
};

type LivePlayer = {
  uuid?: string;
  name: string;
  position: {
    x: number;
    z: number;
  };
};

type LivePlayersPayload = {
  players?: LivePlayer[];
};

type TroupeBotStatus = {
  name: string;
  reachable?: boolean;
  state?: string;
  detail?: string;
  currentGoal?: string;
  updatedAt?: string;
  home?: {
    x?: number;
    z?: number;
  } | null;
};

type TroupeStatusPayload = {
  bots?: TroupeBotStatus[];
  summary?: {
    reachable?: number;
    live?: number;
  };
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`request_failed_${response.status}`);
  }
  return (await response.json()) as T;
};

const describeBotState = (bot?: TroupeBotStatus | null) => {
  const state = String(bot?.state ?? "").trim().replace(/_/g, " ");
  return state || "standing by";
};

const roundCoord = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;

const splitServerAddress = (value: string) => {
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    const host = end >= 0 ? value.slice(1, end) : value.slice(1);
    const port = end >= 0 && value[end + 1] === ":" ? value.slice(end + 2) : "25565";
    return { host, port };
  }

  const parts = value.split(":");
  if (parts.length <= 1) {
    return {
      host: value,
      port: "25565",
    };
  }

  return {
    host: parts.slice(0, -1).join(":"),
    port: parts.at(-1) || "25565",
  };
};

export function MinecraftHomeCallout() {
  const [copied, setCopied] = useState(false);
  const serverAddress = normalizeMinecraftServerHost(
    process.env.NEXT_PUBLIC_MINECRAFT_SERVER_ADDRESS,
  );
  const { host, port } = splitServerAddress(serverAddress);
  const publicMapUrl = resolveMinecraftMapBaseUrl(
    process.env.NEXT_PUBLIC_MINECRAFT_MAP_URL,
    process.env.NEXT_PUBLIC_MINECRAFT_SERVER_ADDRESS,
  );
  const mapLinkUrl = publicMapUrl
    ? `${publicMapUrl.replace(/\/$/, "")}/index.html`
    : "";

  const { data: troupeData } = useSWR<TroupeStatusPayload>(
    "/api/minecraft/troupe-status",
    fetchJson,
    {
      refreshInterval: 5000,
    },
  );
  const { data: events } = useSWR<MinecraftEvent[]>(
    "/api/minecraft/events",
    fetchJson,
    {
      refreshInterval: 5000,
    },
  );
  const { data: playersData, error: playersError } = useSWR<LivePlayersPayload>(
    publicMapUrl ? "/mc-troupe-map/maps/world/live/players.json" : null,
    fetchJson,
    {
      refreshInterval: 5000,
    },
  );

  const bots = Array.isArray(troupeData?.bots)
    ? troupeData.bots.filter((bot) => bot.reachable)
    : [];
  const players = Array.isArray(playersData?.players) ? playersData.players : [];
  const latestEvent = Array.isArray(events) ? events[0] : null;
  const leadBot = bots[0] ?? null;
  const latestLine = latestEvent
    ? `${latestEvent.bot ?? latestEvent.type ?? "Signal"} ${
        formatTimeAgo(latestEvent.ts) || "live"
      }`
    : leadBot
      ? `${leadBot.name} ${describeBotState(leadBot)}`
      : "Listening for the next world pulse.";
  const botPreview = bots.slice(0, 3);

  const signalPoints = useMemo(() => {
    const items = [
      ...players.slice(0, 6).map((player, index) => ({
        key: player.uuid ?? `${player.name}-${index}`,
        label: player.name,
        kind: "player" as const,
        x: roundCoord(player.position?.x),
        z: roundCoord(player.position?.z),
      })),
      ...bots
        .filter(
          (bot) =>
            typeof bot.home?.x === "number" && typeof bot.home?.z === "number",
        )
        .slice(0, 5)
        .map((bot) => ({
          key: `${bot.name}-bot`,
          label: bot.name,
          kind: "bot" as const,
          x: roundCoord(bot.home?.x),
          z: roundCoord(bot.home?.z),
        })),
      ...(latestEvent?.coords &&
      typeof latestEvent.coords.x === "number" &&
      typeof latestEvent.coords.z === "number"
        ? [
            {
              key: latestEvent.id ?? "latest-event",
              label: latestEvent.bot ?? latestEvent.type ?? "Signal",
              kind: "event" as const,
              x: roundCoord(latestEvent.coords.x),
              z: roundCoord(latestEvent.coords.z),
            },
          ]
        : []),
    ];

    return items.slice(0, 10);
  }, [bots, latestEvent, players]);

  const mapBounds = useMemo(() => {
    const fallbackX = signalPoints[0]?.x ?? 0;
    const fallbackZ = signalPoints[0]?.z ?? 0;
    const xs = signalPoints.map((point) => point.x);
    const zs = signalPoints.map((point) => point.z);
    const minXRaw = xs.length ? Math.min(...xs) : fallbackX - 16;
    const maxXRaw = xs.length ? Math.max(...xs) : fallbackX + 16;
    const minZRaw = zs.length ? Math.min(...zs) : fallbackZ - 16;
    const maxZRaw = zs.length ? Math.max(...zs) : fallbackZ + 16;
    const paddingX = Math.max(12, (maxXRaw - minXRaw) * 0.3 || 12);
    const paddingZ = Math.max(12, (maxZRaw - minZRaw) * 0.3 || 12);

    return {
      minX: minXRaw - paddingX,
      maxX: maxXRaw + paddingX,
      minZ: minZRaw - paddingZ,
      maxZ: maxZRaw + paddingZ,
    };
  }, [signalPoints]);

  const xRange = Math.max(1, mapBounds.maxX - mapBounds.minX);
  const zRange = Math.max(1, mapBounds.maxZ - mapBounds.minZ);
  const toLeft = (x: number) => ((x - mapBounds.minX) / xRange) * 100;
  const toTop = (z: number) => 100 - ((z - mapBounds.minZ) / zRange) * 100;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(serverAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      id="troupe"
      className="mx-auto max-w-6xl scroll-mt-28 px-6 py-8"
    >
      <div className="overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,230,109,0.12),transparent_28%),radial-gradient(circle_at_82%_12%,rgba(66,245,255,0.14),transparent_32%),linear-gradient(150deg,rgba(8,12,28,0.96),rgba(18,31,34,0.86))] p-5 shadow-[0_26px_80px_rgba(0,0,0,0.32)] md:p-6">
        <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-stretch">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.38em] text-cloud/58">
              Minecraft world
            </div>
            <h2 className="section-title mt-3 text-4xl md:text-5xl">
              Crafty
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-cloud/82 md:text-base">
              Jump into the world with me and the bots. The live map and troupe
              pulse are right here, and the join address is open whenever you
              want to drop in.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_132px]">
              <div className="rounded-[24px] border border-white/10 bg-black/22 p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/52">
                  Join the server
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rave-chip rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-white">
                    {host}
                  </span>
                  <span className="rave-chip rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-glow">
                    Port {port}
                  </span>
                </div>
                <div className="mt-3 text-sm font-semibold text-white">
                  {serverAddress}
                </div>
                <div className="mt-2 text-xs text-cloud/64">
                  Connect at <span className="text-white">crafty.rasies.com</span>{" "}
                  and keep the default Minecraft port visible if you need to key it
                  in manually.
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-black/22 p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/52">
                  Troupe live
                </div>
                <div className="mt-3 text-3xl font-semibold text-white">
                  {bots.length}
                </div>
                <div className="mt-2 text-xs text-cloud/64">
                  bot{bots.length === 1 ? "" : "s"} reporting in
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[22px] border border-white/10 bg-black/18 p-4">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/50">
                  <Bot size={12} />
                  Bot status
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {botPreview.length
                    ? botPreview.map((bot) => bot.name).join(", ")
                    : "Listening for troupe status"}
                </div>
                <div className="mt-2 text-xs text-cloud/62">
                  {leadBot?.detail || leadBot?.currentGoal || "Waiting on the next move."}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-black/18 p-4">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/50">
                  <Swords size={12} />
                  Live players
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {players.length ? `${players.length} in world` : "No player positions yet"}
                </div>
                <div className="mt-2 text-xs text-cloud/62">
                  {players[0]
                    ? `${players[0].name} at x${roundCoord(players[0].position?.x)} z${roundCoord(players[0].position?.z)}`
                    : "The world map wakes up as soon as positions land."}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-black/18 p-4">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/50">
                  <MapPinned size={12} />
                  World pulse
                </div>
                <div className="mt-2 text-sm font-semibold text-white">
                  {latestLine}
                </div>
                <div className="mt-2 text-xs text-cloud/62">
                  {mapLinkUrl
                    ? "The full live map is one click away."
                    : "The observatory still carries the relay even if the map is quiet."}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button onClick={handleCopy}>
                <Copy size={16} />
                {copied ? "Address copied" : "Copy join address"}
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/mc">Open observatory</Link>
              </Button>
              {mapLinkUrl ? (
                <Button variant="secondary" asChild>
                  <a href={mapLinkUrl} target="_blank" rel="noreferrer">
                    Open live map
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,rgba(7,14,28,0.92),rgba(8,23,26,0.9))] p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.24em] text-cloud/50">
                  High-level map
                </div>
                <div className="mt-2 text-lg font-semibold text-white">
                  World snapshot
                </div>
              </div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-cloud/55">
                {signalPoints.length ? `${signalPoints.length} live markers` : "Waiting for map signal"}
              </div>
            </div>

            <div className="relative mt-4 min-h-[270px] overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,12,23,0.96),rgba(7,18,20,0.94))]">
              <div className="absolute inset-0 opacity-35" aria-hidden="true">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`mc-h-${index}`}
                    className="absolute left-0 right-0 border-t border-dashed border-white/8"
                    style={{ top: `${22 + index * 16}%` }}
                  />
                ))}
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`mc-v-${index}`}
                    className="absolute bottom-0 top-0 border-l border-dashed border-white/8"
                    style={{ left: `${20 + index * 16}%` }}
                  />
                ))}
              </div>
              <div className="absolute bottom-0 left-1/2 top-0 border-l border-white/8" />
              <div className="absolute left-0 right-0 top-1/2 border-t border-white/8" />

              {signalPoints.length > 0 ? (
                signalPoints.map((point) => (
                  <div
                    key={point.key}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{
                      left: `${toLeft(point.x)}%`,
                      top: `${toTop(point.z)}%`,
                    }}
                  >
                    <div
                      className={`rounded-full border ${
                        point.kind === "player"
                          ? "h-4 w-4 border-white/75 bg-glow shadow-[0_0_18px_rgba(255,230,109,0.45)]"
                          : point.kind === "bot"
                            ? "h-3.5 w-3.5 border-white/60 bg-comet shadow-[0_0_16px_rgba(255,79,216,0.35)]"
                            : "h-3 w-3 border-white/45 bg-aurora shadow-[0_0_14px_rgba(66,245,255,0.3)]"
                      }`}
                    />
                    <div className="mt-2 whitespace-nowrap rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-cloud/72">
                      {point.label}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex h-full min-h-[270px] items-center justify-center px-6 text-center text-sm text-cloud/68">
                  {playersError
                    ? "The public map is quiet right now, but the join address and bot status are still live."
                    : "Waiting for the world to draw itself in."}
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.22em] text-cloud/58">
              <span className="rave-chip rounded-full px-3 py-2">
                {players.length} live player{players.length === 1 ? "" : "s"}
              </span>
              <span className="rave-chip rounded-full px-3 py-2">
                {bots.length} troupe bot{bots.length === 1 ? "" : "s"}
              </span>
              <span className="rave-chip rounded-full px-3 py-2">
                {latestEvent ? formatTimeAgo(latestEvent.ts) || "live" : "bridge listening"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
