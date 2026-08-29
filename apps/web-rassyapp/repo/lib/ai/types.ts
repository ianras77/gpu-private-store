export type ModelRole = "primary" | "fast" | "code" | "embedding" | "vision";

export type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
};

export type ModelRequest = {
  modelRole?: ModelRole;
  modelId: string;
  messages: ModelMessage[];
  instructions?: string;
  temperature?: number;
  maxOutput?: number;
  metadata?: Record<string, string>;
};

export type ModelEvent =
  | { type: "text.delta"; text: string }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "completed"; response: ModelResponse }
  | { type: "error"; error: Error };

export type ModelResponse = {
  id?: string;
  model: string;
  text: string;
  finishReason?: string;
};

export type ProviderCapabilityStatus = "qualified" | "supported" | "experimental" | "unsupported" | "unknown";

export type ProviderCapabilityReport = {
  providerId: string;
  reachable: boolean;
  capabilities: Record<string, ProviderCapabilityStatus>;
  error?: string;
};

export type ModelDescriptor = {
  id: string;
  ownedBy?: string;
};

export interface ModelProvider {
  readonly id: string;
  probe(): Promise<ProviderCapabilityReport>;
  listModels(): Promise<ModelDescriptor[]>;
  generate(request: ModelRequest): Promise<ModelResponse>;
  stream(request: ModelRequest): AsyncIterable<ModelEvent>;
}
