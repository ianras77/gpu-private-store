import { describe, expect, it } from "vitest";
import { isPublicAddress } from "./page-reader";

describe("public page address policy", () => {
  it("rejects internal, reserved, and mapped addresses", () => {
    for (const address of ["127.0.0.1", "10.2.3.4", "169.254.169.254", "192.168.1.2", "100.64.0.1", "198.51.100.2", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "2001:db8::1"]) expect(isPublicAddress(address)).toBe(false);
    expect(isPublicAddress("8.8.8.8")).toBe(true);
    expect(isPublicAddress("2606:4700:4700::1111")).toBe(true);
  });
});
