import { randomUUID } from "node:crypto";
import { ensureSchema, getPool } from "@/lib/db";

export type StoredThread = {
  id: string;
  userId: string;
  title: string;
  mode: string;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredMessage = {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  mode: string | null;
  model: string | null;
  createdAt: Date;
};

let chatSchemaReady: Promise<void> | undefined;

export async function ensureChatSchema(): Promise<void> {
  await ensureSchema();
  chatSchemaReady ??= getPool().query(`
    create table if not exists threads (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      title text not null,
      mode text not null,
      archived boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists threads_user_updated_idx on threads(user_id, updated_at desc);

    create table if not exists messages (
      id text primary key,
      thread_id text not null references threads(id) on delete cascade,
      role text not null check (role in ('user', 'assistant', 'system')),
      content text not null,
      mode text,
      model text,
      created_at timestamptz not null default now()
    );

    create index if not exists messages_thread_created_idx on messages(thread_id, created_at asc);
  `).then(() => undefined);
  return chatSchemaReady;
}

export async function createThread(input: { userId: string; title: string; mode: string }): Promise<StoredThread> {
  await ensureChatSchema();
  const id = randomUUID();
  const result = await getPool().query(
    `insert into threads (id, user_id, title, mode)
     values ($1, $2, $3, $4)
     returning id, user_id, title, mode, created_at, updated_at`,
    [id, input.userId, input.title, input.mode]
  );
  return mapThread(result.rows[0]);
}

export async function findThreadForUser(threadId: string, userId: string): Promise<StoredThread | null> {
  await ensureChatSchema();
  const result = await getPool().query(
    "select id, user_id, title, mode, created_at, updated_at from threads where id = $1 and user_id = $2",
    [threadId, userId]
  );
  return result.rows[0] ? mapThread(result.rows[0]) : null;
}

export async function listThreadsForUser(userId: string): Promise<StoredThread[]> {
  await ensureChatSchema();
  const result = await getPool().query(
    "select id, user_id, title, mode, created_at, updated_at from threads where user_id = $1 and archived = false order by updated_at desc limit 50",
    [userId]
  );
  return result.rows.map(mapThread);
}

export async function appendMessage(input: {
  threadId: string;
  role: StoredMessage["role"];
  content: string;
  mode?: string | null;
  model?: string | null;
}): Promise<StoredMessage> {
  await ensureChatSchema();
  const id = randomUUID();
  const result = await getPool().query(
    `insert into messages (id, thread_id, role, content, mode, model)
     values ($1, $2, $3, $4, $5, $6)
     returning id, thread_id, role, content, mode, model, created_at`,
    [id, input.threadId, input.role, input.content, input.mode ?? null, input.model ?? null]
  );
  await getPool().query("update threads set updated_at = now() where id = $1", [input.threadId]);
  return mapMessage(result.rows[0]);
}

function mapThread(row: {
  id: string;
  user_id: string;
  title: string;
  mode: string;
  created_at: Date;
  updated_at: Date;
}): StoredThread {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    mode: row.mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMessage(row: {
  id: string;
  thread_id: string;
  role: StoredMessage["role"];
  content: string;
  mode: string | null;
  model: string | null;
  created_at: Date;
}): StoredMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role,
    content: row.content,
    mode: row.mode,
    model: row.model,
    createdAt: row.created_at
  };
}
