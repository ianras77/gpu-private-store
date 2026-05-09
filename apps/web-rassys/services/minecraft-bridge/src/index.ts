import Fastify from "fastify";
import cors from "@fastify/cors";
import Redis from "ioredis";
import WebSocket, { WebSocketServer } from "ws";
import crypto from "crypto";

const config = {
  PORT: Number(process.env.PORT ?? 4100),
  REDIS_URL: process.env.REDIS_URL ?? "redis://redis:6379",
  MINECRAFT_EVENTS_URL: process.env.MINECRAFT_EVENTS_URL ?? "",
  MINECRAFT_MOCK: (process.env.MINECRAFT_MOCK ?? "false") === "true"
};

const redis = new Redis(config.REDIS_URL);

const EVENTS_KEY = "minecraft:events";

let lastEventAt: string | null = null;
let connected = false;
let inboundConnections = 0;

const normalizeEvent = (event: any) => {
  if (!event || typeof event !== "object") {
    return { type: "raw", message: String(event ?? "") };
  }

  const normalized: Record<string, any> = { ...event };

  if (!normalized.bot && (normalized.agent || normalized.speaker || normalized.name)) {
    normalized.bot = normalized.agent ?? normalized.speaker ?? normalized.name;
  }

  if (!normalized.message && (normalized.text || normalized.content)) {
    normalized.message = normalized.text ?? normalized.content;
  }

  if (!normalized.type) {
    normalized.type = normalized.bot ? "bot" : "event";
  }

  if (!normalized.coords && Array.isArray(normalized.position) && normalized.position.length >= 3) {
    normalized.coords = {
      x: normalized.position[0],
      y: normalized.position[1],
      z: normalized.position[2]
    };
  }

  return normalized;
};

const recordEvent = async (event: any) => {
  const normalized = normalizeEvent(event);
  const payload = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    ...normalized
  };
  lastEventAt = payload.ts;
  await redis.lpush(EVENTS_KEY, JSON.stringify(payload));
  await redis.ltrim(EVENTS_KEY, 0, 199);
  await redis.publish("minecraft:events", JSON.stringify(payload));
};

const startMockGenerator = () => {
  const bots = ["PixelFox", "LavaOtter", "CloudTurtle", "MapleBee"];
  const actions = ["mined", "crafted", "wandered", "built", "chatted", "teleported"];
  setInterval(async () => {
    const bot = bots[Math.floor(Math.random() * bots.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    await recordEvent({
      type: "bot",
      bot,
      action,
      coords: {
        x: Math.floor(Math.random() * 200),
        y: 64 + Math.floor(Math.random() * 40),
        z: Math.floor(Math.random() * 200)
      },
      message: `${bot} ${action} near the cloud ridge.`
    });
  }, 4000);
};

const connectWebsocket = (url: string) => {
  const ws = new WebSocket(url);
  ws.on("open", () => {
    connected = true;
  });
  ws.on("close", () => {
    connected = false;
    setTimeout(() => connectWebsocket(url), 3000);
  });
  ws.on("message", async (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      await recordEvent(parsed);
    } catch {
      await recordEvent({ type: "raw", message: data.toString() });
    }
  });
};

const start = async () => {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.get("/healthz", async () => ({ ok: true, ts: Date.now() }));
  app.get("/readyz", async (_request, reply) => {
    const redisReady = await redis
      .ping()
      .then((value) => value === "PONG")
      .catch(() => false);
    const ingressMode = config.MINECRAFT_MOCK && !config.MINECRAFT_EVENTS_URL
      ? "mock"
      : config.MINECRAFT_EVENTS_URL
        ? "upstream"
        : "direct";
    const ingressReady =
      ingressMode === "direct" || config.MINECRAFT_MOCK || Boolean(config.MINECRAFT_EVENTS_URL);
    const ok = redisReady && ingressReady;

    reply.code(ok ? 200 : 503);
    return {
      ok,
      ts: Date.now(),
      checks: {
        redis: { ok: redisReady },
        ingress: {
          ok: ingressReady,
          connected,
          inboundConnections,
          mode: ingressMode,
          lastEventAt
        }
      }
    };
  });
  app.get("/status", async () => ({ connected, inboundConnections, lastEventAt }));
  app.get("/events", async () => {
    const events = await redis.lrange(EVENTS_KEY, 0, 49);
    return events.map((item) => JSON.parse(item));
  });
  app.post("/events", async (request, reply) => {
    const event = request.body as any;
    if (!event) {
      reply.code(400);
      return { error: "missing event" };
    }
    if (Array.isArray(event)) {
      for (const item of event) {
        await recordEvent(item);
      }
      return { ok: true, count: event.length };
    }
    await recordEvent(event);
    return { ok: true, count: 1 };
  });

  await app.listen({ port: config.PORT, host: "0.0.0.0" });

  const wss = new WebSocketServer({ server: app.server, path: "/events" });
  wss.on("connection", (socket) => {
    inboundConnections += 1;
    socket.on("close", () => {
      inboundConnections = Math.max(0, inboundConnections - 1);
    });
    socket.on("message", async (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            await recordEvent(item);
          }
        } else {
          await recordEvent(parsed);
        }
      } catch {
        await recordEvent({ type: "raw", message: data.toString() });
      }
    });
  });

  if (config.MINECRAFT_EVENTS_URL) {
    if (config.MINECRAFT_EVENTS_URL.startsWith("ws")) {
      connectWebsocket(config.MINECRAFT_EVENTS_URL);
    } else if (config.MINECRAFT_EVENTS_URL.startsWith("http")) {
      setInterval(async () => {
        try {
          const res = await fetch(config.MINECRAFT_EVENTS_URL);
          if (!res.ok) return;
          const payload = await res.json();
          if (Array.isArray(payload)) {
            for (const event of payload) {
              await recordEvent(event);
            }
          } else {
            await recordEvent(payload);
          }
        } catch {
          // ignore polling errors
        }
      }, 5000);
    }
  }

  if (config.MINECRAFT_MOCK && !config.MINECRAFT_EVENTS_URL) {
    startMockGenerator();
  }
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
