import type { ChatModeId } from "./rassymind";

type LaneDisplay = {
  glyph: string;
  capability: string;
  accent: string;
};

const LANE_DISPLAY: Record<ChatModeId, LaneDisplay> = {
  general: { glyph: "MIND", capability: "Reasoning + synthesis", accent: "cyan" },
  "deep-coding": { glyph: "CODE", capability: "Systems + high-context code", accent: "gold" },
  "fast-coding": { glyph: "FAST", capability: "Focused code loops", accent: "violet" },
  quick: { glyph: "UTIL", capability: "Short utility turns", accent: "rose" },
  spark: { glyph: "SPRK", capability: "Low-latency transforms", accent: "gold" },
  knowledge: { glyph: "KNOW", capability: "Mind + selected vectors", accent: "cyan" }
};

export function getLaneDisplay(mode: ChatModeId): LaneDisplay {
  return LANE_DISPLAY[mode];
}
