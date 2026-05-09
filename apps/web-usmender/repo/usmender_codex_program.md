# USMender Relationship Arbitration App
## Codex Build Program (Web + iOS) 🫧

> Paste the **Codex Prompt** sections into your coding agent (Codex or similar).  
> This spec builds a production-shaped MVP for **usmender.com** style mediation with a **Cheshire Cat AI** core and a custom **Arbitration plugin**.

---

## 1) Codex Prompt
### Role
You are **Codex**, a senior full-stack engineer and product-minded implementer. Build a calm, secure, testable mediation product:

- **Web app** (responsive)
- **iOS app**
- **Backend API**
- **Cheshire Cat AI** service (dockerized)
- **Arbitration plugin** for Cheshire Cat exposing deterministic custom endpoints

You must implement the app end-to-end with:
- a clear state machine
- predictable LLM behavior (no “free-form chat orchestration”)
- privacy + consent guarantees
- basic safety red-flag handling

### Non-negotiables
1. **Raw user messages are never shown verbatim** to the other party.
2. Invitee must **explicitly consent** before any “resolution proposal” step begins.
3. If safety red flags appear (threats, coercion, stalking, self-harm), the session must **abort safely** and not forward content.
4. The system must be **calming** and **low-friction** to use.
5. Everything must be **locally runnable** via `docker compose up` + simple app commands.

### Allowed assumptions
- We will build an MVP first, then list Phase 2 items.
- We will use **TypeScript** for web + mobile + backend.
- We will use **Python** inside Cheshire Cat for the plugin.
- We will use Postgres as the primary database.

### Explicit out-of-scope (MVP)
- Payments and subscriptions with real billing (implement plan gating only, payments stubbed)
- Therapy/diagnosis, crisis counseling, legal arbitration
- PDF export (Phase 2)
- Full admin console (Phase 2)

---

## 2) What the product does (core loop)
USMender is a structured mediation loop between **two participants**:

### Mediation loop
1. **Initiator** writes their need in their own words (private).
2. Cheshire Cat **rewrites** it into a neutral outreach message for the Invitee:
   - kind
   - accurate
   - non-accusatory
   - consent-based
3. Invitee chooses: **Resolve** or **Decline**.
4. If Invitee accepts:
   - both parties provide short perspectives
   - Cat asks clarifying questions as needed
5. Cat generates a **Proposal v1** (bullets + acceptance criteria).
6. Both vote:
   - YES / NEEDS CHANGES / NO
7. If not both YES:
   - one refinement loop → **Proposal v2**
   - second vote
8. If still not both YES:
   - **Close without agreement** with compassionate next-step guidance
9. If both YES:
   - **Agreement** summary + follow-up suggestion

---

## 3) Architecture overview
### Services
- `apps/web` - Next.js web app
- `apps/ios` - Expo React Native iOS app
- `apps/api` - Node.js + TypeScript backend (Fastify recommended)
- `services/cat` - Cheshire Cat AI running in docker
- `services/cat/plugins/usmender_arbitration` - Python plugin with custom endpoints
- `postgres` - DB
- (optional) `qdrant` - vector store, Phase 2 or optional now

### Communication model
**Clients never talk to Cheshire Cat directly**.  
Clients → USMender API → Cheshire Cat custom endpoints.

This keeps Cat credentials server-side and simplifies security.

---

## 4) UX principles (calm UI spec) 🌿
Codex: implement UI that feels like “a quiet room with good lighting”.

### UI behaviors
- Short screens, one clear action each
- No harsh alerts except safety
- Soft microcopy:
  - “Take your time.”
  - “You can pause whenever you need.”
- Stepper: Invite → Perspectives → Proposal → Vote → Wrap

### Accessibility
- Large tap targets
- Supports Dynamic Type (mobile)
- Keyboard-friendly inputs
- Clear focus outlines (web)

### Message views
Each participant sees two lanes:
- **My private messages** (raw)
- **Shared summary** (neutralized, safe)

---

## 5) Data model (Postgres)
Codex: implement with Prisma migrations + seed data.

### Tables

#### User
- `id` uuid PK
- `email` unique
- `displayName`
- `createdAt`

#### Relationship
- `id`
- `createdByUserId`
- `label` (optional)
- `participantAUserId`
- `participantBUserId` (nullable until invite accepted)

#### MediationSession
- `id`
- `relationshipId`
- `status` (enum)
- `topic` (short string)
- `createdByUserId`
- `createdAt`, `updatedAt`
- `closedAt` nullable

#### Participant
- `id`
- `sessionId`
- `userId`
- `role` enum: INITIATOR | INVITEE
- `consentStatus`: PENDING | ACCEPTED | DECLINED
- `lastSeenAt`

#### Message
- `id`
- `sessionId`
- `authorUserId` nullable for system/cat
- `visibility`: PRIVATE_TO_AUTHOR | SHARED_REPHRASE | SYSTEM
- `kind`: USER_RAW | CAT_REPHRASE | CAT_QUESTION | USER_REPLY | CAT_PROPOSAL | CAT_SUMMARY
- `content` text
- `createdAt`

#### Proposal
- `id`
- `sessionId`
- `version` int (1 or 2)
- `title`
- `bulletPoints` json array
- `acceptanceCriteria` json array
- `createdAt`

#### Vote
- `id`
- `proposalId`
- `userId`
- `value` YES | NO | NEEDS_CHANGES
- `comment` optional (private-to-cat)
- `createdAt`

#### Invite
- `id`
- `sessionId`
- `token` random, unique
- `inviteeEmailOrPhone`
- `status` SENT | OPENED | ACCEPTED | DECLINED | EXPIRED
- `expiresAt`
- `createdAt`

#### AuditLog
- `id`
- `sessionId`
- `actor` USER | SYSTEM | CAT
- `eventType`
- `payload` json
- `createdAt`

### MVP encryption approach
- Dev mode: plain storage
- Prod mode: encrypt `Message.content` and `Vote.comment` using application-level encryption:
  - `ENABLE_DB_ENCRYPTION=true`
  - `DATA_ENCRYPTION_KEY` (32 bytes base64)
Codex: implement `encrypt()` / `decrypt()` with libsodium or node crypto.

---

## 6) State machine (the heart)
Codex: implement as a pure function with exhaustive tests.

### Status enum
- `DRAFT`
- `INVITE_READY`
- `INVITED`
- `ACTIVE_INTAKE`
- `PROPOSAL_V1`
- `VOTING_V1`
- `REFINEMENT`
- `PROPOSAL_V2`
- `VOTING_V2`
- `AGREED`
- `CLOSED_NO_AGREEMENT`
- `ABORTED_SAFETY`

### Allowed transitions
- DRAFT → INVITE_READY (after initiator submits need + context)
- INVITE_READY → INVITED (after invite sent)
- INVITED → ACTIVE_INTAKE (invitee accepts)
- INVITED → CLOSED_NO_AGREEMENT (invitee declines or invite expires)
- ACTIVE_INTAKE → PROPOSAL_V1 (after both contributed at least once)
- PROPOSAL_V1 → VOTING_V1
- VOTING_V1 → AGREED (both YES)
- VOTING_V1 → REFINEMENT (any NO / NEEDS_CHANGES)
- REFINEMENT → PROPOSAL_V2
- PROPOSAL_V2 → VOTING_V2
- VOTING_V2 → AGREED (both YES)
- VOTING_V2 → CLOSED_NO_AGREEMENT (otherwise)
- ANY → ABORTED_SAFETY (safety flag)
- ANY → CLOSED_NO_AGREEMENT (anyone exits)

Codex: add a `transition(session, event)` reducer, and test every event in every state.

---

## 7) Safety policy (must implement)
### Trigger conditions (minimum viable)
If any user message indicates:
- imminent violence
- threats
- coercive control
- stalking/harassment
- self-harm ideation
- “I’m not safe”, “they will hurt me”
Then:
- DO NOT forward to other party
- mark session `ABORTED_SAFETY`
- show “safety-first” guidance screen
- store only minimal audit metadata (avoid storing harmful detail)

---

## 8) Cheshire Cat AI integration
### What Cheshire Cat provides
Cheshire Cat is a production-ready agent framework that exposes HTTP endpoints, WebSocket chat, and a plugin system. You can access API docs at:
- `http://localhost:1865/docs` (when running locally)

### Plugin strategy
We will NOT rely on a free-form chat bot to orchestrate the app.  
Instead, the app orchestrates the state machine and calls deterministic plugin endpoints:

- rewrite invite
- ask clarifying question
- propose v1
- refine v2
- closeout guidance

This makes behavior testable and stable.

---

## 9) Arbitration plugin spec (Python)
### Plugin name
`usmender_arbitration`

### Folder structure
```
services/cat/plugins/usmender_arbitration/
  plugin.json
  usmender_arbitration.py
```

### Endpoints (required)
All endpoints must return JSON and must include `safetyFlag` if applicable.

#### 1) POST /custom/usmender/draft_invite
Input:
- `initiatorNeedRaw: string`
- `relationshipType: "romantic"|"family"|"roommate"|"work"|...`
- `desiredOutcome?: string`
- `boundaries?: string[]`

Output:
- `inviteMessageNeutral: string`
- `issueSummaryNeutral: string`
- `subjectLine: string`
- `safetyFlag: { flagged: boolean, reason?: string }`

#### 2) POST /custom/usmender/intake_question
Input:
- `sessionSummary: string`
- `who: "INITIATOR"|"INVITEE"`
- `lastUserMessage: string`

Output:
- `question: string`
- `whyThisQuestion?: string` (internal)

#### 3) POST /custom/usmender/propose_resolution_v1
Input:
- `neutralSummaryOfInitiator: string`
- `neutralSummaryOfInvitee: string`
- `constraints?: string[]`

Output:
- `proposal: { title: string, bullets: string[], acceptanceCriteria: string[] }`
- `toneNote?: string`
- `safetyFlag`

#### 4) POST /custom/usmender/refine_resolution_v2
Input:
- `proposalV1`
- `votes: { userId: string, value: "YES"|"NO"|"NEEDS_CHANGES", comment?: string }[]`

Output:
- `proposal: { title, bullets, acceptanceCriteria }`
- `changeLog: string[]`
- `safetyFlag`

#### 5) POST /custom/usmender/closeout_guidance
Input:
- `sessionSummary: string`
- `blockers: string[]`

Output:
- `closureMessage: string`
- `nextSteps: string[]`
- `suggestedFollowUpWindowDays: number`

### Prompt style rules inside the plugin
Enforce a calm arbitration tone:
- no blame
- reflect needs, not accusations
- keep messages readable on mobile
- never reveal raw private messages to the other party
- avoid therapy voice; do not diagnose

Codex: implement these in a single reusable `STYLE_GUIDE` string and apply it to every generation.

---

## 10) Backend API spec (Node + Fastify)
Codex: implement typed routes with zod validation.

### Auth
Choose one and fully implement:
- Email + password, or
- Magic link

Use JWT sessions. Rate limit auth routes.

### Core endpoints
- `POST /auth/signup`
- `POST /auth/login`
- `GET /sessions`
- `POST /sessions`
- `GET /sessions/:id`
- `POST /sessions/:id/need`  
  - stores raw need privately
  - calls Cat `draft_invite`
  - stores neutral invite preview (SYSTEM message)
  - transitions DRAFT → INVITE_READY

- `POST /sessions/:id/invite`  
  - creates invite token
  - sends invite email (dev: console log)
  - transitions INVITE_READY → INVITED

- `POST /invites/:token/accept`  
  - transitions INVITED → ACTIVE_INTAKE

- `POST /invites/:token/decline`  
  - transitions INVITED → CLOSED_NO_AGREEMENT

- `POST /sessions/:id/message`  
  - author sends private input
  - backend decides if Cat should ask intake question
  - stores both USER_RAW (private) + CAT_REPHRASE (shared) if relevant

- `POST /sessions/:id/propose`  
  - only allowed once intake complete
  - calls Cat `propose_resolution_v1`
  - stores Proposal v1
  - transitions ACTIVE_INTAKE → PROPOSAL_V1 → VOTING_V1

- `POST /sessions/:id/vote`  
  - stores vote
  - if both YES:
    - transitions → AGREED
    - generate agreement summary (Cat or template)
  - else:
    - go to refinement or closeout

- `POST /sessions/:id/exit`  
  - transitions ANY → CLOSED_NO_AGREEMENT

### Orchestration rules
- Backend is the only system that may change session state.
- Cat is a pure “advisor/transformer” service.

---

## 11) Web app (Next.js)
### Required pages
- `/` landing (minimal)
- `/login`
- `/dashboard`
- `/sessions/new`
- `/sessions/:id` (session room)
- `/invites/:token` (accept/decline)
- `/settings`

### Session room UI
- Stepper header
- Two-lane messages:
  - private (only me)
  - shared summary (what the other sees)
- Proposal card + vote buttons

---

## 12) iOS app (Expo RN)
### Screens
- Auth
- Dashboard
- Start session
- Invite preview
- Session room
- Vote
- Agreement
- Closeout
- Safety abort

### iOS details
- Smooth keyboard handling
- Respect safe areas
- Haptics on “vote submitted” and “agreement reached”

---

## 13) Plan gating (MVP)
Implement plan gating matching the site’s idea:
- Free tier: **1 mediation session per month**
- Premium: **unlimited sessions** (no billing yet)

Codex: create `UserPlan` table, compute sessions created in current month, block session creation if exceeded, and show upgrade prompt.

---

## 14) Local dev: docker compose
Codex: provide `compose.yml` that starts:
- postgres
- api
- cat core + plugin mount
- (optional) qdrant

### “It works when”
- `docker compose up` starts everything
- Cat docs visible at `http://localhost:1865/docs`
- `POST /custom/usmender/draft_invite` returns a neutral invite JSON
- Web app can create session and reach AGREED in the happy path

---

## 15) Testing requirements ✅
### Unit tests
- state machine transition table
- vote aggregation logic
- message visibility rules (never leak raw)

### Integration tests
- happy path (agreement)
- disagreement path (refinement then closeout)
- safety abort path

### E2E (web)
- create session → invite → accept → intake → proposal → vote yes/yes

---

## 16) Deliverables checklist
Codex, do not declare “done” until:
- [ ] monorepo boot instructions work from a clean machine
- [ ] all required endpoints implemented
- [ ] all state transitions enforced server-side
- [ ] plugin endpoints secured behind backend (no public keys in clients)
- [ ] tests passing
- [ ] basic UI complete on web + iOS

---

## 17) Implementation plan (build order)
1. Monorepo scaffolding + tooling (lint, typecheck, test)
2. DB schema + migrations + seed
3. API skeleton (auth + sessions)
4. Cat docker + plugin with `draft_invite`
5. Orchestration for invite flow
6. Intake + proposal v1 + vote v1
7. Refinement v2 + vote v2 + closeout
8. Web UI end-to-end
9. iOS UI end-to-end
10. Safety and polish

Each step must include:
- exact commands to run
- expected output
- observable success signals

---

## 18) Phase 2 ideas (after MVP)
- Push notifications
- PDF export of agreement
- Admin dashboard and analytics
- Per-relationship history, tagging, search
- Better safety classifier model
- Enterprise team accounts + SSO

---

## 19) Reference links (for the developer)
Put these in a browser while implementing:
- USMender site and feature language: https://usmender.com/  
- USMender FAQ: https://usmender.com/faq/  
- USMender pricing: https://usmender.com/pricing/  
- Cheshire Cat docs (plugins): https://cheshire-cat-ai.github.io/docs/plugins/plugins/  
- Cheshire Cat docs (auth): https://cheshire-cat-ai.github.io/docs/production/auth/authentication/  
- Cheshire Cat docs (env vars): https://cheshire-cat-ai.github.io/docs/production/administrators/env-variables/  
- Cheshire Cat docs (docker compose): https://cheshire-cat-ai.github.io/docs/production/administrators/docker-compose/  
- Cheshire Cat docs (HTTP endpoints): https://cheshire-cat-ai.github.io/docs/production/network/http-endpoints/

---

## 20) Final note to Codex
Build with empathy and engineering discipline.  
When the product is used, someone is probably stressed. The UI and words must feel like a steady hand on the wheel. 🌙

---

## Codex Build Log
### 2026-02-21
- Created a monorepo scaffold with `apps/`, `packages/`, and `services/`.
- Implemented the shared state machine + safety detector with exhaustive transition tests.
- Built a first-pass “quiet room” web landing page with ambient motion and soft UI.
- Added an API skeleton (Fastify) with a health check.
- Implemented a deterministic Cheshire Cat arbitration plugin with safety gating.
- Added `compose.yml` with Postgres, API, and Cheshire Cat services + plugin mount.

Next up:
- Add Prisma schema/migrations and seed data.
- Implement auth, sessions, invites, and message orchestration in the API.
- Wire API → Cheshire Cat endpoints with deterministic flows.
- Build the session room UI and start the iOS screens.

### 2026-02-21 (Later)
- Aligned Cheshire Cat custom endpoints to use `cat=check_permissions(...)` and confirmed plugin mount paths in Docker compose.

### 2026-02-21 (DB + API)
- Added Prisma schema for all core tables + enums, including `UserPlan`.
- Added seed data and Prisma scripts to the API workspace.
- Wired the API to the state machine for initial `submit need` flow.
- Added basic session creation + need submission routes with safety gating.
- Updated Docker compose with `DATABASE_URL` and API Dockerfile to run `prisma generate`.
- Adjusted Docker build context to include shared workspace compilation for API runtime.

### 2026-02-21 (Cat orchestration + Session room)
- Added a Cat HTTP client with zod validation + safe fallbacks.
- Wired `/sessions/:id/need` to call `draft_invite` and store neutral summaries + invite preview.
- Added `/sessions/:id/message` intake flow with Cat clarifying questions and safety aborts.
- Created session room UI with stepper, private/shared lanes, proposal card, and votes.
- Added new session and dashboard pages to make the flow clickable.
- Ensured API dev/build runs the shared package build for workspace imports.

### 2026-02-21 (Finishing touches pass)
- Added global web shell (header + footer) with calm navigation and CTA.
- Added login, settings, and invite pages with consent-first microcopy.
- Polished web UI states, focus styles, and responsive layout adjustments.
- Expanded iOS UI to a full session-room mock with stepper, lanes, proposal, and haptic vote buttons.

### 2026-02-21 (Web ↔ API wiring)
- Added a dev bootstrap endpoint to create a demo user, relationship, and session.
- Wired the new session form to call the API and store invite drafts for preview.
- Added a client-side invite preview page that reads the draft and links into the room.
- Added web API helper + environment example for API base URL.

### 2026-02-21 (Auth + relationship creation)
- Added email/password auth with JWT, rate limiting, and `/me` endpoint.
- Added password hashing to the User model and updated seed credentials.
- Implemented relationship creation and locked session creation to authenticated users.
- Removed dev bootstrap usage from the web flow and wired auth-based creation.
- Updated login UI to create accounts or sign in and store JWT locally.

### 2026-02-21 (Invite flow end-to-end)
- Added invite creation, token lookup, accept, and decline endpoints with state transitions.
- Added invite token generation + 7-day expiry and updated invite status to OPENED on view.
- Wired web invite preview to send invites and show shareable links.
- Built invite acceptance UI that creates or verifies accounts and issues JWT for the invitee.

### 2026-02-21 (Plan gating)
- Enforced free-tier monthly session limit (1) on session creation.
- Added upgrade prompt messaging in the web new-session form.

### 2026-02-21 (Plan status panel)
- Added `/plan` API endpoint for current plan and monthly session usage.
- Added settings plan panel with upgrade CTA and usage visibility.
