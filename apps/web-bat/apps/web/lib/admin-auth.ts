export const ADMIN_SESSION_COOKIE = "bat_admin_session";

const DEFAULT_ADMIN_USERNAME = "ian";
const DEFAULT_ADMIN_PASSWORD = "Mycobacteri@98";
const SESSION_SALT = process.env.BAT_ADMIN_SESSION_SALT ?? "bat-admin-session-v1";

export function getAdminCredentials() {
  return {
    username: process.env.BAT_ADMIN_USERNAME ?? DEFAULT_ADMIN_USERNAME,
    password: process.env.BAT_ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD,
  };
}

export function normalizeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/admin";
  }
  return value;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildAdminSessionToken(username: string, password: string): Promise<string> {
  return sha256Hex(`${SESSION_SALT}:${username}:${password}`);
}

export async function isValidAdminLogin(username: string, password: string): Promise<boolean> {
  const credentials = getAdminCredentials();
  return username === credentials.username && password === credentials.password;
}

export async function isValidAdminSession(token: string | null | undefined): Promise<boolean> {
  if (!token) {
    return false;
  }
  const credentials = getAdminCredentials();
  const expected = await buildAdminSessionToken(credentials.username, credentials.password);
  return token === expected;
}
