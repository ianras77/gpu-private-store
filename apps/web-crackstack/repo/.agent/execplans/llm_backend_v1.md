# ExecPlan: llm_backend_v1

## Goal
Ship a functional LLM backend for Crackstack that uses the local LocalAI install for tool-calling data manipulation.

## Architecture constraints
- LocalAI OpenAI-compatible `/v1/chat/completions` API
- Tool-calling required for data inspection + recipe proposals
- FastAPI backend service

## Milestones

### M1: LocalAI client + tool contract
**Description**
- Implement LocalAI client wrapper
- Define tool schemas for dataset inspection + recipe proposal
- Provide demo dataset so the tool contract returns real data

**Commands**
- `uvicorn app.main:app --reload --port 8000`
- `curl -sS http://127.0.0.1:8000/agent/threads -X POST -H 'Content-Type: application/json' -d '{"brand":"xlcrack"}'`

**Acceptance**
- Agent responds with tool calls and a final message

**Tests required**
- None (demo mode)

---

### M2: Agent orchestration
**Description**
- Tool-calling loop with guardrails
- Approval gating simulated

**Commands**
- `curl -sS http://127.0.0.1:8000/agent/threads/<THREAD_ID>/chat -X POST -H 'Content-Type: application/json' -d '{"message":"Clean dates and drop null revenue rows."}'`

**Acceptance**
- Response includes tool call events and preview/approval artifacts

**Tests required**
- None (demo mode)

---

### M3: DuckDB-backed data tooling
**Description**
- Replace demo stub with DuckDB/Parquet-backed inspection
- Real schema, sample, profile, preview from stored dataset versions

**Commands**
- `uvicorn app.main:app --reload --port 8000`
- `curl -sS http://127.0.0.1:8000/agent/threads -X POST -H 'Content-Type: application/json' -H 'X-API-Key: local-dev-key' -d '{"brand":"xlcrack"}'`

**Acceptance**
- Tool calls return live schema/sample/profile from Parquet

**Tests required**
- None (demo mode)

---

### M4: Recipe execution + tenant auth
**Description**
- Implement run_recipe to create new dataset versions
- Add API-key tenant scoping to /agent endpoints

**Commands**
- `curl -sS http://127.0.0.1:8000/agent/threads/<THREAD_ID>/chat -X POST -H 'Content-Type: application/json' -H 'X-API-Key: local-dev-key' -d '{"message":"Normalize dates and drop null revenue rows."}'`

**Acceptance**
- run_recipe returns a new version_id
- Unauthorized calls rejected without API key

**Tests required**
- None (demo mode)

## Risks & mitigations
- Small local model may hallucinate; mitigate with required tool calls and schema-first rules.
- Tool-call JSON errors; mitigate with error logging + retries.

## Rollback strategy
- Disable /agent routes or swap LocalAI base URL to a null provider.

## Progress log
- [x] M1 (2026-02-22): LocalAI client, tool schema, demo dataset.
- [x] M2 (2026-02-22): Agent loop + /agent endpoints.
- [x] M3 (2026-02-22): DuckDB/Parquet-backed tooling + catalog.
- [x] M4 (2026-02-22): run_recipe execution + API-key tenant scoping.
