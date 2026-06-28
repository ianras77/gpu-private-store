import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { ensureSchema, getPool } from "@/lib/db";
import { chooseRoleForNewUser, isRegistrationAllowed, normalizeEmail, type UserRole } from "./policy";
import { hashPassword, verifyPassword } from "./passwords";
import { createSessionToken, hashSessionToken, SESSION_COOKIE, sessionExpiresAt } from "./sessions";

export type AppUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: "active" | "disabled";
  createdAt: Date;
};

const authInputSchema = z.object({
  email: z.string().email().transform(normalizeEmail),
  password: z.string().min(8).max(256),
  name: z.string().trim().max(120).optional()
});

type AuthInput = z.infer<typeof authInputSchema>;

function mapUser(row: {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: "active" | "disabled";
  created_at: Date;
}): AppUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: row.created_at
  };
}

export function parseAuthInput(input: unknown): AuthInput {
  return authInputSchema.parse(input);
}

export async function countUsers(): Promise<number> {
  await ensureSchema();
  const result = await getPool().query<{ count: string }>("select count(*)::text as count from users");
  return Number(result.rows[0]?.count ?? "0");
}

export async function findUserByEmail(email: string): Promise<(AppUser & { passwordHash: string }) | null> {
  await ensureSchema();
  const result = await getPool().query(
    "select id, email, name, password_hash, role, status, created_at from users where email = $1",
    [normalizeEmail(email)]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...mapUser(row), passwordHash: row.password_hash };
}

export async function findUserById(id: string): Promise<AppUser | null> {
  await ensureSchema();
  const result = await getPool().query("select id, email, name, role, status, created_at from users where id = $1", [id]);
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function listUsers(): Promise<AppUser[]> {
  await ensureSchema();
  const result = await getPool().query("select id, email, name, role, status, created_at from users order by created_at desc");
  return result.rows.map(mapUser);
}

export async function registerUser(input: unknown): Promise<AppUser> {
  const parsed = parseAuthInput(input);
  await ensureSchema();

  if (!isRegistrationAllowed(process.env.RASSY_ONLINE_REGISTRATION_POLICY)) {
    throw new Error("registration_closed");
  }

  const existingUserCount = await countUsers();
  const role = chooseRoleForNewUser({
    email: parsed.email,
    bootstrapAdminEmail: process.env.RASSY_ONLINE_BOOTSTRAP_ADMIN_EMAIL,
    existingUserCount
  });
  const passwordHash = await hashPassword(parsed.password);
  const id = randomUUID();
  const result = await getPool().query(
    `insert into users (id, email, name, password_hash, role)
     values ($1, $2, $3, $4, $5)
     returning id, email, name, role, status, created_at`,
    [id, parsed.email, parsed.name || null, passwordHash, role]
  );

  await writeAuditEvent(null, "user.register", id, { role });
  return mapUser(result.rows[0]);
}

export async function loginUser(input: unknown): Promise<{ user: AppUser; token: string; expiresAt: Date }> {
  const parsed = parseAuthInput(input);
  const user = await findUserByEmail(parsed.email);
  if (!user || user.status !== "active") {
    throw new Error("invalid_credentials");
  }

  const valid = await verifyPassword(parsed.password, user.passwordHash);
  if (!valid) {
    throw new Error("invalid_credentials");
  }

  const token = createSessionToken();
  const expiresAt = sessionExpiresAt();
  await getPool().query("insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)", [
    hashSessionToken(token),
    user.id,
    expiresAt
  ]);
  await writeAuditEvent(user.id, "user.login", user.id, {});

  const { passwordHash: _passwordHash, ...safeUser } = user;
  return { user: safeUser, token, expiresAt };
}

export async function getUserForSessionToken(token: string | undefined): Promise<AppUser | null> {
  if (!token) return null;
  await ensureSchema();
  const result = await getPool().query(
    `select users.id, users.email, users.name, users.role, users.status, users.created_at
     from sessions
     join users on users.id = sessions.user_id
     where sessions.token_hash = $1 and sessions.expires_at > now() and users.status = 'active'`,
    [hashSessionToken(token)]
  );
  return result.rows[0] ? mapUser(result.rows[0]) : null;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  return getUserForSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function deleteSessionToken(token: string | undefined): Promise<void> {
  if (!token) return;
  await ensureSchema();
  await getPool().query("delete from sessions where token_hash = $1", [hashSessionToken(token)]);
}

export async function writeAuditEvent(
  actorUserId: string | null,
  action: string,
  subject: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  await ensureSchema();
  await getPool().query(
    "insert into audit_events (id, actor_user_id, action, subject, metadata) values ($1, $2, $3, $4, $5)",
    [randomUUID(), actorUserId, action, subject, JSON.stringify(metadata)]
  );
}
