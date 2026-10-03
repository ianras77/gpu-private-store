/**
 * Deterministic guidance for the model's existing, schema-backed tools.  This
 * is deliberately advice, not a permission system: the Agent registry remains
 * the authority for which tools may actually run.
 */
export function normalizeToolName(name: string | undefined): string {
  return (name ?? "").replace(/[-_\s]/g, "").toLowerCase();
}

export function isResearchToolName(name: string | undefined): boolean {
  return ["websearch", "parallelresearch", "adaptiveresearch"].includes(normalizeToolName(name));
}

export function buildToolExecutionContext(prompt: string): string {
  const lower = prompt.toLowerCase();
  const wantsMath = /\b(?:calculate|compute|solve|matrix|determinant|inverse|eigen|integral|derivative|differentiate|equation|plot|graph)\b/.test(lower);
  const wantsVisual = /\b(?:chart|graph|plot|visuali[sz]e|diagram|matrix|spectrum|wavefunction|phase portrait|vector field)\b/.test(lower);
  const wantsFresh = /\b(?:latest|today|current|news|research|search|verify|compare)\b/.test(lower);
  const guidance = [
    "TOOL EXECUTION POLICY: use a tool only when it adds verifiable value; read its output before answering; never claim a tool ran without its returned result.",
    wantsMath ? "For non-trivial arithmetic, validate the number with calculator. For linear systems use mathLab operation=solve with vectorB as a flat vector; matrixB is only for matrix multiplication." : "",
    wantsVisual ? "For supplied numeric series use chart (bar, line, scatter, or pie); for formulas or matrices use mathLab. A visual must explain supplied or tool-verified data, never invented data." : "",
    wantsFresh ? "Fresh factual claims need the configured research path and returned URLs; pageReader is for deepening a returned public source." : "",
    "If a tool returns an error, adapt once with corrected valid arguments or state the bounded limitation; do not fabricate a result or loop on the same call."
  ].filter(Boolean);
  return guidance.join("\n");
}

export function toolFailureText(name: string | undefined): string {
  const label = name?.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").trim() || "Tool";
  return `${label} did not complete; the assistant should correct the arguments or continue without inventing its result.`;
}
