import OpenAI from "openai";
import { createHash } from "node:crypto";

type LLMOptions = {
  maxTokens?: number;
  temperature?: number;
};

export interface LLMResponse {
  content: string | null;
  provider: string;
  model: string;
  baseURL?: string;
}

const parseHeaders = (): Record<string, string> | undefined => {
  const raw = process.env.OPENAI_DEFAULT_HEADERS_JSON;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed;
  } catch {
    return undefined;
  }
};

export const callLLM = async (
  system: string,
  prompt: string,
  options: LLMOptions = {}
): Promise<LLMResponse> => {
  const useRassyMind = process.env.RASSYMIND_ENABLED === "1";
  const baseURL = useRassyMind
    ? (process.env.RASSYMIND_BASE_URL || "http://host.docker.internal:8844/v1")
    : (process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL || undefined);
  const apiKey = useRassyMind ? process.env.RASSYMIND_API_KEY : process.env.OPENAI_API_KEY;
  const model = useRassyMind ? (process.env.RASSYMIND_MODEL || "rassy-fast") : (process.env.OPENAI_MODEL ?? "gpt-4o");
  const provider =
    process.env.OPENAI_PROVIDER_NAME ??
    (baseURL?.toLowerCase().includes("cheshire")
      ? "cheshire-cat"
      : baseURL
      ? "openai-compatible"
      : "openai");

  if (!apiKey) {
    return {
      content: null,
      provider: "fallback",
      model: "fallback",
      baseURL
    };
  }

  const headers = parseHeaders() || {};
  if (useRassyMind) {
    headers["X-Rassy-Session-ID"] = createHash("sha256").update(process.env.RASSYMIND_SESSION_ID || "astro:anonymous").digest("hex").slice(0, 32);
    headers["X-Rassy-Workload"] = "interactive";
    headers["X-Rassy-Deadline-Ms"] = process.env.RASSYMIND_DEADLINE_MS || "60000";
  }
  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: headers
  });

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      response_format: { type: "json_object" }
    });

    return {
      content: response.choices[0]?.message?.content ?? null,
      provider,
      model,
      baseURL
    };
  } catch {
    return {
      content: null,
      provider,
      model,
      baseURL
    };
  }
};
