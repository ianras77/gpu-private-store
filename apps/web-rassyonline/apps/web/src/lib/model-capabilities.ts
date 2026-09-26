import type { MastraAgentId } from "@/mastra/routing";

export type CapabilityState = "qualified" | "supported" | "experimental" | "unsupported" | "unknown";
export type ModelCapability = { model: string; status: CapabilityState; streaming: CapabilityState; tools: CapabilityState; maxOutputTokens: number };
const cache = new Map<string, { expires: number; value: ModelCapability }>();

export function modelForAgent(agent: MastraAgentId): string {
  if (agent === "coder") return "rassy-code";
  if (agent === "knowledge") return "rassy-mind";
  if (agent === "utility") return "rassy-utility";
  return "rassy-agent";
}

function state(value: unknown): CapabilityState {
  return value === "qualified" || value === "supported" || value === "experimental" || value === "unsupported" ? value : "unknown";
}

export function parseModelCapability(model: string, raw: unknown): ModelCapability {
  const data = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const features = data.features && typeof data.features === "object" ? data.features as Record<string, unknown> : {};
  const max = typeof data.max_output_tokens === "number" && Number.isInteger(data.max_output_tokens) ? data.max_output_tokens : 0;
  return { model, status: state(data.status), streaming: state(features.streaming), tools: state(features.tools), maxOutputTokens: Math.max(0, Math.min(8192, max)) };
}

export async function getModelCapability(model: string): Promise<ModelCapability> {
  const current = cache.get(model);
  if (current && current.expires > Date.now()) return current.value;
  const base = (process.env.RASSYMIND_BASE_URL ?? "http://host.docker.internal:8844").replace(/\/+$/, "");
  let value = parseModelCapability(model, null);
  try {
    const response = await fetch(`${base}/v1/models/${encodeURIComponent(model)}/capabilities`, {
      headers: { authorization: `Bearer ${process.env.RASSYMIND_API_KEY ?? "runtipi-server-key"}`, accept: "application/json" },
      signal: AbortSignal.timeout(5000), cache: "no-store"
    });
    if (response.ok) value = parseModelCapability(model, await response.json());
  } catch { /* Unknown is intentionally not ready. */ }
  cache.set(model, { expires: Date.now() + 30_000, value });
  return value;
}
