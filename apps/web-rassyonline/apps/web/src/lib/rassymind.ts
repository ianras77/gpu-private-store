export type ChatModeId = "general" | "deep-coding" | "fast-coding" | "quick" | "spark" | "knowledge";

export type ChatMode = {
  id: ChatModeId;
  label: string;
  model: string;
  maxTokens: number;
  thinking: boolean;
  description: string;
  contextWindow: string;
};

export const CHAT_MODES: ChatMode[] = [
  { id: "general", label: "Talk", model: "rassy-mind", maxTokens: 2048, thinking: true, contextWindow: "Mind lane", description: "Reasoning, conversation, and synthesis through the general RassyMind lane." },
  { id: "deep-coding", label: "Deep Code", model: "rassy-code", maxTokens: 4096, thinking: true, contextWindow: "Code lane", description: "High-context coding, systems reasoning, and operator work." },
  { id: "fast-coding", label: "Fast Code", model: "rassy-code", maxTokens: 1536, thinking: false, contextWindow: "Code lane", description: "Focused implementation loops through the same canonical code lane." },
  { id: "quick", label: "Utility", model: "rassy-utility", maxTokens: 768, thinking: false, contextWindow: "Utility lane", description: "Short answers, titles, summaries, and quick transforms." },
  { id: "spark", label: "Spark", model: "rassy-fast", maxTokens: 512, thinking: false, contextWindow: "Fast lane", description: "Low-latency transforms when speed matters more than depth." },
  { id: "knowledge", label: "Knowledge", model: "rassy-mind", maxTokens: 3072, thinking: true, contextWindow: "Mind + vectors", description: "RassyMind reasoning grounded with your selected document vectors." }
];

export function getChatMode(value: string | null | undefined): ChatMode {
  return CHAT_MODES.find((mode) => mode.id === value) ?? CHAT_MODES[0];
}

export function getRassyMindChatUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;
}

export function getRassyMindEmbeddingsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/v1/embeddings`;
}

export function getRassyMindRequestError(status: number): Error {
  return new Error(`RassyMind request failed with status ${status}`);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const baseUrl = process.env.RASSYMIND_BASE_URL ?? "http://host.docker.internal:8844";
  const response = await fetch(getRassyMindEmbeddingsUrl(baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.RASSYMIND_API_KEY ? { authorization: `Bearer ${process.env.RASSYMIND_API_KEY}` } : {})
    },
    body: JSON.stringify({ model: "rassy-embed", input: texts })
  });

  if (!response.ok) {
    throw getRassyMindRequestError(response.status);
  }

  const parsed = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  const embeddings = parsed.data?.map((item) => item.embedding ?? []) ?? [];
  if (embeddings.length !== texts.length || embeddings.some((embedding) => embedding.length === 0)) {
    throw new Error("RassyMind embeddings response was incomplete");
  }
  return embeddings;
}

export async function rerankTexts(query: string, documents: string[]): Promise<number[]> {
  if (!documents.length) return [];
  const baseUrl = process.env.RASSYMIND_BASE_URL ?? "http://host.docker.internal:8844";
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/v1/rerank`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.RASSYMIND_API_KEY ? { authorization: `Bearer ${process.env.RASSYMIND_API_KEY}` } : {})
    },
    body: JSON.stringify({ model: "rassy-rerank", query, documents, top_n: documents.length })
  });
  if (!response.ok) throw getRassyMindRequestError(response.status);
  const parsed = (await response.json()) as { results?: Array<{ index?: number; relevance_score?: number; score?: number }> };
  return (parsed.results ?? [])
    .filter((item) => typeof item.index === "number")
    .sort((left, right) => (right.relevance_score ?? right.score ?? 0) - (left.relevance_score ?? left.score ?? 0))
    .map((item) => item.index as number);
}

export function extractDeltaFromSseLine(line: string): string | null {
  return extractDeltaPayloadFromSseLine(line)?.content ?? null;
}

export function extractDeltaPayloadFromSseLine(line: string): { content: string | null; reasoning: string | null } | null {
  if (!line.startsWith("data:")) return null;
  const data = line.slice("data:".length).trim();
  if (!data || data === "[DONE]") return null;

  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string; reasoning_content?: string; reasoning?: string }; message?: { content?: string; reasoning_content?: string; reasoning?: string }; text?: string }>;
    };
    const choice = parsed.choices?.[0];
    return {
      content: choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? null,
      reasoning: choice?.delta?.reasoning_content ?? choice?.delta?.reasoning ?? choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? null
    };
  } catch {
    return null;
  }
}
