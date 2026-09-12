import { createHash, randomUUID } from "node:crypto";
import { getPool } from "./db";

export const RUN_STATUSES = ["queued", "running", "waiting_for_tool", "awaiting_approval", "suspended", "succeeded", "failed", "cancelled", "interrupted"] as const;
export type RunStatus = typeof RUN_STATUSES[number];
const TERMINAL = new Set<RunStatus>(["succeeded", "failed", "cancelled", "interrupted"]);
const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["running", "cancelled", "interrupted"],
  running: ["waiting_for_tool", "awaiting_approval", "suspended", "succeeded", "failed", "cancelled", "interrupted"],
  waiting_for_tool: ["running", "cancelled", "interrupted"],
  awaiting_approval: ["running", "cancelled", "interrupted"],
  suspended: ["running", "cancelled", "interrupted"],
  succeeded: [], failed: [], cancelled: [], interrupted: []
};

export type AgentRun = {
  id: string; userId: string; threadId: string | null; projectId: string | null; workflow: string;
  workflowVersion: string; status: RunStatus; currentStep: string; attempt: number;
  leaseGeneration: number; budget: Record<string, unknown>; errorCategory: string | null;
  createdAt: string; updatedAt: string; finishedAt: string | null;
};

export type RunEvent = { runId: string; sequence: number; type: string; payload: Record<string, unknown>; createdAt: string };
export type RunApproval = { id: string; runId: string; userId: string; tool: string; target: string; argumentsHash: string; sourceRevision: string; status: "pending" | "consumed" | "denied" | "expired"; expiresAt: string; createdAt: string };

function mapRun(row: Record<string, unknown>): AgentRun {
  return { id: String(row.id), userId: String(row.user_id), threadId: row.thread_id ? String(row.thread_id) : null, projectId: row.project_id ? String(row.project_id) : null, workflow: String(row.workflow), workflowVersion: String(row.workflow_version), status: row.status as RunStatus, currentStep: String(row.current_step), attempt: Number(row.attempt), leaseGeneration: Number(row.lease_generation), budget: (row.budget ?? {}) as Record<string, unknown>, errorCategory: row.error_category ? String(row.error_category) : null, createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(), finishedAt: row.finished_at ? new Date(String(row.finished_at)).toISOString() : null };
}

function mapApproval(row: Record<string, unknown>): RunApproval {
  return { id: String(row.id), runId: String(row.run_id), userId: String(row.user_id), tool: String(row.tool), target: String(row.target), argumentsHash: String(row.arguments_hash), sourceRevision: String(row.source_revision), status: row.status as RunApproval["status"], expiresAt: new Date(String(row.expires_at)).toISOString(), createdAt: new Date(String(row.created_at)).toISOString() };
}

export function hashApprovalArguments(argumentsValue: unknown): string {
  return createHash("sha256").update(JSON.stringify(argumentsValue, Object.keys(argumentsValue as object ?? {}).sort())).digest("hex");
}

export async function createApproval(input: { runId: string; userId: string; tool: string; target: string; argumentsHash: string; sourceRevision: string; expiresSeconds?: number }): Promise<RunApproval> {
  const run = await findRunForUser(input.runId, input.userId);
  if (!run) throw new Error("run_not_found");
  if (!["running", "awaiting_approval", "suspended"].includes(run.status)) throw new Error("run_not_awaiting_approval");
  const id = randomUUID();
  const nonceHash = createHash("sha256").update(randomUUID()).digest("hex");
  const seconds = Math.max(30, Math.min(input.expiresSeconds ?? 900, 86400));
  const result = await getPool().query(`insert into agent_approvals(id,run_id,user_id,tool,target,arguments_hash,source_revision,expires_at,nonce_hash) values($1,$2,$3,$4,$5,$6,$7,now()+($8::text || ' seconds')::interval,$9) returning *`, [id, input.runId, input.userId, input.tool, input.target, input.argumentsHash, input.sourceRevision, seconds, nonceHash]);
  return mapApproval(result.rows[0]);
}

export async function consumeApproval(id: string, userId: string, argumentsHash: string, sourceRevision: string): Promise<RunApproval> {
  const result = await getPool().query("update agent_approvals set status='consumed',consumed_at=now() where id=$1 and user_id=$2 and status='pending' and expires_at>now() and arguments_hash=$3 and source_revision=$4 returning *", [id, userId, argumentsHash, sourceRevision]);
  if (!result.rows[0]) throw new Error("approval_invalid_or_expired");
  return mapApproval(result.rows[0]);
}

export async function createRun(input: { userId: string; threadId?: string; projectId?: string; workflow: string; workflowVersion?: string; budget?: Record<string, unknown> }): Promise<AgentRun> {
  const id = randomUUID();
  const result = await getPool().query(`insert into agent_runs (id,user_id,thread_id,project_id,workflow,workflow_version,status,budget) values ($1,$2,$3,$4,$5,$6,'queued',$7) returning *`, [id, input.userId, input.threadId ?? null, input.projectId ?? null, input.workflow, input.workflowVersion ?? "1", JSON.stringify(input.budget ?? {})]);
  return mapRun(result.rows[0]);
}

export async function claimNextRun(workerId: string, leaseSeconds = 60): Promise<AgentRun | null> {
  const result = await getPool().query(`with candidate as (select id from agent_runs where status='queued' or (status='running' and lease_expires_at < now()) order by updated_at for update skip locked limit 1) update agent_runs r set status='running', lease_owner=$1, lease_generation=r.lease_generation+1, lease_expires_at=now() + ($2::text || ' seconds')::interval, started_at=coalesce(started_at,now()), updated_at=now() from candidate where r.id=candidate.id returning r.*`, [workerId, leaseSeconds]);
  return result.rows[0] ? mapRun(result.rows[0]) : null;
}

export async function renewRunLease(id: string, workerId: string, leaseGeneration: number, leaseSeconds = 60): Promise<boolean> {
  const result = await getPool().query("update agent_runs set lease_expires_at=now() + ($1::text || ' seconds')::interval,updated_at=now() where id=$2 and lease_owner=$3 and lease_generation=$4 and status='running'", [leaseSeconds, id, workerId, leaseGeneration]);
  return result.rowCount === 1;
}

export async function appendRunEvent(id: string, workerId: string, leaseGeneration: number, type: string, payload: Record<string, unknown>): Promise<RunEvent> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const run = await client.query("select id from agent_runs where id=$1 and lease_owner=$2 and lease_generation=$3 for update", [id, workerId, leaseGeneration]);
    if (!run.rows[0]) throw new Error("run_lease_lost");
    const next = await client.query("select coalesce(max(sequence),0)+1 as sequence from agent_run_events where run_id=$1", [id]);
    const sequence = Number(next.rows[0].sequence);
    const inserted = await client.query("insert into agent_run_events(run_id,sequence,type,payload) values($1,$2,$3,$4) returning *", [id, sequence, type, JSON.stringify(payload)]);
    await client.query("commit");
    const row = inserted.rows[0];
    return { runId: String(row.run_id), sequence, type: String(row.type), payload: row.payload as Record<string, unknown>, createdAt: new Date(String(row.created_at)).toISOString() };
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

export async function listRunEvents(id: string, userId: string, after = 0): Promise<RunEvent[]> {
  const result = await getPool().query("select e.* from agent_run_events e join agent_runs r on r.id=e.run_id where e.run_id=$1 and r.user_id=$2 and e.sequence>$3 order by e.sequence asc limit 500", [id, userId, after]);
  return result.rows.map((row) => ({ runId: String(row.run_id), sequence: Number(row.sequence), type: String(row.type), payload: row.payload as Record<string, unknown>, createdAt: new Date(String(row.created_at)).toISOString() }));
}

export async function listRunsForUser(userId: string): Promise<AgentRun[]> {
  const result = await getPool().query("select * from agent_runs where user_id=$1 order by updated_at desc limit 100", [userId]);
  return result.rows.map(mapRun);
}

export async function findRunForUser(id: string, userId: string): Promise<AgentRun | null> {
  const result = await getPool().query("select * from agent_runs where id=$1 and user_id=$2", [id, userId]);
  return result.rows[0] ? mapRun(result.rows[0]) : null;
}

export async function transitionRun(id: string, userId: string, next: RunStatus, step?: string): Promise<AgentRun> {
  const current = await findRunForUser(id, userId);
  if (!current) throw new Error("run_not_found");
  if (!TRANSITIONS[current.status].includes(next)) throw new Error("invalid_run_transition");
  const finished = TERMINAL.has(next);
  const result = await getPool().query(`update agent_runs set status=$1,current_step=coalesce($2,current_step),attempt=attempt+1,updated_at=now(),started_at=case when $1='running' and started_at is null then now() else started_at end,finished_at=case when $3 then now() else finished_at end where id=$4 and user_id=$5 and status=$6 returning *`, [next, step ?? null, finished, id, userId, current.status]);
  if (!result.rows[0]) throw new Error("run_changed_during_transition");
  return mapRun(result.rows[0]);
}

export async function cancelRun(id: string, userId: string): Promise<AgentRun> {
  const current = await findRunForUser(id, userId);
  if (!current) throw new Error("run_not_found");
  if (TERMINAL.has(current.status)) return current;
  return transitionRun(id, userId, "cancelled", "cancel-requested");
}
