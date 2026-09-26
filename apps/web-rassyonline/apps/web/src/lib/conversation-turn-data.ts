import { ensureSchema, getPool } from "@/lib/db";

export type ConversationSource = { title: string; url: string; snippet: string; source?: string; publishedAt?: string };
export type ConversationArtifact = Record<string, unknown>;
export type ConversationTerminalStatus = "complete" | "truncated" | "failed" | "cancelled" | "empty";

export type ConversationTurnData = {
  turnId: string;
  threadId: string;
  userId: string;
  assistantContent: string;
  sources: ConversationSource[];
  artifacts: ConversationArtifact[];
  terminalStatus: ConversationTerminalStatus;
  createdAt: Date;
};

export async function saveConversationTurnData(input: Omit<ConversationTurnData, "createdAt">): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `insert into conversation_turn_data (turn_id, thread_id, user_id, assistant_content, sources, artifacts, terminal_status)
     values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
     on conflict (turn_id) do update set assistant_content = excluded.assistant_content, sources = excluded.sources, artifacts = excluded.artifacts, terminal_status = excluded.terminal_status`,
    [input.turnId, input.threadId, input.userId, input.assistantContent, JSON.stringify(input.sources), JSON.stringify(input.artifacts), input.terminalStatus]
  );
}

export async function listConversationTurnData(threadId: string, userId: string): Promise<ConversationTurnData[]> {
  await ensureSchema();
  const result = await getPool().query(
    `select turn_id, thread_id, user_id, assistant_content, sources, artifacts, terminal_status, created_at
     from conversation_turn_data where thread_id = $1 and user_id = $2 order by created_at asc`,
    [threadId, userId]
  );
  return result.rows.map((row) => ({
    turnId: row.turn_id, threadId: row.thread_id, userId: row.user_id,
    assistantContent: row.assistant_content, sources: row.sources ?? [], artifacts: row.artifacts ?? [],
    terminalStatus: row.terminal_status, createdAt: row.created_at
  }));
}
