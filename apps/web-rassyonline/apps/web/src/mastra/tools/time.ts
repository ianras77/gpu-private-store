import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export function currentTime(timezone: string) {
  const now = new Date();
  return { iso: now.toISOString(), formatted: new Intl.DateTimeFormat("en", { dateStyle: "full", timeStyle: "long", timeZone: timezone }).format(now) };
}

export const timeTool = createTool({
  id: "current-time",
  description: "Return the current time for an IANA timezone, using the server clock.",
  inputSchema: z.object({ timezone: z.string().trim().min(1).max(100).default("UTC") }),
  outputSchema: z.object({ status: z.enum(["ok", "failed"]), timezone: z.string(), iso: z.string().optional(), formatted: z.string().optional(), error: z.string().optional() }),
  execute: async ({ timezone }) => { try { return { status: "ok" as const, timezone, ...currentTime(timezone) }; } catch (error) { return { status: "failed" as const, timezone, error: error instanceof Error ? error.message : "invalid timezone" }; } }
});
