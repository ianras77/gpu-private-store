# RassyGPT 2.0 Post-V100 / OpenFang Plan

Date: 2026-06-06

This is a documentation-only handoff plan. It assumes the M40 is removed and
replaced with another 32 GB Tesla V100. Do not design around the M40.

## Executive Decision

Build RassyGPT 2.0 as a new blue/green Runtipi app, not as an in-place mutation
of the current stack.

Use a new app id such as `rassygpt2` or `rassygpt-next`, keep the current
RassyGPT 1.0.4 app running on its existing port until 2.0 passes live checks,
then move OpenFang and downstream apps to 2.0 and stop the old app.

Reason: the 2.0 goal is not only "more GPUs." It changes the serving topology,
context policy, media services, OpenFang integration, routing aliases, telemetry,
and agent workflow. A side-by-side deployment is the reliable path.

## North Star

RassyGPT 2.0 is the local intelligence substrate for OpenFang.

The priority is that OpenFang can do the kinds of machine-level coding and app
operations Codex has been doing here:

- inspect repos, docs, logs, generated compose, installed copies, and live state;
- plan and execute code changes through existing OpenCode/Aider hands;
- run tests, browser checks, Runtipi validation, and HTTP probes;
- operate web-app workflows with visual verification;
- preserve evidence, decisions, and durable memory without leaking secrets;
- delegate work to linked OpenFang worker machines when useful.

Chat is still important, but OpenFang operator capability is the main product.

## Post-Swap Hardware Target

Re-discover UUIDs after the swap. Do not rely on GPU indexes.

| Lane | Hardware target | Purpose |
|---|---|---|
| codex-pro | 2x V100 32 GB | Highest-quality coding, agent planning, repo-scale reasoning |
| general-pro | 2x V100 16 GB | General smart chat, writing, reasoning, fallback for codex-pro |
| worker-code | V100 12 GB | Fast code worker, tool-call parsing, short agent loops |
| fast-context | P40 24 GB | Summaries, routing, compression, cheap utility prompts |
| retrieval | P100 16 GB | Embeddings, reranking, retrieval helpers |
| media-image | RTX 2080 Ti 11 GB | ComfyUI image generation/editing workflows |
| media-audio | CPU/P100/RTX queue | STT/TTS with clear priority rules |

The new 32 GB V100 should be paired with the existing 32 GB V100 only after
checking `nvidia-smi topo -m`, PCIe placement, power, cooling, and whether
multi-GPU split performance is actually better than single-card operation for
the chosen model.

## Serving Strategy

Use llama.cpp/GGUF as the core serving engine for 2.0.

Use vLLM only as a pinned, tested optional lane. Current vLLM documentation has
mixed implications for older cards: some quantization paths mention Volta
support, but current GPU installation requirements target compute capability
7.5 or newer, which excludes V100. P100/P40 are older still. That makes vLLM a
bad choice for the core reliability layer on this host.

Do not base 2.0 on TensorRT-LLM. Modern TensorRT direction is strongest on newer
NVIDIA architectures, and Volta support has already been removed in TensorRT
10.5 release notes. This host is a mixed Volta/Pascal machine, so the stable
path is llama.cpp plus carefully pinned specialty services.

### Initial Model Lanes

| Public alias | Engine | Initial model class | Hardware | Context target |
|---|---|---|---|---|
| `rassy-codex` | llama.cpp | Qwen3-Coder-30B-A3B-Instruct GGUF, highest quant that fits | 2x V100 32 GB | 64k, `parallel=1` |
| `rassy-general` | llama.cpp | Qwen3-30B-A3B-Instruct-2507 GGUF | 2x V100 16 GB | 32k, `parallel=1` or `2` after tests |
| `rassy-worker` | llama.cpp first, pinned vLLM only if proven | 7B/14B coder or instruct worker | V100 12 GB | 8k-16k |
| `rassy-fast` | llama.cpp | 8B/14B instruct utility model | P40 24 GB | 16k-32k |
| `rassy-embed` | llama.cpp | Nomic/BGE-style embedding model | P100 16 GB | 8k |
| `rassy-rerank` | llama.cpp | BGE-style reranker | P100 16 GB | 2k-4k |
| `rassy-image` | ComfyUI adapter | SDXL/Flux-schnell-class workflow that fits 11 GB | RTX 2080 Ti | queued |
| `rassy-transcribe` | faster-whisper or whisper.cpp | Whisper large-v3/turbo class | queued GPU/CPU | per request |
| `rassy-speech` | Piper/Kokoro first, XTTS optional | fast local TTS plus optional high-quality voice | CPU/RTX queue | streaming preferred |

Keep model names stable even if internals change. Downstream apps should call
aliases, not concrete Hugging Face repo names.

## Context Policy

Do not try to solve context by blindly chasing huge windows.

The usable strategy is:

1. A true long-code lane: `rassy-codex` gets a real 64k target with one slot.
2. Accurate token budgeting: gateway uses tokenizer-aware counts, not char/4.
3. Per-lane advertised limits: max prompt, max output, max total, slot count,
   and usable warning threshold are returned in `/v1/models` metadata.
4. Retrieval-first repo context: OpenFang sends a packed working set, not whole
   repos by default.
5. Compaction: long agent sessions produce state summaries, decisions, file
   touch lists, errors, and next actions.
6. Prefix reuse: fixed system prompts, repo summaries, and tool instructions
   are stable prefixes so engines that support prefix caching can benefit.
7. Reranked memory: Qdrant stores project chunks, summaries, build logs,
   previous fixes, and app-specific runbooks with dense+sparse retrieval and
   reranking.

Context rules for OpenFang:

- below 8k: direct worker or fast lane;
- 8k-32k: general/coder lane with retrieval pack;
- 32k-64k: codex-pro only;
- above 64k: summarize, retrieve, chunk, and ask for a scoped task pack.

## Learning And Memory Fabric

RassyGPT 2.0 needs a real memory system, not just a bigger prompt.

The goal is compounding usefulness: every app fix, failed command, model route,
test result, screenshot, crawl, summary, and final report should make the next
task faster and better.

### Store Types

Use multiple stores because they answer different questions:

| Store | Candidate | Purpose |
|---|---|---|
| job ledger | SQLite first, Postgres later if needed | append-only task evidence, commands, files touched, tests, outcomes |
| vector store | Qdrant | semantic retrieval, dense/sparse hybrid search, rerank candidates |
| keyword search | Meilisearch or Tantivy-backed service | exact terms, filenames, error codes, package names, log snippets |
| object library | filesystem under `/data/apps/openfang/library` | raw crawls, PDFs, screenshots, transcripts, reports, generated artifacts |
| graph memory | SQLite/Postgres tables first | app/service/model/host relationships and dependency maps |
| hot cache | SQLite/Redis optional | small facts that should be recalled instantly |

Start with SQLite + Qdrant + filesystem object library. Add Meilisearch when
exact-keyword and typo-tolerant documentation search becomes a bottleneck. Do
not add a distributed database until the single-host version is proven.

### Library Layout

Use app-scoped storage under `/data/apps/openfang/library`:

```text
/data/apps/openfang/library/
  sources/          raw crawls, PDFs, docs, transcripts
  objects/          screenshots, logs, reports, generated files
  chunks/           normalized chunk JSONL
  indexes/          local lexical indexes if not containerized
  ledgers/          job, crawl, eval, and route ledgers
  summaries/        durable LLM-written state summaries
  graph/            entity/relation exports
  manifests/        source manifests and hashes
```

Keep secrets out of the library. Store redacted facts, provenance, hashes, and
pointers to live secret locations instead.

### Ingestion Pipeline

Every source should pass through the same pipeline:

1. acquire: repo scan, web crawl, PDF extraction, log capture, screenshot, STT;
2. normalize: markdown/text plus metadata;
3. redact: remove secrets, cookies, tokens, and raw env values;
4. chunk: preserve path, app, service, date, hash, heading, and line anchors;
5. embed: dense embedding plus optional sparse vector;
6. index: Qdrant, keyword index, graph entities, and job ledger;
7. summarize: short durable summary and "why this matters" note;
8. evaluate: sample retrieval queries prove it can be found again.

This makes the system learn from action without pretending to fine-tune giant
models on every event.

### Retrieval Modes

OpenFang should be able to retrieve in several ways:

- hot facts: "what is the current RassyGPT public port?";
- exact search: filenames, error codes, container names, env var names;
- semantic search: "why did this app fail after update?";
- hybrid search: exact technical terms plus fuzzy natural-language meaning;
- graph walk: app -> generated compose -> container -> endpoint -> health check;
- time search: "what changed in the last 24 hours?";
- evidence replay: "show the commands and probes from the last fix";
- crawl recall: "what did the upstream docs say about this option?";
- multimodal artifact lookup: screenshots and STT transcripts tied to jobs.

Retrieval must return provenance with every result: source path/URL, timestamp,
hash, chunk id, score, and whether the content is redacted.

### Deep Crawling

Use a crawler lane for documentation and web research that can produce clean
Markdown, structured extraction, and crawl manifests. Crawl4AI is a good
candidate because it is built for LLM-friendly crawls, Markdown output, browser
control, structured extraction, and adaptive crawling.

Crawler policy:

- allowlist domains by task;
- obey robots and rate limits;
- cap depth, pages, bytes, and runtime;
- store raw and normalized outputs with hashes;
- deduplicate by canonical URL and content hash;
- summarize crawls into durable briefs;
- index crawled docs into Qdrant and keyword search;
- refresh high-value docs on a schedule, not on every prompt.

### Learning Loop

After each meaningful OpenFang job:

1. write a job record;
2. extract reusable facts;
3. update app/service graph relations;
4. embed and index the final report and touched files;
5. run a small retrieval self-test;
6. record whether the retrieved memory helped or misled the job;
7. promote only durable, verified facts into hot memory.

This keeps memory dynamic while avoiding junk accumulation.

### Memory Tiers

| Tier | Lifetime | Examples |
|---|---|---|
| scratch | one request/job | raw tool output, temporary command logs |
| session | one workflow | current repo plan, failures, active files |
| project | weeks/months | app architecture, known drift traps, deployment quirks |
| durable | long-term | verified ports, runbooks, stable service relationships |
| archive | cold | old logs, old screenshots, superseded crawl snapshots |

Only project/durable memory should be injected automatically. Scratch/session
memory should be explicitly selected by the job coordinator.

### Hardware Fit

The post-swap machine is sufficient for this plan if the memory layer is mostly
I/O and CPU efficient:

- embeddings and reranking can live on the P100 lane;
- Qdrant and SQLite/Postgres are mostly CPU/RAM/disk services;
- keyword search is CPU/RAM heavy but not GPU heavy;
- crawlers are network/browser/CPU heavy, so run them with queues and caps;
- summarization can use `rassy-fast` or `rassy-worker`;
- deep coding still uses the V100 lanes.

The important constraint is not raw GPU count. It is queueing, storage layout,
index hygiene, and not letting crawlers/media jobs starve OpenFang coding work.

## OpenFang Operator Architecture

OpenFang stays above RassyGPT. RassyGPT provides models, media, embeddings,
reranking, and OpenAI-compatible APIs. OpenFang decides what to do.

### Existing Hands To Preserve

The current OpenFang control layer already has:

- `opencode-hand` for system work, Docker, Runtipi, deployment, live checks,
  reports, and broad app operations;
- `aider-hand` for focused selected-file edits, repo-map questions, and tight
  implementation loops;
- `codex-god` knowledge under `/data/apps/openfang/knowledge/codex-god/`;
- RassyGPT provider verification through `check-openfang-rassygpt.sh`.

RassyGPT 2.0 should improve those hands instead of replacing them.

### New OpenFang-Centered Capabilities

Add these as RassyGPT/OpenFang integration goals:

- `rassy-codex` as the default model for OpenFang coding jobs.
- `rassy-architect` alias for planning and design review.
- `rassy-reviewer` alias for code review and regression-risk checks.
- `rassy-webapp` alias for frontend implementation and QA.
- `rassy-summarizer` alias for compaction, reports, and memory writes.
- A job ledger under `/data/apps/openfang` with task id, repo, branch/worktree,
  commands run, files touched, tests, health probes, screenshots, model lane,
  and final evidence.
- A worktree-per-job mode for risky or multi-step coding tasks.
- A "no secrets in prompts" redaction layer for env files, compose secrets,
  API keys, cookies, and session material.
- A delegated-worker protocol for linked OpenFang machines.

### Tool Layer

Expose host actions through scoped tools rather than raw omnipotence.

Recommended tool groups:

- filesystem: read/list/search/write within approved roots;
- git: status, diff, show, branch, worktree, commit, push with policy gates;
- shell: allowlisted commands, timeouts, output caps, no secret dumps;
- docker: ps, logs, inspect, compose config/up/down for scoped projects;
- runtipi: validate store, inspect generated compose, sync installed copy,
  dashboard/API checks;
- browser: Playwright dev-server launch, console errors, screenshots, mobile and
  desktop checks;
- retrieval: Qdrant search, add project memory, rerank;
- media: image generation, OCR/image analysis if added, STT/TTS;
- OpenFang A2A/OFP: discover agents, submit jobs, collect worker evidence.

MCP is the preferred protocol shape for new tool servers because it gives a
standard split between tools, resources, prompts, and authorization. Local
STDIO tools can use environment credentials; HTTP tools need bearer/OAuth-style
authorization and strict audience validation.

## Web App Support

Web apps are first-class workloads, not an afterthought.

Add an OpenFang web-app routine that can:

- inspect the repo and package manager;
- install or reuse dependencies without breaking lockfiles;
- run the dev server on an available port;
- use Playwright to capture desktop and mobile screenshots;
- check console/network errors;
- inspect rendered text overflow and obvious layout overlap;
- run build/lint/test commands where present;
- preserve screenshots and a short QA report under app-scoped reports;
- for Runtipi apps, validate source, installed copy, generated compose,
  app-data env/config, live container state, and HTTP probes.

This is the route to making local OpenFang useful for the same web-app work
Codex has been doing.

## Media Services

Split media into focused services instead of one fragile do-everything lane.

### Image

Use ComfyUI on the RTX 2080 Ti with versioned workflow JSON and a small gateway
adapter exposing OpenAI-compatible image endpoints where useful.

Requirements:

- queue image jobs so the 2080 Ti is not oversubscribed;
- start with models/workflows that fit 11 GB reliably;
- store workflow JSON, prompt, seed, dimensions, and output path;
- include a health probe that actually generates or validates a tiny workflow,
  not only an HTTP 200.

### STT

Use faster-whisper or whisper.cpp behind `/v1/audio/transcriptions`.

Requirements:

- pin CUDA/CTranslate2 versions if using faster-whisper;
- support CPU fallback;
- queue long audio jobs;
- return transcript, segments, language, duration, and timing metadata.

### TTS

Use Piper or Kokoro as the default fast local TTS path. Add XTTS-style voice
cloning only as an optional high-quality lane with a queue.

Requirements:

- expose `/v1/audio/speech`;
- prefer streaming output for interactive use;
- cache voice/model assets under the app data/model directory;
- keep voice license metadata with the model files.

## Runtipi Compatibility Requirements

Every RassyGPT 2.0 implementation pass must prove these surfaces separately:

- source checkout;
- installed copy under `/data/runtipi/apps/gpu-private-store/<app-id>`;
- generated compose;
- app-data env and persisted gateway routes/config;
- Runtipi DB/dashboard state;
- live Docker containers;
- public HTTP endpoints;
- OpenFang provider path.

Do not call it fixed if only source changed.

Minimum checks:

- appstore validator;
- app-local `scripts/validate.sh`;
- `docker compose config --quiet`;
- `docker ps` and `docker inspect`;
- `/health`, `/ready`, `/v1/models`;
- smoke chat through `rassy-codex`, `rassy-general`, `rassy-fast`;
- embedding and rerank probes;
- image, STT, and TTS probes when those lanes are enabled;
- `bash /data/apps/openfang/check-openfang-rassygpt.sh`;
- one OpenFang coding job dry run that returns evidence.

## Implementation Phases For Codex

### Phase 0 - Post-Swap Discovery

After the V100 swap:

- capture `nvidia-smi` full table with UUIDs, memory, PCI bus ids, power, and
  temperatures;
- capture `nvidia-smi topo -m`;
- confirm Docker GPU runtime sees all GPUs;
- record the new V100 32 GB UUID;
- confirm the M40 is absent;
- update only the 2.0 plan/config with UUIDs.

### Phase 1 - New App Scaffold

- Create `rassygpt2` or `rassygpt-next` beside the current app.
- Keep 1.0.4 untouched and running.
- Use new host port during build, for example `8845:8080`.
- Keep all backend ports internal.
- Use UUID-based `CUDA_VISIBLE_DEVICES`.
- Build gateway config around lane objects rather than hardcoded routes.

### Phase 2 - Gateway 2.0

Tests first:

- tokenizer-aware budget tests;
- route selection tests;
- fallback tests;
- structured 503 tests;
- per-lane readiness tests;
- redaction tests;
- OpenFang model alias tests.

Implementation:

- OpenAI-compatible chat, embeddings, rerank, audio, and image facade;
- `/admin/status` with lane limits, queue depth, last error, restarts, and GPU
  UUID;
- request ids and per-request route traces;
- model metadata that tells OpenFang usable context limits;
- retry/fallback policy by failure class, not blind retry loops.

### Phase 3 - Learning/Data Layer

- Create `/data/apps/openfang/library` layout.
- Add job ledger schema and write/read tests.
- Add ingestion manifest format.
- Add redaction tests.
- Add Qdrant collection plan for project chunks, reports, crawls, and summaries.
- Add retrieval API tests for hot, exact, semantic, hybrid, graph, and time
  search modes.
- Add a tiny crawl ingestion proof with stored Markdown, chunks, embeddings,
  summary, and retrieval self-test.
- Add OpenFang job post-processing: report -> facts -> graph -> indexes.

Do this before the full OpenFang cutover so the first real 2.0 jobs begin
learning immediately.

### Phase 4 - Text Lanes

Bring up in this order:

1. `rassy-fast`
2. `rassy-embed`
3. `rassy-rerank`
4. `rassy-general`
5. `rassy-codex`
6. `rassy-worker`

Benchmark each lane before adding the next one.

### Phase 5 - OpenFang Integration

- Point a test OpenFang agent at RassyGPT 2.0 without changing production Sister
  Ray first.
- Add `rassy-codex` to the provider/model map.
- Run a read-only coding job.
- Run a small selected-file Aider hand job.
- Run an OpenCode hand job that performs live checks but no destructive edits.
- Verify job ledger output and knowledge refresh.
- Only then switch the production OpenFang default from 1.0.4 to 2.0.

### Phase 6 - Web-App Workflow

- Add a representative test app or use an existing low-risk web app.
- Run install/build/test.
- Start dev server.
- Capture Playwright desktop/mobile screenshots.
- Check console errors.
- Produce a report and artifact paths.
- Verify OpenFang can understand the report and decide the next action.

### Phase 7 - Media

- Bring up ComfyUI image lane.
- Add image adapter smoke test.
- Bring up STT.
- Bring up TTS.
- Add media endpoints to `/ready` as optional unless explicitly required.

### Phase 8 - Soak And Cutover

- 24-hour container restart count check;
- repeated chat/embedding/rerank probes;
- one long-context coding prompt;
- one web-app QA workflow;
- one image job;
- one STT job;
- one TTS job;
- OpenFang provider checker;
- downstream app smoke checks.

Cut over only after evidence is clean. Keep rollback to RassyGPT 1.0.4 simple:
restore OpenFang provider URL/model and stop `rassygpt2`.

## Performance Targets

These are starting gates, not marketing numbers:

- all required containers healthy after cold boot;
- no required backend missing from `/ready`;
- zero 5xx on health/model listing routes during soak;
- model lane OOMs become structured degraded status, not gateway crashes;
- `rassy-fast` responds to small prompts quickly enough for routing/summaries;
- `rassy-codex` handles a 32k coding prompt reliably before attempting 64k;
- OpenFang coding dry run returns command/file/test evidence;
- web-app workflow produces screenshots and console-error report;
- each completed OpenFang job writes a ledger record and indexed summary;
- retrieval self-tests can find the last fix by app, error, file, and symptom.

## Things Not To Do

- Do not design around the M40.
- Do not make latest vLLM the core on this Volta/Pascal host.
- Do not chase 1M context as a production target.
- Do not expose backend model ports directly through Runtipi.
- Do not let media jobs starve coding lanes.
- Do not let OpenFang see raw secrets.
- Do not dump every artifact into long-term memory without redaction,
  provenance, and retrieval self-tests.
- Do not call source-only edits a Runtipi fix.
- Do not cut over until OpenFang and at least one web-app workflow are proven.

## Final Success Definition

RassyGPT 2.0 is successful when OpenFang can receive a real request like:

> Fix this Runtipi web app, verify it live, and tell me what changed.

and then:

1. chooses the right hand;
2. gathers repo and runtime context;
3. routes reasoning to `rassy-codex`;
4. edits safely through Aider/OpenCode;
5. runs tests and browser checks;
6. syncs Runtipi surfaces when needed;
7. verifies containers and HTTP endpoints;
8. writes a durable evidence report;
9. indexes the useful facts and artifacts;
10. proves the new memory can be retrieved;
11. leaves the machine in a known-good state.

That is the holy-grail target.
