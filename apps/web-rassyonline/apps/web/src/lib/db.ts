import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var rassyOnlinePool: Pool | undefined;
  // eslint-disable-next-line no-var
  var rassyOnlineSchemaReady: Promise<void> | undefined;
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  globalThis.rassyOnlinePool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10
  });

  return globalThis.rassyOnlinePool;
}

export async function ensureSchema(): Promise<void> {
  globalThis.rassyOnlineSchemaReady ??= migrate();
  return globalThis.rassyOnlineSchemaReady;
}

async function migrate(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    create table if not exists users (
      id text primary key,
      email text not null unique,
      name text,
      password_hash text not null,
      role text not null check (role in ('admin', 'user')) default 'user',
      status text not null check (status in ('active', 'disabled')) default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists sessions (
      token_hash text primary key,
      user_id text not null references users(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    );

    create index if not exists sessions_user_id_idx on sessions(user_id);
    create index if not exists sessions_expires_at_idx on sessions(expires_at);

    create table if not exists admin_settings (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz not null default now()
    );

    create table if not exists audit_events (
      id text primary key,
      actor_user_id text references users(id) on delete set null,
      action text not null,
      subject text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
}
