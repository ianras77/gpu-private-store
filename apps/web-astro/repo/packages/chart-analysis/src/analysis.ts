import type { Aspect, NatalChart } from "@astro/astro-core";
import { aspectBasis, buildInternalMap, placement } from "./internal-map";
import type { AnalysisBasis, ChartAnalysis } from "./types";

const HARD_ASPECTS = new Set<Aspect["type"]>(["conjunction", "opposition", "square"]);
const GRACE_ASPECTS = new Set<Aspect["type"]>(["sextile", "trine"]);

const basis = (chartBasis: string[], sourceBasis: string[]): AnalysisBasis => ({
  chartBasis: Array.from(new Set(chartBasis)),
  sourceBasis
});

const aspectAnalysis = (aspect: Aspect): AnalysisBasis =>
  basis([aspectBasis(aspect)], [`${aspect.type} aspect, orb ${aspect.orb}, exact ${aspect.exact}`]);

export const analyzeChart = (chart: NatalChart): ChartAnalysis => {
  const internalMap = buildInternalMap(chart);
  const hardAspects = chart.aspects.filter((aspect) => HARD_ASPECTS.has(aspect.type));
  const graceAspects = chart.aspects.filter((aspect) => GRACE_ASPECTS.has(aspect.type));
  const bodyPlacements = chart.points.filter((point) => point.house === 2 || point.house === 6);
  const ageMarkers = chart.points.filter(
    (point) => point.key === "Saturn" || point.key === "Moon" || point.key === "Sun"
  );

  return {
    version: "0.1.0",
    correspondences: chart.points.map((point) =>
      basis([placement(point)], [`${point.type} placement at ${point.degree} degrees`])
    ),
    developmentalTasks: [
      basis(internalMap.shadowGate.chartBasis, internalMap.shadowGate.sourceBasis),
      basis(internalMap.serviceGate.chartBasis, internalMap.serviceGate.sourceBasis)
    ],
    integrationTensions: hardAspects.map(aspectAnalysis),
    graceChannels: graceAspects.map(aspectAnalysis),
    practiceNeeds: [
      basis(bodyPlacements.map(placement), ["2nd- and 6th-house placements"]),
      basis(internalMap.shadowGate.chartBasis, internalMap.shadowGate.sourceBasis)
    ],
    directInspirationStyle: basis(internalMap.inspirationGate.chartBasis, internalMap.inspirationGate.sourceBasis),
    allegoryAssignments: {
      root: basis(internalMap.root.chartBasis, internalMap.root.sourceBasis),
      heart: basis(internalMap.heartChamber.chartBasis, internalMap.heartChamber.sourceBasis),
      voice: basis(internalMap.voiceAndMind.chartBasis, internalMap.voiceAndMind.sourceBasis),
      crown: basis(internalMap.crownAndStar.chartBasis, internalMap.crownAndStar.sourceBasis),
      shadow: basis(internalMap.shadowGate.chartBasis, internalMap.shadowGate.sourceBasis),
      service: basis(internalMap.serviceGate.chartBasis, internalMap.serviceGate.sourceBasis),
      inspiration: basis(internalMap.inspirationGate.chartBasis, internalMap.inspirationGate.sourceBasis)
    },
    ageTransitionSignatures: ageMarkers.map((point) =>
      basis([placement(point)], [`${point.key} placement as transition marker`])
    ),
    internalMap
  };
};
