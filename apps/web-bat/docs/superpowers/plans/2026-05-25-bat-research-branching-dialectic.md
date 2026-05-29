# BAT Research Branching Dialectic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each BAT research cycle create branching content paths that connect new research to prior research, and make each written editorial pass receive one RassyGPT challenger critique before the final draft is saved.

**Architecture:** Keep the change inside the existing FastAPI worker/editorial stack. Research branching will be deterministic metadata derived from the query plan, top themes, prior analysis briefs, and recent editorial coverage, then persisted in `voice_memory` and returned in pipeline summaries. The dialectic challenger will use the existing RassyGPT gateway with a smaller configurable model and only upgrade a draft when the challenged revision scores at least as well as the champion draft.

**Tech Stack:** Python 3.11, FastAPI services, SQLAlchemy async sessions, existing RassyGPT/Ollama-compatible chat gateway, unittest/pytest.

---

### Task 1: Research Content Branches

**Files:**
- Modify: `apps/api/src/workers/jobs.py`
- Test: `apps/api/src/tests/test_pipeline_jobs.py`

- [ ] **Step 1: Write the failing test**

Add a unit test that calls a new `_research_content_branches(...)` helper with two active themes, a query plan, and prior analysis/editorial cards. Assert the helper returns branches with `seed_query`, `previous_connection`, `next_research_queries`, and `writer_prompt` fields, and that each branch connects to prior work instead of starting cold.

- [ ] **Step 2: Run the test to verify RED**

Run: `PYTHONPATH=apps/api/src pytest apps/api/src/tests/test_pipeline_jobs.py::PipelineJobTests::test_research_content_branches_connect_previous_research_to_next_paths -q`

Expected: FAIL because `_research_content_branches` does not exist yet.

- [ ] **Step 3: Implement branch synthesis**

Add `_research_content_branches(...)` and a small helper for safe previous-connection text. Feed its output into `run_researcher_cycle()` summary and persist a compact version to `voice_memory` key `research_content_paths`.

- [ ] **Step 4: Run the test to verify GREEN**

Run: `PYTHONPATH=apps/api/src pytest apps/api/src/tests/test_pipeline_jobs.py::PipelineJobTests::test_research_content_branches_connect_previous_research_to_next_paths -q`

Expected: PASS.

### Task 2: Branches In Analysis Briefs

**Files:**
- Modify: `apps/api/src/services/analysis_engine.py`
- Test: `apps/api/src/tests/test_analysis_engine.py`

- [ ] **Step 1: Write the failing test**

Add a test proving `_brief_payload(...)` emits `content_branches` metadata derived from `query_variants`, `nearby_coverage`, `dialectic`, and selected angle. Assert `format_analysis_brief(...)` renders at least one branch line.

- [ ] **Step 2: Run the test to verify RED**

Run: `PYTHONPATH=apps/api/src pytest apps/api/src/tests/test_analysis_engine.py::AnalysisEngineTests::test_brief_payload_emits_content_branches_for_written_research -q`

Expected: FAIL because `content_branches` is missing.

- [ ] **Step 3: Implement analysis branch metadata**

Add deterministic `_content_branches(...)` and include the output in brief `meta`. Update `format_analysis_brief(...)` to render `Content branch: ...`.

- [ ] **Step 4: Run the test to verify GREEN**

Run: `PYTHONPATH=apps/api/src pytest apps/api/src/tests/test_analysis_engine.py::AnalysisEngineTests::test_brief_payload_emits_content_branches_for_written_research -q`

Expected: PASS.

### Task 3: RassyGPT Challenger Model Override

**Files:**
- Modify: `apps/api/src/config.py`
- Modify: `apps/api/src/services/cat_client.py`
- Modify: `docker-compose.yml`
- Test: `apps/api/src/tests/test_cat_client.py`

- [ ] **Step 1: Write the failing test**

Add a test proving `_build_llm_payload(..., model_override="rassy-fast")` uses `rassy-fast` instead of `settings.llm_model`.

- [ ] **Step 2: Run the test to verify RED**

Run: `PYTHONPATH=apps/api/src pytest apps/api/src/tests/test_cat_client.py::CatClientTests::test_llm_payload_accepts_model_override_for_challenger -q`

Expected: FAIL because `_build_llm_payload` has no `model_override` parameter.

- [ ] **Step 3: Implement model override**

Add `llm_challenger_model: str = "rassy-fast"` to settings, expose `LLM_CHALLENGER_MODEL` in compose, and thread optional `model_override` through `_build_llm_payload(...)` and `generate_with_cat(...)`.

- [ ] **Step 4: Run the test to verify GREEN**

Run: `PYTHONPATH=apps/api/src pytest apps/api/src/tests/test_cat_client.py::CatClientTests::test_llm_payload_accepts_model_override_for_challenger -q`

Expected: PASS.

### Task 4: Champion/Challenger Editorial Pass

**Files:**
- Modify: `apps/api/src/services/editorial_service.py`
- Test: `apps/api/src/tests/test_editorial_style.py`

- [ ] **Step 1: Write the failing test**

Add an async test that patches `generate_with_cat` so the normal champion draft is followed by a challenger revision using model override `settings.llm_challenger_model`. Assert `_run_editorial_generation_pass(...)` returns `dialectic_review`, increments reroll count, and selects the challenger when its style rank is stronger.

- [ ] **Step 2: Run the test to verify RED**

Run: `PYTHONPATH=apps/api/src pytest apps/api/src/tests/test_editorial_style.py::EditorialStyleTests::test_editorial_generation_runs_challenger_pass_with_smaller_model -q`

Expected: FAIL because no challenger pass exists yet.

- [ ] **Step 3: Implement challenger pass**

Add a concise challenger prompt builder, call RassyGPT with `model_override=settings.llm_challenger_model` after the champion draft when enough sources exist, assess the challenger revision with the existing style gate, and only replace the champion when the rank is at least as strong. Store challenger metadata on editorial objects.

- [ ] **Step 4: Run the test to verify GREEN**

Run: `PYTHONPATH=apps/api/src pytest apps/api/src/tests/test_editorial_style.py::EditorialStyleTests::test_editorial_generation_runs_challenger_pass_with_smaller_model -q`

Expected: PASS.

### Task 5: Verify And Redeploy

**Files:**
- Modify if needed: `config.json`

- [ ] **Step 1: Run focused tests**

Run: `PYTHONPATH=apps/api/src pytest apps/api/src/tests/test_pipeline_jobs.py apps/api/src/tests/test_analysis_engine.py apps/api/src/tests/test_cat_client.py apps/api/src/tests/test_editorial_style.py -q`

Expected: PASS.

- [ ] **Step 2: Run backend health checks**

Run: `curl -fsS http://127.0.0.1:3197/api/v1/health/live`

Expected: JSON status `ok`.

Run: `curl -fsS http://127.0.0.1:3197/api/v1/health/ready`

Expected: JSON status `ready`.

- [ ] **Step 3: Sync installed Runtipi app and recreate**

If source changes need live deployment, copy the changed app files into `/data/runtipi/apps/gpu-private-store/web-bat`, then recreate the stack from `/data/runtipi/apps/gpu-private-store/web-bat/docker-compose.generated.yml` with the live env file.

- [ ] **Step 4: Run post-deploy health and smoke checks**

Repeat live/ready health checks, then probe `POST /api/v1/admin/pipeline/run-now` only if no active pipeline lock is present.
