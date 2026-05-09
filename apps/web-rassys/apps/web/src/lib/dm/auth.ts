import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const cookieName = "rassy_dm";
const keyLength = 64;

const secret = new TextEncoder().encode(
  process.env.DM_JWT_SECRET || process.env.ADMIN_JWT_SECRET || "unsafe-dm-secret"
);

export type DmSession = {
  userId: string;
  email: string;
  displayName: string;
};

const normalizeHash = (value: string) => value.trim();

const shouldUseSecureDmCookie = (request?: Request) => {
  if (process.env.DM_COOKIE_SECURE === "true") return true;
  if (process.env.DM_COOKIE_SECURE === "false") return false;
  if (process.env.NODE_ENV !== "production") return false;

  const forwardedProto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (forwardedProto) {
    return forwardedProto === "https";
  }

  if (!request) return true;

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return true;
  }
};

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, keyLength).toString("hex");
  return `${salt}:${hash}`;
};

export const verifyPassword = (password: string, storedHash: string) => {
  const normalized = normalizeHash(storedHash);
  const [salt, expectedHash] = normalized.split(":");
  if (!salt || !expectedHash) return false;
  const derived = scryptSync(password, salt, keyLength);
  const expected = Buffer.from(expectedHash, "hex");
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
};

export const issueDmToken = async (session: DmSession, request?: Request) => {
  const token = await new SignJWT({
    scope: "dm-user",
    email: session.email,
    displayName: session.displayName
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureDmCookie(request),
    path: "/"
  });
};

export const clearDmToken = async (request?: Request) => {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureDmCookie(request),
    path: "/",
    maxAge: 0
  });
};

export const getDmSession = async (): Promise<DmSession | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    if (payload.scope !== "dm-user") return null;
    const userId = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const displayName = typeof payload.displayName === "string" ? payload.displayName : "";
    if (!userId || !email || !displayName) return null;
    return { userId, email, displayName };
  } catch {
    return null;
  }
};
