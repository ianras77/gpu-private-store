export type MastraAgentId = "rassy" | "researcher" | "knowledge" | "coder" | "utility";

export function agentForMode(mode: string | undefined): MastraAgentId {
  if (mode === "deep-coding" || mode === "fast-coding") return "coder";
  if (mode === "quick") return "utility";
  return "rassy";
}

export function selectMastraAgent(input: { requestedAgent?: MastraAgentId; mode?: string; searchRequested: boolean }): MastraAgentId {
  const requested = input.requestedAgent && input.requestedAgent !== "rassy" ? input.requestedAgent : agentForMode(input.mode);
  return requested === "rassy" && input.searchRequested ? "researcher" : requested;
}

export function maxStepsForMode(mode: string | undefined, agent: MastraAgentId): number {
  if (agent === "utility" || mode === "quick" || mode === "spark") return 3;
  if (agent === "coder" || mode === "deep-coding" || mode === "knowledge") return 12;
  if (agent === "researcher") return 10;
  return 8;
}
