import { randomUUID } from "node:crypto";
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

function mapRun(row: Record<string, unknown>): AgentRun {
  return { id: String(row.id), userId: String(row.user_id), threadId: row.thread_id ? String(row.thread_id) : null, projectId: row.project_id ? String(row.project_id) : null, workflow: String(row.workflow), workflowVersion: String(row.workflow_version), status: row.status as RunStatus, currentStep: String(row.current_step), attempt: Number(row.attempt), leaseGeneration: Number(row.lease_generation), budget: (row.budget ?? {}) as Record<string, unknown>, errorCategory: row.error_category ? String(row.error_category) : null, createdAt: new Date(String(row.created_at)).toISOString(), updatedAt: new Date(String(row.updated_at)).toISOString(), finishedAt: row.finished_at ? new Date(String(row.finished_at)).toISOString() : null };
}

export async function createRun(input: { userId: string; threadId?: string; projectId?: string; workflow: string; workflowVersion?: string; budget?: Record<string, unknown> }): Promise<AgentRun> {
  const id = randomUUID();
  const result = await getPool().query(`insert into agent_runs (id,user_id,thread_id,project_id,workflow,workflow_version,status,budget) values ($1,$2,$3,$4,$5,$6,'queued',$7) returning *`, [id, input.userId, input.threadId ?? null, input.projectId ?? null, input.workflow, input.workflowVersion ?? "1", JSON.stringify(input.budget ?? {})]);
  return mapRun(result.rows[0]);
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
