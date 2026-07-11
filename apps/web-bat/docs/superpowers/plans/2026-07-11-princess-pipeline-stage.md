# Princess Pipeline Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Princess stage that prepares drafts for Queen so Queen can focus on final oversight and publishing.

**Architecture:** The pipeline becomes researcher -> analyst -> writer -> princess -> queen. Princess owns pruning stale drafts and reworking promising drafts into approved publish-ready objects. Queen receives `princess_summary`, publishes the approved backlog, curates links/social/homepage, and reports the final release outcome.

**Tech Stack:** Python 3.12, FastAPI worker services, SQLAlchemy async sessions, Redis lock/heartbeat, pytest.

---

### Task 1: Add Princess Pipeline Role

**Files:**
- Modify: `apps/api/src/services/pipeline_blueprint.py`
- Test: `apps/api/src/tests/test_pipeline_jobs.py`

- [ ] **Step 1: Write the failing test**

Add a test asserting the pipeline runs Princess between writer and Queen and passes the Princess result into Queen:

```python
async def test_run_pipeline_cycle_runs_princess_before_queen(self) -> None:
    ...
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest apps/api/src/tests/test_pipeline_jobs.py::PipelineJobTests::test_run_pipeline_cycle_runs_princess_before_queen -q`

- [ ] **Step 3: Write minimal implementation**

Add `{"role": "princess", "plugins": ["analysis_engine", "homepage_editor", "voice_memory"]}` before Queen in `CAT_ROLE_PIPELINE`, add `run_princess_cycle`, and route Queen with `princess_summary`.

- [ ] **Step 4: Run test to verify it passes**

Run the same focused test and expect PASS.

### Task 2: Move Draft Prep Out Of Queen

**Files:**
- Modify: `apps/api/src/workers/jobs.py`
- Test: `apps/api/src/tests/test_pipeline_jobs.py`

- [ ] **Step 1: Write failing tests**

Add tests that Princess calls `prune_editorial_backlog` and `rework_editorial_backlog`, and Queen does not call those prep functions when given a Princess summary.

- [ ] **Step 2: Run tests to verify they fail**

Run the focused pipeline job tests.

- [ ] **Step 3: Write minimal implementation**

Implement `run_princess_cycle` with daily target/shortfall limits. Remove initial prune/rework from Queen and have Queen publish based on Princess handoff while retaining extra emergency rework only when no Princess summary exists.

- [ ] **Step 4: Run tests to verify pass**

Run focused pipeline tests, then the wider regression bundle.

### Task 3: Deploy And Verify Live

**Files:**
- Sync modified source files to `/data/runtipi/apps/gpu-private-store/web-bat`
- Rebuild/recreate `bat-api` and `bat-worker`
- Reattach API/worker to `web-bat_gpu-private-store_web-bat_gpu-private-store_network`

- [ ] **Step 1: Rebuild and restart**

Run Docker Compose with both app env files, then reconnect the app network and restart worker.

- [ ] **Step 2: Verify**

Check network verifier, API readiness, worker heartbeat, pipeline lock, latest pipeline rows, and publish/draft counts.

- [ ] **Step 3: Commit and push**

Commit relevant `web-bat` changes only, then push to origin.
