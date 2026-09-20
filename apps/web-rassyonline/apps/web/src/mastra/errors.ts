export type MastraFailureKind = "context" | "busy" | "upstream" | "unknown";
export function classifyMastraFailure(error: unknown): MastraFailureKind {
  const value = error instanceof Error ? error.message : String(error ?? "");
  if (/context_accounting|rendered context|context window/i.test(value)) return "context";
  if (/429|busy|queue|overload|capacity|try again/i.test(value)) return "busy";
  if (/503|502|upstream|gateway|provider|fetch failed|network/i.test(value)) return "upstream";
  return "unknown";
}
export function mastraFailureMessage(error: unknown): string {
  switch (classifyMastraFailure(error)) {
    case "context": return "Rassy is temporarily recalculating its conversation context. Please try again in a moment.";
    case "busy": return "Rassy is busy right now. Please try again in a moment.";
    case "upstream": return "Rassy’s model connection briefly failed. Please try again in a moment.";
    default: return "Rassy could not complete that response. Please try again.";
  }
}
export function isRetryableMastraFailure(error: unknown): boolean {
  return ["context", "busy", "upstream"].includes(classifyMastraFailure(error));
}
