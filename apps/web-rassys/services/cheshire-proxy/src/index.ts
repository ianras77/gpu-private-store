// @ts-nocheck
import Fastify from "fastify";
import cors from "@fastify/cors";
import crypto from "crypto";
import {
    canAcquireQueueSlot,
    defaultQueueWaitMs,
    shouldShedBackgroundLane
} from "./queue-policy.js";
const toNumber = (value, fallback) => {
    if (!value)
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};
const sleep = async (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});
const normalizeMode = (value) => {
    const lowered = (value ?? "auto").trim().toLowerCase();
    if (lowered === "ollama" || lowered === "openai")
        return lowered;
    return "auto";
};
const config = {
    PORT: toNumber(process.env.PORT, 1865),
    LLM_BASE_URL: process.env.LLM_BASE_URL ?? "http://host.docker.internal:8844/v1",
    LLM_MODE: normalizeMode(process.env.LLM_MODE),
    LLM_MODEL: process.env.LLM_MODEL ?? "rassy-mind",
    LLM_API_KEY: process.env.LLM_API_KEY ?? "",
    EMBED_BASE_URL: process.env.EMBED_BASE_URL ?? "http://host.docker.internal:8844/v1",
    EMBED_MODE: normalizeMode(process.env.EMBED_MODE),
    EMBED_MODEL: process.env.EMBED_MODEL ?? "rassy-embed",
    EMBED_API_KEY: process.env.EMBED_API_KEY ?? "",
    RERANK_BASE_URL: process.env.RERANK_BASE_URL ?? process.env.LLM_BASE_URL ?? "http://host.docker.internal:8844/v1",
    RERANK_MODEL: process.env.RERANK_MODEL ?? "rassy-rerank",
    RERANK_API_KEY: process.env.RERANK_API_KEY ?? process.env.LLM_API_KEY ?? "",
    REQUEST_TIMEOUT_MS: toNumber(process.env.REQUEST_TIMEOUT_MS, 45000),
    REQUEST_RETRIES: toNumber(process.env.REQUEST_RETRIES, 0),
    RETRY_DELAY_MS: toNumber(process.env.RETRY_DELAY_MS, 0),
    LLM_KEEP_ALIVE: process.env.LLM_KEEP_ALIVE ?? "15m",
    QUEUE_MAX_ACTIVE_REQUESTS: toNumber(process.env.QUEUE_MAX_ACTIVE_REQUESTS, 3),
    QUEUE_MAX_WAIT_MS: toNumber(process.env.QUEUE_MAX_WAIT_MS, 10000),
    QUEUE_RESERVED_LISTENER_SLOTS: toNumber(process.env.QUEUE_RESERVED_LISTENER_SLOTS, 1)
};
const laneState = {
    llm: {
        consecutiveFailures: 0,
        lastCheckedAt: 0,
        lastError: "",
        lastFailureAt: 0,
        lastLatencyMs: 0,
        lastSuccessAt: 0
    },
    embeddings: {
        consecutiveFailures: 0,
        lastCheckedAt: 0,
        lastError: "",
        lastFailureAt: 0,
        lastLatencyMs: 0,
        lastSuccessAt: 0
    }
};
const cheshireQueueState = {
    active: 0,
    activeByLane: new Map(),
    queue: [],
    queuedByLane: new Map()
};
const bumpLaneCount = (target, lane, delta) => {
    const next = Math.max(0, (target.get(lane) ?? 0) + delta);
    if (next <= 0) {
        target.delete(lane);
        return;
    }
    target.set(lane, next);
};
const queuePriorityWeight = (priority) => {
    if (priority === "high")
        return 0;
    if (priority === "low")
        return 2;
    return 1;
};
const snapshotCheshireQueue = () => ({
    active: cheshireQueueState.active,
    maxActive: Math.max(1, config.QUEUE_MAX_ACTIVE_REQUESTS),
    queued: cheshireQueueState.queue.length,
    lanes: Array.from(new Set([
        ...Array.from(cheshireQueueState.activeByLane.keys()),
        ...Array.from(cheshireQueueState.queuedByLane.keys())
    ]))
        .sort()
        .map((lane) => ({
        lane,
        active: cheshireQueueState.activeByLane.get(lane) ?? 0,
        queued: cheshireQueueState.queuedByLane.get(lane) ?? 0
    }))
});
const dispatchNextQueuedRequest = () => {
    if (cheshireQueueState.active >= Math.max(1, config.QUEUE_MAX_ACTIVE_REQUESTS)) {
        return;
    }
    const listenerPressure = cheshireQueueState.queuedByLane.has("listener");
    const nextIndex = cheshireQueueState.queue
        .map((ticket, index) => ({ ticket, index }))
        .filter(({ ticket }) =>
        canAcquireQueueSlot(
            ticket.lane,
            cheshireQueueState.active,
            config.QUEUE_MAX_ACTIVE_REQUESTS,
            config.QUEUE_RESERVED_LISTENER_SLOTS,
            listenerPressure
        ))
        .sort((left, right) => {
            const a = left.ticket;
            const b = right.ticket;
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return a.createdAt - b.createdAt;
        })
        .at(0)?.index;
    if (nextIndex === undefined)
        return;
    const next = cheshireQueueState.queue.splice(nextIndex, 1)[0];
    if (!next)
        return;
    if (next.timeoutId)
        clearTimeout(next.timeoutId);
    bumpLaneCount(cheshireQueueState.queuedByLane, next.lane, -1);
    cheshireQueueState.active += 1;
    bumpLaneCount(cheshireQueueState.activeByLane, next.lane, 1);
    next.resolve(makeQueueRelease(next.lane));
};
const makeQueueRelease = (lane) => {
    let released = false;
    return () => {
        if (released)
            return;
        released = true;
        cheshireQueueState.active = Math.max(0, cheshireQueueState.active - 1);
        bumpLaneCount(cheshireQueueState.activeByLane, lane, -1);
        dispatchNextQueuedRequest();
    };
};
const acquireQueueSlot = async (lane, priority, waitMs) => {
    const listenerPressure =
        lane === "listener" ||
        cheshireQueueState.activeByLane.has("listener") ||
        cheshireQueueState.queuedByLane.has("listener");
    if (shouldShedBackgroundLane(lane, listenerPressure))
        return null;
    if (canAcquireQueueSlot(
        lane,
        cheshireQueueState.active,
        config.QUEUE_MAX_ACTIVE_REQUESTS,
        config.QUEUE_RESERVED_LISTENER_SLOTS,
        listenerPressure
    )) {
        cheshireQueueState.active += 1;
        bumpLaneCount(cheshireQueueState.activeByLane, lane, 1);
        return makeQueueRelease(lane);
    }
    if (waitMs <= 0)
        return null;
    return new Promise((resolve) => {
        const ticket = {
            createdAt: Date.now(),
            lane,
            priority: queuePriorityWeight(priority),
            resolve: (release) => {
                if (ticket.timeoutId)
                    clearTimeout(ticket.timeoutId);
                resolve(release);
            },
            timeoutId: null
        };
        ticket.timeoutId = setTimeout(() => {
            const ticketIndex = cheshireQueueState.queue.indexOf(ticket);
            if (ticketIndex >= 0) {
                cheshireQueueState.queue.splice(ticketIndex, 1);
            }
            bumpLaneCount(cheshireQueueState.queuedByLane, lane, -1);
            resolve(null);
        }, waitMs);
        cheshireQueueState.queue.push(ticket);
        bumpLaneCount(cheshireQueueState.queuedByLane, lane, 1);
    });
};
const buildOpenAIEndpoint = (base, path) => {
    const trimmed = base.replace(/\/$/, "");
    if (trimmed.endsWith("/v1"))
        return `${trimmed}/${path}`;
    return `${trimmed}/v1/${path}`;
};
const withTimeout = async (fn, ms, parentSignal) => {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    const timeout = setTimeout(() => controller.abort(), ms);
    if (parentSignal) {
        if (parentSignal.aborted) {
            controller.abort();
        }
        else {
            parentSignal.addEventListener("abort", onAbort, { once: true });
        }
    }
    try {
        return await fn(controller.signal);
    }
    finally {
        clearTimeout(timeout);
        if (parentSignal) {
            parentSignal.removeEventListener("abort", onAbort);
        }
    }
};
const shouldRetryStatus = (status) => status === 408 || status === 425 || status === 429 || status >= 500;
const readOverrideInt = (value, fallback, options) => {
    const raw = Array.isArray(value) ? value[0] : value;
    if (!raw)
        return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.max(options.min, Math.min(options.max, parsed));
};
const readHeaderValue = (value) => {
    const raw = Array.isArray(value) ? value[0] : value;
    const trimmed = raw?.trim();
    return trimmed ? trimmed : undefined;
};
const normalizeQueueLane = (value, fallback) => {
    const raw = readHeaderValue(value)?.toLowerCase();
    if (raw === "listener" ||
        raw === "programming" ||
        raw === "notes" ||
        raw === "web" ||
        raw === "dm" ||
        raw === "admin" ||
        raw === "curio" ||
        raw === "embeddings" ||
        raw === "general") {
        return raw;
    }
    return fallback;
};
const normalizeQueuePriority = (value, fallback) => {
    const raw = readHeaderValue(value)?.toLowerCase();
    if (raw === "high" || raw === "normal" || raw === "low") {
        return raw;
    }
    return fallback;
};
const readQueueWaitMs = (value, fallback) => readOverrideInt(value, fallback, {
    min: 0,
    max: Math.max(1000, config.QUEUE_MAX_WAIT_MS)
});
const requestTimeoutForLane = (lane) => lane === "listener"
    ? Math.min(config.REQUEST_TIMEOUT_MS, 12_000)
    : Math.max(config.REQUEST_TIMEOUT_MS, 60_000);
const buildRequestOptions = (headers, signal, timeoutFallback = config.REQUEST_TIMEOUT_MS) => ({
    retries: readOverrideInt(headers["x-cheshire-retries"], config.REQUEST_RETRIES, {
        min: 0,
        max: 4
    }),
    retryDelayMs: readOverrideInt(headers["x-cheshire-retry-delay-ms"], config.RETRY_DELAY_MS, {
        min: 0,
        max: 60_000
    }),
    signal,
    timeoutMs: readOverrideInt(headers["x-cheshire-timeout-ms"], timeoutFallback, {
        min: 1_000,
        max: 10 * 60 * 1_000
    })
});
const createClientAbort = (request) => {
    const controller = new AbortController();
    const abort = () => {
        if (!controller.signal.aborted) {
            controller.abort();
        }
    };
    const handleAborted = () => abort();
    const handleClose = () => {
        if (request.raw.aborted) {
            abort();
        }
    };
    request.raw.once("aborted", handleAborted);
    request.raw.once("close", handleClose);
    return {
        cleanup: () => {
            request.raw.off("aborted", handleAborted);
            request.raw.off("close", handleClose);
        },
        signal: controller.signal
    };
};
const noteLaneSuccess = (lane, latencyMs) => {
    const now = Date.now();
    laneState[lane] = {
        ...laneState[lane],
        consecutiveFailures: 0,
        lastCheckedAt: now,
        lastError: "",
        lastLatencyMs: latencyMs,
        lastSuccessAt: now
    };
};
const noteLaneFailure = (lane, error, latencyMs) => {
    const now = Date.now();
    laneState[lane] = {
        ...laneState[lane],
        consecutiveFailures: laneState[lane].consecutiveFailures + 1,
        lastCheckedAt: now,
        lastError: error,
        lastFailureAt: now,
        lastLatencyMs: latencyMs
    };
};
const snapshotLane = (lane) => {
    const state = laneState[lane];
    return {
        baseUrl: lane === "llm" ? config.LLM_BASE_URL : config.EMBED_BASE_URL,
        consecutiveFailures: state.consecutiveFailures,
        lastCheckedAt: state.lastCheckedAt || null,
        lastError: state.lastError || null,
        lastFailureAt: state.lastFailureAt || null,
        lastLatencyMs: state.lastLatencyMs || null,
        lastSuccessAt: state.lastSuccessAt || null,
        mode: lane === "llm" ? config.LLM_MODE : config.EMBED_MODE,
        model: lane === "llm" ? config.LLM_MODEL : config.EMBED_MODEL
    };
};
class ProxyUpstreamError extends Error {
    status;
    retryable;
    constructor(message, options) {
        super(message);
        this.name = "ProxyUpstreamError";
        this.status = options?.status;
        this.retryable = options?.retryable ?? true;
    }
}
const toErrorMessage = (error) => {
    if (error instanceof ProxyUpstreamError)
        return error.message;
    if (error instanceof Error) {
        if (error.name === "AbortError")
            return "request_timeout";
        return error.message;
    }
    return "request_failed";
};
const getCheckCandidates = (baseUrl, mode) => {
    if (mode === "ollama") {
        return [{ provider: "ollama", url: `${baseUrl.replace(/\/$/, "")}/api/tags` }];
    }
    if (mode === "openai") {
        return [{ provider: "openai", url: buildOpenAIEndpoint(baseUrl, "models") }];
    }
    return [
        { provider: "openai", url: buildOpenAIEndpoint(baseUrl, "models") },
        { provider: "ollama", url: `${baseUrl.replace(/\/$/, "")}/api/tags` }
    ];
};
const checkUpstream = async (lane, baseUrl, mode, apiKey) => {
    const headers = {};
    if (apiKey)
        headers.Authorization = `Bearer ${apiKey}`;
    let lastError = "upstream_unavailable";
    let lastLatencyMs = 0;
    for (const candidate of getCheckCandidates(baseUrl, mode)) {
        const started = Date.now();
        try {
            const response = await withTimeout((signal) => fetch(candidate.url, {
                method: "GET",
                headers,
                cache: "no-store",
                signal
            }), Math.min(config.REQUEST_TIMEOUT_MS, 8000));
            const latencyMs = Date.now() - started;
            lastLatencyMs = latencyMs;
            if (response.ok) {
                noteLaneSuccess(lane, latencyMs);
                return {
                    ok: true,
                    latencyMs,
                    provider: candidate.provider
                };
            }
            const error = `http_${response.status}`;
            lastError = error;
            if (mode === "auto" && (response.status === 404 || response.status === 405)) {
                continue;
            }
            noteLaneFailure(lane, error, latencyMs);
            return {
                ok: false,
                latencyMs,
                provider: candidate.provider,
                error
            };
        }
        catch (error) {
            const latencyMs = Date.now() - started;
            lastLatencyMs = latencyMs;
            lastError = toErrorMessage(error);
            if (mode === "auto" && candidate.provider === "openai") {
                continue;
            }
            noteLaneFailure(lane, lastError, latencyMs);
            return {
                ok: false,
                latencyMs,
                provider: candidate.provider,
                error: lastError
            };
        }
    }
    noteLaneFailure(lane, lastError, lastLatencyMs);
    return {
        ok: false,
        latencyMs: lastLatencyMs,
        provider: mode === "ollama" ? "ollama" : "openai",
        error: lastError
    };
};
const fetchJson = async (url, payload, apiKey, signal) => {
    const headers = { "Content-Type": "application/json" };
    if (apiKey)
        headers.Authorization = `Bearer ${apiKey}`;
    return fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal
    });
};
const postJsonUpstream = async (lane, url, payload, apiKey, options) => {
    const retries = Math.max(0, options?.retries ?? config.REQUEST_RETRIES);
    const retryDelayMs = Math.max(0, options?.retryDelayMs ?? config.RETRY_DELAY_MS);
    const timeoutMs = Math.max(1000, options?.timeoutMs ?? config.REQUEST_TIMEOUT_MS);
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const started = Date.now();
        try {
            const response = await withTimeout((signal) => fetchJson(url, payload, apiKey, signal), timeoutMs, options?.signal);
            const latencyMs = Date.now() - started;
            if (response.ok) {
                noteLaneSuccess(lane, latencyMs);
                return response;
            }
            await response.text();
            throw new ProxyUpstreamError(`upstream_http_${response.status}`, {
                retryable: shouldRetryStatus(response.status),
                status: response.status
            });
        }
        catch (error) {
            const latencyMs = Date.now() - started;
            const typed = error instanceof ProxyUpstreamError
                ? error
                : new ProxyUpstreamError(toErrorMessage(error), {
                    retryable: true
                });
            if (attempt < retries && typed.retryable) {
                await sleep(retryDelayMs * (attempt + 1));
                continue;
            }
            noteLaneFailure(lane, typed.message, latencyMs);
            throw typed;
        }
    }
    throw new ProxyUpstreamError("upstream_unavailable", { retryable: false });
};
const parseJsonResponse = async (response, fallbackMessage) => {
    const text = await response.text();
    try {
        return JSON.parse(text);
    }
    catch {
        throw new ProxyUpstreamError(fallbackMessage, {
            retryable: false,
            status: 502
        });
    }
};
const usesJsonResponseFormat = (responseFormat) => Boolean(responseFormat &&
    typeof responseFormat === "object" &&
    (responseFormat.type === "json_object" ||
        responseFormat.type === "json_schema"));
const readOllamaText = (value) => {
    if (typeof value === "string") {
        return value.trim();
    }
    if (Array.isArray(value)) {
        const merged = value
            .map((part) => {
            if (typeof part === "string") {
                return part;
            }
            if (part && typeof part === "object") {
                if (typeof part.text === "string") {
                    return part.text;
                }
                if (typeof part.content === "string") {
                    return part.content;
                }
            }
            return "";
        })
            .join("")
            .trim();
        if (merged) {
            return merged;
        }
    }
    if (value && typeof value === "object") {
        if (typeof value.text === "string" && value.text.trim()) {
            return value.text.trim();
        }
        if (typeof value.content === "string" && value.content.trim()) {
            return value.content.trim();
        }
    }
    return "";
};
const extractEmbeddedJson = (value) => {
    if (!value || typeof value !== "string") {
        return "";
    }
    const stripped = value
        .replace(/```json/gi, "```")
        .replace(/```/g, "")
        .trim();
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start < 0 || end <= start) {
        return "";
    }
    const candidate = stripped.slice(start, end + 1).trim();
    try {
        JSON.parse(candidate);
        return candidate;
    }
    catch {
        return "";
    }
};
const readOllamaChatContent = (payload, wantsJson = false) => {
    const messageContent = readOllamaText(payload?.message?.content);
    if (messageContent)
        return messageContent;
    const responseContent = readOllamaText(payload?.response);
    if (responseContent) {
        return responseContent;
    }
    if (wantsJson) {
        const thinking = readOllamaText(payload?.message?.thinking) || readOllamaText(payload?.thinking);
        const extractedJson = extractEmbeddedJson(thinking);
        if (extractedJson) {
            return extractedJson;
        }
    }
    return "";
};
const requestOllamaChat = async (payload, requestOptions) => {
    const endpoint = `${config.LLM_BASE_URL.replace(/\/$/, "")}/api/chat`;
    const res = await postJsonUpstream("llm", endpoint, payload, config.LLM_API_KEY, requestOptions);
    return (await res.json());
};
const mapOllamaChat = async (body, requestOptions) => {
    const model = body?.model ?? config.LLM_MODEL;
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const ollamaOptions = {};
    if (typeof body?.temperature === "number")
        ollamaOptions.temperature = body.temperature;
    if (typeof body?.top_p === "number")
        ollamaOptions.top_p = body.top_p;
    if (typeof body?.seed === "number")
        ollamaOptions.seed = body.seed;
    const maxTokens = body?.max_tokens ?? body?.max_completion_tokens;
    const responseFormat = body?.response_format;
    if (typeof maxTokens === "number")
        ollamaOptions.num_predict = maxTokens;
    const wantsJson = usesJsonResponseFormat(responseFormat);
    const buildPayload = (format) => ({
        model,
        messages,
        stream: false,
        keep_alive: config.LLM_KEEP_ALIVE,
        format,
        options: Object.keys(ollamaOptions).length ? ollamaOptions : undefined
    });
    let data = await requestOllamaChat(buildPayload(wantsJson ? "json" : undefined), requestOptions);
    let content = readOllamaChatContent(data, wantsJson);
    // Ollama occasionally returns an empty assistant message under json mode.
    // Retry once with a relaxed payload so downstream callers do not fall straight
    // into fallback mode when the model actually had enough context.
    if (!content) {
        data = await requestOllamaChat(buildPayload(undefined), requestOptions);
        content = readOllamaChatContent(data, wantsJson);
    }
    if (!content) {
        throw new ProxyUpstreamError("upstream_empty_response", {
            retryable: true,
            status: 502
        });
    }
    const promptTokens = Number(data?.prompt_eval_count ?? 0);
    const completionTokens = Number(data?.eval_count ?? 0);
    return {
        status: 200,
        body: {
            id: data?.id ?? `chatcmpl-${crypto.randomUUID()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content },
                    finish_reason: data?.done_reason ?? "stop"
                }
            ],
            usage: {
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: promptTokens + completionTokens
            }
        }
    };
};
const forwardOpenAIChat = async (body, options) => {
    const model = body?.model ?? config.LLM_MODEL;
    const endpoint = buildOpenAIEndpoint(config.LLM_BASE_URL, "chat/completions");
    const payload = { ...body, model, stream: false };
    const res = await postJsonUpstream("llm", endpoint, payload, config.LLM_API_KEY, options);
    const parsed = await parseJsonResponse(res, "openai_chat_invalid_json");
    return { status: 200, body: parsed };
};
const mapOllamaEmbeddings = async (body, options) => {
    const model = body?.model ?? config.EMBED_MODEL;
    const input = body?.input ?? "";
    const inputs = Array.isArray(input) ? input : [input];
    const endpoint = `${config.EMBED_BASE_URL.replace(/\/$/, "")}/api/embeddings`;
    const data = [];
    let index = 0;
    for (const item of inputs) {
        const prompt = typeof item === "string" ? item : JSON.stringify(item);
        const res = await postJsonUpstream("embeddings", endpoint, { model, prompt }, config.EMBED_API_KEY, options);
        const payload = (await res.json());
        const embedding = payload?.embedding ?? payload?.data?.[0]?.embedding ?? [];
        data.push({ object: "embedding", index, embedding });
        index += 1;
    }
    return {
        status: 200,
        body: {
            object: "list",
            data,
            model,
            usage: { prompt_tokens: 0, total_tokens: 0 }
        }
    };
};
const forwardOpenAIEmbeddings = async (body, options) => {
    const model = body?.model ?? config.EMBED_MODEL;
    const endpoint = buildOpenAIEndpoint(config.EMBED_BASE_URL, "embeddings");
    const payload = { ...body, model };
    const res = await postJsonUpstream("embeddings", endpoint, payload, config.EMBED_API_KEY, options);
    const parsed = await parseJsonResponse(res, "openai_embed_invalid_json");
    return { status: 200, body: parsed };
};
const forwardOpenAIRerank = async (body, options) => {
    const model = body?.model ?? config.RERANK_MODEL;
    const endpoint = buildOpenAIEndpoint(config.RERANK_BASE_URL, "rerank");
    const payload = { ...body, model };
    const res = await postJsonUpstream("embeddings", endpoint, payload, config.RERANK_API_KEY, options);
    const parsed = await parseJsonResponse(res, "openai_rerank_invalid_json");
    return { status: 200, body: parsed };
};
const resolveChat = async (body, options) => {
    if (config.LLM_MODE === "ollama")
        return mapOllamaChat(body, options);
    try {
        return await forwardOpenAIChat(body, options);
    }
    catch (error) {
        if (error instanceof ProxyUpstreamError && (error.status === 404 || error.status === 405)) {
            return mapOllamaChat(body, options);
        }
        throw error;
    }
};
const resolveEmbeddings = async (body, options) => {
    if (config.EMBED_MODE === "ollama")
        return mapOllamaEmbeddings(body, options);
    try {
        return await forwardOpenAIEmbeddings(body, options);
    }
    catch (error) {
        if (error instanceof ProxyUpstreamError && (error.status === 404 || error.status === 405)) {
            return mapOllamaEmbeddings(body, options);
        }
        throw error;
    }
};
const isChatPayloadValid = (body) => Array.isArray(body?.messages) &&
    body.messages.length > 0 &&
    body.messages.length <= 64 &&
    body.messages.every((message) => typeof message?.content === "string" &&
        typeof message?.role === "string" &&
        message.role.trim().length > 0 &&
        message.content.trim().length > 0);
const isEmbeddingPayloadValid = (body) => {
    const input = body?.input;
    if (typeof input === "string")
        return input.trim().length > 0;
    return Array.isArray(input) && input.length > 0;
};
const isRerankPayloadValid = (body) => {
    const query = body?.query ?? body?.text;
    const documents = body?.documents ?? body?.docs;
    return typeof query === "string" && query.trim().length > 0 && Array.isArray(documents) && documents.length > 0;
};
const buildModelsPayload = () => ({
    object: "list",
    data: [
        {
            id: config.LLM_MODEL,
            object: "model",
            owned_by: "cheshire-proxy"
        },
        {
            id: config.EMBED_MODEL,
            object: "model",
            owned_by: "cheshire-proxy"
        },
        {
            id: config.RERANK_MODEL,
            object: "model",
            owned_by: "cheshire-proxy"
        }
    ]
});
const runDeepHealth = async () => {
    const [llm, embeddings] = await Promise.all([
        checkUpstream("llm", config.LLM_BASE_URL, config.LLM_MODE, config.LLM_API_KEY),
        checkUpstream("embeddings", config.EMBED_BASE_URL, config.EMBED_MODE, config.EMBED_API_KEY)
    ]);
    const ok = llm.ok && embeddings.ok;
    return {
        ok,
        queue: snapshotCheshireQueue(),
        llm: {
            ...llm,
            state: snapshotLane("llm")
        },
        embeddings: {
            ...embeddings,
            state: snapshotLane("embeddings")
        }
    };
};
const toErrorPayload = (error) => {
    if (error instanceof ProxyUpstreamError) {
        return {
                status: error.status ?? 502,
                body: {
                    error: error.message
                }
        };
    }
    return {
        status: 500,
        body: {
            error: toErrorMessage(error)
        }
    };
};
const serializeError = (error) => error instanceof Error
    ? {
        name: error.name,
        message: error.message
    }
    : error;
const start = async () => {
    const app = Fastify({ logger: true, bodyLimit: 4 * 1024 * 1024 });
    await app.register(cors, { origin: true });
    app.setErrorHandler((error, request, reply) => {
        request.log.error({ error: serializeError(error) }, "Cheshire proxy unhandled error");
        if (reply.sent)
            return;
        const payload = toErrorPayload(error);
        reply.code(payload.status).send(payload.body);
    });
    app.get("/healthz", async (request, reply) => {
        const deep = request.query?.deep === "1";
        if (!deep) {
            return {
                ok: true,
                queue: snapshotCheshireQueue(),
                llm: snapshotLane("llm"),
                embeddings: snapshotLane("embeddings")
            };
        }
        const health = await runDeepHealth();
        reply.code(health.ok ? 200 : 503);
        return health;
    });
    app.get("/readyz", async (_request, reply) => {
        const health = await runDeepHealth();
        reply.code(health.ok ? 200 : 503);
        return health;
    });
    app.get("/v1/models", async () => buildModelsPayload());
    app.post("/v1/chat/completions", async (request, reply) => {
        const body = request.body;
        if (!isChatPayloadValid(body)) {
            return reply.code(400).send({ error: "invalid_chat_payload" });
        }
        const clientAbort = createClientAbort(request);
        const requestClient = readHeaderValue(request.headers["x-cheshire-client"]);
        const requestPurpose = readHeaderValue(request.headers["x-cheshire-purpose"]);
        const requestLane = normalizeQueueLane(request.headers["x-cheshire-lane"], "general");
        const requestOptions = buildRequestOptions(request.headers, clientAbort.signal, requestTimeoutForLane(requestLane));
        const requestPriority = normalizeQueuePriority(request.headers["x-cheshire-priority"], requestLane === "listener" ? "high" : requestLane === "notes" ? "low" : "normal");
        const queueWaitMs = readQueueWaitMs(request.headers["x-cheshire-queue-wait-ms"], defaultQueueWaitMs(requestLane));
        const queueRelease = await acquireQueueSlot(requestLane, requestPriority, queueWaitMs);
        if (!queueRelease) {
            clientAbort.cleanup();
            return reply.code(503).send({
                error: "cheshire_queue_busy",
                lane: requestLane,
                queue: snapshotCheshireQueue()
            });
        }
        try {
            const result = await resolveChat(body, requestOptions);
            return reply.code(result.status).send(result.body);
        }
        catch (error) {
            request.log.warn({
                client: requestClient,
                error: serializeError(error),
                purpose: requestPurpose,
                lane: requestLane
            }, "Cheshire chat upstream failed");
            const payload = toErrorPayload(error);
            return reply.code(payload.status).send(payload.body);
        }
        finally {
            queueRelease();
            clientAbort.cleanup();
        }
    });
    app.post("/v1/embeddings", async (request, reply) => {
        const body = request.body;
        if (!isEmbeddingPayloadValid(body)) {
            return reply.code(400).send({ error: "invalid_embeddings_payload" });
        }
        const clientAbort = createClientAbort(request);
        const requestClient = readHeaderValue(request.headers["x-cheshire-client"]);
        const requestLane = normalizeQueueLane(request.headers["x-cheshire-lane"], "embeddings");
        const requestOptions = buildRequestOptions(request.headers, clientAbort.signal, requestTimeoutForLane(requestLane));
        const requestPriority = normalizeQueuePriority(request.headers["x-cheshire-priority"], "low");
        const queueWaitMs = readQueueWaitMs(request.headers["x-cheshire-queue-wait-ms"], defaultQueueWaitMs(requestLane));
        const queueRelease = await acquireQueueSlot(requestLane, requestPriority, queueWaitMs);
        if (!queueRelease) {
            clientAbort.cleanup();
            return reply.code(503).send({
                error: "cheshire_queue_busy",
                lane: requestLane,
                queue: snapshotCheshireQueue()
            });
        }
        try {
            const result = await resolveEmbeddings(body, requestOptions);
            return reply.code(result.status).send(result.body);
        }
        catch (error) {
            request.log.warn({ client: requestClient, error: serializeError(error), lane: requestLane }, "Cheshire embeddings upstream failed");
            const payload = toErrorPayload(error);
            return reply.code(payload.status).send(payload.body);
        }
        finally {
            queueRelease();
            clientAbort.cleanup();
        }
    });
    app.post("/v1/rerank", async (request, reply) => {
        const body = request.body;
        if (!isRerankPayloadValid(body)) {
            return reply.code(400).send({ error: "invalid_rerank_payload" });
        }
        const clientAbort = createClientAbort(request);
        const requestOptions = buildRequestOptions(request.headers, clientAbort.signal);
        const requestClient = readHeaderValue(request.headers["x-cheshire-client"]);
        const requestLane = normalizeQueueLane(request.headers["x-cheshire-lane"], "embeddings");
        const requestPriority = normalizeQueuePriority(request.headers["x-cheshire-priority"], "normal");
        const queueWaitMs = readQueueWaitMs(request.headers["x-cheshire-queue-wait-ms"], defaultQueueWaitMs(requestLane));
        const queueRelease = await acquireQueueSlot(requestLane, requestPriority, queueWaitMs);
        if (!queueRelease) {
            clientAbort.cleanup();
            return reply.code(503).send({
                error: "cheshire_queue_busy",
                lane: requestLane,
                queue: snapshotCheshireQueue()
            });
        }
        try {
            const result = await forwardOpenAIRerank(body, requestOptions);
            return reply.code(result.status).send(result.body);
        }
        catch (error) {
            request.log.warn({ client: requestClient, error: serializeError(error), lane: requestLane }, "Cheshire rerank upstream failed");
            const payload = toErrorPayload(error);
            return reply.code(payload.status).send(payload.body);
        }
        finally {
            queueRelease();
            clientAbort.cleanup();
        }
    });
    await app.listen({ port: config.PORT, host: "0.0.0.0" });
};
start().catch((err) => {
    console.error(err);
    process.exit(1);
});
