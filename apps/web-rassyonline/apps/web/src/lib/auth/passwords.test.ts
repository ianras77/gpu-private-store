import { describe, expect, test } from "vitest";
import { hashPassword, verifyPassword } from "./passwords";

describe("password helpers", () => {
  test("hashes passwords without storing the original value", async () => {
    const hash = await hashPassword("correct horse battery staple");

    expect(hash).not.toContain("correct horse battery staple");
    expect(hash.length).toBeGreaterThan(32);
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });
});
