# Rassy Online baseline — 2026-09-26 UTC

## Source and runtime

- Reviewed source branch: `codex/rassys-2.0`, base commit `be44e4d933d5ed88ae00eeeab9e88969e2450b92`.
- Web package and lockfile: `0.1.8`; installed Next.js `15.5.25`, Mastra core `1.63.2` range, AI SDK `7.0.84` range. Exact installed versions are determined by `npm ls` during release qualification.
- Managed Compose project: `web-rassyonline_gpu-private-store`; web port `3199:3000`.
- Observed running image ID before changes: `sha256:654b6395c58b4d185b4ea08554fe103697364905bfa5537b65403b217b747e9e`, created `2026-09-26T01:08:59Z`.
- Both `/data/runtipi/app-data/gpu-private-store/web-rassyonline/app.env` and `/data/runtipi/user-config/gpu-private-store/web-rassyonline/app.env` exist. Their values were not printed.
- Local and public `/api/health`: HTTP 200 before changes. This is availability evidence only.
- App SQL schema is created idempotently in `src/lib/db.ts` and `src/lib/chat-store.ts`; no versioned migration table was found in the reviewed paths.

## Gateway contract observed from the application container

- Authenticated `/v1/models`: HTTP 200 with `rassy-agent`, `rassy-fast`, `rassy-code`, `rassy-mind`, `rassy-utility`, embedding, rerank, and voice aliases.
- `/v1/models/rassy-agent/capabilities`: streaming and tools `qualified`, maximum output `4096`.
- `/v1/models/rassy-fast/capabilities`: streaming and tools `qualified`, maximum output `4096`.
- `/v1/models/rassy-code/capabilities`: streaming and tools `qualified`, maximum output `8192`.
- `/v1/models/rassy-mind/capabilities`: streaming and tools `qualified`, maximum output `8192`.
- `/v1/models/rassy-utility/capabilities`: streaming `qualified`, tools `qualified`, model status `supported`, maximum output `2048`.
- A direct synthetic `rassy-agent` calculator request returned HTTP 200 and a `calculator` tool call; a synthetic tool-result continuation returned HTTP 200 and a final answer containing `44.1`. These are gateway contract probes, not an installed Mastra SDK or browser proof.

## Verified source defects at baseline

- Explicit web search could be overridden by the `Explain` prefix; `latest` was forced into a one-day search window.
- Requested search domains were sent as `indices` and not enforced on returned URLs.
- Browser read `x-thread-id` while server sent `x-rassy-thread-id`.
- Chat wrote Mastra memory while signed-in history read only legacy tables.
- Browser SSE parser dropped CRLF/multiline/fragmented records; error handling replaced partial text.
- Page reader did not validate DNS addresses or pin the connection destination.
- Mastra generation controls were passed at the wrong option level for the installed type declaration.

## Project checklist

- [x] Confirm source, container, gateway, and app health baseline.
- [x] Repair explicit search/date/domain behavior and generation settings.
- [x] Add a fail-closed capability adapter and cap requested output.
- [x] Join Mastra and legacy history reads without deleting records.
- [x] Repair stream parsing, partial output, stale thread callbacks, and selected document scope.
- [x] Harden page reads against private DNS answers and rebinding.
- [x] Prove installed SDK calculator loop and live app behavior after deployment.
- [x] Capture and inspect deployed desktop/mobile screenshots.
- [ ] Complete stored artifact/source history, migration rehearsal, interactive renderer/voice/UI qualification, and rollback rehearsal.
