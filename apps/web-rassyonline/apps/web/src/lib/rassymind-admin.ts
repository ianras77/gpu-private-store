export type RassyMindAdminSnapshot = {
  gateway: "healthy" | "unreachable" | "degraded";
  models: Array<{
    id: string;
    ownedBy?: string;
    capabilities: string[];
  }>;
  checkedAt: string;
};

const EXPECTED_LANES = [
  { id: "rassy-mind", capabilities: ["streaming", "tools", "structured output: experimental"] },
  { id: "rassy-code", capabilities: ["streaming", "tools", "structured output: experimental"] },
  { id: "rassy-fast", capabilities: ["streaming", "tools", "parallel tools", "structured output: experimental"] },
  { id: "rassy-utility", capabilities: ["streaming", "tools", "structured output: experimental"] },
  { id: "rassy-embed", capabilities: ["4096-dimensional embeddings"] },
  { id: "rassy-rerank", capabilities: ["dedicated reranking"] }
];

export async function getRassyMindAdminSnapshot(): Promise<RassyMindAdminSnapshot> {
  const baseUrl = (process.env.RASSYMIND_BASE_URL ?? "http://host.docker.internal:8844").replace(/\/+$/, "");
  const headers: Record<string, string> = process.env.RASSYMIND_API_KEY ? { authorization: `Bearer ${process.env.RASSYMIND_API_KEY}` } : {};
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) return { gateway: "degraded", models: EXPECTED_LANES, checkedAt };
    const payload = (await response.json()) as { data?: Array<{ id?: string; owned_by?: string }> };
    const models = (payload.data ?? []).map((model) => ({
      id: model.id ?? "unknown",
      ownedBy: model.owned_by,
      capabilities: EXPECTED_LANES.find((lane) => lane.id === model.id)?.capabilities ?? ["catalogued"]
    }));
    return { gateway: "healthy", models: models.length ? models : EXPECTED_LANES, checkedAt };
  } catch {
    return { gateway: "unreachable", models: EXPECTED_LANES, checkedAt };
  }
}
