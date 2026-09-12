import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export function currentTime(timezone: string) {
  const now = new Date();
  return { iso: now.toISOString(), formatted: new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "long", timeZone: timezone }).format(now) };
}

export function isCurrentTimeQuestion(prompt: string): boolean {
  return /\b(current date|today'?s date|what day is it|current time|what time is it|right now)\b/i.test(prompt);
}

export function buildCurrentTimeContext(timezone = "UTC") {
  const result = currentTime(timezone);
  return `AUTHORITATIVE SERVER CLOCK for this turn: ${result.formatted} (${result.iso}). Use this as the current date/time; do not guess or claim your knowledge cutoff is the current date.`;
}

export const timeTool = createTool({
  id: "current-time",
  description: "Return the current time for an IANA timezone, using the server clock.",
  inputSchema: z.object({ timezone: z.string().trim().min(1).max(100).default("UTC") }),
  outputSchema: z.object({ status: z.enum(["ok", "failed"]), timezone: z.string(), iso: z.string().optional(), formatted: z.string().optional(), error: z.string().optional() }),
  execute: async ({ timezone }) => { try { return { status: "ok" as const, timezone, ...currentTime(timezone) }; } catch (error) { return { status: "failed" as const, timezone, error: error instanceof Error ? error.message : "invalid timezone" }; } }
});
