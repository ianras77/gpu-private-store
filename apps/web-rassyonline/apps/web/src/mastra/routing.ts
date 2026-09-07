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
