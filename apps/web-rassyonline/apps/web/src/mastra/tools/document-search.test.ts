import { describe, expect, it } from "vitest";
import { permittedDocumentIds } from "./document-search";

describe("document working set", () => {
  it("defaults to selected documents and permits only narrowing", () => {
    expect(permittedDocumentIds(["a", "b"])).toEqual(["a", "b"]);
    expect(permittedDocumentIds(["a"], ["b", "a", "a"])).toEqual(["a"]);
    expect(permittedDocumentIds(["a"], [])).toEqual([]);
  });
});
