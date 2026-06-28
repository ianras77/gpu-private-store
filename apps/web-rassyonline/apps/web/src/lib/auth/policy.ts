export type RegistrationPolicy = "open" | "invite-only" | "closed";
export type UserRole = "admin" | "user";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isRegistrationAllowed(policy: string | undefined): boolean {
  return (policy ?? "open") === "open";
}

export function chooseRoleForNewUser(input: {
  email: string;
  bootstrapAdminEmail?: string | null;
  existingUserCount: number;
}): UserRole {
  if (
    input.existingUserCount === 0 &&
    input.bootstrapAdminEmail &&
    normalizeEmail(input.email) === normalizeEmail(input.bootstrapAdminEmail)
  ) {
    return "admin";
  }

  return "user";
}

export function assertAdmin(role: UserRole | string | null | undefined): asserts role is "admin" {
  if (role !== "admin") {
    throw new Error("admin_required");
  }
}
