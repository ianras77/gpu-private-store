import { describe, it, expect } from "vitest";
import { ReadingOutputSchema, CompatibilityOutputSchema } from "../schemas";

describe("ReadingOutputSchema", () => {
  it("validates reading output", () => {
    const reading = {
      title: "The Architect's Fire",
      subtitle: "A grounded natal reading for purpose, rhythm, and repair.",
      excerpt: "A concise doorway into the full reading.",
      overview: [
        "Line one",
        "Line two",
        "Line three",
        "Line four",
        "Line five"
      ],
      narrative: [
        "Paragraph one",
        "Paragraph two"
      ],
      characterSheet: {
        title: "The Architect",
        archetypes: ["Builder", "Keeper"],
        strengths: ["Discipline", "Focus"],
        shadows: ["Rigidity", "Overcontrol"],
        path: ["Choose one vow", "Sustain the ritual"],
        motto: "Build what lasts."
      },
      bigThree: {
        sun: "Sun in Aries",
        moon: "Moon in Taurus",
        rising: "Asc in Gemini"
      },
      planets: [
        { planet: "Sun", text: "text" },
        { planet: "Moon", text: "text" },
        { planet: "Mercury", text: "text" },
        { planet: "Venus", text: "text" },
        { planet: "Mars", text: "text" }
      ],
      houses: [{ house: 1, text: "text" }],
      aspects: [
        { aspect: "Sun trine Moon", text: "text" },
        { aspect: "Moon square Mars", text: "text" },
        { aspect: "Venus sextile Jupiter", text: "text" }
      ],
      brandLens: [{ title: "Module", text: "text" }],
      ritualCalendar: [
        { date: "2026-02-26", title: "Gate of Focus", focus: "Sun in Aries", ritual: "text" },
        { date: "2026-02-27", title: "Quiet Forge", focus: "Moon in Taurus", ritual: "text" },
        { date: "2026-02-28", title: "Signal Drift", focus: "Moon in Gemini", ritual: "text" },
        { date: "2026-03-01", title: "Rooted Calm", focus: "Moon in Cancer", ritual: "text" },
        { date: "2026-03-02", title: "Bright Pulse", focus: "Moon in Leo", ritual: "text" }
      ],
      actionables: ["one", "two", "three"],
      disclaimer: "for reflection"
    };

    expect(() => ReadingOutputSchema.parse(reading)).not.toThrow();
  });
});

describe("CompatibilityOutputSchema", () => {
  it("validates compatibility output", () => {
    const reading = {
      overview: ["line 1", "line 2", "line 3", "line 4"],
      narrative: ["para 1", "para 2"],
      pairing: {
        personA: { sun: "Sun in Aries", moon: "Moon in Taurus", rising: "Asc in Gemini" },
        personB: { sun: "Sun in Cancer", moon: "Moon in Leo", rising: "Asc in Virgo" }
      },
      harmony: [
        { title: "Ease", text: "text" },
        { title: "Flow", text: "text" }
      ],
      friction: [
        { title: "Tension", text: "text" },
        { title: "Edge", text: "text" }
      ],
      growth: ["one", "two"],
      aspects: [
        { aspect: "Sun trine Moon", text: "text" },
        { aspect: "Moon square Mars", text: "text" },
        { aspect: "Venus sextile Jupiter", text: "text" }
      ],
      rituals: ["one", "two", "three"],
      disclaimer: "for reflection"
    };

    expect(() => CompatibilityOutputSchema.parse(reading)).not.toThrow();
  });
});
