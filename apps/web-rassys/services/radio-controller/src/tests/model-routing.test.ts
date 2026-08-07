import { describe, expect, it } from "vitest";
import { resolveListenerModel } from "../dj/model-routing";

describe("listener model routing", () => {
  it("uses the fast RassyMind lane by default", () => {
    expect(resolveListenerModel()).toBe("rassy-fast");
  });

  it("honors an explicit listener model override", () => {
    expect(resolveListenerModel("rassy-mind")).toBe("rassy-mind");
  });
});
