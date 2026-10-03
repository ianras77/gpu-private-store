import { describe, expect, it } from "vitest";
import { parseGroundedCompanionReply } from "../companion-workflow";
import { selectRelevantFacts } from "../fact-tools";

const facts = [
  { id: "placement:sun", humanText: "Sun in Leo", category: "placement" },
  { id: "placement:moon", humanText: "Moon in Cancer", category: "placement" },
  { id: "aspect:venus-mars", humanText: "Venus conjunct Mars", category: "aspect" }
];

describe("Chart Companion grounding", () => {
  it("retrieves the requested planet and leaves unsupported topics empty", () => {
    expect(selectRelevantFacts(facts, "Help me understand my Moon sign").map((fact) => fact.id)).toEqual(["placement:moon"]);
    expect(selectRelevantFacts(facts, "Tell me about Saturn")).toEqual([]);
  });

  it("accepts only answers that cite retrieved facts", () => {
    expect(parseGroundedCompanionReply(
      '{"answer":"Your Moon is in Cancer.","factRefs":["placement:moon","placement:moon"]}',
      ["placement:moon"]
    )).toEqual({ answer: "Your Moon is in Cancer.", factRefs: ["placement:moon"] });
    expect(parseGroundedCompanionReply(
      '{"answer":"You are very emotional.","factRefs":["not-a-chart-fact"]}',
      ["placement:moon"]
    )).toBeNull();
    expect(parseGroundedCompanionReply(
      '{"answer":"You are very emotional.","factRefs":[]}',
      ["placement:moon"]
    )).toBeNull();
  });
});
