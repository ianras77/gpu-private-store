export type ChatModeId = "general" | "deep-coding" | "fast-coding" | "quick" | "knowledge";

export type ChatMode = {
  id: ChatModeId;
  label: string;
  model: string;
  description: string;
};

export const CHAT_MODES: ChatMode[] = [
  {
    id: "general",
    label: "General",
    model: "rassy-general",
    description: "Broad assistant chat and analysis."
  },
  {
    id: "deep-coding",
    label: "Deep Coding",
    model: "rassy-codex",
    description: "High-context coding and operator reasoning."
  },
  {
    id: "fast-coding",
    label: "Fast Coding",
    model: "rassy-codex-lite",
    description: "Normal coding loops and faster agent work."
  },
  {
    id: "quick",
    label: "Quick",
    model: "rassy-fast",
    description: "Short answers, titles, and summaries."
  },
  {
    id: "knowledge",
    label: "Knowledge",
    model: "rassy-general",
    description: "Document-grounded chat; retrieval arrives in Stage 4."
  }
];

export function getChatMode(value: string | null | undefined): ChatMode {
  return CHAT_MODES.find((mode) => mode.id === value) ?? CHAT_MODES[0];
}

export function getRassyCodexChatUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
}

export function extractDeltaFromSseLine(line: string): string | null {
  if (!line.startsWith("data:")) return null;
  const data = line.slice("data:".length).trim();
  if (!data || data === "[DONE]") return null;

  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{
        delta?: { content?: string };
        message?: { content?: string };
        text?: string;
      }>;
    };
    return (
      parsed.choices?.[0]?.delta?.content ??
      parsed.choices?.[0]?.message?.content ??
      parsed.choices?.[0]?.text ??
      null
    );
  } catch {
    return null;
  }
}
