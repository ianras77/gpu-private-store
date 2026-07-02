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
      notice: "RassyCodex deep coding lane is active."
    };
  }

  if (command === "/fast") {
    return {
      kind: value ? "send" : "local",
      ...(value ? { prompt: value } : {}),
      updates: { mode: "quick" },
      notice: "RassyCodex quick lane is active."
    };
  }

  if (command === "/know") {
    return {
      kind: value ? "send" : "local",
      ...(value ? { prompt: value } : {}),
      updates: { mode: "knowledge" },
      notice: "RassyCodex knowledge lane is active."
    };
  }

  if (command === "/search" && value) {
    return {
      kind: "send",
      prompt: value,
      updates: { webSearch: "on" },
      notice: "Web search is on for this request."
    };
  }

  if (command === "/local" && value) {
    return {
      kind: "send",
      prompt: value,
      updates: { webSearch: "off" },
      notice: "This request will stay local."
    };
  }

  if (command === "/mode" && MODES.has(value as ChatModeId)) {
    return {
      kind: "local",
      updates: { mode: value as ChatModeId },
      notice: `Mode changed to ${value}.`
    };
  }

  if (command === "/theme" && THEMES.has(value as ThemeId)) {
    return {
      kind: "local",
      updates: { themeId: value as ThemeId },
      notice: `Atmosphere shifted to ${value}.`
    };
  }

  return null;
}
