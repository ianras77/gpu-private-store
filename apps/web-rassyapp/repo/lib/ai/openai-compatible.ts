import type {
  ModelDescriptor,
  ModelEvent,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ProviderCapabilityReport
} from "./types";

type ClientOptions = { id?: string; baseUrl: string; apiKey?: string; fetcher?: typeof fetch };

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ClientOptions) {
    this.id = options.id ?? "openai-compatible";
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
  }

  private headers() {
    return { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) };
  }

  async listModels(): Promise<ModelDescriptor[]> {
    const response = await this.fetcher(`${this.baseUrl}/models`, { headers: this.headers() });
    if (!response.ok) throw new Error(`Provider models request failed: ${response.status}`);
    const body = (await response.json()) as { data?: Array<{ id: string; owned_by?: string }> };
    return (body.data ?? []).map((model) => ({ id: model.id, ownedBy: model.owned_by }));
  }

  async probe(): Promise<ProviderCapabilityReport> {
    try {
      await this.listModels();
      return { providerId: this.id, reachable: true, capabilities: { textGeneration: "supported", streaming: "supported", toolCalls: "unknown", structuredJson: "unknown", embeddings: "unknown" } };
    } catch (error) {
      return { providerId: this.id, reachable: false, capabilities: { textGeneration: "unknown", streaming: "unknown", toolCalls: "unknown", structuredJson: "unknown", embeddings: "unknown" }, error: error instanceof Error ? error.message : "Provider unavailable" };
    }
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const response = await this.fetcher(`${this.baseUrl}/chat/completions`, { method: "POST", headers: this.headers(), body: JSON.stringify(this.body(request, false)) });
    if (!response.ok) throw new Error(`Provider completion failed: ${response.status}`);
    const body = (await response.json()) as { id?: string; model?: string; choices?: Array<{ message?: { content?: string }; finish_reason?: string }> };
    const choice = body.choices?.[0];
    return { id: body.id, model: body.model ?? request.modelId, text: choice?.message?.content ?? "", finishReason: choice?.finish_reason };
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelEvent> {
    const response = await this.fetcher(`${this.baseUrl}/chat/completions`, { method: "POST", headers: this.headers(), body: JSON.stringify(this.body(request, true)) });
    if (!response.ok || !response.body) { yield { type: "error", error: new Error(`Provider stream failed: ${response.status}`) }; return; }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    try {
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:") || line.trim() === "data: [DONE]") continue;
          const data = JSON.parse(line.slice(5).trim()) as { choices?: Array<{ delta?: { content?: string } }> };
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) { text += delta; yield { type: "text.delta", text: delta }; }
        }
      }
      yield { type: "completed", response: { model: request.modelId, text } };
    } catch (error) { yield { type: "error", error: error instanceof Error ? error : new Error("Malformed provider stream") }; }
  }

  private body(request: ModelRequest, stream: boolean) {
    return { model: request.modelId, messages: [...(request.instructions ? [{ role: "system", content: request.instructions }] : []), ...request.messages], temperature: request.temperature, max_tokens: request.maxOutput, stream };
  }
}
