import OpenAI from "openai";

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
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL || undefined;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
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
    defaultHeaders: parseHeaders()
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
