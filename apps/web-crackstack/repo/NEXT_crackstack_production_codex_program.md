# Crackstack Production Schema Transform (XLCRACK + TAPECRACK)
*A Codex Program for building the “it just works” agentic schema-transform product.*

> **Scope:** Rework and harden the existing Crackstack repo into a production-grade, multi-tenant data transformation platform with two branded clients (XLCRACK + TAPECRACK).  
> **Core promise:** Upload a file → system understands schema → user chooses export schema or uploads a template → system maps + previews → export → optionally save as reusable workflow.

---

## Table of Contents
- [Mission](#mission)
- [Product Requirements](#product-requirements)
- [Repo Constraints](#repo-constraints)
- [Non-negotiable Product Principles](#non-negotiable-product-principles)
- [Stage 0: Recon + Freeze Current Behavior](#stage-0-recon--freeze-current-behavior)
- [Stage 1: Data Ingestion + Canonical Dataset Model](#stage-1-data-ingestion--canonical-dataset-model)
- [Stage 2: Schema Inference + Template Schema Extraction](#stage-2-schema-inference--template-schema-extraction)
- [Stage 3: Mapping Engine + LLM Suggestion Layer](#stage-3-mapping-engine--llm-suggestion-layer)
- [Stage 4: Whizz-bag Web UI](#stage-4-whizz-bag-web-ui)
- [Stage 5: Accounts + Workflow Persistence](#stage-5-accounts--workflow-persistence)
- [Stage 6: Production Hardening](#stage-6-production-hardening)
- [Stage 7: iOS Readiness](#stage-7-ios-readiness)
- [Stage 8: Docker Rebuild + Start + Fix Errors (Final Gate)](#stage-8-docker-rebuild--start--fix-errors-final-gate)
- [Guardrails (Codex Must Follow)](#guardrails-codex-must-follow)
- [Codex Agent Team Setup](#codex-agent-team-setup)
- [Execution Order (Codex Must Follow)](#execution-order-codex-must-follow)
- [Definition of Done (Ship Criteria)](#definition-of-done-ship-criteria)
- [Optional Enhancements](#optional-enhancements)

---

## Mission
Transform Crackstack into a production-ready, multi-tenant agentic data transformation app where:

1. User uploads an Excel/CSV file  
2. System **infers schema** and **profiles data** automatically  
3. User chooses one of two flows:
   - **Flow A: Export Scheme Picker** (graphical mapping using inferred schema)
   - **Flow B: Template Upload** (user uploads desired schema/template, system maps source → template)
4. User sees a **whizz-bag schema UI** showing:
   - detected columns/types/keys
   - suggested mappings (with confidence + evidence)
   - preview of transformed output
   - validation warnings
5. User exports:
   - CSV in new schema, or
   - Excel shaped like the uploaded template schema
6. If logged in, user can save as a **Workflow**
   - next time: upload file → select workflow → export (no mapping/template step)

Preserve:
- Two brands (XLCRACK, TAPECRACK) sharing one backend
- LocalAI LLM integration
- Current repo layout + monorepo approach

Add:
- Production-grade file handling, schema inference, mapping engine, workflow persistence, previews, guardrails, tests.

---

## Product Requirements

### User Flows

#### Flow A: Export Scheme Picker
- Upload dataset
- Platform profiles schema
- User chooses a target schema from:
  - predefined “export schemes” (app-managed), and/or
  - schema built interactively in UI (optional later)
- Platform maps and previews
- Export CSV

#### Flow B: Template Upload (Magic Mapping)
- Upload dataset
- Upload template file (Excel/CSV) that represents desired schema
- Platform extracts target schema from template
- Platform maps source → target (deterministic + LLM assisted suggestions)
- Preview
- Export:
  - CSV in target schema, and/or
  - Excel shaped like template schema

#### Workflow Save (Logged-in)
- After successful mapping, user saves:
  - target schema definition
  - mapping rules
  - parsing tolerances
- Next time:
  - upload dataset → pick workflow → preview → export

### “It Just Works” Expectations
- Schema understanding appears quickly via deterministic profiling.
- LLM is a *planner* not an executor.
- Every export is reproducible via saved Transform Spec.
- UI makes mapping feel obvious and trustworthy.

---

## Repo Constraints
Use the existing layout:

```
/infra
/backend
  app/ (FastAPI)
  tests/
/web
  apps/xlcrack
  apps/tapecrack
  packages/ui
  packages/api-client
/ios
  XLCRACK/
  TAPECRACK/
  Shared/
```

Rules:
- Do not create a second backend.
- Do not duplicate UI packages between brands.
- Brand differences should be theming + copy, not duplicated logic.

---

## Non-negotiable Product Principles
- **Deterministic core:** LLM suggests; system executes deterministically.
- **Reproducible transforms:** each export links to a versioned Transform Spec.
- **Explainability:** confidence + evidence for mappings.
- **Privacy + safety:** do not send raw dataset to LLM beyond summaries + tiny samples.
- **Fast first impression:** profiling is local and quick; LLM is optional enhancement.

---

## Stage 0: Recon + Freeze Current Behavior
**Goal:** Understand current endpoints, agent thread model, and web shells. Lock current behavior with tests.

### Tasks
- Read:
  - `AGENTS.md`
  - `/.agent/PLANS.md`
  - `/.agent/execplans/crackstack_v1.md`
- Inspect backend:
  - thread creation endpoints
  - chat endpoint behavior
  - any existing file upload endpoints (if none, create in Stage 1)
- Inspect web apps/packages:
  - current routing
  - placeholder pages
  - api-client usage
- Add smoke tests:
  - backend starts
  - `/health` returns ok
  - existing `/agent/threads` flow still works

### Acceptance Criteria
- `make up` boots infra
- `make test` passes
- Existing agent endpoints still function

### Deliverables
- `backend/tests/test_smoke.py`
- `docs/BASELINE.md` describing current flows

---

## Stage 1: Data Ingestion + Canonical Dataset Model
**Goal:** Robust upload pipeline and canonical dataset representation.

### Architecture Decisions
- Store uploads in object storage:
  - Dev: local filesystem volume
  - Prod-ready: MinIO option in `/infra/docker-compose.yml`
- Track metadata + profiling in DB:
  - Prefer Postgres in infra (add if missing)
- Parse Excel:
  - `openpyxl` for `.xlsx`
  - `pandas` optionally for flexible parsing
- Support `.xlsx`, `.xls`, `.csv` first.

### Backend Entities
- **Tenant**: based on brand (xlcrack/tapecrack)
- **User**: optional initially but must support workflow ownership
- **Dataset**
  - id, tenant, user_id nullable
  - filename, storage_key, created_at
  - row_count, column_count, sheet_name (if excel)
  - parse_warnings
- **DatasetProfile**
  - dataset_id
  - inferred_schema JSON
  - stats JSON (null %, uniques, min/max)
  - sample_rows JSON (sanitized, limited)
- **TransformSpec**
  - dataset_id
  - mapping JSON (source→target + transforms)
  - template_id optional
  - created_at
- **Workflow**
  - tenant_id, user_id
  - name, description
  - transform_recipe JSON (reusable mapping + tolerances)
  - created_at, updated_at

### Required Endpoints (FastAPI)
- `POST /datasets/upload` (multipart) → `{ dataset_id }`
- `POST /datasets/{id}/profile` → triggers profiling (sync first; async later)
- `GET /datasets/{id}/profile`
- `POST /templates/upload` (multipart) → `{ template_id, extracted_schema }`
- `POST /transforms/plan`
  - input: `dataset_id`, mode: `scheme|template`, optional `template_id`
  - output: mapping suggestion + warnings
- `POST /transforms/preview`
  - input: mapping draft/spec
  - output: preview rows + validation issues
- `POST /transforms/export`
  - output: download link or streamed export
- `POST /workflows`
- `GET /workflows`
- `POST /workflows/{id}/run`
  - input: `dataset_id`
  - output: mapping plan + export options

### Acceptance Criteria
- Upload Excel works reliably.
- Profile produces consistent schema JSON.
- LLM not required yet.
- Tests cover upload + profile.

---

## Stage 2: Schema Inference + Template Schema Extraction
**Goal:** Build “understand schema” engine + consistent schema format for dataset/templates.

### Canonical Schema JSON Contract
Use a single schema format everywhere:

```json
{
  "tables": [
    {
      "name": "Sheet1",
      "columns": [
        {
          "name": "Order Date",
          "canonical_name": "order_date",
          "type": "date|datetime|int|float|string|bool|category",
          "nullable": true,
          "example_values": ["2024-01-02", "2024-01-03"],
          "stats": { "null_pct": 0.02, "unique": 120 }
        }
      ],
      "primary_key_candidates": ["order_id"],
      "notes": ["Detected currency symbols in revenue"]
    }
  ],
  "inference_version": "1.0"
}
```

### Template Extraction Rules
When a user uploads a “desired schema template”:
- Excel: interpret header row(s) + sheet names as target schema
- CSV: header row is target schema columns
- Store extracted schema in a Template entity.

### Acceptance Criteria
- Dataset and template schemas share the exact JSON contract.
- Template upload returns extracted schema quickly.
- Schema inference handles:
  - header normalization
  - type inference (dates/currency/percent)
  - mixed types flagged as warnings

---

## Stage 3: Mapping Engine + LLM Suggestion Layer
**Goal:** Accurate source→target mapping with LLM used only for suggestions.

### 3A. Deterministic Mapping Engine
Implement mapping strategies:
- exact name match (normalized)
- fuzzy match (rapidfuzz)
- value-pattern match (date-like, currency-like)
- optional embeddings match later
- transform library:
  - trim, lowercase, uppercase
  - parse_date, parse_currency, parse_percent
  - split, join
  - coalesce columns
  - category mapping via dictionary
  - computed columns via a safe expression subset (optional)

Mapping output format:

```json
{
  "target_columns": [
    {
      "target": "order_date",
      "source": ["Order Date"],
      "transform": [{"op":"parse_date","args":{"dayfirst":false}}],
      "confidence": 0.92,
      "evidence": ["name_fuzzy=0.89", "values_look_like_date=0.97"]
    }
  ],
  "unmapped_source_columns": ["Notes"],
  "unfilled_target_columns": ["region_code"],
  "warnings": ["Revenue has mixed currency symbols"]
}
```

### 3B. LLM Suggestion Layer (LocalAI)
- Provide LLM only:
  - schema summaries
  - column names + inferred types + tiny sample values
- LLM returns mapping JSON in the same contract
- Validate LLM output:
  - targets must exist
  - sources must exist
  - transforms must be allowlisted
  - reject unsafe expressions

### Acceptance Criteria
- Without LLM, mapping works using heuristics.
- With LLM, mapping improves but never violates safety rules.
- Mapping outputs are stable and testable.

---

## Stage 4: Whizz-bag Web UI
**Goal:** UI feels like it understands the data.

### Pages (Shared components, branded shells)
1. Landing / Upload  
2. Dataset Profile
   - columns, types, null %, unique count, sample values
3. Choose Flow
   - A: Pick export schema
   - B: Upload template
4. Mapping Studio (whizz-bag)
   - source schema (left)
   - target schema (right)
   - suggested mappings (center)
   - warnings panel
   - preview table
5. Export
   - CSV
   - Excel template-shaped
6. Workflow Save (if logged in)
7. Workflow Run

### UI Requirements
- Put reusable components in `/web/packages/ui`
- Brand theming via tokens/config per app
- Mapping UI MVP:
  - list + dropdown “mapped to” editor
- Structure for later enhancement:
  - visual connectors graph

### Acceptance Criteria
- Upload → profile → mapping → preview → export works smoothly.
- Confidence + warnings visible.
- Exports download reliably.

---

## Stage 5: Accounts + Workflow Persistence
**Goal:** Workflows are the reason to sign up.

### Auth
Implement a production-friendly baseline:
- JWT auth with refresh tokens
- `User` table
- workflow ownership by user + tenant

### Workflow Definition
Workflow stores:
- target schema definition
- explicit mapping rules
- tolerances:
  - accept extra columns
  - required columns
  - parsing preferences

Workflow run:
- upload dataset
- apply stored mapping
- if mismatch: show “needs attention” + suggested fixes

### Acceptance Criteria
- Login works.
- User can save workflow from successful mapping.
- Workflow can be reused with new dataset without template upload/remapping.

---

## Stage 6: Production Hardening
**Goal:** Reliability, safety, observability, and tenant isolation.

### Requirements
- Background jobs for large work:
  - profiling
  - preview
  - export
- Limits:
  - max upload size (configurable)
  - preview row limit
- Observability:
  - structured logs
  - request IDs
  - timing metrics for parse/profile/map/export
- Security:
  - sanitize filenames
  - protect against CSV/Excel formula injection
  - do not log sensitive payloads
- Multi-tenant enforcement:
  - tenant derived from API key and/or user org
  - scope all queries to tenant

### Acceptance Criteria
- Large files do not lock web requests.
- Tenant isolation enforced everywhere.
- Tests cover auth and tenant scoping.

---

## Stage 7: iOS Readiness
**Goal:** Backend supports the same flow from iOS.

### Requirements
- CORS configured correctly
- Export via streaming or pre-signed links
- OpenAPI is accurate and complete
- Stable identifiers: dataset_id, transform_id, workflow_id

### Acceptance Criteria
- iOS client can:
  - upload dataset
  - fetch profile
  - plan transform
  - fetch preview
  - export

---

## Stage 8: Docker Rebuild + Start + Fix Errors (Final Gate)
**Goal:** Fresh build works, services start, errors resolved, tests pass.

### Requirements
- `make up` boots:
  - backend
  - web dev servers or built web container (choose one)
  - DB
  - storage (minio optional)
- Provide:
  - `make down`
  - `make reset` (wipe dev volumes safely)

Codex must run:
- `docker compose build --no-cache`
- `docker compose up -d`
- run smoke tests and fix issues until green

### Acceptance Criteria
- Fresh clone → `make up` works
- Backend + web both usable
- No red errors in logs
- `make test` + `make lint` pass

---

## Guardrails (Codex Must Follow)
1. LLM never executes transforms; it only proposes mapping JSON.
2. Transform execution is deterministic and validated.
3. Canonical schema JSON contract is used everywhere.
4. Multi-brand:
   - shared backend
   - shared packages
   - brand shells only for theming/copy
5. No stage is done without tests.
6. Keep code style consistent and linted.

---

## Codex Agent Team Setup
Run agents in parallel per stage with clear ownership.

### Agent A: Backend Core (Data, Schema, Mapping)
Owns:
- upload + storage
- profiling + schema inference
- mapping engine + validator
- transform executor + export
- tests

### Agent B: Web Product UX (Whizz-bag UI)
Owns:
- shared pages + components
- mapping editor + preview
- brand wiring and tokens

### Agent C: Auth + Workflows
Owns:
- JWT auth
- workflow CRUD
- workflow run flow
- web workflow screens

### Agent D: Infra + Hardening
Owns:
- docker-compose + Makefile
- env config
- logging/metrics
- job runner/worker (if used)
- security and ops docs

### Coordination Rule
Before implementing interfaces, agents must agree on:
- schema JSON contract
- mapping JSON contract
- endpoint signatures

Write these into `docs/CONTRACTS.md` and treat it as source-of-truth.

---

## Execution Order (Codex Must Follow)
1. Stage 0 baseline tests
2. Stage 1 upload + dataset entities + profiling
3. Stage 2 canonical schema + template extraction
4. Stage 3 mapping engine + LLM suggestion + validation
5. Stage 4 web UI for profile/mapping/preview/export
6. Stage 5 auth + workflows
7. Stage 6 hardening + security + tenant enforcement
8. Stage 7 iOS readiness docs + endpoint polish
9. Stage 8 docker rebuild + start + fix errors until green

---

## Definition of Done (Ship Criteria)
- ✅ Upload Excel/CSV works
- ✅ Schema inferred and shown in UI
- ✅ Both flows work:
  - export scheme picker
  - template upload mapping
- ✅ Mapping suggested + editable + previewable
- ✅ Export to CSV and template-shaped Excel works
- ✅ Logged-in users can save workflows and reuse them
- ✅ Multi-tenant enforced (xlcrack vs tapecrack)
- ✅ Full docker rebuild/start succeeds; tests/lint pass
- ✅ Docs exist for deploy + API + security

---

## Optional Enhancements
Only after core is solid:

- Embeddings-based semantic mapping for column names
- Multi-sheet and multi-table support with joins
- Column-level lineage visualization
- Versioned workflows + rollback
- Org/team sharing of workflows
- “Schema library” marketplace across brands
