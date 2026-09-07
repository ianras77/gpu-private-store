import { fetchUpstreamJson } from "./upstream";

const endpoint = () => (process.env.RASSY_INTELLIGENCE_URL ?? "").replace(/\/$/, "");

const extractJson = (value: string) => {
  const clean = value.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  return start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
};

export const requestRassyAgentText = async (agentId: string, prompt: string): Promise<string> => {
  const base = endpoint();
  if (!base) throw new Error("rassy_intelligence_unconfigured");
  const token = process.env.RASSY_INTELLIGENCE_INTERNAL_TOKEN;
  const response = await fetchUpstreamJson<{ text?: string }>(
    `${base}/v1/agents/${encodeURIComponent(agentId)}/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ prompt }),
    },
    { timeoutMs: 35000, retries: 0 },
  );
  if (typeof response.text !== "string" || !response.text.trim()) throw new Error("rassy_intelligence_empty_response");
  return response.text;
};

export type RassyChannelResponse = { text: string; delegations?: Array<{ agentId: string; ok: boolean }> };

export const requestRassyChannel = async (channelId: string, message: string, context?: unknown): Promise<RassyChannelResponse> => {
  const base = endpoint();
  if (!base) throw new Error("rassy_intelligence_unconfigured");
  const token = process.env.RASSY_INTELLIGENCE_INTERNAL_TOKEN;
  const response = await fetchUpstreamJson<{ text?: string; delegations?: Array<{ agentId?: unknown; ok?: unknown }> }>(
    `${base}/v1/channels/${encodeURIComponent(channelId)}/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ message, ...(context === undefined ? {} : { context }) }),
    },
    { timeoutMs: 35000, retries: 0 },
  );
  if (typeof response.text !== "string" || !response.text.trim()) throw new Error("rassy_intelligence_empty_response");
  const delegations = Array.isArray(response.delegations)
    ? response.delegations.filter((entry): entry is { agentId: string; ok: boolean } => typeof entry?.agentId === "string" && typeof entry.ok === "boolean")
    : undefined;
  return { text: response.text, ...(delegations ? { delegations } : {}) };
};

export const requestRassyChannelText = async (channelId: string, message: string, context?: unknown): Promise<string> =>
  (await requestRassyChannel(channelId, message, context)).text;

export const requestRassyAgentJson = async <T>(agentId: string, prompt: string): Promise<T> =>
  JSON.parse(extractJson(await requestRassyAgentText(agentId, prompt))) as T;

export const requestRassyEmbedding = async (value: string): Promise<number[]> => {
  const base = endpoint();
  if (!base) throw new Error("rassy_intelligence_unconfigured");
  const token = process.env.RASSY_INTELLIGENCE_INTERNAL_TOKEN;
  const response = await fetchUpstreamJson<{ data?: Array<{ embedding?: number[] }> }>(
    `${base}/v1/embeddings`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ model: "rassy-embed", input: value }),
    },
    { timeoutMs: 15000, retries: 0 },
  );
  const embedding = response.data?.[0]?.embedding;
  if (!embedding?.length) throw new Error("rassy_intelligence_empty_embedding");
  return embedding;
};
