import type { WebSearchMode } from "@/lib/chat-intents";

/** The browser's local-only selection is an execution policy, not a hint. */
export function localOnlyExecution(webSearch: WebSearchMode): boolean {
  return webSearch === "off";
}
