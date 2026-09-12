import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const workerId = process.env.RUN_WORKER_ID || `rassy-worker-${randomUUID()}`;
const pollMs = Math.max(1000, Number(process.env.RUN_WORKER_POLL_MS || 2000));
const leaseSeconds = 60;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { stopping = true; });

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
    const run = await claim();
    if (run) await processRun(run);
    else await new Promise((resolve) => setTimeout(resolve, pollMs));
  } catch (error) {
    if (!stopping) console.error(`run-worker cycle failed: ${error instanceof Error ? error.message : "unknown"}`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
await pool.end();
