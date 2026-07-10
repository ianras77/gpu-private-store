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
    craftedSections: QualityCheck;
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
  const tokens = Array.from(new Set(chartTokens(chart)));
  const matchedTokens = tokens.filter((token) => text.includes(token));
  const chartSpecificityThreshold = Math.min(6, Math.max(1, tokens.length));
  const groundedSources = guide.sourceProvenance.filter(
    (source) => source.title.trim().length > 0 && source.source.trim().length > 0
  );
  const forbidden = ["pope", "church authority", "only true", "damned", "curse", "must obey"];
  const practicalWords = ["practice", "notice", "choose", "return", "ask", "serve", "forgive"];
  const sections = [...guide.overview, ...guide.practices];
  const completeCraftedSections = sections.filter(
    (section) =>
      (section.chartInstruction?.trim().length ?? 0) >= 20 &&
      section.force.trim().length >= 20 &&
      section.allegory.trim().length >= 20 &&
      (section.story?.trim().length ?? 0) >= 20 &&
      section.practicalCounsel.trim().length >= 20 &&
      section.mysteryQuestion.trim().endsWith("?")
  );

  const checks = {
    schema: check(parsed.success, ["HumanGuideSchema"], "Guide does not match HumanGuideSchema."),
    chartSpecificity: check(
      matchedTokens.length >= chartSpecificityThreshold,
      matchedTokens.slice(0, 12),
      "Guide does not name enough concrete chart facts."
    ),
    sourceGrounding: check(
      groundedSources.length > 0,
      groundedSources.map((source) => source.title),
      "Guide has no source provenance with non-empty title and source."
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
    ),
    craftedSections: check(
      completeCraftedSections.length === sections.length,
      [`${completeCraftedSections.length}/${sections.length} crafted sections complete`],
      "Guide sections must include chart instruction, force, allegory, story, practical counsel, and a mystery question."
    )
  };

  return {
    passed: Object.values(checks).every((qualityCheck) => qualityCheck.passed),
    checks
  };
};
