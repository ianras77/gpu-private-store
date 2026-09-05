import { describe, expect, it } from "vitest";
import { validateAstrologyLanguage, validateSectionDraft } from "../grounding";

const graph = { schemaVersion: "1.0.0" as const, analysisVersion: "1.0.0", chartHash: "x", facts: [{ id: "placement:sun", category: "placement" as const, label: "Sun", value: {}, humanText: "Sun is in Aries.", importance: 1, confidence: "exact" as const, sourcePath: [], relatedFactIds: [] }] };
describe("grounding", () => { it("rejects unsupported facts", () => { expect(() => validateSectionDraft({ key: "x", title: "X", body: ["text"], factRefs: ["placement:moon"] }, graph)).toThrow(/Unsupported/); }); });
describe("astrology language", () => {
  it("rejects deterministic or harmful claims", () => { expect(() => validateAstrologyLanguage("You are destined to fail.")).toThrow(/Unsupported/); });
  it("allows reflective language", () => { expect(validateAstrologyLanguage("This pattern may invite reflection.")).toContain("may"); });
});
