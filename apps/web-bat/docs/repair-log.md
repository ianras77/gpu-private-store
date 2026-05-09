# Repair Log

## 2026-03-13

| Timestamp (UTC) | File changed | Why changed | Issue addressed | Expected effect |
|---|---|---|---|---|
| 21:16 | `apps/api/src/config.py` | Added explicit runtime knobs for search, embedding, retrieval, ingestion thresholds, and X API base URL | Hidden/missing config, weak control of quality/fallback behavior | Predictable config surface and safer defaults |
| 21:18 | `apps/api/src/services/structured_logging.py` | Added reusable JSON event logging helper | Black-box behavior and weak observability | Consistent structured logs across pipeline stages |
| 21:19 | `apps/api/src/services/search_client.py` | Implemented normalized search client with retries, dedupe, blocked domains, debug metadata | Search integration fragility + junk result passthrough | Reliable search adapter and debuggable discovery behavior |
| 21:19 | `apps/api/src/services/search_connector.py` | Rewired connector to use robust search client | Legacy silent-empty behavior | Clear search outputs and optional debug payload |
| 21:22 | `apps/api/src/services/ingestion_service.py` | Rebuilt ingestion filters/quality scoring/chunk metadata/summary counters | Irrelevant ingestion, weak source quality control, no stage-level transparency | Cleaner source corpus and clear skip/failure metrics |
| 21:23 | `apps/api/src/services/fetcher.py` | Added explicit success/failure logging and error payload | Silent fetch failures | Actionable fetch diagnostics |
| 21:24 | `apps/api/src/services/qdrant_service.py` | Added result checks + structured logs for collection and point upsert | Silent vector store failures | Visible vector write failures and collection state |
| 21:25 | `apps/api/src/services/embedding_service.py` | Added controlled fallback behavior and per-chunk failure handling | Junk/hidden embedding failures | Explicit embedding quality posture and safer vector writes |
| 21:26 | `apps/api/src/services/x_connector.py` | Added logging and explicit skip/failure events | Undiagnosed X research no-op behavior | Traceable X ingestion path |
| 21:26 | `apps/api/src/services/social_dispatcher.py` | Added dispatch success/failure logging | Opaque publish adapter behavior | Clear social publish/dry-run traceability |
| 21:28 | `apps/api/src/services/retrieval_service.py` | Added retrieval bundle assembly from vectors + source quality + trends/themes | Weak context continuity for editorial generation | Better grounded synthesis context |
| 21:30 | `apps/api/src/services/cat_client.py` | Implemented layered prompt assembly and robust response parsing/fallback logging | Cat path not inspectable and weak fallback diagnostics | Durable A/B/C/D prompt chain and reliable fallback behavior |
| 21:34 | `apps/api/src/services/editorial_service.py` | Integrated retrieval bundle, prompt-layer metadata, stricter social style gate, generation logging | Generic/off-voice outputs and limited inspectability | Better grounded outputs and safer publish gating |
| 21:35 | `apps/api/src/workers/jobs.py` | Added structured stage/cycle logs around revision writes | Pipeline stage failures hard to trace | Better stage-level observability |
| 21:35 | `apps/api/src/workers/main.py` | Switched worker loop logging to structured events | Sparse worker diagnostics | Clear cycle-level runtime telemetry |
| 21:36 | `apps/api/src/routes/health.py` | Added live/ready/diagnostics endpoints with dependency checks, queue depth, recent/failed job views | No serious runtime diagnostics | Operational readiness and failure visibility |
| 21:36 | `apps/api/src/routes/admin.py` | Added `jobs/recent` and `jobs/failed` APIs | Missing admin-readable job reports | Fast operational triage |
| 21:37 | `apps/api/src/tests/test_*.py`, `apps/api/src/tests/fixtures/search_response.json` | Added unit tests + fixture coverage for search normalization, ingestion filtering, style gate/trend helper logic | No regression tests for core hardening changes | Guardrails against regressions |
| 21:38 | `.env.example` | Expanded env template with all required new knobs | Implicit/missing required settings | Faster, safer deployment configuration |
| 21:48 | `apps/api/src/services/trend_engine.py` | Fixed `MultipleResultsFound` by tolerant upsert and duplicate cleanup | `POST /trends/refresh` 500 failure | Stable trend refresh pipeline |
| 21:49 | `infra/sql/003_trend_observation_uniqueness.sql` | Added dedupe + uniqueness migration script for trend observations | Historical duplicate ledger growth | Durable trend ledger integrity |
| 21:52 | `docs/backend-*.md`, `docs/risk-register.md`, `docs/operations-runbook.md`, `docs/repair-log.md` | Added required technical deliverables | Missing audit and runbook artifacts | Complete handoff and operational documentation |

## 2026-03-14

| Timestamp (UTC) | File changed | Why changed | Issue addressed | Expected effect |
|---|---|---|---|---|
| 01:20 | `apps/api/src/services/cat_client.py` | Wired `CAT_PRIMARY_ENABLED` so Cat primary can be disabled cleanly | Cheshire Cat primary instability could block throughput cycles | Stable direct-to-LLM generation path without code rewrites |
| 01:21 | `.env`, `.env.example` | Added `CAT_PRIMARY_ENABLED` env control | Missing runtime knob in env templates | Explicit deployment/runtime control for generation routing |
| 01:23 | `infra/scripts/run_research_generation_cycle.py` | Added one-command end-to-end research + generation workflow with throughput/report output | Manual testing was repetitive and error-prone | Fast repeatable validation and practical examples in one command |
| 01:24 | `README.md`, `docs/operations-runbook.md` | Documented throughput script and model routing toggle | Operators lacked a concise “run it now” workflow | Faster operations onboarding and repeatable live demos |
| 01:31 | `apps/api/src/services/trend_engine.py`, `apps/api/src/tests/test_trend_engine.py` | Deduped theme member matches and switched inserts to upsert semantics | `POST /trends/refresh` could fail with `theme_members_pkey` duplicate violations | Stable theme rebuilds across repeated high-throughput ingestion runs |
| 01:37 | `apps/api/src/services/editorial_service.py`, `apps/api/src/tests/test_editorial_style.py` | Added prompt-echo stripping and hard-fail patterns for instruction leakage in generated text | Drafts occasionally echoed task instructions instead of editorial voice | Cleaner editorial/social outputs and stronger style-gate enforcement |
