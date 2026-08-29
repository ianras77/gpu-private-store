# ExecPlan: Crackstack Next

## Goal

Evolve the existing single Crackstack backend into a durable, provider-neutral, deterministic data workspace powering XLCRACK and TAPECRACK through shared workflows and shared UI packages.

## Architecture constraints

- One FastAPI backend and one data/ intelligence platform for both brands.
- PostgreSQL/RLS remains the tenant boundary.
- Parquet remains canonical storage; DuckDB/Polars remain deterministic execution tools.
- Temporal is the durable workflow backbone; no Celery, Kafka, Kubernetes, or second durable agent engine.
- AI proposes typed intent/plans; validators and deterministic engines execute.
- Saved flows must run without an AI provider.
- Secrets stay external; no raw data in operational logs.
- Small milestones only; after each milestone run checks, document evidence, and stop.

## Milestones

### M0 — Audit and rollback checkpoint

Commands: `git status --short`, `git rev-parse HEAD`, `docker compose ps --all`, `python3 -m pytest -q -r s` from `backend`, `npm run build` from `web`.

Acceptance: current architecture, runtime state, test/build blockers, and rollback commit are documented in `docs/architecture/CURRENT-STATE-AUDIT.md`.

Tests: run existing backend and web suites; add no product code.

### M1 — Provider-neutral AI boundary

Implement `AIProvider`, request/response/capability models, `OpenAICompatibleProvider`, explicit `OpenAIProvider` configuration, role-based model selection, conservative capability probing, and a compatibility adapter for existing LocalAI tests/routes.

Commands: `python3 -m pytest -q -r s`, `python3 -m ruff check .` from `backend`.

Acceptance: existing agent behavior remains compatible; provider selection uses neutral settings; no workflow code depends on `LocalAIClient`.

Tests: provider URL/auth/payload tests, capability parsing, role mapping, timeout/error classification, and compatibility regression tests.

### M2 — Canonical Crack domain contracts

Add strict Pydantic models for fingerprint/profile/intent/plan/preview/quality/flow/approval/artifact/lineage and use them at new boundaries.

Acceptance: malformed plans and unsafe transform specs fail validation before execution.

Tests: model contract and transform-risk validation tests.

### M3 — Temporal workflow foundation

Add worker, `DataCrackWorkflow`, activities, durable state, retry policy, cancellation, queries, and test worker recovery.

Acceptance: an observed upload/profile/plan/preview/execute/verify run resumes after worker restart without duplicate versions or exports.

Tests: Temporal workflow/activity tests and idempotency/recovery tests.

### M4 — Profiler, fingerprint, typed transform/quality engine

Deepen type-aware profiling, structural fingerprints, strict transform DSL, deterministic preview, quality rules, verification, and risk classification.

Acceptance: messy CSV/XLSX vertical slice produces before/after evidence and refuses unsafe output.

### M5 — Durable approvals and product event protocol

Persist approvals/events, signal Temporal workflows, add SSE with sequence-based reconnect, and retain compatibility routes.

### M6 — Shared Visual Crack Canvas

Decompose `AgentWorkbench` into shared canvas/sidebar/inspector/preview/timeline/mapping/quality components with accessible non-graph alternatives.

### M7 — Crack Flows and deterministic repeatability

Version saved flows, recognize fingerprints, visualize drift, adapt only with explicit confirmation, and execute saved flows without AI.

### M8 — XLCRACK/TAPECRACK specialization and hardening

Apply typed brand configuration, spreadsheet-first XLCRACK UX, recurring-feed TAPECRACK UX, security/performance/recovery qualification, deployment pinning, and final release evidence.

## Risks and mitigations

- Legacy tests patch `LocalAIClient`: retain a compatibility symbol until tests and callers migrate.
- Temporal is not currently wired: prove worker/runtime before changing product claims.
- Provider feature differences: capability-gate tools, streaming, and structured output.
- Existing dirty sibling worktree: scope edits strictly to `repo/` Crackstack files.
- Large files and sensitive data: bounded samples, server-side queries, immutable artifacts, and redacted logs.

## Rollback strategy

Rollback checkpoint is commit `86d8bd0c79a06054f2b7f28a6a20d2e040bcd4fb`, recorded before implementation. Keep migrations additive and feature-flag new workflow paths; preserve legacy agent/workstream routes during migration. Never mutate raw dataset versions.

## Progress log

- [x] 2026-08-23 M0 audit captured; no Crackstack containers running; web build blocked by missing dependencies; Temporal worker absent; rollback commit recorded.
- [x] 2026-08-23 M1 provider-neutral boundary: added explicit provider capabilities, role mapping, OpenAI-compatible and OpenAI provider variants, configured-provider selection, and legacy LocalAI adapter; full suite `14 passed, 15 skipped`; Ruff clean.
- [x] 2026-08-23 M2 canonical Crack contracts: added strict Pydantic models for state, profile, fingerprint, intent, plan, transforms, preview, quality, flows, approvals, artifacts, and lineage. Contract tests pass (`6 passed` targeted); arbitrary code operations and unknown plan fields are rejected.
- [~] 2026-08-23 M3 Temporal foundation started: added typed `DataCrackWorkflow` shell, task queue contract, retry classification, and deterministic activity idempotency keys. Temporal SDK is not installed in the current host environment, so live worker registration/recovery remains unverified.
- [ ] M4 profiler and transform/quality engine.
- [ ] M5 approvals and events.
- [ ] M6 Visual Crack Canvas.
- [ ] M7 Crack Flows.
- [ ] M8 brand specialization and hardening.
- [x] 2026-08-29 closeout: committed as `25ee0f7d`, pushed to `origin/codex/rassys-2.0`, and deployed through Runtipi as `web-crackstack:gpu-private-store`. Live probes passed: backend `/health` 200, XLCRACK `3212` 200, TAPECRACK `3213` 200; Postgres healthy and Temporal running. The Temporal SDK worker/recovery implementation remains intentionally unfinished.
