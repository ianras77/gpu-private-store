# Rassy Online Stage 3 Chat Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a functional ChatGPT-style chat surface backed by RassyCodex.

**Architecture:** The browser posts messages to `/api/chat`. The server maps friendly modes to exact RassyCodex model IDs, calls the OpenAI-compatible `/v1/chat/completions` endpoint with streaming enabled, streams assistant deltas back to the browser, and persists threads/messages for signed-in users.

**Tech Stack:** Next.js App Router, Postgres, RassyCodex OpenAI-compatible API, Web Streams.

---

## Files

- `src/lib/rassycodex.ts`: mode catalog, request builder, SSE delta parser.
- `src/lib/chat-store.ts`: thread/message schema bootstrap and persistence helpers.
- `src/app/api/chat/route.ts`: streaming chat endpoint.
- `src/app/api/threads/route.ts`: signed-in thread list endpoint.
- `src/components/chat-workbench.tsx`: client chat UI.
- `src/app/page.tsx`: use workbench instead of static composer.
- `src/lib/rassycodex.test.ts`: mode/SSE tests.

## Task 1: Capability Mapping

- [ ] Write failing tests for mode-to-model mapping and SSE delta extraction.
- [ ] Implement `rassycodex.ts`.
- [ ] Run tests green.

## Task 2: Chat Persistence

- [ ] Add `threads` and `messages` tables through idempotent schema bootstrap.
- [ ] Add helpers to create/list/update threads and append messages.
- [ ] Persist only for authenticated users; anonymous chats stay browser-local.

## Task 3: Streaming Chat API

- [ ] Add `/api/chat`.
- [ ] Validate input.
- [ ] Build RassyCodex request with selected mode.
- [ ] Stream assistant text to the browser.
- [ ] Persist user and assistant messages for signed-in users.
- [ ] Return useful error text when RassyCodex is unreachable.

## Task 4: Chat UI

- [ ] Add a client workbench with mode selector, message list, composer, send/stop state, and signed-in account state.
- [ ] Preserve Stage 1 magical shell and capability constellation.
- [ ] Show active mode and persistence state.

## Task 5: Verification

- [ ] `npm run test`.
- [ ] `npm run lint`.
- [ ] `npm run build`.
- [ ] Rebuild local compose stack.
- [ ] Probe RassyCodex health/model route from host.
- [ ] Send a small chat prompt through the UI/API.
- [ ] Verify signed-in message persistence.
- [ ] Capture desktop/mobile screenshots.
- [ ] Run appstore validation scripts.

