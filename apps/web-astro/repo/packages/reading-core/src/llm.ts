import OpenAI from "openai";

type LLMOptions = {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
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

const resolveTimeoutMs = (value?: number) => {
  const candidate = value ?? Number(process.env.OPENAI_TIMEOUT_MS ?? 45_000);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : 45_000;
};

export const callLLM = async (
  system: string,
  prompt: string,
  options: LLMOptions = {}
): Promise<LLMResponse> => {
  const baseURL = process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL || undefined;
  const apiKey = process.env.OPENAI_API_KEY || (baseURL ? "rassygpt-internal" : undefined);
  const model = process.env.OPENAI_MODEL ?? "rassy-smart";
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
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

  const client = new OpenAI({
    apiKey,
    baseURL,
    defaultHeaders: parseHeaders(),
    timeout: timeoutMs
  });

  try {
    const completion = client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      response_format: { type: "json_object" }
    });

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`LLM request timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    const response = await Promise.race([completion, timeout]);

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
