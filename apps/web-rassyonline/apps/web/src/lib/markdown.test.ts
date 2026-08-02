import { describe, expect, it } from "vitest";
import { parseMarkdownBlocks } from "./markdown";

describe("parseMarkdownBlocks", () => {
  it("separates prose, headings, lists, code, and quotes", () => {
    expect(
      parseMarkdownBlocks(
        [
          "## Plan",
          "Here is the path.",
          "- search first",
          "- cite sources",
          "> keep it bounded",
          "```ts",
          "const answer = true;",
          "```"
        ].join("\n")
      )
    ).toEqual([
      { type: "heading", depth: 2, text: "Plan" },
      { type: "paragraph", text: "Here is the path." },
      { type: "list", ordered: false, items: ["search first", "cite sources"] },
      { type: "quote", text: "keep it bounded" },
      { type: "code", language: "ts", text: "const answer = true;" }
    ]);
  });

  it("parses simple markdown tables", () => {
    expect(
      parseMarkdownBlocks(
        [
          "| Tool | Use |",
          "| --- | --- |",
          "| RassyMind | local model gateway |",
          "| search.rasies.com | fresh web context |"
        ].join("\n")
      )
    ).toEqual([
      {
        type: "table",
        headers: ["Tool", "Use"],
        rows: [
          ["RassyMind", "local model gateway"],
          ["search.rasies.com", "fresh web context"]
        ]
      }
    ]);
  });
});
