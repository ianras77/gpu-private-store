"use client";

import { AgentWorkbench } from "@crackstack/ui";

const DEFAULT_PROMPT =
  "Normalize dates, map region aliases, and drop rows where revenue is null.";

export function PlaygroundClient() {
  return (
    <AgentWorkbench
      brand="xlcrack"
      defaultPrompt={DEFAULT_PROMPT}
      modeChipLabel="live"
      promptTagLabel="LLM prompt"
      runButtonLabel="Run recipe"
      uploadNamePlaceholder="Q1 revenue cleanup"
      uploadDescriptionPlaceholder="Finance export from ops"
    />
  );
}
