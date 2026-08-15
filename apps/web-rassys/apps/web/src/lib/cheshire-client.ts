import { z } from "zod";
import { fetchUpstreamJson } from "./upstream";

export type CheshireChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CheshireQueuePriority = "high" | "normal" | "low";
export type CheshireQueueLane =
  | "general"
  | "listener"
  | "notes"
  | "programming"
  | "web"
  | "dm"
  | "admin"
  | "curio"
  | "embeddings";

type CheshireRequestControl = {
  lane?: CheshireQueueLane;
  priority?: CheshireQueuePriority;
  purpose?: string;
  queueWaitMs?: number;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
};

type CheshireChatRequest = CheshireRequestControl & {
  messages: CheshireChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: Record<string, unknown>;
};

type CheshireChatResponse = {
  content: string;
  latencyMs: number;
  model: string;
  raw: Record<string, unknown>;
};

const embedResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number()),
    }),
  ),
  model: z.string().optional(),
});

const buildEndpoint = (base: string, path: string) => {
  const trimmed = base.replace(/\/$/, "");
  if (trimmed.endsWith("/v1")) return `${trimmed}/${path}`;
  return `${trimmed}/v1/${path}`;
};

const readNumber = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getBaseUrl = () => (process.env.CHESHIRE_BASE_URL ?? "").trim();

const getHeaders = () => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.CHESHIRE_API_KEY) {
    headers.Authorization = `Bearer ${process.env.CHESHIRE_API_KEY}`;
  }
  return headers;
};

const getRequestOptions = (control?: CheshireRequestControl) => {
  const timeoutMs = Math.max(1000, control?.timeoutMs ?? readNumber(process.env.CHESHIRE_REQUEST_TIMEOUT_MS, 60000));
  return {
    timeoutMs,
    retries: Math.max(0, control?.retries ?? 0),
    retryDelayMs: Math.max(0, control?.retryDelayMs ?? 0),
  };
};

const buildControlHeaders = (
  requestOptions: ReturnType<typeof getRequestOptions>,
  control: CheshireRequestControl | undefined,
  defaults: {
    lane: CheshireQueueLane;
    priority: CheshireQueuePriority;
    purpose?: string;
    queueWaitMs: number;
  },
) => {
  const lane = control?.lane ?? defaults.lane;
  const priority = control?.priority ?? defaults.priority;
  const purpose = control?.purpose?.trim() || defaults.purpose;
  const queueWaitMs = Math.max(0, control?.queueWaitMs ?? defaults.queueWaitMs);

  return {
    "x-cheshire-client": "web",
    "x-cheshire-lane": lane,
    "x-cheshire-priority": priority,
    "x-cheshire-queue-wait-ms": String(queueWaitMs),
    "x-cheshire-retries": String(requestOptions.retries),
    "x-cheshire-retry-delay-ms": String(requestOptions.retryDelayMs),
    "x-cheshire-timeout-ms": String(Math.max(1000, requestOptions.timeoutMs - 750)),
    ...(purpose ? { "x-cheshire-purpose": purpose } : {}),
  };
};

export const extractJsonPayload = (content: string) => {
  const stripped = content
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return stripped.slice(start, end + 1);
  }
  return stripped;
};

export const isCheshireConfigured = () => Boolean(getBaseUrl());

export const requestCheshireChat = async (
  input: CheshireChatRequest,
): Promise<CheshireChatResponse> => {
  const base = getBaseUrl();
  if (!base) {
    throw new Error("cheshire_unconfigured");
  }

  const model = input.model ?? process.env.CHESHIRE_MODEL ?? "rassy-fast";
  const payload: Record<string, unknown> = {
    model,
    messages: input.messages,
  };
  const requestOptions = getRequestOptions(input);
  if (typeof input.temperature === "number") {
    payload.temperature = input.temperature;
  }
  if (typeof input.maxTokens === "number") {
    payload.max_tokens = input.maxTokens;
  }
  if (input.responseFormat) {
    payload.response_format = input.responseFormat;
  }

  const started = Date.now();
  const raw = await fetchUpstreamJson<Record<string, unknown>>(
    buildEndpoint(base, "chat/completions"),
    {
      method: "POST",
      headers: {
        ...getHeaders(),
        ...buildControlHeaders(requestOptions, input, {
          lane: "web",
          priority: "normal",
          purpose: "web-chat",
          queueWaitMs: 6000,
        }),
      },
      body: JSON.stringify(payload),
    },
    requestOptions,
  );

  const choices = Array.isArray(raw.choices) ? raw.choices : [];
  const firstChoice =
    choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : null;
  const message =
    firstChoice && typeof firstChoice.message === "object"
      ? (firstChoice.message as Record<string, unknown>)
      : null;
  const content =
    message && typeof message.content === "string" ? message.content.trim() : "";

  if (!content) {
    throw new Error("cheshire_empty_response");
  }

  return {
    content,
    latencyMs: Date.now() - started,
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model : model,
    raw,
  };
};

export const requestCheshireJson = async <T>(
  input: CheshireChatRequest,
  schema: z.ZodType<T>,
) => {
  const chat = await requestCheshireChat(input);
  const responseJson = JSON.parse(extractJsonPayload(chat.content)) as Record<string, unknown>;
  const parsed = schema.safeParse(responseJson);
  if (!parsed.success) {
    throw new Error(`cheshire_payload_invalid:${parsed.error.message}`);
  }

  return {
    ...chat,
    data: parsed.data,
    responseJson,
  };
};

export const requestCheshireEmbedding = async (
  text: string,
  model = process.env.CHESHIRE_EMBED_MODEL ?? "rassy-embed",
  control?: CheshireRequestControl,
) => {
  const base = getBaseUrl();
  if (!base) {
    throw new Error("cheshire_unconfigured");
  }

  const payload = {
    model,
    input: text,
  };
  const requestOptions = getRequestOptions(control);

  const raw = await fetchUpstreamJson<unknown>(
    buildEndpoint(base, "embeddings"),
    {
      method: "POST",
      headers: {
        ...getHeaders(),
        ...buildControlHeaders(requestOptions, control, {
          lane: "embeddings",
          priority: "low",
          purpose: "web-embedding",
          queueWaitMs: 4000,
        }),
      },
      body: JSON.stringify(payload),
    },
    requestOptions,
  );

  const parsed = embedResponseSchema.parse(raw);
  const embedding = parsed.data[0]?.embedding;
  if (!embedding?.length) {
    throw new Error("cheshire_embedding_empty");
  }

  return {
    embedding,
    model: parsed.model ?? model,
  };
};
