import { describe, expect, it } from "vitest";
import { makeMathLabSvg, matrixDeterminant, matrixInverse, matrixMultiply, matrixTrace, matrixTranspose, symmetricEigenvalues, symmetricEigenvectors2x2 } from "./math-lab";

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

  it("fails closed for non-symmetric matrices", () => {
    expect(() => symmetricEigenvalues([[0, 1], [0, 0]])).toThrow("real symmetric matrix");
  });

  it("renders matrix spectrum into a bounded SVG", () => {
    const svg = makeMathLabSvg("matrix", "Hamiltonian", "H", [[2, 1], [1, 2]]);
    expect(svg).toContain("EIGENVALUES λ");
    expect(svg).toContain("3.00000");
    expect(svg).toContain("width=\"760\"");
  });
});
