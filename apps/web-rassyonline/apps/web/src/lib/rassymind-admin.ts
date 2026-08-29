export type RassyMindAdminSnapshot = {
  gateway: "healthy" | "unreachable" | "degraded";
  models: Array<{
    id: string;
    ownedBy?: string;
    capabilities: string[];
    status?: string;
  }>;
  checkedAt: string;
};

const EXPECTED_LANES = [
  { id: "rassy-mind", capabilities: ["chat", "streaming", "reasoning"] },
  { id: "rassy-code", capabilities: ["chat", "streaming", "reasoning"] },
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
    const payload = (await response.json()) as { models?: Array<{ id?: string; status?: string; chat?: boolean; embeddings?: boolean; rerank?: boolean; stt?: boolean; tts?: boolean }> };
    const models = (payload.models ?? []).map((model) => ({
      id: model.id ?? "unknown",
      capabilities: [
        ...(model.chat ? ["chat", "streaming"] : []),
        ...(model.embeddings ? ["embeddings"] : []),
        ...(model.rerank ? ["rerank"] : []),
        ...(model.stt ? ["speech to text"] : []),
        ...(model.tts ? ["text to speech"] : [])
      ].concat(model.status === "qualified" ? ["qualified"] : []),
      status: model.status
    }));
    return { gateway: "healthy", models: models.length ? models : EXPECTED_LANES, checkedAt };
  } catch {
    return { gateway: "unreachable", models: EXPECTED_LANES, checkedAt };
  }
}
