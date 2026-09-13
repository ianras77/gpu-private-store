import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import pg from "pg";

const { Pool } = pg;
const execFileAsync = promisify(execFile);
const workerId = process.env.RUN_WORKER_ID || `rassy-worker-${randomUUID()}`;
const pollMs = Math.max(1000, Number(process.env.RUN_WORKER_POLL_MS || 2000));
const leaseSeconds = 60;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const fixtureRoot = path.resolve(process.env.PROJECT_FIX_FIXTURE_ROOT || "/app-data/project-fix-fixtures");
const workspaceRoot = path.resolve(process.env.PROJECT_FIX_WORKSPACE_ROOT || "/app-data/project-fix-workspaces");
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

function safeProjectId(value) {
  const id = String(value || "fixture");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id)) throw new Error("invalid_project_scope");
  return id;
}

function hash(value) { return createHash("sha256").update(value).digest("hex"); }

async function fixtureFor(run) {
  const project = safeProjectId(run.project_id);
  const directory = path.join(fixtureRoot, project);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const source = path.join(directory, "calculator.mjs");
  const test = path.join(directory, "calculator.test.mjs");
  try { await readFile(source, "utf8"); } catch {
    await writeFile(source, "export function answer() { return 40; }\n", { mode: 0o600, flag: "wx" });
  }
  try { await readFile(test, "utf8"); } catch {
    await writeFile(test, "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { answer } from './calculator.mjs';\ntest('answer is fixed', () => assert.equal(answer(), 42));\n", { mode: 0o600, flag: "wx" });
  }
  const sourceText = await readFile(source, "utf8");
  const testText = await readFile(test, "utf8");
  return { project, directory, source, test, sourceText, testText, sourceRevision: hash(`${sourceText}\0${testText}`) };
}

async function createArtifact(run, name, content, mimeType = "text/plain") {
  const id = randomUUID();
  const bytes = Buffer.from(content, "utf8");
  const directory = path.resolve(process.env.APP_DATA_DIR || "/app-data", "artifacts");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const storagePath = path.join(directory, id);
  await writeFile(storagePath, bytes, { mode: 0o600, flag: "wx" });
  const contentHash = hash(bytes);
  await pool.query("insert into agent_artifacts(id,user_id,run_id,project_id,content_hash,mime_type,size_bytes,storage_path,classification,source_ids) values($1,$2,$3,$4,$5,$6,$7,$8,'private','[]')", [id, run.user_id, run.id, run.project_id, contentHash, mimeType, bytes.length, storagePath]);
  return id;
}

async function setResult(run, result, artifactIds) {
  await pool.query("update agent_runs set result=$1,artifact_ids=$2,updated_at=now() where id=$3 and lease_owner=$4 and lease_generation=$5", [JSON.stringify(result), JSON.stringify(artifactIds), run.id, workerId, run.lease_generation]);
}

async function consumedApproval(run) {
  const result = await pool.query("select * from agent_approvals where run_id=$1 and user_id=$2 and status='consumed' order by consumed_at desc limit 1", [run.id, run.user_id]);
  return result.rows[0] || null;
}

async function executeProjectFix(run) {
  const fixture = await fixtureFor(run);
  const approval = await consumedApproval(run);
  if (!approval) throw new Error("approval_missing");
  if (approval.source_revision !== fixture.sourceRevision) throw new Error("source_revision_changed");
  const expectedHash = hash(JSON.stringify({ file: "calculator.mjs", from: "return 40", to: "return 42" }));
  if (approval.arguments_hash !== expectedHash) throw new Error("approval_arguments_changed");
  const workspace = path.join(workspaceRoot, `${fixture.project}-${run.id}`);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  await writeFile(path.join(workspace, "calculator.mjs"), fixture.sourceText, { mode: 0o600 });
  await writeFile(path.join(workspace, "calculator.test.mjs"), fixture.testText, { mode: 0o600 });
  await event(run, "workspace_created", { project: fixture.project, sourceRevision: fixture.sourceRevision });
  const patched = fixture.sourceText.replace("return 40", "return 42");
  if (patched === fixture.sourceText) throw new Error("expected_patch_not_found");
  await writeFile(path.join(workspace, "calculator.mjs"), patched, { mode: 0o600 });
  await event(run, "patch_applied", { file: "calculator.mjs", sourceRevision: fixture.sourceRevision });
  await transition(run, "running", "test");
  try {
    await execFileAsync(process.execPath, ["--test", "calculator.test.mjs"], { cwd: workspace, timeout: 30000, maxBuffer: 256 * 1024 });
  } catch { throw new Error("allowlisted_test_failed"); }
  const diff = `--- calculator.mjs\n+++ calculator.mjs\n- return 40\n+ return 42\n`;
  const testEvidence = "node --test calculator.test.mjs: PASS\n";
  const diffId = await createArtifact(run, "calculator.diff", diff, "text/x-diff");
  const testId = await createArtifact(run, "test-evidence.txt", testEvidence);
  await setResult(run, { project: fixture.project, sourceRevision: fixture.sourceRevision, outcome: "tested_patch", verified: true }, [diffId, testId]);
  await rm(workspace, { recursive: true, force: true });
  await transition(run, "succeeded", "completed");
  await event(run, "run_succeeded", { verified: true, artifactCount: 2 });
}

async function processRun(run) {
  await event(run, "run_started", { workflow: run.workflow, workflowVersion: run.workflow_version });
  if (run.status === "cancelled") return;
  if (run.workflow !== "project-fix") {
    await transition(run, "failed", "unsupported-workflow", "unsupported_workflow");
    await event(run, "run_failed", { error: "unsupported_workflow" });
    return;
  }
  if (["approved", "workspace", "test", "execution", "completed"].includes(run.current_step)) {
    try { await executeProjectFix(run); }
    catch (error) {
      await transition(run, "failed", "execution-failed", error instanceof Error ? error.message : "execution_failed");
      await event(run, "run_failed", { error: error instanceof Error ? error.message : "execution_failed" });
    }
    return;
  }
  const fixture = await fixtureFor(run);
  const argumentsHash = hash(JSON.stringify({ file: "calculator.mjs", from: "return 40", to: "return 42" }));
  await transition(run, "awaiting_approval", "proposal-review");
  await event(run, "proposal_ready", { project: fixture.project, sourceRevision: fixture.sourceRevision, target: "calculator.mjs", argumentsHash, approvalTool: "apply_isolated_patch" });
  await event(run, "approval_requested", { reason: "project-fix requires explicit approval before applying the isolated patch" });
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
