import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const RADIO_CHAT_COOKIE = "rassy_radio_visitor";

const secret = () => {
  const value = process.env.DM_JWT_SECRET || process.env.ADMIN_JWT_SECRET;
  if (!value || value.length < 32) throw new Error("Radio chat identity secret is unavailable");
  return value;
};

const signature = (id: string) => createHmac("sha256", secret()).update(`radio-chat:${id}`).digest("base64url");

export function readRadioChatIdentity(cookie: string | undefined): string | null {
  if (!cookie) return null;
  const match = /^([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(cookie);
  if (!match) return null;
  const expected = Buffer.from(signature(match[1]));
  const actual = Buffer.from(match[2]);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? match[1] : null;
}

export function createRadioChatIdentity() {
  const id = randomUUID();
  return { id, cookie: `${id}.${signature(id)}` };
}
