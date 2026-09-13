import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const SIZE = 500;
const GRID = 100;

function hash(value: string) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return (result >>> 0) / 4294967296;
}

export function makeDotMatrixSvg(pattern: "rosette" | "wave" | "halftone" | "constellation", title: string, seed: string): string {
  const safeTitle = title.replace(/[<&>\"']/g, "").slice(0, 80) || "Dot matrix study";
  const dots: string[] = [];
  const seedValue = hash(seed || safeTitle);
  for (let row = 0; row < GRID; row += 1) {
    for (let column = 0; column < GRID; column += 1) {
      const x = (column + .5) * SIZE / GRID;
      const y = (row + .5) * SIZE / GRID;
      const nx = (column - 49.5) / 49.5;
      const ny = (row - 49.5) / 49.5;
      const radius = Math.sqrt(nx * nx + ny * ny);
      const angle = Math.atan2(ny, nx);
      let density = 0;
      if (pattern === "rosette") density = .5 + .5 * Math.cos(angle * 7 + radius * 24 + seedValue * 6);
      if (pattern === "wave") density = .5 + .5 * Math.sin(nx * 16 + Math.sin(ny * 8 + seedValue * 10) * 3);
      if (pattern === "halftone") density = .5 + .5 * Math.sin((nx * nx + ny * ny) * 38 + seedValue * 12);
      if (pattern === "constellation") density = Math.max(0, 1 - radius) * (.45 + .55 * Math.sin(nx * 29 + seedValue * 9) * Math.sin(ny * 23 + seedValue * 7));
      const vignette = Math.max(0, 1 - radius * .92);
      const threshold = hash(`${seed}:${row}:${column}`) * .18;
      if (density * vignette > .43 + threshold) {
        const dotRadius = pattern === "halftone" ? 1.25 + density * 1.25 : 1.35;
        dots.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${dotRadius.toFixed(2)}"/>`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500" role="img" aria-label="${safeTitle}"><title>${safeTitle}</title><rect width="500" height="500" fill="white"/><g fill="black">${dots.join("")}</g></svg>`;
}

export const dotMatrixTool = createTool({
  id: "dot-matrix",
  description: "Create sophisticated black-and-white 500x500 print-quality dot-matrix artwork. Use supplied title and seed; choose rosette, wave, halftone, or constellation. The result is a visual artifact, not ASCII text.",
  inputSchema: z.object({
    pattern: z.enum(["rosette", "wave", "halftone", "constellation"]).default("rosette"),
    title: z.string().trim().min(1).max(160).default("Dot matrix study"),
    seed: z.string().trim().max(160).default("rassy")
  }),
  outputSchema: z.object({ kind: z.literal("dot-matrix"), title: z.string(), width: z.literal(500), height: z.literal(500), svg: z.string() }),
  execute: async ({ pattern, title, seed }) => ({ kind: "dot-matrix" as const, title, width: 500 as const, height: 500 as const, svg: makeDotMatrixSvg(pattern, title, seed) })
});
