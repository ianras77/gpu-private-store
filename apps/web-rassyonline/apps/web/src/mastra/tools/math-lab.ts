import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { sampleGraph } from "./calculator";

const esc = (value: string) => value.replace(/[<&>\"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" })[character] ?? character);

function assertRectangular(input: number[][], label = "matrix"): void {
  if (!input.length || !input[0]?.length || input.some((row) => row.length !== input[0].length)) throw new Error(`${label} must be a non-empty rectangular matrix`);
}

function assertSquare(input: number[][], label = "matrix"): void {
  assertRectangular(input, label);
  if (input.length !== input[0].length) throw new Error(`${label} must be square`);
}

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

export function matrixTrace(input: number[][]): number {
  assertSquare(input, "trace input");
  return Number(input.reduce((sum, row, index) => sum + row[index], 0).toFixed(8));
}

export function matrixDeterminant(input: number[][]): number {
  const n = input.length;
  assertSquare(input, "determinant input");
  if (n > 8) throw new Error("determinant supports matrices up to 8×8");
  const matrix = input.map((row) => [...row]); let sign = 1; let determinant = 1;
  for (let column = 0; column < n; column += 1) { let pivot = column; for (let row = column + 1; row < n; row += 1) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row; if (Math.abs(matrix[pivot][column]) < 1e-12) return 0; if (pivot !== column) { [matrix[pivot], matrix[column]] = [matrix[column], matrix[pivot]]; sign *= -1; } const value = matrix[column][column]; determinant *= value; for (let row = column + 1; row < n; row += 1) { const factor = matrix[row][column] / value; for (let inner = column + 1; inner < n; inner += 1) matrix[row][inner] -= factor * matrix[column][inner]; } }
  return Number((determinant * sign).toFixed(8));
}

export function symmetricEigenvectors2x2(input: number[][]): number[][] {
  if (input.length !== 2 || input.some((row) => row.length !== 2)) throw new Error("eigenvectors currently support 2x2 matrices");
  const angle = .5 * Math.atan2(2 * input[0][1], input[0][0] - input[1][1]);
  return [[Number(Math.cos(angle).toFixed(8)), Number(Math.sin(angle).toFixed(8))], [Number(-Math.sin(angle).toFixed(8)), Number(Math.cos(angle).toFixed(8))]];
}

export function matrixTranspose(input: number[][]): number[][] { assertRectangular(input); return input[0].map((_, column) => input.map((row) => row[column])); }
export function matrixMultiply(left: number[][], right: number[][]): number[][] {
  assertRectangular(left, "left matrix"); assertRectangular(right, "right matrix");
  if (left[0].length !== right.length) throw new Error("matrix dimensions are not compatible");
  return left.map((row) => right[0].map((_, column) => Number(row.reduce((sum, value, index) => sum + value * right[index][column], 0).toFixed(8))));
}
export function matrixInverse(input: number[][]): number[][] {
  const n = input.length;
  assertSquare(input, "inverse input");
  const augmented = input.map((row, index) => [...row, ...Array.from({ length: n }, (_, identityIndex) => identityIndex === index ? 1 : 0)]);
  for (let column = 0; column < n; column += 1) { let pivot = column; for (let row = column + 1; row < n; row += 1) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row; if (Math.abs(augmented[pivot][column]) < 1e-12) throw new Error("matrix is singular"); [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]; const divisor = augmented[column][column]; augmented[column] = augmented[column].map((value) => value / divisor); for (let row = 0; row < n; row += 1) if (row !== column) { const factor = augmented[row][column]; augmented[row] = augmented[row].map((value, index) => value - factor * augmented[column][index]); } }
  return augmented.map((row) => row.slice(n).map((value) => Number(value.toFixed(8))));
}

/** Solve Ax=b with the same pivoted inverse used by the matrix artifact. */
export function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  assertSquare(matrix, "solve coefficient matrix");
  if (matrix.length !== vector.length) throw new Error("solve requires one right-hand-side value per matrix row");
  return matrixMultiply(matrixInverse(matrix), vector.map((value) => [value])).map((row) => row[0]);
}

export function reducedRowEchelon(input: number[][]): { matrix: number[][]; rank: number } {
  assertRectangular(input, "RREF input");
  const matrix = input.map((row) => [...row]); let pivotRow = 0;
  for (let column = 0; column < matrix[0].length && pivotRow < matrix.length; column += 1) {
    let pivot = pivotRow;
    for (let row = pivotRow + 1; row < matrix.length; row += 1) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row;
    if (Math.abs(matrix[pivot][column]) < 1e-12) continue;
    [matrix[pivotRow], matrix[pivot]] = [matrix[pivot], matrix[pivotRow]];
    const divisor = matrix[pivotRow][column]; matrix[pivotRow] = matrix[pivotRow].map((value) => value / divisor);
    for (let row = 0; row < matrix.length; row += 1) if (row !== pivotRow) { const factor = matrix[row][column]; matrix[row] = matrix[row].map((value, index) => { const next = value - factor * matrix[pivotRow][index]; return Math.abs(next) < 1e-12 ? 0 : next; }); }
    pivotRow += 1;
  }
  return { matrix: matrix.map((row) => row.map((value) => Number(value.toPrecision(10)))), rank: pivotRow };
}

export function matrixPower(input: number[][], exponent: number): number[][] {
  assertSquare(input, "power input");
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 16) throw new Error("power exponent must be an integer from 0 through 16");
  let result: number[][] = input.map((row, rowIndex) => row.map((_, columnIndex) => rowIndex === columnIndex ? 1 : 0)); let factor = input.map((row) => [...row]); let remaining = exponent;
  while (remaining) { if (remaining % 2) result = matrixMultiply(result, factor); remaining = Math.floor(remaining / 2); if (remaining) factor = matrixMultiply(factor, factor); }
  return result;
}

export function solveResidual(matrix: number[][], vector: number[], solution: number[]): number {
  const reconstructed = matrixMultiply(matrix, solution.map((value) => [value])).map((row) => row[0]);
  return Number(Math.sqrt(reconstructed.reduce((sum, value, index) => sum + (value - vector[index]) ** 2, 0)).toPrecision(8));
}

function formatMatrixNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute >= 100_000 || absolute < 0.0001)) return value.toExponential(3);
  return Number(value.toPrecision(6)).toString();
}

function plotPath(points: Array<{ x: number; y: number | null }>, xMin: number, xMax: number, width: number, height: number, minY: number, maxY: number) {
  const rangeY = maxY - minY || 1;
  const segments: string[] = [];
  let current: string[] = [];
  for (const point of points) {
    if (point.y === null) { if (current.length) segments.push(current.join(" ")); current = []; continue; }
    current.push(`${((point.x - xMin) / (xMax - xMin) * width).toFixed(2)},${(height - ((point.y - minY) / rangeY * height)).toFixed(2)}`);
  }
  if (current.length) segments.push(current.join(" "));
  return segments.map((segment) => `<polyline class="curve" points="${segment}"/>`).join("");
}

export function makeMathLabSvg(mode: "formula" | "matrix" | "plot" | "wavefunction" | "vector-field" | "fourier" | "phase", title: string, formula: string, matrix: number[][], operation = "spectrum", matrixB: number[][] = [], vectorB: number[] = [], exponent = 2): string {
  const safeTitle = esc(title.replace(/[\r\n]/g, " ").slice(0, 100) || "Math Lab");
  const safeFormula = esc(formula.slice(0, 180) || "f(x)");
  let displayMatrix = matrix;
  if (mode === "matrix" && operation === "transpose") displayMatrix = matrixTranspose(matrix);
  if (mode === "matrix" && operation === "inverse") displayMatrix = matrixInverse(matrix);
  if (mode === "matrix" && operation === "multiply") displayMatrix = matrixMultiply(matrix, matrixB);
  if (mode === "matrix" && operation === "solve") displayMatrix = solveLinearSystem(matrix, vectorB).map((value) => [value]);
  if (mode === "matrix" && operation === "rref") displayMatrix = reducedRowEchelon(matrix).matrix;
  if (mode === "matrix" && operation === "power") displayMatrix = matrixPower(matrix, exponent);
  // A real general matrix does not necessarily have real eigenvalues.  Still
  // render its supplied data and invariants rather than making the whole tool
  // call fail (the prior behavior made common linear-system demos disappear).
  const symmetric = matrix.every((row, rowIndex) => row.length === matrix.length && row.every((value, columnIndex) => Math.abs(value - (matrix[columnIndex]?.[rowIndex] ?? NaN)) <= 1e-8));
  const eigenvalues = mode === "matrix" && operation === "spectrum" && matrix.length && symmetric ? symmetricEigenvalues(matrix) : [];
  const trace = mode === "matrix" && matrix.length ? matrixTrace(matrix) : null;
  const determinant = mode === "matrix" && matrix.length ? matrixDeterminant(matrix) : null;
  const eigenvectors = mode === "matrix" && matrix.length === 2 ? symmetricEigenvectors2x2(matrix) : [];
  const width = 760; const height = 430; const left = 64; const top = 86; const graphW = 650; const graphH = 270;
  let body = `<text x="${left}" y="58" class="formula">${safeFormula}</text>`;
  if (mode === "matrix") {
    const rows = displayMatrix.slice(0, 8); const cols = Math.max(...rows.map((row) => row.length), 1); const cellW = 72; const cellH = 42; const startX = (width - cols * cellW) / 2; const startY = 130;
    body += `<path class="bracket" d="M${startX - 22} ${startY - 18}h12v${rows.length * cellH + 6}h-12M${startX + cols * cellW + 22} ${startY - 18}h-12v${rows.length * cellH + 6}h12"/>`;
    body += `<text x="${left}" y="105" class="small">OPERATION · ${esc(operation)}</text>`;
    rows.forEach((row, rowIndex) => row.slice(0, cols).forEach((value, columnIndex) => { body += `<text x="${startX + columnIndex * cellW + cellW / 2}" y="${startY + rowIndex * cellH}" class="matrix-value" text-anchor="middle">${formatMatrixNumber(value)}</text>`; }));
    const detailsY = Math.max(350, startY + rows.length * cellH + 58);
    const residual = operation === "solve" ? solveResidual(matrix, vectorB, displayMatrix.map((row) => row[0])) : null;
    const rank = operation === "rref" ? reducedRowEchelon(matrix).rank : null;
    body += `<text x="${left}" y="${detailsY}" class="small">${operation === "solve" ? "SOLUTION VECTOR X" : operation === "rref" ? "RANK" : eigenvalues.length ? "EIGENVALUES λ" : "TRACE / DETERMINANT"}</text>`;
    body += `<text x="${left}" y="${detailsY + 35}" class="${eigenvalues.length ? "eigenvalues" : "invariants"}">${eigenvalues.length ? eigenvalues.map(formatMatrixNumber).join("   ") : operation === "solve" ? displayMatrix.map((row) => formatMatrixNumber(row[0])).join("   ") : operation === "rref" ? String(rank) : `${formatMatrixNumber(trace ?? 0)}  /  ${formatMatrixNumber(determinant ?? 0)}`}</text>`;
    if (residual !== null) body += `<text x="${left + 380}" y="${detailsY}" class="small">RESIDUAL ‖AX−B‖₂</text><text x="${left + 380}" y="${detailsY + 35}" class="invariants">${formatMatrixNumber(residual)}</text>`;
    if (!eigenvalues.length && operation === "spectrum") body += `<text x="${left}" y="${detailsY + 61}" class="small">REAL-SYMMETRIC EIGENSPECTRUM REQUIRED</text>`;
    if (eigenvectors.length) body += `<text x="${left + 360}" y="${detailsY}" class="small">EIGENVECTORS</text><text x="${left + 360}" y="${detailsY + 28}" class="small">${eigenvectors.map((vector) => `(${vector.map((value) => formatMatrixNumber(value)).join(", ")})`).join("   ")}</text>`;
  } else if (mode === "formula") {
    body += `<text x="${left}" y="142" class="hint">A clean mathematical expression, ready to discuss or transform.</text><path class="rule" d="M${left} 176h${graphW}"/>`;
    body += `<text x="${left}" y="224" class="small">differentiate · integrate · simplify · dimensional-check · explain</text>`;
  } else if (mode === "vector-field") {
    // This is deliberately a vector field, rather than a line plot with a
    // vector-field label.  Short normalized arrows remain legible at phone
    // size and avoid suggesting a numerical solution we have not computed.
    const columns = 11; const rows = 6;
    const arrows: string[] = [];
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const x = left + (column / (columns - 1)) * graphW;
      const y = top + (row / (rows - 1)) * graphH;
      const normalizedX = (column / (columns - 1)) * 4 - 2;
      const normalizedY = 2 - (row / (rows - 1)) * 4;
      const dx = -normalizedY; const dy = normalizedX;
      const scale = 15 / Math.max(Math.hypot(dx, dy), .35);
      const endX = x + dx * scale; const endY = y - dy * scale;
      arrows.push(`<path class="vector" d="M${x.toFixed(1)} ${y.toFixed(1)}L${endX.toFixed(1)} ${endY.toFixed(1)}m${(endX - 5).toFixed(1)} ${(endY + 2).toFixed(1)}l5 -2 -2 5"/>`);
    }
    body += `<text x="${left}" y="105" class="small">ROTATIONAL FIELD · direction only</text><path class="grid" d="M${left} ${top + graphH / 2}h${graphW}M${left + graphW / 2} ${top}v${graphH}"/>${arrows.join("")}`;
  } else if (mode === "phase") {
    const points = Array.from({ length: 180 }, (_, index) => {
      const t = index / 179 * Math.PI * 8;
      const radius = 1.85 * Math.exp(-t / 15);
      return { x: radius * Math.cos(t), y: radius * Math.sin(t) };
    });
    const path = points.map((point, index) => `${index ? "L" : "M"}${(left + graphW / 2 + point.x * 92).toFixed(2)} ${(top + graphH / 2 - point.y * 92).toFixed(2)}`).join(" ");
    body += `<text x="${left}" y="105" class="small">PHASE PORTRAIT · DAMPED ORBIT</text><path class="grid" d="M${left} ${top + graphH / 2}h${graphW}M${left + graphW / 2} ${top}v${graphH}"/><path class="curve" d="${path}"/><circle class="origin" cx="${left + graphW / 2}" cy="${top + graphH / 2}" r="4"/>`;
  } else {
    const expression = mode === "wavefunction" ? `sin(x) * exp(-x^2 / 8)` : mode === "fourier" ? `sin(x) + sin(3*x)/3 + sin(5*x)/5` : formula;
    const points = sampleGraph(expression, -10, 10, 161); const valid = points.filter((point) => point.y !== null); const rawMin = Math.min(...valid.map((point) => point.y as number), -1); const rawMax = Math.max(...valid.map((point) => point.y as number), 1); const pad = Math.max((rawMax - rawMin) * .08, .5); const minY = rawMin - pad; const maxY = rawMax + pad; const path = plotPath(points, -10, 10, graphW, graphH, minY, maxY); const zeroY = minY <= 0 && maxY >= 0 ? top + graphH - ((0 - minY) / (maxY - minY) * graphH) : null;
    body += `<path class="grid" d="M${left} ${top + graphH / 2}h${graphW}M${left + graphW / 2} ${top}v${graphH}M${left} ${top + graphH * .25}h${graphW}M${left} ${top + graphH * .75}h${graphW}"/>${zeroY === null ? "" : `<path class="axis" d="M${left} ${zeroY}h${graphW}"/>`}${path}`;
    body += `<text x="${left}" y="${top + graphH + 32}" class="small">−10</text><text x="${left + graphW / 2}" y="${top + graphH + 32}" class="small" text-anchor="middle">0</text><text x="${left + graphW}" y="${top + graphH + 32}" class="small" text-anchor="end">10</text>`;
  }
  // Styling is deliberately in application CSS. The client sanitizer rejects
  // SVG style nodes, so embedding styles here created an unstyled white card.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${safeTitle}"><rect width="100%" height="100%" fill="#0b0d0d"/><text x="${left}" y="34" class="title">${safeTitle}</text>${body}</svg>`;
}

export const mathLabTool = createTool({
  id: "math-lab",
  description: "Create a dark-theme mathematical artifact from verified supplied values. Matrix operations: transpose/inverse accept matrix; multiply requires matrixB as a 2-D array; solve requires vectorB as a flat vector and returns X plus residual for AX=B; rref returns reduced row echelon form and rank; power raises a square matrix to integer exponent 0..16; spectrum returns eigenvalues only for real symmetric A (otherwise trace and determinant). Use calculator for each non-trivial numeric step first. Use plots, Fourier, fields, and phase portraits only when they clarify the supplied formula—never invent data or physical meaning.",
  inputSchema: z.object({ mode: z.enum(["formula", "matrix", "plot", "wavefunction", "vector-field", "fourier", "phase"]).default("formula"), operation: z.enum(["spectrum", "transpose", "multiply", "inverse", "solve", "rref", "power"]).default("spectrum"), title: z.string().trim().min(1).max(160).default("Math Lab"), formula: z.string().trim().max(220).default("f(x) = sin(x)"), matrix: z.array(z.array(z.number().finite()).min(1).max(8)).max(8).default([]), matrixB: z.preprocess((value) => typeof value === "string" && !value.trim() ? [] : value, z.array(z.array(z.number().finite()).min(1).max(8)).max(8).default([])), vectorB: z.preprocess((value) => typeof value === "string" && !value.trim() ? [] : value, z.array(z.number().finite()).min(1).max(8).default([])), exponent: z.preprocess((value) => typeof value === "string" && !value.trim() ? 2 : value, z.number().int().min(0).max(16).default(2)) }),
  outputSchema: z.object({ kind: z.literal("math-lab"), mode: z.string(), operation: z.string(), title: z.string(), width: z.literal(760), height: z.literal(430), svg: z.string(), eigenvalues: z.array(z.number()).optional(), eigenvectors: z.array(z.array(z.number())).optional(), trace: z.number().optional(), determinant: z.number().optional() }),
  execute: async ({ mode, operation, title, formula, matrix, matrixB, vectorB, exponent }) => { const symmetric = matrix.every((row, rowIndex) => row.length === matrix.length && row.every((value, columnIndex) => Math.abs(value - (matrix[columnIndex]?.[rowIndex] ?? NaN)) <= 1e-8)); return { kind: "math-lab" as const, mode, operation, title, width: 760 as const, height: 430 as const, svg: makeMathLabSvg(mode, title, formula, matrix, operation, matrixB, vectorB, exponent), eigenvalues: mode === "matrix" && operation === "spectrum" && matrix.length && symmetric ? symmetricEigenvalues(matrix) : undefined, eigenvectors: mode === "matrix" && operation === "spectrum" && matrix.length === 2 && symmetric ? symmetricEigenvectors2x2(matrix) : undefined, trace: mode === "matrix" && matrix.length ? matrixTrace(matrix) : undefined, determinant: mode === "matrix" && matrix.length ? matrixDeterminant(matrix) : undefined }; }
});
