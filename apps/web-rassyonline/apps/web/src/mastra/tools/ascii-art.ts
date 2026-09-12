import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export function makeAsciiArt(kind: "banner" | "box" | "flow" | "bar-chart" | "scatter", title: string, labels: string[], values: number[]): string {
  const safeTitle = title.replace(/[\r\n]/g, " ").slice(0, 60);
  if (kind === "box") return [`+${"-".repeat(Math.min(72, safeTitle.length + 4))}+`, `|  ${safeTitle.padEnd(Math.min(68, safeTitle.length + 2))}  |`, `+${"-".repeat(Math.min(72, safeTitle.length + 4))}+`].join("\n");
  if (kind === "flow") return labels.slice(0, 12).map((label, index) => `${index + 1}. ${label}${index < labels.length - 1 ? "\n   |\n   v" : ""}`).join("\n");
  if (kind === "banner") return `╔${"═".repeat(Math.min(72, safeTitle.length + 2))}╗\n║ ${safeTitle.padEnd(Math.min(70, safeTitle.length))} ║\n╚${"═".repeat(Math.min(72, safeTitle.length + 2))}╝`;
  const max = Math.max(...values.map((value) => Math.abs(value)), 1);
  return values.slice(0, 40).map((value, index) => `${String(labels[index] ?? index + 1).slice(0, 18).padEnd(18)} |${"█".repeat(Math.max(0, Math.round(Math.abs(value) / max * 40)))} ${value}`).join("\n");
}

export const asciiArtTool = createTool({
  id: "ascii-art",
  description: "Create bounded monospace ASCII art: banners, boxes, flow diagrams, bar charts, or scatter-style layouts. Use actual supplied labels/data and keep it readable in a terminal.",
  inputSchema: z.object({ kind: z.enum(["banner", "box", "flow", "bar-chart", "scatter"]), title: z.string().max(160).default("Diagram"), labels: z.array(z.string().max(100)).max(100).default([]), values: z.array(z.number().finite()).max(100).default([]) }),
  outputSchema: z.object({ kind: z.literal("ascii-art"), art: z.string(), width: z.number(), height: z.number() }),
  execute: async ({ kind, title, labels, values }) => { const art = makeAsciiArt(kind, title, labels, values); return { kind: "ascii-art" as const, art, width: Math.max(...art.split("\n").map((line) => line.length), 0), height: art.split("\n").length }; }
});
