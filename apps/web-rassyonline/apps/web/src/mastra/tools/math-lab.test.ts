import { describe, expect, it } from "vitest";
import { makeMathLabSvg, mathLabTool, matrixDeterminant, matrixInverse, matrixMultiply, matrixPower, matrixTrace, matrixTranspose, reducedRowEchelon, solveLinearSystem, solveResidual, symmetricEigenvalues, symmetricEigenvectors2x2 } from "./math-lab";

describe("math lab", () => {
  it("finds eigenvalues for a symmetric matrix", () => {
    expect(symmetricEigenvalues([[2, 1], [1, 2]])).toEqual([3, 1]);
  });

  it("checks the basic spectral invariants", () => {
    expect(matrixTrace([[2, 1], [1, 2]])).toBe(4);
    expect(matrixDeterminant([[2, 1], [1, 2]])).toBe(3);
  });

  it("returns orthonormal eigenvectors for a 2x2 symmetric matrix", () => {
    const vectors = symmetricEigenvectors2x2([[2, 1], [1, 2]]);
    expect(vectors[0][0] ** 2 + vectors[0][1] ** 2).toBeCloseTo(1);
    expect(makeMathLabSvg("matrix", "Hamiltonian", "H", [[2, 1], [1, 2]])).toContain("EIGENVECTORS");
  });

  it("supports core matrix operations", () => {
    expect(matrixTranspose([[1, 2], [3, 4]])).toEqual([[1, 3], [2, 4]]);
    expect(matrixMultiply([[1, 2]], [[3], [4]])).toEqual([[11]]);
    expect(matrixInverse([[2, 0], [0, 4]])).toEqual([[0.5, 0], [0, 0.25]]);
    expect(makeMathLabSvg("fourier", "Fourier study", "f(x)", [])).toContain("polyline");
  });

  it("solves a supplied system without asking the model to invent an inverse", () => {
    expect(solveLinearSystem([[2, 1], [1, 3]], [5, 8])).toEqual([1.4, 2.2]);
    const svg = makeMathLabSvg("matrix", "Solve AX=B", "AX=B", [[2, 1], [1, 3]], "solve", [], [5, 8]);
    expect(svg).toContain("SOLUTION VECTOR X");
    expect(svg).toContain("1.4");
    expect(solveResidual([[2, 1], [1, 3]], [5, 8], [1.4, 2.2])).toBeCloseTo(0);
  });

  it("supports rank-revealing and repeated linear operations", () => {
    expect(reducedRowEchelon([[1, 2], [2, 4]]).rank).toBe(1);
    expect(matrixPower([[1, 1], [0, 1]], 3)).toEqual([[1, 3], [0, 1]]);
    expect(makeMathLabSvg("matrix", "Row reduction", "A", [[1, 2], [2, 4]], "rref")).toContain("RANK");
  });

  it("accepts blank optional fields that tool-calling models commonly emit", () => {
    const input = (mathLabTool.inputSchema as unknown as { parse(value: unknown): { matrixB: number[][]; vectorB: number[]; exponent: number } }).parse({ mode: "matrix", operation: "solve", title: "Solve", formula: "", matrix: [[2, 1], [1, 3]], matrixB: "", vectorB: [5, 8], exponent: "" });
    expect(input).toMatchObject({ matrixB: [], vectorB: [5, 8], exponent: 2 });
  });

  it("fails closed for non-symmetric matrices", () => {
    expect(() => symmetricEigenvalues([[0, 1], [0, 0]])).toThrow("real symmetric matrix");
    expect(makeMathLabSvg("matrix", "General matrix", "A", [[0, 1], [0, 0]])).toContain("REAL-SYMMETRIC EIGENSPECTRUM REQUIRED");
  });

  it("renders matrix spectrum into a bounded SVG", () => {
    const svg = makeMathLabSvg("matrix", "Hamiltonian", "H", [[2, 1], [1, 2]]);
    expect(svg).toContain("EIGENVALUES λ");
    expect(svg).toContain(">3   1<");
    expect(svg).toContain("width=\"760\"");
    expect(svg).not.toContain("<style>");
  });

  it("breaks a plot at undefined samples", () => {
    const svg = makeMathLabSvg("plot", "Reciprocal", "1/x", []);
    expect((svg.match(/<polyline class="curve"/g) ?? []).length).toBe(2);
  });

  it("renders semantically distinct field and phase artifacts", () => {
    expect(makeMathLabSvg("vector-field", "Flow", "v", [])).toContain('class="vector"');
    expect(makeMathLabSvg("phase", "Orbit", "x, v", [])).toContain("PHASE PORTRAIT");
  });
});
