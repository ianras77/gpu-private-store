export type CheshireModelLane =
  | "listener"
  | "programming"
  | "notes"
  | "web"
  | "dm"
  | "admin"
  | "curio"
  | "general";

type ModelRoutingOptions = {
  requestedModel?: unknown;
  lane: CheshireModelLane;
  genericModel: string;
  programmingModel: string;
  adminModel: string;
};

const nonEmptyModel = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

export const resolveCheshireModel = ({
  requestedModel,
  lane,
  genericModel,
  programmingModel,
  adminModel,
}: ModelRoutingOptions) => {
  const explicit = nonEmptyModel(requestedModel);
  if (explicit) return explicit;

  if (lane === "programming") return programmingModel;
  if (lane === "admin") return adminModel;
  return genericModel;
};
