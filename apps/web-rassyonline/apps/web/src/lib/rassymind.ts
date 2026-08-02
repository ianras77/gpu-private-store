export type ChatModeId = "general" | "deep-coding" | "fast-coding" | "quick" | "knowledge";

export type ChatMode = {
  id: ChatModeId;
  label: string;
  model: string;
  description: string;
};

export const CHAT_MODES: ChatMode[] = [
  { id: "general", label: "Talk", model: "rassy-smart", description: "Broad assistant chat, thinking, and synthesis." },
  { id: "deep-coding", label: "Deep Code", model: "rassy-code", description: "High-context coding, systems reasoning, and operator work." },
  { id: "fast-coding", label: "Fast Code", model: "rassy-fast", description: "Fast coding loops, implementation passes, and focused edits." },
  { id: "quick", label: "Spark", model: "rassy-utility", description: "Short answers, titles, summaries, and quick transforms." },
  { id: "knowledge", label: "Memory", model: "rassy-mind", description: "Document-grounded chat with enabled workspace memory." }
];

export function getChatMode(value: string | null | undefined): ChatMode {
  return CHAT_MODES.find((mode) => mode.id === value) ?? CHAT_MODES[0];
}

export function getRassyMindChatUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
}

export function getRassyMindEmbeddingsUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/v1/embeddings`;
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
    throw new Error(`RassyMind embeddings failed: ${response.status} ${await response.text()}`);
  }

  const parsed = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  const embeddings = parsed.data?.map((item) => item.embedding ?? []) ?? [];
  if (embeddings.length !== texts.length || embeddings.some((embedding) => embedding.length === 0)) {
    throw new Error("RassyMind embeddings response was incomplete");
  }
  return embeddings;
}

export function extractDeltaFromSseLine(line: string): string | null {
  if (!line.startsWith("data:")) return null;
  const data = line.slice("data:".length).trim();
  if (!data || data === "[DONE]") return null;

  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string }; message?: { content?: string }; text?: string }>;
    };
    return parsed.choices?.[0]?.delta?.content ?? parsed.choices?.[0]?.message?.content ?? parsed.choices?.[0]?.text ?? null;
  } catch {
    return null;
  }
}
