export type RassyMindAdminSnapshot = {
  gateway: "healthy" | "unreachable" | "degraded";
  models: Array<{
    id: string;
    ownedBy?: string;
    capabilities: string[];
    status?: string;
    featureStates?: Record<string, string>;
  }>;
  checkedAt: string;
};

const EXPECTED_LANES = [
  { id: "rassy-mind", capabilities: ["Qwen3.8", "chat", "streaming", "tools", "JSON Schema: unqualified", "parallel tools: unsupported"] },
  { id: "rassy-code", capabilities: ["Qwen3.8", "chat", "streaming", "tools", "JSON Schema: unqualified", "parallel tools: unsupported"] },
  { id: "rassy-fast", capabilities: ["chat", "streaming", "qualified"] },
  { id: "rassy-utility", capabilities: ["chat", "streaming"] },
  { id: "rassy-embed", capabilities: ["4096-dimensional embeddings"] },
  { id: "rassy-rerank", capabilities: ["dedicated reranking"] }
];

export async function getRassyMindAdminSnapshot(): Promise<RassyMindAdminSnapshot> {
  const baseUrl = (process.env.RASSYMIND_BASE_URL ?? "http://host.docker.internal:8844").replace(/\/+$/, "");
  const headers: Record<string, string> = process.env.RASSYMIND_API_KEY ? { authorization: `Bearer ${process.env.RASSYMIND_API_KEY}` } : {};
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(`${baseUrl}/v1/capabilities`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) return { gateway: "degraded", models: EXPECTED_LANES, checkedAt };
    const payload = (await response.json()) as { models?: Array<{ id?: string; status?: string; chat?: boolean; embeddings?: boolean; rerank?: boolean; stt?: boolean; tts?: boolean; features?: Record<string, string> }> };
    const models = (payload.models ?? []).map((model) => ({
      id: model.id ?? "unknown",
      capabilities: [
        ...(model.chat || model.features?.chat === "supported" || model.features?.chat === "qualified" ? ["chat"] : []),
        ...(model.features?.streaming === "qualified" ? ["streaming"] : []),
        ...(model.embeddings ? ["embeddings"] : []),
        ...(model.rerank ? ["rerank"] : []),
        ...(model.stt ? ["speech to text"] : []),
        ...(model.tts ? ["text to speech"] : [])
      ].concat(model.id && ["rassy-mind", "rassy-code"].includes(model.id) ? ["Qwen3.8"] : [], model.features?.tools === "qualified" ? ["tools"] : [], model.features?.json_schema === "pending" ? ["JSON Schema: unqualified"] : [], model.features?.parallel_tools === "unsupported" ? ["parallel tools: unsupported"] : [], model.status === "qualified" ? ["qualified"] : []),
      featureStates: model.features,
      status: model.status
    }));
    return { gateway: "healthy", models: models.length ? models : EXPECTED_LANES, checkedAt };
  } catch {
    return { gateway: "unreachable", models: EXPECTED_LANES, checkedAt };
  }
}
