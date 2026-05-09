# XLCRACK + TAPECRACK — Unified Agentic Data Infra & App Build Plan (v1)

**Purpose:** This document is a **build-ready blueprint** for two sophisticated data management products:
- **XLCRACK (xlcrack.com)**: “Excel and messy-business-data cracking” brand
- **TAPECRACK (tapecrack.app)**: “data pipeline tape, automation, repeatability” brand

Both share the **same backend platform** and differ mainly in **theme, copy, and packaging** (web + iOS).  
The core experience is an **AI agent playground** for **large dataset ingestion, manipulation, repeatable programs, and auditability**.

---

## 0) Product North Star

Users should be able to:
1) **Drop in a dataset** (Excel/CSV/Parquet/JSON, later DB connectors).
2) **Ask for what they want** in natural language (“clean this, reshape, join, produce report-ready table”).
3) **See a proposed plan** (recipe + preview + warnings).
4) **Approve** (or edit) and run.
5) **Promote** ad hoc work into a **reusable rule-based program** (parameterized, schedulable, shareable).

**Key loop:**  
**Ad hoc session → Proposed recipe → Preview → Approval → Durable run → Versioned outputs → Save as Program**

---

## 1) Requirements (Non-Negotiable)

### 1.1 Ad hoc + Repeatable, both first-class
- **Ad hoc:** immediate transformations, exploration, “what’s inside this file?”
- **Repeatable:** saved recipes/programs with parameters, schedules, access controls, run logs

### 1.2 Safe, controlled “agentic + generative AI”
Agents must:
- Use **tools** (not free-form fantasies)
- Produce **structured outputs** (recipes, SQL, validations)
- Require **explicit approvals** for destructive/high-impact actions
- Be fully **observable** (tool traces, logs, run history)

### 1.3 Massive data capability
- Efficient ingest → canonical columnar storage
- Columnar compute engines
- Streaming/multipart uploads
- Long-running job orchestration

### 1.4 Multi-tenant security
- Tenant isolation everywhere
- Auditability of access, transformations, exports

---

## 2) Architecture Overview

### 2.1 High-level diagram

```text
                        ┌────────────────────────────────────┐
                        │           Web (Next.js)             │
                        │   XLCRACK theme / TAPECRACK theme   │
                        └────────────────────────────────────┘
                                      │
                                      │ HTTPS (JWT)
                                      ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                               API Gateway                                │
│                          (FastAPI monolith first)                         │
│  Auth ▪ Tenant Scope ▪ Dataset Catalog ▪ Query ▪ Recipes ▪ Agent ▪ Jobs   │
└──────────────────────────────────────────────────────────────────────────┘
          │                     │                       │
          │                     │                       │
          ▼                     ▼                       ▼
┌─────────────────┐   ┌───────────────────┐   ┌──────────────────────────┐
│ Postgres (RLS)  │   │ Object Storage     │   │ Temporal + Workers        │
│ tenants/users    │   │ S3/MinIO          │   │ ingest, recipe runs,      │
│ datasets/recipes │   │ raw + parquet     │   │ exports, schedules        │
│ audit/job states │   └───────────────────┘   └──────────────────────────┘
          │                     ▲                       │
          │                     │                       │
          │                     │                       ▼
          │            ┌────────────────────┐   ┌─────────────────────────┐
          │            │ DuckDB/Polars      │   │ Agent Service            │
          │            │ query + transform  │   │ tool calls + proposals   │
          │            └────────────────────┘   └─────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          Observability & Audit                            │
│  traces ▪ logs ▪ metrics ▪ run history ▪ data lineage ▪ approval records  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Monorepo layout

```text
/
  AGENTS.md
  README.md
  .agent/
    PLANS.md
    execplans/
      crackstack_v1.md
  infra/
    docker-compose.yml
    dev-secrets/
    nginx/ (optional)
  backend/
    app/
    tests/
    alembic/
    pyproject.toml
  web/
    apps/
      xlcrack/
      tapecrack/
    packages/
      ui/
      api-client/
    package.json
  ios/
    XLCRACK/
    TAPECRACK/
    Shared/
```

---

## 3) Data Model (Backend)

### 3.1 Core entities

**Tenant / workspace**
- `tenants(id, name, created_at, …)`

**Users & membership**
- `users(id, email, password_hash, created_at, …)`
- `memberships(id, tenant_id, user_id, role, created_at, …)`

**Datasets**
- `datasets(id, tenant_id, name, description, created_at, …)`
- `dataset_versions(id, tenant_id, dataset_id, version, parent_version_id, storage_uri, schema_json, row_count, created_at, …)`

**Uploads**
- `uploads(id, tenant_id, user_id, filename, content_type, size_bytes, storage_uri_raw, status, created_at, …)`

**Recipes (transform programs)**
- `recipes(id, tenant_id, name, description, steps_json, parameters_json, created_at, …)`
- `recipe_runs(id, tenant_id, recipe_id, status, started_at, finished_at, logs_uri, output_dataset_version_id, …)`

**Agent sessions**
- `agent_threads(id, tenant_id, user_id, brand, created_at, …)`
- `agent_events(id, tenant_id, thread_id, event_type, payload_json, created_at, …)`  
  (tool calls, proposals, approvals, errors)

**Audit**
- `audit_log(id, tenant_id, user_id, action, resource_type, resource_id, metadata_json, created_at, …)`

### 3.2 Multi-tenancy enforcement
- Every tenant-scoped table has `tenant_id`
- Postgres **Row Level Security** policies prevent cross-tenant reads/writes
- API sets tenant context from JWT claims (and optionally a tenant header for multi-tenant users)

---

## 4) Data Storage & Processing Strategy

### 4.1 Canonical storage format
- Raw uploads stored as-is (object storage)
- Canonical datasets stored as **Parquet** in object storage
- Versioning: each transformation produces a **new immutable dataset_version**

Why:
- Parquet is columnar and efficient for analytics
- Versioning makes everything auditable and reversible

### 4.2 Ingest pipeline
1) Upload raw file (multipart direct-to-object storage)
2) Create upload record + dataset record
3) Worker ingests:
   - Excel: read sheets → normalize headers → infer types → create tables
   - CSV/JSON: parse → infer schema
4) Write Parquet objects (partitioned if needed)
5) Record schema + stats in `dataset_versions`

### 4.3 Query layer (DuckDB)
- DuckDB runs server-side in worker pods
- Attaches Parquet paths for a dataset_version
- Executes safe queries (read-only for v1, later allow writes into new versions)
- Returns results with pagination and metadata

### 4.4 Transform layer (Recipe DSL + SQL)
Two transform modes (both supported, interoperable):
- **SQL Transform** (SELECT …) to produce new version
- **Recipe DSL** steps (validated JSON), e.g.
  - filter rows
  - select/rename columns
  - derive columns
  - join versions
  - group/aggregate

**Rule:** all transforms must be replayable and deterministic given inputs + parameters.

---

## 5) “Agent Playground” Design

### 5.1 Agent interaction contract (the key safety pattern)
Agents do not “do the work” directly. They:
1) Inspect schema + samples with tools
2) Propose a **structured recipe**
3) Provide a preview plan + warnings
4) Wait for approval
5) Trigger durable run via workflow engine

### 5.2 Tool catalog (strict, minimal, powerful)
Agents may call only these tools (v1 set):

- `list_datasets()`
- `get_schema(dataset_version_id)`
- `sample_rows(dataset_version_id, table, limit, seed)`
- `profile_columns(dataset_version_id, table)`
- `run_sql(dataset_version_id, sql, limit, offset)`
- `propose_recipe(intent_text, dataset_version_id)` → returns **steps_json + parameters + rationale + risk_flags**
- `validate_recipe(steps_json, dataset_version_id)` → returns warnings/errors
- `preview_recipe(steps_json, dataset_version_id)` → returns row counts + small sample diff
- `request_approval(summary, risk_flags)` → returns approval_token or rejection
- `run_recipe(recipe_id or steps_json, dataset_version_id, params, approval_token)`
- `export(dataset_version_id, format, options)`

### 5.3 Guardrails and approvals
- Anything that could:
  - delete rows
  - drop columns
  - change types
  - export sensitive subsets
  must require approval.
- Approvals are logged to `agent_events` + `audit_log`

### 5.4 Observability
Every agent action is recorded:
- tool calls + arguments
- tool results (redacted where needed)
- proposals + approval decisions
- run ids and outcomes

UI should show:
- an “agent timeline” (like a build log, but for data)

---

## 6) Durable Workflows (Temporal)

### 6.1 Why Temporal here
“Repeatable programs” are long-running, retryable, resumable, auditable processes.

### 6.2 Workflows to implement (v1)
- `IngestWorkflow(upload_id)`
- `RunRecipeWorkflow(recipe_run_id)`
- `ExportWorkflow(export_request_id)`
- Later:
  - schedules / cron
  - alerts on failure
  - dependency graphs (pipelines)

### 6.3 Idempotency patterns
- Each step accepts an idempotency key (upload_id, recipe_run_id)
- Writes create immutable versions and store “already done” markers

---

## 7) API Surface (FastAPI)

### 7.1 Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh` (optional)
- `GET /me`

### 7.2 Tenants
- `GET /tenants`
- `POST /tenants`
- `POST /tenants/{id}/switch` (if supporting multi-tenant user)

### 7.3 Uploads + datasets
- `POST /uploads/initiate-multipart`
- `POST /uploads/complete-multipart`
- `POST /datasets/from-upload/{upload_id}` (or auto-create)
- `GET /datasets`
- `GET /datasets/{dataset_id}`
- `GET /dataset-versions/{version_id}/schema`
- `GET /dataset-versions/{version_id}/preview`

### 7.4 Query
- `POST /dataset-versions/{version_id}/query`
  - body: `{ sql, limit, offset }`

### 7.5 Recipes
- `POST /recipes`
- `GET /recipes`
- `GET /recipes/{id}`
- `POST /recipes/{id}/run`
- `GET /recipe-runs/{run_id}`
- `GET /recipe-runs/{run_id}/logs`

### 7.6 Agent
- `POST /agent/threads`
- `POST /agent/threads/{id}/chat`
- `POST /agent/threads/{id}/approve`

### 7.7 Export
- `POST /exports`
- `GET /exports/{id}`
- `GET /exports/{id}/download` (presigned URL)

---

## 8) Web App (Next.js)

### 8.1 Core screens (v1)
- Login
- Dataset Catalog
- Dataset Detail
  - schema view
  - preview table (virtualized grid)
  - profiling panel (nulls, distinct, min/max basic)
- SQL Workspace
  - editor
  - results grid
  - save query as recipe (optional)
- Recipe Builder
  - step list
  - parameter editor
  - validate + preview
  - run
- Agent Playground
  - chat + timeline
  - proposal cards (editable JSON + human-readable summary)
  - approve/reject
- Run History
  - runs with logs, artifacts, links to outputs

### 8.2 Branding
Both brands share UI components but differ in:
- name, logo, color system, microcopy tone
- default landing & onboarding path
- feature framing (XLCRACK = “fix messy Excel fast”, TAPECRACK = “automation and pipelines”)

Implementation approach:
- `BRAND=xlcrack|tapecrack`
- theme tokens per brand
- build targets per domain

---

## 9) iOS App (SwiftUI)

### 9.1 Two targets
- `XLCRACK` bundle id + app icon
- `TAPECRACK` bundle id + app icon
Shared:
- networking layer
- authentication flow
- dataset browsing
- agent chat timeline

### 9.2 Mobile scope (v1)
Keep iOS scope tight but premium:
- Login
- Dataset list + dataset detail (schema + preview)
- Agent chat + approve proposals
- Run history summary

Do not attempt full SQL editor on v1 mobile; provide “saved queries/recipes” and “agent-driven changes.”

---

## 10) Security, Compliance, and Safety (Baseline)

### 10.1 Security basics
- TLS everywhere
- JWT access tokens with rotation (optional refresh tokens)
- Argon2 password hashing
- RLS in Postgres
- Object storage paths are tenant-scoped and never guessable
- Presigned URLs short-lived

### 10.2 Data governance
- Immutability via dataset versions
- Audit trail of:
  - imports
  - transformations
  - exports
  - approvals
  - access

### 10.3 Safety for agent actions
- The agent must never execute destructive steps without approval
- Show warnings and preview diffs
- Require “reason for export” for sensitive exports (optional but strong)

---

## 11) Performance & Scaling Plan

### 11.1 Horizontal scaling points
- API server: stateless scale-out
- Workers: scale for ingestion and recipe runs
- Query compute: separate worker pool for heavy queries

### 11.2 Storage scaling
- Object storage handles large payloads
- Parquet partitioning strategy for huge datasets (by date, tenant, dataset)

### 11.3 “Local-first” optional mode (later)
- Offer DuckDB-Wasm in browser for small datasets
- Reduces server load and increases privacy posture

---

## 12) Roadmap (Pragmatic)

### v1 (ship)
- Auth + tenants + RLS
- Upload + ingest to Parquet
- DuckDB query
- Recipes + versions
- Temporal workflows
- Agent proposals + approvals
- Web app with core screens
- iOS app with core screens

### v1.5 (delight)
- Better profiling + anomaly detection
- Join suggestions
- Semantic labeling (ID/date/currency)
- Dataset documentation auto-gen
- Collaboration (comments, sharing recipes)

### v2 (platform)
- Connectors (DBs, warehouses)
- Marketplace for tools (MCP-like connector pattern)
- Scheduling/alerts/pipelines UI
- Multi-agent “assembly line” flows

---

# PART II: Codex Multi-Stage Development Program (Backend → Web → iOS)

This section is designed to be pasted into Codex as a **staged build program**.

## A) Repo-level control file: `AGENTS.md` (paste into repo root)

```md
# AGENTS.md (Repository Rules for Codex)

You are Codex operating inside this repository.

## Prime Directive
Build a production-grade multi-tenant agentic data platform powering two branded clients (XLCRACK and TAPECRACK). Backend first, then web, then iOS.

## Planning Rule (ExecPlans)
For any milestone beyond trivial changes, you MUST:
1) Create or update an ExecPlan in `/.agent/execplans/<name>.md`
2) Break work into milestones with:
   - explicit commands to run
   - acceptance criteria (observable behaviors)
   - tests to add

## Quality Rules
- Multi-tenant isolation must be enforced in the database (RLS) and tested.
- Keep secrets out of git.
- Any new endpoint must have:
  - request/response models
  - validation
  - tests
- Prefer small PR-sized changes; run tests + lint after each milestone.

## Stop Rule
After each milestone:
- run checks
- fix failures
- update the ExecPlan with completion status and evidence
Then stop.
```

## B) ExecPlan specification: `/.agent/PLANS.md`

```md
# ExecPlan Format

Each plan lives in: `/.agent/execplans/<plan_name>.md`

## Required sections
1) Goal
2) Architecture constraints (tech choices locked)
3) Milestones
   - Description
   - Commands to run
   - Acceptance criteria
   - Tests required
4) Risks & mitigations
5) Rollback strategy
6) Progress log (timestamped)

Milestone acceptance criteria must be demonstrable using commands or UI steps.
```

## C) The first ExecPlan: `/.agent/execplans/crackstack_v1.md`

```md
# ExecPlan: crackstack_v1

## Goal
Deliver a v1 of the unified backend plus two branded clients:
- Web: xlcrack + tapecrack
- iOS: XLCRACK + TAPECRACK

## Locked Tech Choices
- Python 3.12 + FastAPI + Pydantic
- SQLAlchemy + Alembic + Postgres + RLS
- Redis
- S3/MinIO for object storage
- Parquet canonical storage
- DuckDB for query/transform
- Polars for ingestion
- Temporal for durable workflows
- OpenAI Agents SDK + Responses integration behind /agent endpoints
- Web: Next.js + TypeScript
- iOS: SwiftUI

## Milestones

### M0: Bootstrapping & local dev infra
**Deliverables**
- monorepo structure created
- docker-compose: postgres, redis, minio, temporal dev server
- Makefile/tasks: `make up`, `make test`, `make lint`

**Commands**
- `docker-compose up`
- `make -C backend test`
- `make -C backend lint`

**Acceptance**
- all services start
- backend test suite executes (even minimal placeholder)

---

### M1: Auth + tenants + RLS + core models
**Deliverables**
- auth endpoints (register/login)
- tenants/users/memberships tables
- RLS policies for tenant isolation
- integration test proving isolation

**Acceptance**
- tenant A cannot read/write tenant B data

---

### M2: Uploads + ingest to Parquet + dataset catalog
**Deliverables**
- multipart presigned upload flow
- ingestion worker creates dataset_version parquet
- schema + preview endpoints

**Acceptance**
- upload .xlsx → Parquet created → preview works

---

### M3: Query + recipes + versioning
**Deliverables**
- query endpoint using DuckDB against Parquet
- recipe DSL + SQL transform
- new dataset version per run

**Acceptance**
- transformation creates new immutable dataset version

---

### M4: Temporal workflows for ingest/run/export
**Deliverables**
- Temporal worker and workflows
- job/run tracking and resumability

**Acceptance**
- restart worker mid-run; run completes

---

### M5: Agent service + tool catalog + approvals + tracing
**Deliverables**
- /agent threads + chat endpoints
- strict tools only
- proposal → approve → run
- trace timeline persisted

**Acceptance**
- dataset → ask for transform → proposal → approve → new version

---

### M6: Web apps (two brands)
**Deliverables**
- Next.js app(s) with brand switching
- dataset browsing + agent panel + approvals
- run history

**Acceptance**
- end-to-end in browser

---

### M7: iOS apps (two targets)
**Deliverables**
- SwiftUI app for each brand
- shared API client module
- dataset browse + agent approve

**Acceptance**
- builds in Xcode and connects to backend

---

## Risks & Mitigations
- Huge Excel files: require streaming ingest, memory limits, row chunking.
- Agent hallucination: strict tool-use, validation, approvals.
- Query abuse: read-only default, timeouts, row limits, per-tenant quotas.

## Rollback Strategy
- Immutable dataset versions; revert by pointing to prior version.
- Recipes are versioned; keep history.

## Progress Log
- [ ] M0
- [ ] M1
- [ ] M2
- [ ] M3
- [ ] M4
- [ ] M5
- [ ] M6
- [ ] M7
```

---

# PART III: Codex Stage Prompts (Copy/Paste)

## Prompt 0: Bootstrap repo + planning scaffolding (run first)

```text
You are Codex in a repo workspace. Create the monorepo structure and local dev infrastructure.

Tasks:
1) Create directories: backend, web, ios, infra, .agent/execplans
2) Add docker-compose with:
   - postgres
   - redis
   - minio
   - temporal dev server (or temporal + ui if easy)
3) Add root AGENTS.md, .agent/PLANS.md, .agent/execplans/crackstack_v1.md per this document.
4) Add README with exact commands:
   - start infra
   - run backend tests
   - start web dev server (placeholder ok)
5) Ensure backend has minimal python project scaffolding and a placeholder test that passes.

After creating these, stop. Do NOT begin feature implementation yet.
Run the commands you claim work and fix failures.
```

## Prompt 1: Backend M1 (Auth + RLS)
```text
Execute Milestone M1 from /.agent/execplans/crackstack_v1.md.

Implement:
- FastAPI skeleton with /health
- Postgres + Alembic migrations for tenants/users/memberships/audit_log
- Argon2 password hashing and JWT auth endpoints
- Tenant scoping from JWT claims
- Postgres RLS policies and integration tests proving tenant isolation

Run lint/test and fix failures. Update ExecPlan progress log with evidence. Stop.
```

## Prompt 2: Backend M2 (Uploads + ingest)
```text
Execute Milestone M2.

Implement:
- direct-to-object-storage multipart upload via presigned URLs
- upload tracking table
- ingest worker: excel/csv/json/parquet → canonical Parquet
- dataset catalog endpoints: list, schema, preview
- tests with at least one Excel fixture

Run lint/test and fix failures. Update ExecPlan. Stop.
```

## Prompt 3: Backend M3 (Query + recipes + versioning)
```text
Execute Milestone M3.

Implement:
- DuckDB query endpoint against Parquet (safe SELECT only)
- Recipe DSL with validation
- SQL Transform step
- Each run creates new dataset_version and lineage links
- integration test: ingest → query → recipe → query

Run lint/test and fix failures. Update ExecPlan. Stop.
```

## Prompt 4: Backend M4 (Temporal)
```text
Execute Milestone M4.

Implement:
- Temporal worker + workflows for ingest and recipe runs (and export if feasible)
- run tracking updates progress
- demonstrate resumability after worker restart

Run lint/test. Update ExecPlan. Stop.
```

## Prompt 5: Backend M5 (Agent service)
```text
Execute Milestone M5.

Implement:
- /agent/threads create/list
- /agent/threads/{id}/chat with strict tool catalog
- agent proposes structured recipe and requests approval for risky actions
- /agent/threads/{id}/approve to provide approval token
- trace stored in agent_events + audit_log

Run lint/test and fix failures. Update ExecPlan. Stop.
```

## Prompt 6: Web M6
```text
Execute Milestone M6.

Implement Next.js web client(s):
- brand switching via BRAND env var
- login
- dataset catalog + detail + preview grid
- agent chat timeline + proposal card + approve/reject
- run history

Acceptance: end-to-end ingest → propose → approve → output visible.

Run typecheck/lint/tests. Update ExecPlan. Stop.
```

## Prompt 7: iOS M7
```text
Execute Milestone M7.

Implement SwiftUI iOS apps with two targets:
- XLCRACK and TAPECRACK bundle ids and branding
- shared API client module
- login
- dataset list + detail (schema + preview)
- agent chat timeline + approve/reject

Build in Xcode. Update ExecPlan with build evidence. Stop.
```

---

# PART IV: Brand Differentiation Cheatsheet

## XLCRACK (xlcrack.com)
- Tone: “fast, punchy, power-user friendly”
- Framing: “crack messy spreadsheets into clean truth”
- Defaults:
  - onboarding: upload Excel
  - agent templates: cleaning, reshaping, reporting

## TAPECRACK (tapecrack.app)
- Tone: “systems, automation, reliability”
- Framing: “crack duct-taped pipelines into reusable programs”
- Defaults:
  - onboarding: create first program/recipe
  - agent templates: scheduled runs, parameterized transformations

---

# PART V: What makes this ‘way beyond Cheshire Cat’

✅ Agents are not a chatbot skin. They are **operational**, constrained by tools.  
✅ Everything is **versioned**, **audited**, **replayable**.  
✅ Repeatability is built-in via Temporal durable workflows.  
✅ You get a true “playground” that can scale into a platform.

If you want, the next add-on document can be:
- a complete JSON schema for Recipe DSL
- an OpenAPI spec for all endpoints
- UI wireframes per screen (web + iOS)
