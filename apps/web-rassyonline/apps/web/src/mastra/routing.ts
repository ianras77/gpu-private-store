export type MastraAgentId = "rassy" | "researcher" | "knowledge" | "coder" | "utility";

export type TaskShape = "conversation" | "research" | "knowledge" | "build" | "analysis";

export function taskShape(prompt: string, input: { mode?: string; searchRequested: boolean; knowledgeRequested?: boolean }): TaskShape {
  if (input.mode === "deep-coding" || input.mode === "fast-coding" || /\b(build|implement|fix|refactor|debug|create|deploy)\b/i.test(prompt)) return "build";
  if (input.knowledgeRequested) return "knowledge";
  if (input.searchRequested) return "research";
  if (/\b(analy[sz]e|compare|plan|design|trade[- ]?off|why|reason|evaluate)\b/i.test(prompt)) return "analysis";
  return "conversation";
}

export function buildExecutionBrief(prompt: string, input: { mode?: string; searchRequested: boolean; knowledgeRequested?: boolean }): string {
  const shape = taskShape(prompt, input);
  const phases = shape === "research"
    ? "understand the question -> gather fresh evidence -> compare source quality -> synthesize with citations -> state uncertainty"
    : shape === "knowledge"
      ? "identify the needed material -> retrieve and rerank relevant evidence -> answer only from supported content -> identify gaps"
      : shape === "build"
        ? "clarify the goal -> decompose into bounded steps -> use tools/evidence -> verify outputs -> report completed and remaining work"
        : shape === "analysis"
          ? "frame the decision -> separate facts from assumptions -> reason through alternatives -> test the conclusion -> present the result"
          : "understand intent -> answer directly -> verify dates/calculations/tool claims -> ask only when required";
  return `EXECUTION BRIEF: task_shape=${shape}; phases=${phases}. Keep the plan implicit unless the user asks for it. Do not claim a phase is complete without its result. If a tool fails, adapt or report the bounded failure instead of improvising evidence.`;
}

export function agentForMode(mode: string | undefined): MastraAgentId {
  if (mode === "deep-coding" || mode === "fast-coding") return "coder";
  if (mode === "quick") return "utility";
  return "rassy";
}

export function selectMastraAgent(input: { requestedAgent?: MastraAgentId; mode?: string; searchRequested: boolean }): MastraAgentId {
  const requested = input.requestedAgent && input.requestedAgent !== "rassy" ? input.requestedAgent : agentForMode(input.mode);
  return requested === "rassy" && input.searchRequested ? "researcher" : requested;
}

export function maxStepsForMode(mode: string | undefined, agent: MastraAgentId, shape?: TaskShape): number {
  if (agent === "utility" || mode === "quick" || mode === "spark") return 3;
  if (shape === "build" || shape === "analysis") return 12;
  if (agent === "coder" || mode === "deep-coding" || mode === "knowledge") return 12;
  if (agent === "researcher") return 10;
  return 8;
}
