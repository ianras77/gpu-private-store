import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { serverConfig } from "./server-config";

const cookieName = "rassy_admin";

const secretValue = serverConfig.ADMIN_JWT_SECRET.trim();
const secret = secretValue ? new TextEncoder().encode(secretValue) : null;
const shouldUseSecureCookies = (process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("https://");

type AdminSession = {
  username: string;
};

export const issueAdminToken = async (username: string) => {
  if (!secret) {
    throw new Error("admin_jwt_secret_missing");
  }

  const token = await new SignJWT({ role: "admin", username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .setSubject(username)
    .sign(secret);
  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies,
    path: "/"
  });
};

export const clearAdminToken = async () => {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies,
    path: "/",
    maxAge: 0
  });
};

export const getAdminSession = async (): Promise<AdminSession | null> => {
  if (!secret) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, secret);
    return {
      username:
        String(verified.payload.username ?? verified.payload.sub ?? serverConfig.ADMIN_USERNAME) ||
        serverConfig.ADMIN_USERNAME
    };
  } catch {
    return null;
  }
};

export const requireAdmin = async () => {
  return Boolean(await getAdminSession());
};
