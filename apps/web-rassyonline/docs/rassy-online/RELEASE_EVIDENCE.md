# Rassy Online release evidence

Updated: 2026-09-26 UTC. Release branch: `codex/rassyonline-release-only-20260926` (focused app commit cherry-picked onto the reviewed `be44e4d93` base). This document distinguishes direct observations from work still awaiting qualification.

## Verified

| Gate | State | Observation |
| --- | --- | --- |
| Clean install | PASS | `npm ci --offline`; 356 packages installed, audit found 0 vulnerabilities. |
| Types | PASS | `npm run lint` (`tsc --noEmit`) after the repaired contracts. |
| Unit suite | PASS | Final rerun: 29 files / 100 tests. |
| Production build | PASS | `npm run build` and managed Docker image build passed, with the known Mastra dynamic dependency warning. |
| Gateway capability metadata | PASS | Authenticated model catalog and per-alias capability endpoints from the running application container. |
| Installed SDK calculator loop | PASS | Disposable container with the installed `ai`, `@ai-sdk/openai`, and `zod` packages completed a two-step synthetic calculator tool loop and final answer containing `44.1`. |
| Installed Mastra settings wire test | PASS | `chat-wire.test.ts` observed the outgoing provider body carry `temperature: 0.4` and `max_tokens: 1024`. |
| Search service | PASS | Application-container request returned HTTP 200, JSON content type, and Mastra official-site/GitHub results. |
| Managed final rebuild | PASS | Web image `sha256:c4c633c3a26e923ab8b16baa0084030b7ef402ac8c51f5fbadaaed9cd96e3492`; only `rassy-online-web` was recreated. Postgres and Qdrant stayed running. |
| Live synthetic smoke | PASS | Final image: health, capability map, web-off arithmetic `44.1`, and explicit search all completed. |
| Live two-turn research | PASS | Guest follow-up completed, resolved both subjects, and returned official Mastra and LangGraph sources including `mastra.ai`, `www.langchain.com/langgraph`, and `docs.langchain.com/oss/python/langgraph/overview`. Claim-by-claim source support was not audited. |
| Rendered screenshots | PASS | Captured deployed app at `after-390.png`, `after-768.png`, and `after-1440.png`; 390px and 1440px images were visually inspected. Baseline at `before-1440.png`. |

## Remaining qualification

| Gate | State | Exact gap |
| --- | --- | --- |
| Final source/image parity | PASS | The final source was synced to the managed mirror before the final Docker build and web recreate. |
| Claim-level citation support | NOT RUN | Verify each generated claim against its cited page; the current URL check establishes retrieval/allowlisting, not factual support. |
| Signed-in history/document isolation | NOT RUN | Use controlled test accounts in staging and verify create, reopen, account switch, and selected-document scope. |
| Browser workflows | NOT RUN | Exercise keyboard, IME, file, voice, scroll, stop/retry, and 390/768/1440px plus 200% zoom in an interactive browser. |
| Migration reconciliation | NOT RUN | Rehearse old `threads/messages` plus Mastra overlap in a staging database snapshot. Dual-read compatibility code is present; no destructive migration was run. |
| Evidence/artifact persistence | NOT RUN | Search source and artifact history across reload still needs an exact message-ID association and test. |
| Full rollback | NOT RUN | Previous image tagged `runtipi-local-web-rassyonline-web:rollback-20260926`; a rollback has not been executed. |

## Deployment and rollback

The managed mirror is `/data/runtipi/apps/gpu-private-store/web-rassyonline`. The source is this appstore folder. Synchronize only `apps/web`, omitting `node_modules` and `.next`, then use the protected app env at `/data/runtipi/app-data/gpu-private-store/web-rassyonline/app.env` with Compose project `web-rassyonline_gpu-private-store`. Build and recreate only `rassy-online-web` with `--no-deps` to preserve Postgres, Qdrant, uploads, and worker state. Verify the local and public health endpoints and real chat paths. Do not print env values.

For image rollback, retag `runtipi-local-web-rassyonline-web:rollback-20260926` as `latest` and recreate only `rassy-online-web` with `--no-build --no-deps`. Revert the managed source mirror to the corresponding appstore revision before any later rebuild. The changes here add no destructive schema migration; existing Mastra and legacy tables and app-data mounts are retained. A rollback rehearsal remains required before marking that path proven.
