import { describe, expect, it } from "vitest";
import { resolveCheshireModel } from "./model-routing";

const defaults = {
  genericModel: "rassy-fast",
  programmingModel: "rassy-code",
  adminModel: "rassy-mind",
};

describe("Cheshire model routing", () => {
  it("uses the fast lane for generic requests", () => {
    expect(resolveCheshireModel({ ...defaults, lane: "general" })).toBe("rassy-fast");
    expect(resolveCheshireModel({ ...defaults, lane: "listener" })).toBe("rassy-fast");
    expect(resolveCheshireModel({ ...defaults, lane: "dm" })).toBe("rassy-fast");
  });

  it("keeps coding and operator work on their larger-card lanes", () => {
    expect(resolveCheshireModel({ ...defaults, lane: "programming" })).toBe("rassy-code");
    expect(resolveCheshireModel({ ...defaults, lane: "admin" })).toBe("rassy-mind");
  });

  it("honors an explicit caller model", () => {
    expect(
      resolveCheshireModel({
        ...defaults,
        lane: "general",
        requestedModel: "rassy-code",
      }),
    ).toBe("rassy-code");
    expect(
      resolveCheshireModel({
        ...defaults,
        lane: "programming",
        requestedModel: "rassy-fast",
      }),
    ).toBe("rassy-fast");
  });
});
