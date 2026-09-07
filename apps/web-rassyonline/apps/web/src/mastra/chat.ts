import type { Agent } from "@mastra/core/agent";

export type MastraChatInput = {
  agent: Agent;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  threadId: string;
  resourceId: string;
  signal?: AbortSignal;
  maxSteps?: number;
  toolChoice?: "auto" | "none" | "required";
};

/** Native Mastra stream seam. IDs are mandatory so memory cannot accidentally become global. */
export async function streamMastraChat(input: MastraChatInput) {
  if (!input.threadId || !input.resourceId) throw new Error("Mastra chat requires threadId and resourceId");
  // Mastra memory owns the prior turns. Replaying the browser transcript into
  // the provider creates malformed assistant/tool message shapes on gateways
  // that support the qualified agent loop. Keep only this turn plus trusted
  // server context; continuity remains keyed by thread/resource.
  const latest = [...input.messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const context = input.messages.filter((message) => message.role === "system").map((message) => ({ role: "system" as const, content: message.content }));
  return input.agent.stream(latest, {
    ...(context.length ? { context } : {}),
    memory: { thread: input.threadId, resource: input.resourceId },
    maxSteps: input.maxSteps ?? 8,
    ...(input.toolChoice ? { toolChoice: input.toolChoice } : {}),
    abortSignal: input.signal,
  });
}
