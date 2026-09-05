import { createHash } from "node:crypto";
import { z } from "zod";
import { readRassyMindConfig, requireRassyMindCapability, type RassyMindLane } from "./index";

const CompletionSchema = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().nullable().optional() }) })).min(1), model: z.string().optional(), id: z.string().optional() });
export type RassyMindResult = { text: string; model?: string; traceId?: string; latencyMs: number; lane: RassyMindLane };
export async function callRassyMind(input: { lane: RassyMindLane; system: string; prompt: string; sessionId: string; deadlineMs?: number; signal?: AbortSignal; structuredOutput?: boolean }): Promise<RassyMindResult> {
  const config = readRassyMindConfig();
  const model = { "rassy-fast": config.lanes.fast, "rassy-mind": config.lanes.mind, "rassy-utility": config.lanes.utility, "rassy-embed": config.lanes.embed, "rassy-rerank": config.lanes.rerank }[input.lane];
  if (input.structuredOutput) requireRassyMindCapability(input.lane, "structuredOutput");
  const started = Date.now(), controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), input.deadlineMs ?? 60_000);
  if (input.signal) input.signal.addEventListener("abort", () => controller.abort(), { once: true });
  try { const response = await fetch(`${config.baseUrl}/chat/completions`, { method: "POST", signal: controller.signal, headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json", "x-rassy-session-id": `astro:${createHash("sha256").update(input.sessionId).digest("hex").slice(0, 32)}`, "x-rassy-workload": "interactive", "x-rassy-deadline-ms": String(input.deadlineMs ?? 60_000) }, body: JSON.stringify({ model, temperature: 0.4, messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }], ...(input.structuredOutput ? { response_format: { type: "json_object" } } : {}) }) }); if (!response.ok) throw new Error(`RassyMind request failed: HTTP ${response.status}`); const parsed = CompletionSchema.parse(await response.json()); return { text: parsed.choices[0]?.message.content ?? "", model: parsed.model, traceId: parsed.id, latencyMs: Date.now() - started, lane: input.lane }; } finally { clearTimeout(timeout); }
}
