# USMender Matrix-Core Rebuild Plan

Status: v0.5 implementation baseline, 2026-05-24.

## Product Direction

USMender should become a mobile-first messaging app built around a local Matrix core. Matrix provides the durable room/event engine, while users only see USMender: its inbox, rooms, private drafts, mediator approvals, trust controls, and mobile clients.

The root user model is:

1. Open the USMender inbox.
2. Choose or invite a person.
3. Write a private draft.
4. Let the mediator/RAG pipeline prepare a safer shared version.
5. Approve the message.
6. Continue the Matrix-backed room until both people can vote on a concrete plan.

Matrix must remain local and updateable. USMender should not fork Matrix or trap the app on a custom chat engine. Synapse can continue to receive normal upstream updates, and USMender should interact through standard Matrix APIs plus a narrowly scoped USMender application service.

## Research Decision

Decision: run local Matrix/Synapse as the core messaging substrate, build the USMender web/mobile product around it, and keep the current local Postgres/SSE room system only as a phase-0 bridge while the Matrix boundary is implemented.

Databag is the best product reference: small, self-hosted, mobile-friendly, federated, topic-based, E2EE-capable, and simple enough for family-scale hosting. It is not the best root for USMender because the app needs a long-lived local protocol core, standard SDKs, local mobile-client paths, bot/appservice participation, and future federation/bridge options without owning a full custom messenger forever.

Matrix is the better foundation because it gives USMender a standard room/event protocol, established browser SDKs, Synapse self-hosting, mobile-client SDK options, and an Application Service API for a mediator service. The important architectural caveat is that Matrix application services can observe and inject events, but they cannot block or rewrite an event already sent by a user. Therefore USMender must own the composer and send path: raw drafts go to USMender privately, and only approved mediated messages are posted into the shared Matrix room.

Mattermost, Rocket.Chat, Zulip, and similar team-chat products are too shaped around workspace channels and admin-heavy team collaboration. They are useful integration references, but they would make USMender feel like a modified work chat instead of a purpose-built repair messenger.

Sources checked:

- https://github.com/balzack/databag
- https://matrix.org/docs/matrix-concepts/elements-of-matrix/
- https://spec.matrix.org/latest/application-service-api/
- https://github.com/matrix-org/matrix-js-sdk
- https://docs.mattermost.com/integrations-guide/plugins.html
- https://docs.rocket.chat/docs/rocketchat-ai-app

## Matrix-Core Architecture

The app should have three layers:

1. Matrix core: local Synapse, local Matrix Postgres, media store, optional TURN later, and normal upstream update path.
2. USMender service layer: auth mapping, room creation, private drafts, mediator/RAG jobs, approval previews, safety controls, and Matrix application service.
3. USMender clients: Next.js mobile-first PWA, `apps/ios` native shell/client, and a later Android path if the PWA is not enough.

Users should not need to know Matrix exists. Generic Matrix clients such as Element can be useful for admin/debugging, but the production user path should be USMender-only so the mediation contract cannot be bypassed.

The monorepo should be organized around these boundaries:

- `apps/web`: Next.js mobile-first PWA, inbox, thread view, trust settings, and approval composer.
- `apps/api`: Fastify command API for auth, contacts, invites, room orchestration, private drafts, approvals, and room snapshots.
- `apps/worker`: asynchronous mediation/RAG jobs, safety checks, retrieval, memory writes, and delivery retries.
- `apps/matrix-appservice`: Matrix application service that maps USMender rooms to Matrix rooms and posts approved mediator/user events.
- `apps/ios`: USMender mobile client using the same command APIs and Matrix-backed room snapshots.
- `packages/messaging-core`: provider interface for Matrix plus a temporary local adapter.
- `packages/mediation-core`: state machine, safety policy, prompt contracts, approval token logic, and output schemas.
- `packages/shared`: cross-app types, validation helpers, event names, and UI-safe DTOs.
- `services/cat`: existing Cheshire Cat mediator plugins, retained as one RAG/model lane.

The current repo already has useful pieces: Next web, Fastify API, Prisma, event ledger, SSE room updates, approval tokens, delivery attempts, and Cat routing. The rebuild should harden those pieces into a Matrix-aware messenger layer instead of replacing everything blindly.

## Message Pipeline

Every shared message follows this path:

1. Client creates a private draft in USMender.
2. API stores the draft as private data, never as a Matrix room event.
3. Safety classifier checks coercion, threats, harassment, and crisis language.
4. Retrieval gathers Matrix room history, participant commitments, prior proposals, trust settings, and selected knowledge snippets.
5. LLM mediator returns neutral rewrite, recipient framing, coach note, follow-up prompt, and safety metadata.
6. API signs an approval preview tied to the room revision and draft hash.
7. User edits or approves the preview.
8. API records an immutable USMender message event and posts the approved version into the Matrix room.
9. Worker embeds the approved event and updates room memory.

This gives the app its core promise: raw feelings can be written honestly, but the shared Matrix room only receives intentional, approved language.

## Data Model Rebuild

Phase 0 can map the existing `MediationSession` model to "room", but the target model should become messaging-native:

- `Conversation`: topic, relationship label, status, Matrix room id, provider status.
- `ConversationMember`: user, Matrix user id, role, consent, read state, notification state.
- `MessageEvent`: immutable shared event ledger with author, kind, sequence, Matrix event id, and redaction metadata.
- `PrivateDraft`: raw user draft, draft hash, retention policy, and deletion state.
- `MediationJob`: draft id, retrieval bundle id, model lane, result, safety decision, latency, and retry state.
- `ApprovalPreview`: signed preview payload, version, expiry, and approval/rejection state.
- `RetrievalBundle`: selected Matrix timeline, sources, vector ids, and prompt budget.
- `MemoryItem`: embeddings and durable commitments, boundaries, agreements, unresolved themes, and follow-up reminders.
- `MatrixMapping`: local user/room/event ids mapped to Matrix user/room/event ids.

Existing `SessionEvent`, `Message`, `MediationTurn`, `DeliveryAttempt`, and `Vote` concepts should be migrated into these names gradually rather than through one dangerous rewrite.

## UX Rebuild

The app should feel like a messenger, not a form flow.

Primary screens:

- Inbox: Matrix-backed rooms, unread state, active mediator stage, last approved shared message.
- Thread: shared conversation, mediator cards, proposal cards, vote cards, and delivery/read state.
- Composer: private draft area, rewrite preview, approve/send, edit, hold, and safety pause states.
- Contact/invite: search local users, invite by email/SMS link, and explain consent.
- Trust settings: raw draft retention, mediator strictness, notification channels, and safety escalation.
- Room memory: agreements, boundaries, recurring patterns, and follow-up check-ins surfaced as chat-native cards.

Mobile rules:

- Thread and composer are the main screen.
- Inbox collapses to a tab or drawer.
- Approval preview appears above the composer, never as a separate page.
- Proposal voting is a compact message card.
- All actions must be thumb-friendly and resilient to intermittent mobile connectivity.
- Mobile clients should be USMender clients. Matrix stays local under the hood.

## RAG/LLM Design

The mediator is not one prompt. It is a pipeline:

- Safety gate: deterministic checks plus model review for edge cases.
- Retrieval router: Matrix timeline, member-specific commitments, prior agreements, tone preferences, and selected support docs.
- Mediation rewrite: neutral shared message and a short private coach note.
- Proposal planner: structured plan cards with criteria and tradeoffs.
- Reflection memory: stores durable facts only after approval or clear shared-room evidence.
- Closeout worker: follow-up message and reminder suggestions.

Keep the current primary/support Cat split, but wrap it behind a `MediationProvider` interface so RassyGPT, OpenAI-compatible APIs, or a future local RAG service can be swapped without changing the message flow.

## Runtipi Stack

Target Matrix-core stack:

- `web`: USMender Next.js PWA on internal port 3000.
- `api`: USMender Fastify API on 3001.
- `worker`: mediation queue and retrieval jobs.
- `postgres`: USMender app state and event ledger.
- `matrix-postgres`: Synapse database or a separate database/schema if operationally cleaner.
- `matrix`: local Synapse homeserver.
- `matrix-appservice`: USMender mediator bridge.
- `cat`: primary mediation/RAG lane.
- `cat-support`: proposal/refinement lane.
- `vector`: pgvector in Postgres first, Qdrant only if retrieval scale or isolation needs justify it.

Runtipi packaging should keep the app source under `/data/runtipi/runtipi-appstore/gpu-private-store/apps/web-usmender`, with generated/live copies synced only during deployment.

## Implementation Phases

### Phase 0: Product Contract And Local Bridge

- Update homepage and app metadata to the Matrix-core messenger direction.
- Treat the dashboard as an inbox and the session thread as a room.
- Preserve current approval tokens, SSE updates, delivery attempts, and state machine while Matrix is wired in.
- Add private draft lifecycle and explicit approved-message events.
- Draft the `MessagingProvider` and `MatrixMapping` design before schema migration.

### Phase 1: Matrix Provider Boundary

- Add `MessagingProvider` interface with local provider and Matrix provider implementations.
- Move room posting, read receipts, typing/presence, and event fanout behind the provider.
- Normalize event ids and delivery/read state so the UI does not care whether an event came from the local bridge or Matrix.
- Add worker process for mediation jobs and retrieval indexing.

### Phase 2: Local Synapse Core

- Add Synapse and Matrix appservice to compose.
- Create Matrix users and rooms through USMender.
- Post only approved messages into Matrix rooms.
- Keep raw drafts in USMender private storage with retention controls.
- Keep generic Matrix clients out of the normal user flow so users see USMender, not Matrix.
- Validate Matrix update path independently from USMender releases.

### Phase 3: Mobile Clients

- Ship the web app as a PWA first.
- Keep native iOS work in `apps/ios` once the thread/composer model is stable.
- Decide whether Android needs a native client after PWA testing.
- Add push notification strategy for room nudges, approvals, invites, and follow-ups.

## Immediate Next Changes

- Exercise the Matrix provider under real family-account flows and replace the local bridge only after stored room/event mappings are first-class.
- Promote worker mediation jobs from health-checkable service to real async queue processing.
- Persist first-class `MatrixMapping`, `PrivateDraft`, `ApprovalPreview`, and `MessageEvent` models instead of using delivery attempts for provider dispatch metadata.
- Continue renaming user-facing session language to room/conversation.

## v0.5 Delivered Baseline

- Homepage and metadata now present USMender as a Matrix-core repair messenger.
- `@usmender/messaging-core` defines the provider boundary and ships local plus Matrix appservice providers.
- API health reports the active messaging provider.
- API session creation ensures a provider room, signup/accept ensures provider users, and approved mediated messages dispatch through the provider.
- Provider dispatch results are recorded as `MESSAGE_EVENT` delivery attempts.
- `apps/matrix-appservice` exposes health, user mapping, room creation, member invite, approved-message, read, and timeline endpoints. It runs in mock mode without a homeserver token, Synapse mode when configured, and keeps a local mirror if Synapse command calls fail during v0.5 hardening.
- `apps/worker` is deployed and health-checkable as the v0.5 placeholder for async mediation/RAG jobs.
- Compose and Runtipi package definitions include local Synapse, matrix-appservice, worker, API, web, Postgres, and Cat lanes, with Matrix selected as the default messaging provider for v0.5.
