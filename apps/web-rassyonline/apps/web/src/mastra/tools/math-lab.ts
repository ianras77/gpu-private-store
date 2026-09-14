import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sampleGraph } from "./calculator";

const esc = (value: string) => value.replace(/[<&>\"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" })[character] ?? character);

export function symmetricEigenvalues(input: number[][]): number[] {
  const size = input.length;
  if (!size || size > 8 || input.some((row) => row.length !== size)) throw new Error("eigenvalues require a square matrix");
  const matrix = input.map((row) => row.map((value) => value));
  for (let row = 0; row < size; row += 1) for (let column = row + 1; column < size; column += 1) if (Math.abs(matrix[row][column] - matrix[column][row]) > 1e-8) throw new Error("eigenvalues currently require a real symmetric matrix");
  for (let iteration = 0; iteration < 80 * size * size; iteration += 1) {
    let p = 0; let q = 1; let largest = 0;
    for (let row = 0; row < size; row += 1) for (let column = row + 1; column < size; column += 1) if (Math.abs(matrix[row][column]) > largest) { largest = Math.abs(matrix[row][column]); p = row; q = column; }
    if (largest < 1e-10) break;
    const angle = .5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p]); const cosine = Math.cos(angle); const sine = Math.sin(angle);
    for (let index = 0; index < size; index += 1) { const mp = matrix[index][p]; const mq = matrix[index][q]; matrix[index][p] = cosine * mp - sine * mq; matrix[index][q] = sine * mp + cosine * mq; }
    for (let index = 0; index < size; index += 1) { const mp = matrix[p][index]; const mq = matrix[q][index]; matrix[p][index] = cosine * mp - sine * mq; matrix[q][index] = sine * mp + cosine * mq; }
  }
  return matrix.map((row, index) => row[index]).sort((a, b) => b - a).map((value) => Number(value.toFixed(8)));
}

function plotPath(points: Array<{ x: number; y: number | null }>, xMin: number, xMax: number, width: number, height: number, minY: number, maxY: number) {
  const rangeY = maxY - minY || 1;
  return points.filter((point) => point.y !== null).map((point) => `${((point.x - xMin) / (xMax - xMin) * width).toFixed(2)},${(height - ((point.y as number - minY) / rangeY * height)).toFixed(2)}`).join(" ");
}

export function makeMathLabSvg(mode: "formula" | "matrix" | "plot" | "wavefunction" | "vector-field", title: string, formula: string, matrix: number[][]): string {
  const safeTitle = esc(title.replace(/[\r\n]/g, " ").slice(0, 100) || "Math Lab");
  const safeFormula = esc(formula.slice(0, 180) || "f(x)");
  const eigenvalues = mode === "matrix" && matrix.length ? symmetricEigenvalues(matrix) : [];
  const width = 760; const height = 430; const left = 64; const top = 86; const graphW = 650; const graphH = 270;
  let body = `<text x="${left}" y="58" class="formula">${safeFormula}</text>`;
  if (mode === "matrix") {
    const rows = matrix.slice(0, 8); const cols = Math.max(...rows.map((row) => row.length), 1); const cellW = 72; const cellH = 42; const startX = (width - cols * cellW) / 2; const startY = 130;
    body += `<path class="bracket" d="M${startX - 22} ${startY - 18}h12v${rows.length * cellH + 6}h-12M${startX + cols * cellW + 22} ${startY - 18}h-12v${rows.length * cellH + 6}h12"/>`;
    rows.forEach((row, rowIndex) => row.slice(0, cols).forEach((value, columnIndex) => { body += `<text x="${startX + columnIndex * cellW + cellW / 2}" y="${startY + rowIndex * cellH}" class="matrix-value" text-anchor="middle">${Number(value.toFixed(4))}</text>`; }));
    if (eigenvalues.length) body += `<text x="${left}" y="350" class="small">EIGENVALUES λ</text><text x="${left}" y="385" class="eigenvalues">${eigenvalues.map((value) => value.toFixed(5)).join("   ")}</text>`;
  } else if (mode === "formula") {
    body += `<text x="${left}" y="142" class="hint">A clean mathematical expression, ready to discuss or transform.</text><path class="rule" d="M${left} 176h${graphW}"/>`;
    body += `<text x="${left}" y="224" class="small">differentiate · integrate · simplify · dimensional-check · explain</text>`;
  } else {
    const expression = mode === "wavefunction" ? `sin(x) * exp(-x^2 / 8)` : mode === "vector-field" ? `sin(x) * cos(x)` : formula;
    const points = sampleGraph(expression, -10, 10, 161); const valid = points.filter((point) => point.y !== null); const rawMin = Math.min(...valid.map((point) => point.y as number), -1); const rawMax = Math.max(...valid.map((point) => point.y as number), 1); const pad = Math.max((rawMax - rawMin) * .08, .5); const minY = rawMin - pad; const maxY = rawMax + pad; const path = plotPath(points, -10, 10, graphW, graphH, minY, maxY); const zeroY = minY <= 0 && maxY >= 0 ? top + graphH - ((0 - minY) / (maxY - minY) * graphH) : null;
    body += `<path class="grid" d="M${left} ${top + graphH / 2}h${graphW}M${left + graphW / 2} ${top}v${graphH}M${left} ${top + graphH * .25}h${graphW}M${left} ${top + graphH * .75}h${graphW}"/>${zeroY === null ? "" : `<path class="axis" d="M${left} ${zeroY}h${graphW}"/>`}<polyline class="curve" points="${path}"/>`;
    body += `<text x="${left}" y="${top + graphH + 32}" class="small">−10</text><text x="${left + graphW / 2}" y="${top + graphH + 32}" class="small" text-anchor="middle">0</text><text x="${left + graphW}" y="${top + graphH + 32}" class="small" text-anchor="end">10</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeTitle}"><rect width="100%" height="100%" fill="#0b0d0d"/><text x="${left}" y="34" class="title">${safeTitle}</text><style>.title{fill:#9de8ce;font:600 14px ui-monospace,monospace;letter-spacing:2px;text-transform:uppercase}.formula{fill:#edf1eb;font:italic 29px Georgia,serif}.hint,.small{fill:#87918b;font:13px ui-monospace,monospace}.matrix-value,.eigenvalues{fill:#edf1eb;font:22px ui-monospace,monospace}.eigenvalues{fill:#9de8ce;font-size:25px}.bracket{fill:none;stroke:#9de8ce;stroke-width:3}.rule{stroke:#9de8ce;stroke-width:1;opacity:.5}.grid{fill:none;stroke:#edf1eb;stroke-width:1;opacity:.1}.axis{stroke:#9de8ce;stroke-width:1;opacity:.6}.curve{fill:none;stroke:#9de8ce;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}</style>${body}</svg>`;
}

export const mathLabTool = createTool({
  id: "math-lab",
  description: "Create an elegant mathematical artifact for physics and higher mathematics. Use formula for a typeset expression, matrix for linear algebra, plot for a supplied f(x), wavefunction for a quantum-style damped oscillation, or vector-field for a directional calculus visualization. Never invent matrix values or claim physical meaning beyond the supplied formula.",
  inputSchema: z.object({ mode: z.enum(["formula", "matrix", "plot", "wavefunction", "vector-field"]).default("formula"), title: z.string().trim().min(1).max(160).default("Math Lab"), formula: z.string().trim().max(220).default("f(x) = sin(x)"), matrix: z.array(z.array(z.number().finite()).min(1).max(8)).max(8).default([]) }),
  outputSchema: z.object({ kind: z.literal("math-lab"), mode: z.string(), title: z.string(), width: z.literal(760), height: z.literal(430), svg: z.string(), eigenvalues: z.array(z.number()).optional() }),
  execute: async ({ mode, title, formula, matrix }) => ({ kind: "math-lab" as const, mode, title, width: 760 as const, height: 430 as const, svg: makeMathLabSvg(mode, title, formula, matrix), eigenvalues: mode === "matrix" && matrix.length ? symmetricEigenvalues(matrix) : undefined })
});
