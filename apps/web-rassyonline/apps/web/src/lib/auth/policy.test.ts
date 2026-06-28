import { describe, expect, test } from "vitest";
import { chooseRoleForNewUser, isRegistrationAllowed } from "./policy";

describe("auth policy", () => {
  test("allows public registration only when policy is open", () => {
    expect(isRegistrationAllowed("open")).toBe(true);
    expect(isRegistrationAllowed("invite-only")).toBe(false);
    expect(isRegistrationAllowed("closed")).toBe(false);
  });

  test("promotes bootstrap admin email exactly once by email match", () => {
    expect(
      chooseRoleForNewUser({
        email: "ian@example.com",
        bootstrapAdminEmail: "IAN@example.com",
        existingUserCount: 0
      })
    ).toBe("admin");

    expect(
      chooseRoleForNewUser({
        email: "ian@example.com",
        bootstrapAdminEmail: "ian@example.com",
        existingUserCount: 2
      })
    ).toBe("user");

    expect(
      chooseRoleForNewUser({
        email: "someone@example.com",
        bootstrapAdminEmail: "ian@example.com",
        existingUserCount: 0
      })
    ).toBe("user");
  });
});
