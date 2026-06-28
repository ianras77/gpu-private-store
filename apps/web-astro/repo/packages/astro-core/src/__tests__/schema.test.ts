import { describe, it, expect } from "vitest";
import { NatalChartSchema } from "../schema";

const loadSourceSchema = () =>
  import("../schema" + ".ts") as Promise<typeof import("../schema")>;
const loadSourceTypes = () =>
  import("../types" + ".ts") as Promise<typeof import("../types")>;

const sample = {
  points: [
    {
      key: "Sun",
      type: "planet",
      degree: 120,
      sign: "Leo",
      signDegree: 0,
      house: 5
    }
  ],
  aspects: [
    {
      type: "trine",
      between: ["Sun", "Moon"],
      orb: 2,
      exact: 120
    }
  ],
  houses: {
    system: "placidus",
    cusps: Array.from({ length: 12 }, (_, i) => i * 30)
  },
  meta: {
    timeUnknown: false,
    timezone: "UTC",
    calculatedAt: new Date().toISOString(),
    houseSystem: "placidus"
  }
};

describe("NatalChartSchema", () => {
  it("validates chart JSON", () => {
    expect(() => NatalChartSchema.parse(sample)).not.toThrow();
  });

  it("exposes all four natal chart angles", async () => {
    const { ANGLES } = await loadSourceTypes();

    expect(ANGLES).toEqual(["Asc", "MC", "Desc", "IC"]);
  });

  it("validates expanded chart metadata, angles, and point speed", async () => {
    const { NatalChartSchema: SourceNatalChartSchema } = await loadSourceSchema();
    const expanded = {
      points: [
        {
          key: "Sun",
          type: "planet",
          degree: 120,
          sign: "Leo",
          signDegree: 0,
          house: 5,
          speed: 0.95
        },
        {
          key: "Desc",
          type: "angle",
          degree: 210,
          sign: "Scorpio",
          signDegree: 0
        },
        {
          key: "IC",
          type: "angle",
          degree: 30,
          sign: "Taurus",
          signDegree: 0
        }
      ],
      aspects: [
        {
          type: "trine",
          between: ["Sun", "Moon"],
          orb: 2,
          exact: 120
        }
      ],
      houses: {
        system: "placidus",
        cusps: Array.from({ length: 12 }, (_, i) => i * 30),
        ascendant: 30,
        descendant: 210,
        midheaven: 120,
        imumCoeli: 300
      },
      meta: {
        timeUnknown: false,
        timezone: "UTC",
        calculatedAt: new Date().toISOString(),
        houseSystem: "placidus",
        engineId: "swiss-ephemeris",
        engineVersion: "0.1.0",
        ephemerisSource: "swiss-de441",
        calculationConfidence: "canonical",
        zodiacMode: "tropical",
        timezoneSource: "request"
      }
    };

    const parsed = SourceNatalChartSchema.parse(expanded);

    expect(parsed.points[0]).toMatchObject({ speed: 0.95 });
    expect(parsed.houses).toMatchObject({
      descendant: 210,
      imumCoeli: 300
    });
    expect(parsed.meta).toMatchObject({
      engineId: "swiss-ephemeris",
      engineVersion: "0.1.0",
      ephemerisSource: "swiss-de441",
      calculationConfidence: "canonical",
      zodiacMode: "tropical",
      timezoneSource: "request"
    });
  });
});
