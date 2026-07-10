import type { ChatModeId } from "./rassycodex";
import type { ThemeId } from "./theme";

export type WebSearchMode = "auto" | "on" | "off";

export type LocalChatIntent = {
  kind: "local" | "send";
  prompt?: string;
  updates: {
    mode?: ChatModeId;
    themeId?: ThemeId;
    webSearch?: WebSearchMode;
  };
  notice: string;
};

const MODES = new Set<ChatModeId>(["general", "deep-coding", "fast-coding", "quick", "knowledge"]);
const THEMES = new Set<ThemeId>(["aurora", "ember", "verdant"]);

export function applyLocalChatIntent(rawPrompt: string): LocalChatIntent | null {
  const prompt = rawPrompt.trim();
  const [command = "", ...rest] = prompt.split(/\s+/);
  const value = rest.join(" ").trim();

  if (command === "/code") {
    return {
      kind: value ? "send" : "local",
      ...(value ? { prompt: value } : {}),
      updates: { mode: "deep-coding" },
      notice: "Deep Codex is steering the thread."
    };
  }

  if (command === "/fast") {
    return {
      kind: value ? "send" : "local",
      ...(value ? { prompt: value } : {}),
      updates: { mode: "quick" },
      notice: "Spark lane is active for quick turns."
    };
  }

  if (command === "/know") {
    return {
      kind: value ? "send" : "local",
      ...(value ? { prompt: value } : {}),
      updates: { mode: "knowledge" },
      notice: "Memory lane is active; enabled documents can shape the answer."
    };
  }

  if (command === "/search" && value) {
    return {
      kind: "send",
      prompt: value,
      updates: { webSearch: "on" },
      notice: "Web search is lit for this request."
    };
  }

  if (command === "/local" && value) {
    return {
      kind: "send",
      prompt: value,
      updates: { webSearch: "off" },
      notice: "This request will stay local to the room."
    };
  }

  if (command === "/mode" && MODES.has(value as ChatModeId)) {
    return {
      kind: "local",
      updates: { mode: value as ChatModeId },
      notice: `Mode changed to ${value}; the next answer will route through that lane.`
    };
  }

  if (command === "/theme" && THEMES.has(value as ThemeId)) {
    return {
      kind: "local",
      updates: { themeId: value as ThemeId },
      notice: `Atmosphere shifted to ${value}; the room can keep tuning around the conversation.`
    };
  }

  return null;
}
