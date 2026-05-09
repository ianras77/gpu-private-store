import type { RecommendationStatus } from "./station-chat";

export const resolveListenerRecommendationStatus = ({
  generatedStatus,
  recommendationIntent,
  hasExplicitRecommendation,
  hasRecommendationSummary = false
}: {
  generatedStatus?: RecommendationStatus | null;
  recommendationIntent: boolean;
  hasExplicitRecommendation: boolean;
  hasRecommendationSummary?: boolean;
}): RecommendationStatus => {
  if (generatedStatus && generatedStatus !== "none") {
    return recommendationIntent || hasExplicitRecommendation || hasRecommendationSummary
      ? generatedStatus
      : "none";
  }

  return recommendationIntent && (hasExplicitRecommendation || hasRecommendationSummary)
    ? "considering"
    : "none";
};
