"use client";

import { AgentWorkbench } from "@crackstack/ui";

const DEFAULT_PROMPT =
  "Normalize dates, map region aliases, and drop rows where revenue is null.";

export function StudioClient() {
  return (
    <AgentWorkbench
      brand="tapecrack"
      defaultPrompt={DEFAULT_PROMPT}
      modeChipLabel="governed"
      promptTagLabel="Program intent"
      runButtonLabel="Approve & run"
      uploadNamePlaceholder="Daily revenue export"
      uploadDescriptionPlaceholder="Operations feed"
    />
  );
}
