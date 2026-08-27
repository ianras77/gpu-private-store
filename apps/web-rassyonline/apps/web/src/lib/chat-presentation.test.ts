import { describe, expect, test } from "vitest";
import { getLaneDisplay } from "./chat-presentation";

describe("RassyMind channel display", () => {
  test("describes each selectable channel without inventing a gateway capability", () => {
    expect(getLaneDisplay("general")).toMatchObject({ glyph: "MIND", capability: "Reasoning + synthesis" });
    expect(getLaneDisplay("deep-coding")).toMatchObject({ glyph: "CODE", capability: "Systems + high-context code" });
    expect(getLaneDisplay("fast-coding")).toMatchObject({ glyph: "FAST", capability: "Focused code loops" });
    expect(getLaneDisplay("quick")).toMatchObject({ glyph: "UTIL", capability: "Short utility turns" });
    expect(getLaneDisplay("spark")).toMatchObject({ glyph: "SPRK", capability: "Low-latency transforms" });
    expect(getLaneDisplay("knowledge")).toMatchObject({ glyph: "KNOW", capability: "Mind + selected vectors" });
  });
});
