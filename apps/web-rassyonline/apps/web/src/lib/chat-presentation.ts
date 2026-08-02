import type { ChatModeId } from "./rassymind";

type LaneDisplay = {
  glyph: string;
  capability: string;
};

const LANE_DISPLAY: Record<ChatModeId, LaneDisplay> = {
  general: { glyph: "ASK", capability: "Conversation and synthesis" },
  "deep-coding": { glyph: "CODE", capability: "High-context coding" },
  "fast-coding": { glyph: "FAST", capability: "Focused coding loops" },
  quick: { glyph: "SNAP", capability: "Short, low-latency turns" },
  knowledge: { glyph: "KNOW", capability: "Selected document context" }
};

export function getLaneDisplay(mode: ChatModeId): LaneDisplay {
  return LANE_DISPLAY[mode];
}
