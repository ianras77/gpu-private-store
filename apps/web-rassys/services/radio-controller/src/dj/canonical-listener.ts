export type CanonicalListenerFailureReason =
  | "url_missing"
  | "token_missing"
  | "http_error"
  | "empty_response"
  | "invalid_response"
  | "timeout"
  | "request_failed";

export type CanonicalListenerResult =
  | { ok: true; text: string }
  | { ok: false; reason: CanonicalListenerFailureReason; status?: number };

type CanonicalListenerOptions = {
  baseUrl?: string;
  internalToken?: string;
  prompt: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

export async function requestCanonicalListener({
  baseUrl,
  internalToken,
  prompt,
  timeoutMs = 18_000,
  fetcher = fetch,
}: CanonicalListenerOptions): Promise<CanonicalListenerResult> {
  const base = baseUrl?.trim().replace(/\/$/, "");
  if (!base) return { ok: false, reason: "url_missing" };
  if (!internalToken?.trim()) return { ok: false, reason: "token_missing" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    let response: Response;
    try {
      response = await fetcher(`${base}/v1/agents/radio-listener/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${internalToken.trim()}`,
        },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
    } catch {
      return { ok: false, reason: controller.signal.aborted ? "timeout" : "request_failed" };
    }

    if (!response.ok) return { ok: false, reason: "http_error", status: response.status };
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return { ok: false, reason: "invalid_response" };
    }
    const text = payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string"
      ? payload.text.trim()
      : "";
    return text ? { ok: true, text } : { ok: false, reason: "empty_response" };
  } finally {
    clearTimeout(timeoutId);
  }
}
