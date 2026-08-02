import { describe, expect, test } from "vitest";
import { getLaneDisplay } from "./chat-presentation";

describe("RassyMind lane display", () => {
  test("describes each selectable lane without inventing a gateway capability", () => {
    expect(getLaneDisplay("general")).toMatchObject({ glyph: "ASK", capability: "Conversation and synthesis" });
    expect(getLaneDisplay("deep-coding")).toMatchObject({ glyph: "CODE", capability: "High-context coding" });
    expect(getLaneDisplay("fast-coding")).toMatchObject({ glyph: "FAST", capability: "Focused coding loops" });
    expect(getLaneDisplay("quick")).toMatchObject({ glyph: "SNAP", capability: "Short, low-latency turns" });
    expect(getLaneDisplay("knowledge")).toMatchObject({ glyph: "KNOW", capability: "Selected document context" });
  });
});
