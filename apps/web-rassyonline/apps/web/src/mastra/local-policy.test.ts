import { describe, expect, it } from "vitest";
import { localOnlyExecution } from "./local-policy";

describe("local-only execution policy", () => {
  it("treats search off as a hard execution boundary", () => {
    expect(localOnlyExecution("off")).toBe(true);
    expect(localOnlyExecution("auto")).toBe(false);
    expect(localOnlyExecution("on")).toBe(false);
  });
});
