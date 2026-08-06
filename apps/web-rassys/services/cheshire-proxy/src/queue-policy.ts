export type QueueLane =
  | "listener"
  | "programming"
  | "notes"
  | "web"
  | "dm"
  | "admin"
  | "curio"
  | "embeddings"
  | "general";

const backgroundLanes = new Set<QueueLane>(["notes", "curio", "embeddings", "general"]);

export const shouldShedBackgroundLane = (lane: QueueLane, listenerPressure: boolean) =>
  listenerPressure && backgroundLanes.has(lane);

export const canAcquireQueueSlot = (
  lane: QueueLane,
  active: number,
  maxActive: number,
  reservedListenerSlots: number,
  listenerPressure: boolean
) => {
  const capacity = Math.max(1, maxActive);
  if (lane === "listener") return active < capacity;
  if (shouldShedBackgroundLane(lane, listenerPressure)) return false;
  return active < Math.max(0, capacity - Math.max(0, reservedListenerSlots));
};

export const defaultQueueWaitMs = (lane: QueueLane) => {
  if (lane === "listener") return 10_000;
  if (lane === "programming") return 2_000;
  if (lane === "web") return 2_000;
  if (lane === "dm") return 5_000;
  if (lane === "admin") return 2_000;
  return 0;
};
