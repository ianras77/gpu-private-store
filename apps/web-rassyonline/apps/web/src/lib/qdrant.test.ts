import { describe, expect, it } from "vitest";
import { buildQdrantFilter, getUserCollectionName } from "./qdrant";

describe("qdrant helpers", () => {
  it("uses a per-user collection name that is safe for qdrant", () => {
    expect(getUserCollectionName("929e8c7b-eee5-46bc-834e-77192521f1d6")).toBe(
      "rassy_online_929e8c7b_eee5_46bc_834e_77192521f1d6"
    );
  });

  it("always filters retrieval by user and active documents", () => {
    expect(buildQdrantFilter("user-1", ["doc-1", "doc-2"])).toEqual({
      must: [
        { key: "user_id", match: { value: "user-1" } },
        { key: "document_id", match: { any: ["doc-1", "doc-2"] } }
      ]
    });
  });
});
