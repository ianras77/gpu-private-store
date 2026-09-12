import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const workerId = process.env.RUN_WORKER_ID || `rassy-worker-${randomUUID()}`;
const pollMs = Math.max(1000, Number(process.env.RUN_WORKER_POLL_MS || 2000));
const leaseSeconds = 60;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { stopping = true; });

async function ensureRunSchema() {
  await pool.query(`
    create table if not exists agent_runs (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      thread_id text,
      project_id text,
      workflow text not null,
      workflow_version text not null,
      status text not null check (status in ('queued','running','waiting_for_tool','awaiting_approval','suspended','succeeded','failed','cancelled','interrupted')),
      current_step text not null default 'accepted',
      input_ref text,
      budget jsonb not null default '{}'::jsonb,
      permission_snapshot jsonb not null default '{}'::jsonb,
      artifact_ids jsonb not null default '[]'::jsonb,
      approval_ids jsonb not null default '[]'::jsonb,
      attempt integer not null default 0,
      lease_generation bigint not null default 0,
      lease_owner text,
      lease_expires_at timestamptz,
      error_category text,
      result jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      started_at timestamptz,
      finished_at timestamptz
    );
    create index if not exists agent_runs_status_idx on agent_runs(status, updated_at);
    create table if not exists agent_run_events (
      run_id text not null references agent_runs(id) on delete cascade,
      sequence bigint not null,
      type text not null,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      primary key (run_id, sequence)
    );
    create index if not exists agent_run_events_created_idx on agent_run_events(run_id, created_at);
  `);
}

async function claim() {
  const result = await pool.query(`with candidate as (select id from agent_runs where status='queued' or (status='running' and lease_expires_at < now()) order by updated_at for update skip locked limit 1) update agent_runs r set status='running',lease_owner=$1,lease_generation=r.lease_generation+1,lease_expires_at=now() + interval '60 seconds',started_at=coalesce(started_at,now()),updated_at=now() from candidate where r.id=candidate.id returning r.*`, [workerId]);
  return result.rows[0] || null;
}

async function event(run, type, payload = {}) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const locked = await client.query("select id from agent_runs where id=$1 and lease_owner=$2 and lease_generation=$3 for update", [run.id, workerId, run.lease_generation]);
    if (!locked.rows[0]) throw new Error("lease_lost");
    const next = await client.query("select coalesce(max(sequence),0)+1 as sequence from agent_run_events where run_id=$1", [run.id]);
    await client.query("insert into agent_run_events(run_id,sequence,type,payload) values($1,$2,$3,$4)", [run.id, next.rows[0].sequence, type, JSON.stringify(payload)]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
}

async function transition(run, status, step, errorCategory = null) {
  const result = await pool.query("update agent_runs set status=$1,current_step=$2,error_category=$3,updated_at=now(),finished_at=case when $1 in ('succeeded','failed','cancelled','interrupted') then now() else finished_at end where id=$4 and lease_owner=$5 and lease_generation=$6 and status='running' returning *", [status, step, errorCategory, run.id, workerId, run.lease_generation]);
  if (!result.rows[0]) throw new Error("lease_lost");
  return result.rows[0];
}

async function processRun(run) {
  await event(run, "run_started", { workflow: run.workflow, workflowVersion: run.workflow_version });
  if (run.status === "cancelled") return;
  if (run.workflow !== "project-fix") {
    await transition(run, "failed", "unsupported-workflow", "unsupported_workflow");
    await event(run, "run_failed", { error: "unsupported_workflow" });
    return;
  }
  await transition(run, "awaiting_approval", "proposal-review");
  await event(run, "approval_requested", { reason: "project-fix requires explicit publication approval" });
}

while (!stopping) {
  try {
    await ensureRunSchema();
    const run = await claim();
    if (run) await processRun(run);
    else await new Promise((resolve) => setTimeout(resolve, pollMs));
  } catch (error) {
    if (!stopping) console.error(`run-worker cycle failed: ${error instanceof Error ? error.message : "unknown"}`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
await pool.end();
