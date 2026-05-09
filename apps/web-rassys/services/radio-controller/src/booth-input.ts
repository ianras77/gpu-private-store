import type { DJContext, DJProgrammingInfo, DJTrackPlaybackPlan } from "./dj/interface";

export type BoothInput = {
  djScript?: string | null;
  djReason?: string | null;
  programming?: DJProgrammingInfo | null;
  playbackPlans?: DJTrackPlaybackPlan[];
  trackIds?: string[] | null;
};

const cleanTrackIds = (value?: string[] | null) =>
  Array.isArray(value)
    ? value.filter((trackId): trackId is string => typeof trackId === "string" && trackId.trim().length > 0)
    : [];

export const buildBoothInputForContext = (
  context: Pick<DJContext, "nowPlaying" | "queuePreview">,
  input?: BoothInput | null
) => {
  const activeTrackIds = new Set(
    [
      context.nowPlaying?.id,
      ...context.queuePreview.slice(0, 3).map((track) => track.id)
    ].filter((trackId): trackId is string => typeof trackId === "string" && trackId.length > 0)
  );

  const candidateTrackIds = cleanTrackIds(input?.trackIds ?? input?.programming?.trackIds ?? []);
  const aligned = activeTrackIds.size > 0 && candidateTrackIds.some((trackId) => activeTrackIds.has(trackId));

  if (!aligned) {
    return {
      djScript: null,
      djReason: null,
      programming: null,
      playbackPlans: [] as DJTrackPlaybackPlan[]
    };
  }

  return {
    djScript: typeof input?.djScript === "string" ? input.djScript : null,
    djReason: typeof input?.djReason === "string" ? input.djReason : null,
    programming: input?.programming ?? null,
    playbackPlans: Array.isArray(input?.playbackPlans)
      ? input.playbackPlans.filter(
          (plan): plan is DJTrackPlaybackPlan =>
            Boolean(plan) &&
            typeof plan.trackId === "string" &&
            activeTrackIds.has(plan.trackId) &&
            (plan.mode === "full" || plan.mode === "clip")
        )
      : []
  };
};
