import { describe, expect, it } from "vitest";
import { detectThemeIntent, getTheme } from "./theme";

describe("theme helpers", () => {
  it("finds exact and natural-language theme requests", () => {
    expect(detectThemeIntent("theme ember")).toBe("ember");
    expect(detectThemeIntent("make the site look like a garden observatory")).toBe("verdant");
    expect(detectThemeIntent("switch the look to aurora please")).toBe("aurora");
  });

  it("ignores normal chat when no visual request is present", () => {
    expect(detectThemeIntent("explain ember logs in docker")).toBeNull();
  });

  it("falls back to aurora for unknown theme ids", () => {
    expect(getTheme("unknown").id).toBe("aurora");
  });
});
