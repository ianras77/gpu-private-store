import { describe, expect, it } from "vitest";
import { makeMathLabSvg, matrixDeterminant, matrixTrace, symmetricEigenvalues } from "./math-lab";

describe("math lab", () => {
  it("finds eigenvalues for a symmetric matrix", () => {
    expect(symmetricEigenvalues([[2, 1], [1, 2]])).toEqual([3, 1]);
  });

  it("checks the basic spectral invariants", () => {
    expect(matrixTrace([[2, 1], [1, 2]])).toBe(4);
    expect(matrixDeterminant([[2, 1], [1, 2]])).toBe(3);
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
