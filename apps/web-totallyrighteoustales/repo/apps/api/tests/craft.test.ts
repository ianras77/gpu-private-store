import { describe, expect, it } from "vitest";
import { buildCraftNotesFallback } from "../src/lib/craft";

describe("craft notes", () => {
  it("returns revision guidance instead of rewriting the story", () => {
    const notes = buildCraftNotesFallback({
      title: "The Moonlit Porch",
      body: "A porch floated away and everyone in town pretended this was normal.",
      premise: "A porch learns to float",
      voice: "warm and sly",
    });

    expect(notes).toHaveLength(4);
    expect(notes.join(" ")).toContain("choice");
    expect(notes.join(" ")).not.toContain("Once upon");
  });
});
