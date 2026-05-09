import "server-only";

import { createCatClient } from "@/lib/cat/client";
import type { CatChatPayload, CatStreamEvent, CatWhy } from "@/lib/cat/types";

type StreamOptions = {
  token?: string | null;
  userId?: string | null;
  wsBase?: string | null;
  payload: CatChatPayload;
  onEvent: (event: CatStreamEvent) => void;
};

function parseJsonSafely(raw: string) {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseCatEvent(raw: unknown): CatStreamEvent | null {
  if (!raw) return null;
  if (Buffer.isBuffer(raw)) {
    return parseCatEvent(raw.toString("utf8"));
  }
  if (typeof raw === "string") {
    const parsed = parseJsonSafely(raw);
    if (parsed) {
      return parseCatEvent(parsed);
    }
    return { type: "token", value: raw };
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const eventType = String(obj.event ?? obj.type ?? "");
    if (eventType === "error" || obj.error) {
      return { type: "error", message: String(obj.error ?? obj.message ?? "Unknown error") };
    }
    if (eventType === "chat") {
      const value = String(obj.text ?? obj.content ?? obj.message ?? "");
      const why = (obj.why ?? null) as CatWhy | null;
      return { type: "final", value, why };
    }
    if (eventType === "chat_token" || obj.delta || obj.token) {
      const value = String(obj.content ?? obj.delta ?? obj.token ?? obj.text ?? "");
      return { type: "token", value };
    }
    if (eventType === "notification") {
      const message = String(obj.content ?? obj.text ?? obj.message ?? "Notification");
      return { type: "notification", message };
    }
  }
  return null;
}

export function streamChat({ token, userId, wsBase, payload, onEvent }: StreamOptions) {
  const cat = createCatClient({ token, userId, instant: true, base: "ws", wsBase }) as any;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    if (typeof cat.close === "function") {
      cat.close();
    } else if (typeof cat.disconnect === "function") {
      cat.disconnect();
    }
  };

  const handleMessage = (data: unknown) => {
    const event = parseCatEvent(data);
    if (event) {
      Promise.resolve(onEvent(event)).catch(() => undefined);
      if (event.type === "final") {
        close();
      }
    }
  };

  const handleError = (error: unknown) => {
    const message = error instanceof Error ? error.message : "Cat connection error";
    Promise.resolve(onEvent({ type: "error", message })).catch(() => undefined);
    close();
  };

  if (typeof cat.onConnected === "function") {
    cat.onConnected(() => {
      try {
        const message = payload.metadata ? { text: payload.text, metadata: payload.metadata } : payload.text;
        cat.send(message);
      } catch (error) {
        handleError(error);
      }
    });
  }

  if (typeof cat.onMessage === "function") {
    cat.onMessage(handleMessage);
  }

  if (typeof cat.onError === "function") {
    cat.onError((error: unknown) => handleError(error));
  }

  if (typeof cat.onDisconnected === "function") {
    cat.onDisconnected(() => {
      close();
    });
  }

  if (typeof cat.init === "function") {
    Promise.resolve(cat.init()).catch(handleError);
  } else if (typeof cat.connect === "function") {
    Promise.resolve(cat.connect()).catch(handleError);
  }

  return close;
}
