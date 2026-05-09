import type { ApiClient, Party, Reward } from "@jogmania/api-client";
import type { AdventureSummary, Route } from "@jogmania/shared";

export type AdventureContext = {
  party: Party | null;
  courses: Route[];
  activeCourse: Route | null;
};

export type WorkoutProgression = {
  points: number;
  improvement_s_per_km?: number | null;
  rewards: string[];
  inventory: Record<string, number>;
};

export type WorkoutWorldEvent = {
  id: string;
  title: string;
  world_id: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function asNumberRecord(value: unknown): Record<string, number> {
  const record = asRecord(value);
  if (!record) return {};

  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, number] => typeof entry[1] === "number")
  );
}

export async function loadAdventureContext(api: ApiClient): Promise<AdventureContext> {
  const [routes, parties] = await Promise.all([api.listRoutes(), api.listParties()]);
  const party = parties[0] ?? null;
  const courses = routes.filter((route) => route.is_course);
  const activeCourseId = party?.world?.route_id ?? courses[0]?.id ?? null;
  const activeCourse =
    courses.find((route) => route.id === activeCourseId) ??
    routes.find((route) => route.id === activeCourseId) ??
    courses[0] ??
    null;

  return {
    party,
    courses,
    activeCourse
  };
}

export function getWorkoutProgression(rawPayloadJson: Record<string, unknown> | null | undefined): WorkoutProgression | null {
  const rawPayload = asRecord(rawPayloadJson);
  const progression = asRecord(rawPayload?.progression);
  if (!progression) return null;

  return {
    points: typeof progression.points === "number" ? progression.points : 0,
    improvement_s_per_km:
      typeof progression.improvement_s_per_km === "number" ? progression.improvement_s_per_km : null,
    rewards: asStringArray(progression.rewards),
    inventory: asNumberRecord(progression.inventory)
  };
}

export function getWorkoutWorldEvents(rawPayloadJson: Record<string, unknown> | null | undefined): WorkoutWorldEvent[] {
  const rawPayload = asRecord(rawPayloadJson);
  if (!Array.isArray(rawPayload?.world_events)) return [];

  return rawPayload.world_events.flatMap((entry) => {
    const event = asRecord(entry);
    if (!event) return [];
    if (typeof event.id !== "string" || typeof event.title !== "string" || typeof event.world_id !== "string") {
      return [];
    }
    return [{ id: event.id, title: event.title, world_id: event.world_id }];
  });
}

export function getRewardCopy(reward: Reward) {
  const payload = asRecord(reward.payload_json);
  const fallbackLabel = reward.type
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

  return {
    label: typeof payload?.label === "string" ? payload.label : fallbackLabel,
    summary: typeof payload?.summary === "string" ? payload.summary : ""
  };
}

export function formatInventoryLabel(itemKey: string) {
  return itemKey
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function getAdventureHeadline(summary: AdventureSummary | null | undefined) {
  if (!summary) return "Adventure queued";
  return summary.title;
}
