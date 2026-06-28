import type { NatalChart } from "@astro/astro-core";
import { HumanGuideSchema, type HumanGuide } from "./human-guide-schema";

export type QualityCheck = {
  passed: boolean;
  evidence: string[];
  failures: string[];
};

export type HumanGuideQuality = {
  passed: boolean;
  checks: {
    schema: QualityCheck;
    chartSpecificity: QualityCheck;
    sourceGrounding: QualityCheck;
    nonDoctrinalTone: QualityCheck;
    practicalCounsel: QualityCheck;
  };
};

const textOf = (guide: HumanGuide): string => JSON.stringify(guide).toLowerCase();

const chartTokens = (chart: NatalChart): string[] =>
  chart.points
    .flatMap((point) => [
      point.key.toLowerCase(),
      point.sign.toLowerCase(),
      point.house ? `house ${point.house}` : ""
    ])
    .filter(Boolean);

const check = (passed: boolean, evidence: string[], failure: string): QualityCheck => ({
  passed,
  evidence,
  failures: passed ? [] : [failure]
});

export const evaluateHumanGuideQuality = (guide: HumanGuide, chart: NatalChart): HumanGuideQuality => {
  const parsed = HumanGuideSchema.safeParse(guide);
  const text = textOf(guide);
  const tokens = chartTokens(chart);
  const matchedTokens = tokens.filter((token) => text.includes(token));
  const forbidden = ["pope", "church authority", "only true", "damned", "curse", "must obey"];
  const practicalWords = ["practice", "notice", "choose", "return", "ask", "serve", "forgive"];

  const checks = {
    schema: check(parsed.success, ["HumanGuideSchema"], "Guide does not match HumanGuideSchema."),
    chartSpecificity: check(
      matchedTokens.length >= 6,
      matchedTokens.slice(0, 12),
      "Guide does not name enough concrete chart facts."
    ),
    sourceGrounding: check(
      guide.sourceProvenance.length > 0,
      guide.sourceProvenance.map((source) => source.title),
      "Guide has no source provenance."
    ),
    nonDoctrinalTone: check(
      forbidden.every((term) => !text.includes(term)),
      ["No institutional or coercive authority language detected."],
      "Guide contains doctrinal or coercive language."
    ),
    practicalCounsel: check(
      practicalWords.some((word) => text.includes(word)),
      practicalWords.filter((word) => text.includes(word)),
      "Guide lacks practical counsel language."
    )
  };

  return {
    passed: Object.values(checks).every((qualityCheck) => qualityCheck.passed),
    checks
  };
};
