# Rassy Online Design Spec

## Goal

Build `web-rassyonline` as a fully installable Runtipi app for `rassy.online`: a public, magical, ChatGPT-class web interface for using RassyCodex/RassyGPT capabilities with anonymous chat, registered-user history, per-user document/vector workspaces, and admin controls.

The app must be production-shaped from the beginning. It is not a static demo, not only a source checkout, and not a thin redirect from `rassy.online` to another site. It must install, start, stop, restart, expose, and health-check through Runtipi.

## Core Product Shape

Rassy Online is a full-screen AI workbench. The default page is the chat experience itself, not a landing page. Anonymous visitors can immediately chat in an ephemeral session. Registered users can keep history, upload documents, toggle which knowledge sets are active, customize the visual experience, and return later with their workspace intact.

The experience should feel like a magical instrument panel rather than a generic clone. It should still preserve the ergonomics people expect from ChatGPT: message composer, streaming responses, stop/regenerate, edit/retry, branch from a prior answer, model/mode selector, file attachments, chat history, search, settings, and mobile-friendly layout.

The visual language should be whimsical and distinctive: luminous dark surfaces, alive-but-not-distracting motion, lane constellations, floating document sigils, animated thinking states, and user-customizable themes. It must remain readable, accessible, and efficient under repeated daily use.

## Non-Negotiable Runtipi Requirements

The app must follow the custom appstore dynamic compose pattern:

- `config.json` at the app root.
- `docker-compose.yml` at the app root.
- `metadata/description.md`.
- `metadata/logo.jpg` or another accepted logo asset.
- One public web service marked with:
  - `x-runtipi.is_main: true`
  - `x-runtipi.internal_port: 3000`
- Private support services for Postgres, Redis if needed, and Qdrant.
- Persistent state under `${APP_DATA_DIR}/app-data/web-rassyonline/...`.
- RassyCodex access from containers through `http://host.docker.internal:8844`.
- `extra_hosts: host.docker.internal:host-gateway` wherever a service calls RassyCodex.
- Healthcheck for the public service.
- No baked secrets.
- Form fields for public URL, auth secret, admin bootstrap email, RassyCodex base URL, optional RassyCodex API key, upload limits, and registration policy.

Validation must prove:

- appstore validator passes;
- `docker compose config --quiet` passes;
- Runtipi can install/start/stop/restart the app;
- source checkout, installed copy, generated compose, app-data env, live containers, and public HTTP route are checked separately;
- health route returns healthy only when database and required app services are reachable.

## Recommended Stack

Use a custom Next.js App Router app instead of forking Open WebUI or LibreChat.

Core stack:

- Next.js App Router and React.
- TypeScript.
- Tailwind CSS plus focused component primitives.
- `assistant-ui` for chat UI primitives and streaming state patterns.
- Vercel AI SDK for OpenAI-compatible streaming, tool calls, multi-step tools, attachments, message persistence, and model adapters.
- Better Auth for registration, login, session management, and future auth plugins.
- Postgres for durable app data.
- Drizzle ORM for schema and queries.
- Qdrant for user-dependent vector collections.
- Motion for React for layout transitions, gesture polish, and reduced-motion-aware animations.
- React Three Fiber for a controlled, nonessential magical scene layer.
- Playwright for UX verification.
- Vitest for core TypeScript tests.

Use app-local Qdrant for user documents. RassyCodex remains the model/embedding/rerank gateway; Qdrant stores Rassy Online user workspace vectors. This preserves clean boundaries:

- RassyCodex: model lanes, embeddings, rerank, media, and gateway status.
- Rassy Online: users, chats, documents, document toggles, per-user retrieval, theme state, and admin policy.

## RassyCodex Capability Matching

The app should expose RassyCodex capabilities through understandable modes while keeping precise backend routing.

Initial modes:

- `Deep Coding`: `rassy-codex`, long coding/operator work, high-context reasoning.
- `Fast Coding`: `rassy-codex-lite`, normal coding loops and faster agent-style tasks.
- `General`: `rassy-general`, broad assistant chat and analysis.
- `Quick`: `rassy-fast`, short answers, titles, summaries, and lightweight utility chat.
- `Knowledge`: chat plus enabled document retrieval, embeddings through `rassy-embed`, rerank through `rassy-rerank`.
- `Image`: `rassy-image`, exposed after endpoint proof.
- `Audio`: `rassy-audio`, exposed after endpoint proof.

The UI should not dump raw model names only. It should show friendly modes with optional advanced details. Admins can see raw route names, lane health, and backend metadata.

Required backend integration surfaces:

- `/v1/models` or equivalent model listing.
- `/v1/chat/completions` streaming.
- `/v1/embeddings` for document and query vectors.
- `/v1/rerank` if available.
- `/admin/status` for admin-only lane status.
- `/ready` or `/health` for connectivity checks.

If a capability is unavailable, the app should show a graceful disabled state with the exact failing dependency in admin diagnostics. It should not pretend the feature works.

## User Accounts

Anonymous users:

- Can start chatting immediately.
- Get local-browser ephemeral history.
- Can upload only if public uploads are enabled by admin.
- Are encouraged, not forced, to create an account when they need history or durable documents.

Registered users:

- Email/password registration and login.
- Persistent threads.
- Message search.
- Saved document libraries.
- Per-thread document toggles.
- Saved theme/personality preferences.
- Ability to export or delete their own chats and documents.

Admin users:

- Bootstrap admin via configured email or first-run setup token.
- User list, role changes, disable/enable accounts.
- Registration policy: open, invite-only, closed.
- Upload policy: anonymous disabled/enabled, max file size, allowed extensions.
- Model/mode policy: enable/disable modes globally.
- RassyCodex diagnostics: connection, model list, lane health, failed route details.
- Vector diagnostics: Qdrant collection status, document indexing failures, chunk counts.
- Audit events for login, upload, delete, role change, and admin setting changes.

## Data Model

Primary tables:

- `users`: identity, role, status, created/updated timestamps.
- `sessions`: auth sessions.
- `accounts`: auth provider records if needed by Better Auth.
- `threads`: owner, title, mode, pinned state, archived state, last message timestamp.
- `messages`: thread, role, content, model, mode, token metadata, parent/branch metadata.
- `attachments`: uploaded files attached to messages.
- `documents`: owner, title, filename, mime type, size, storage path, status, checksum.
- `document_sets`: user-created groups of documents.
- `document_set_items`: document membership.
- `thread_document_toggles`: which documents or sets are active for each thread.
- `document_chunks`: document, chunk index, text preview, token count, vector id, status.
- `retrieval_events`: thread, query, selected document ids, chunk ids, rerank scores.
- `theme_profiles`: owner, schema-validated theme settings.
- `admin_settings`: registration, uploads, model policy, public limits.
- `audit_events`: admin and security-sensitive events.

Qdrant collection design:

- Use an app-local Qdrant instance.
- Either one collection with strict `user_id` payload filters or one collection per user. The initial implementation should use one collection with payload filters because it is easier to manage and test.
- Every point payload includes `user_id`, `document_id`, `document_set_ids`, `chunk_id`, `checksum`, and `created_at`.
- Retrieval must always filter by authenticated user and active document set. Anonymous upload retrieval, if enabled, gets a short-lived anonymous workspace id.

## Document Ingestion

Supported first:

- `.txt`
- `.md`
- `.pdf`
- `.docx`

Pipeline:

1. Store the original file under app-data.
2. Create document row with `pending` status.
3. Extract text server-side.
4. Chunk text with stable chunk ids.
5. Embed chunks through RassyCodex.
6. Upsert vectors into Qdrant with ownership payload.
7. Mark document `ready`.
8. On failure, keep the document visible with exact status and retry action.

Thread chat retrieval:

1. Build query from latest user message and optional recent thread context.
2. Embed query through RassyCodex.
3. Search Qdrant with `user_id` plus active document filters.
4. Rerank candidates if `rassy-rerank` is available.
5. Inject compact citations/context into the model request.
6. Store retrieval event for transparency/debugging.

## Chat UX

Required baseline:

- Full-height app shell.
- Left thread sidebar on desktop, drawer on mobile.
- Center chat column with streaming assistant messages.
- Composer with file attach, mode selector, active document indicator, stop/send button.
- Message actions: copy, regenerate, edit, branch, delete.
- Thread actions: rename, pin, archive, delete, export.
- Active document tray: visible enabled document sets, toggle menu, upload action.
- Status ribbon: current mode, RassyCodex health, retrieval activity.
- Keyboard-friendly and screen-reader-aware controls.

Magical details:

- A subtle animated "lane constellation" that reacts to selected mode and response state.
- Streaming state as a legible spell-like trace, not hidden loading fluff.
- Document uploads become "knowledge charms" that can be enabled/disabled per thread.
- The active theme can be changed from settings or by chatting with a constrained theme tool.
- No decorative cards inside cards.
- No in-app instructional copy that explains obvious UI mechanics.

## Chat-Driven Theme Changes

Add a safe `theme_designer` tool.

User asks: "make this feel like an emerald observatory" or "less neon, more moonlit library."

The assistant returns a structured theme proposal:

- `name`
- `palette`
- `surfaceStyle`
- `motionIntensity`
- `scene`
- `messageShape`
- `density`
- `fontMood`

The app validates it against a strict schema, previews it, and asks the user to apply or discard. The model cannot send arbitrary CSS or scripts. Admin can disable this feature globally.

## Admin UX

Admin routes live under `/admin`.

Views:

- Overview: app health, RassyCodex status, Qdrant status, Postgres status.
- Users: search, role, status, created date, last active.
- Documents: indexing failures, large uploads, retry/delete actions.
- Models: RassyCodex model list, enabled modes, capability status.
- Settings: registration mode, upload limits, anonymous limits.
- Audit: recent sensitive actions.

Admin controls must be explicit and reversible where possible. Destructive actions require confirmation.

## Stage Looping Mechanism

Every implementation stage must follow a deliberate loop:

1. Clarify: restate what the stage is meant to achieve and list open questions.
2. Build: implement only the stage scope.
3. Inspect: run tests, lint/build, and relevant runtime checks.
4. UX review: inspect desktop and mobile with screenshots where UI changed.
5. Capability match: confirm the feature maps to the intended RassyCodex/Runtipi capability.
6. Report: summarize evidence, gaps, and next-stage decision.
7. Q&A gate: ask for approval or adjustments before expanding the next stage.

The loop should be lightweight for small stages and more formal for risky stages. The project must not jump from scaffold to every advanced feature in one pass.

## Implementation Stages

### Stage 1: Runtipi-Installable Skeleton

Deliver:

- App metadata.
- Docker compose with web, Postgres, Qdrant.
- Next.js app booting on port 3000.
- Health route.
- Store validator pass.
- Compose config pass.

Q&A gate:

- Confirm Runtipi app name, public title, default exposed port, and domain copy.

### Stage 2: Auth, Roles, And Admin Bootstrap

Deliver:

- Better Auth integration.
- Registration/login/logout.
- User roles.
- Bootstrap admin.
- Admin shell.
- Auth tests.

Q&A gate:

- Confirm registration policy defaults and whether anonymous uploads are allowed.

### Stage 3: Core Chat And RassyCodex Gateway

Deliver:

- Streaming chat.
- Anonymous ephemeral chat.
- Registered user persisted threads/messages.
- Mode selector.
- RassyCodex health/model checks.
- Admin model diagnostics.

Q&A gate:

- Confirm mode names and which RassyCodex lanes are public vs admin-only.

### Stage 4: User Vector Database And Documents

Deliver:

- Uploads.
- Text extraction.
- Chunking.
- Embedding through RassyCodex.
- Qdrant user-filtered vectors.
- Document sets.
- Per-thread toggles.
- Retrieval and rerank.
- Citation/context trace in UI.

Q&A gate:

- Confirm document UX vocabulary, default max sizes, and whether anonymous document workspaces remain disabled.

### Stage 5: Full ChatGPT-Class Interaction Polish

Deliver:

- Regenerate/edit/branch/copy/export.
- Thread search and archive.
- Active document tray.
- Composer attachment polish.
- Empty, loading, disabled, and error states.

Q&A gate:

- Confirm the interaction set feels complete before deeper visual work.

### Stage 6: Magical UX System

Deliver:

- Responsive visual system.
- Motion layer.
- R3F lane constellation.
- Theme profiles.
- Chat-driven theme proposal tool.
- Reduced-motion mode.
- Desktop/mobile screenshot review.

Q&A gate:

- Review the "wow" factor and adjust the visual direction before release hardening.

### Stage 7: Admin Completeness And Safety

Deliver:

- User management.
- Settings.
- Audit events.
- Document failure diagnostics.
- Capability toggles.
- Rate-limit policy.

Q&A gate:

- Confirm admin operations match real maintenance needs.

### Stage 8: Runtipi Runtime Proof

Deliver:

- Source validation.
- Installed-copy sync.
- Generated compose inspection.
- App-data env inspection.
- Runtipi install/start/stop/restart proof.
- Live HTTP proof for domain/local route.
- Browser QA.
- Final README/operations doc.

Q&A gate:

- Confirm release readiness and whether to commit/push/deploy publicly.

## Testing Strategy

Unit tests:

- schema validation;
- auth policy helpers;
- mode-to-model mapping;
- theme schema validation;
- document chunking;
- retrieval filters;
- admin policy checks.

Integration tests:

- RassyCodex client with mocked OpenAI-compatible responses;
- document ingestion against local Qdrant when feasible;
- chat persistence;
- role-protected admin routes.

Runtime checks:

- `npm run lint`;
- `npm run test`;
- `npm run build`;
- `docker compose config --quiet`;
- appstore validator;
- container health checks;
- RassyCodex health/model probe;
- Playwright desktop/mobile smoke.

## Security And Abuse Controls

- Server-side auth checks on every user-owned resource.
- Qdrant payload filters must always include `user_id`.
- Upload extension and size validation.
- Store uploads outside the web root.
- No arbitrary CSS/scripts from theme tool.
- Rate limits for anonymous chat, login, registration, upload, and embedding.
- Admin-only RassyCodex diagnostics.
- Secrets only from env/app-data, never committed.
- Audit log for admin changes and destructive actions.

## Stage Gate Decisions With Starting Defaults

These decisions should be confirmed during the stage loops. Each one has a starting default so implementation is never blocked by an undefined choice:

- Registration launches as `open` with admin ability to switch to `invite-only` or `closed`.
- Anonymous users default to `General` mode with no persistent documents.
- Anonymous uploads default to disabled.
- Bootstrap admin comes from `RASSY_ONLINE_BOOTSTRAP_ADMIN_EMAIL`; no hardcoded email.
- Image and audio lanes are admin-enabled only until live endpoint proof passes.
- Initial upload limit is 25 MB per file and 250 MB total per registered user.
- Public users see friendly mode names by default; raw model names appear in advanced details and admin diagnostics.

## Success Definition

The first release is successful when:

- Runtipi can install, start, stop, and restart `web-rassyonline`.
- `rassy.online` opens the app.
- Anyone can chat anonymously.
- A registered user can log in, keep chat history, upload documents, toggle them per thread, and receive grounded answers from their own vector workspace.
- An admin can manage users, registration, uploads, model availability, and diagnostics.
- The app demonstrably uses RassyCodex for chat, embeddings, and rerank where available.
- The UI feels unmistakably like Rassy Online, not a default AI template.
