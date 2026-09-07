import type { Agent } from "@mastra/core/agent";
import type { ModelMessage } from "ai";

export type MastraChatInput = {
  agent: Agent;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  threadId: string;
  resourceId: string;
  signal?: AbortSignal;
  maxSteps?: number;
};

/** Native Mastra stream seam. IDs are mandatory so memory cannot accidentally become global. */
export async function streamMastraChat(input: MastraChatInput) {
  if (!input.threadId || !input.resourceId) throw new Error("Mastra chat requires threadId and resourceId");
  return input.agent.stream(input.messages as ModelMessage[], {
    memory: { thread: input.threadId, resource: input.resourceId },
    maxSteps: input.maxSteps ?? 8,
    abortSignal: input.signal,
    disableBackgroundTasks: true
  });
}
