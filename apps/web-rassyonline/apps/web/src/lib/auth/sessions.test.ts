import { describe, expect, test } from "vitest";
import { createSessionToken, hashSessionToken } from "./sessions";

describe("session helpers", () => {
  test("creates opaque tokens and stable token hashes", () => {
    const token = createSessionToken();

    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
  });
});
