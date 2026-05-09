# Codex Prompt: Build **Totally Righteous Tales** (Web + iOS) 🚀📚✨

Copy/paste everything from **“BEGIN PROMPT”** to **“END PROMPT”** into Codex (or your coding agent).  
This is written to produce a real, runnable MVP with a clean path to production.

---

## BEGIN PROMPT

You are a senior full-stack engineer + product-minded architect.  
Build an MVP for **Totally Righteous Tales**: a whimsical, “old Twitter but long-form” storytelling community for the domain **totallyrighteoustales.com**.

### North Star
Create a delightful place where people can:
- Write or speak a “totally righteous tale” (typing + voice-to-text + optional LLM polishing).
- Submit it into a moderation queue.
- If approved (lightly moderated), it appears publicly in the feed and can be upvoted/downvoted.
- Earn “credits” and climb a leaderboard (king/queen tall-tale teller vibes) while still appearing anonymous to the public.

### Product Rules (must-haves)
1. **Login is required** (so we can track credits), but **public identity is pseudonymous**:
   - By default, display as something like `Anonymous Badger #1842` (auto-generated).
   - Users can optionally set a “Display Name” that is not their real name, and we discourage PII.
2. **Tales are long-form**:
   - Target 400–2,500 words (soft limit). Support markdown-lite formatting.
3. **Light moderation**:
   - Tales and images enter a queue as `PENDING`.
   - An automated check runs immediately.
   - Then a moderator can approve/reject quickly.
4. **Images are optional**, but:
   - No personal photos or identifiable faces. Aim for illustrations, landscapes, abstract, etc.
   - Run basic image moderation + face detection. If a face is detected, auto-reject (or flag).
5. **Voting**:
   - Authenticated users can upvote/downvote.
   - Prevent vote brigading: one vote per user per tale; rate limit; basic abuse checks.
6. **Featured tales**:
   - A “Featured” section highlights top tales (ranking algorithm, time decay).
7. **Web and iOS** should feel like the same product.

---

## Tech Stack (make these choices unless there’s a strong reason not to)

### Monorepo
Use a monorepo with a single `package.json` at root, using **pnpm workspaces**.

### Apps
- **Web:** Next.js (App Router) + TypeScript + Tailwind CSS  
- **iOS:** Expo (React Native) + TypeScript  
- **API:** Node.js + Fastify (or Express) + TypeScript  
  - Use **Prisma** as ORM
  - Use **PostgreSQL**
  - Use **Redis + BullMQ** for background jobs (moderation, ranking updates, image processing)
- **Auth:** Email magic link (or passwordless) via **Supabase Auth** or **NextAuth + Email provider**  
  - Requirement: secure sessions, refresh tokens, and server-side verification.

### Storage
- Store images in **S3-compatible object storage** (e.g., AWS S3, Cloudflare R2, or Supabase Storage).
- Store only what you need:
  - Don’t store raw audio long-term. Keep it briefly for transcription, then delete.

### OpenAI integrations (optional but supported)
- Speech-to-text: call the Audio Transcriptions API.
- Content moderation: call the Moderations API for text + images.
- Story helper: an LLM “tale polishing” endpoint that returns suggested edits (user approves).

Important:
- Make OpenAI usage **feature-flagged** (env var), so the app runs without it.
- Never send secrets to the client. All OpenAI calls happen server-side.
- Make prompts safe: do not request or store personal data.

---

## UI/UX Style Spec (cute + magical, but clean)
- The feed feels like an “antique microblog scroll”:
  - Paper-like cards, soft rounded corners, subtle sparkles, tasteful icons.
  - Mobile-first, accessible, fast.
- Minimal clutter: focus on reading.
- Compose screen should feel special:
  - Title field + story body editor
  - Buttons: **Type**, **Speak**, **Polish with Magic** (LLM), **Attach Image**, **Submit**
- Reader view:
  - Big title, author pseudonym, timestamp, vote buttons, share link.
- Provide dark mode.

---

## Core User Flows (acceptance criteria)
### 1) Sign up / login
- User can sign in with magic link or email/password.
- User gets a generated pseudonym on first login.

### 2) Create tale (typed)
- User opens Compose, writes title + tale, submits.
- Tale enters `PENDING` with a record of automated checks.

### 3) Create tale (voice)
- User records audio on iOS.
- App uploads audio to API.
- API transcribes to text and returns draft text into editor.
- User can edit, then submit.

### 4) Optional: “Polish with Magic”
- User clicks button, API calls LLM to suggest improvements.
- Return suggestions in a diff-like UI:
  - Show original vs suggested.
  - User chooses Accept/Reject.

### 5) Moderation queue
- Admin/moderator can review pending items:
  - Approve, Reject (with reason), or Needs-Edits.
- On approve: tale becomes visible publicly.

### 6) Feed + ranking
- Public feed shows approved tales sorted by “Hot” (time-decayed score).
- Also offer “New” and “Top (All Time)”.

### 7) Voting + credits
- Users upvote/downvote.
- Credits update:
  - +1 for posting approved tale
  - +1 for upvoting (daily cap)
  - +N when your tale gets upvotes (e.g., +2 per net upvote, with anti-abuse)
  - -1 for downvote received (optional)
- Show leaderboard.

### 8) Profile
- Shows pseudonym, credits total, badges, your tales.
- Privacy: no email shown publicly.

---

## Data Model (Postgres via Prisma)
Design the schema with these tables (minimum):
- `User`:
  - id (uuid), email, createdAt
  - pseudonym (string), displayName (nullable), avatarSeed (string)
  - role (`USER` | `MOD` | `ADMIN`)
  - creditsTotal (int)
- `Tale`:
  - id, authorId, title, body, createdAt, updatedAt
  - status (`PENDING` | `APPROVED` | `REJECTED` | `NEEDS_EDITS`)
  - approvedAt (nullable), rejectedAt (nullable), rejectionReason (nullable)
  - hotScore (float), topScore (int), commentCount (int, optional)
  - imageId (nullable)
- `Vote`:
  - id, userId, taleId, value (-1 or +1), createdAt
  - unique constraint (userId, taleId)
- `CreditLedger` (recommended):
  - id, userId, type, delta, metaJson, createdAt
- `ModerationEvent`:
  - id, taleId (nullable), imageId (nullable)
  - source (`AUTO` | `HUMAN`), result (`PASS` | `FLAG` | `BLOCK`)
  - categoriesJson, scoreJson, notes, createdAt
- `ImageAsset`:
  - id, uploaderId, storageKey, url, width, height, createdAt
  - status (`PENDING` | `APPROVED` | `REJECTED`)
  - hasFace (boolean), moderationJson

Also:
- Use soft delete where appropriate (e.g., `deletedAt`).

---

## Ranking Algorithm (implement now, keep simple)
Implement **Hot Score** similar to time-decayed Reddit style:
- `score = upvotes - downvotes`
- `hot = log10(max(|score|, 1)) + sign(score) * ageFactor`
- where `ageFactor` uses hours since creation (tune constant).
Also store:
- `topScore = score` for all-time sorting.

Run a background job every N minutes to recompute `hotScore` for recent tales.

---

## Safety & Abuse Prevention (must implement)
- Rate limit:
  - Tale submission: e.g., max 5/day per user.
  - Voting: e.g., max 200/day.
- Basic anti-spam:
  - Reject duplicate tales (hash title+body).
  - Block obvious links spam (optional).
- Content moderation:
  - Auto-check text and image; if severe, auto-reject and notify mods.
  - If uncertain, flag for human review.
- Image rules:
  - Strip EXIF metadata before storing.
  - Face detection: if face detected, auto-reject or force moderator review.
- Logging:
  - Audit moderation actions with user id and timestamp.

---

## Deliverables (what you must output)
You must output **a runnable codebase**, not just an outline.

### Output format (strict)
1. A short overview (max 15 lines).
2. A repo tree.
3. Then **every file** needed to run the project locally, using this format repeatedly:
   - A line with: `FILE: path/to/file`
   - A fenced code block with that file’s contents.
4. A final `README.md` that includes:
   - Setup instructions (pnpm, docker compose, env vars)
   - How to run web, api, ios
   - How to run tests
   - How to seed the database
   - Admin login setup / how to become a moderator
   - Deployment notes (Vercel/Fly/Render, etc.)

### Runtime requirements
- Include `docker-compose.yml` for Postgres + Redis.
- Add migrations + seed script.
- Add minimal tests:
  - API: test create tale, approve tale, voting.
  - Web: basic smoke test or Playwright for feed load.

---

## Implementation Plan (follow this order)
### Phase 0: Scaffolding
- Create monorepo structure:
  - `apps/web`
  - `apps/ios`
  - `apps/api`
  - `packages/shared` (types, zod schemas)
- Configure TypeScript, linting, formatting.

### Phase 1: API + DB
- Prisma schema + migrations
- Auth middleware
- Core endpoints:
  - `POST /tales` create (PENDING)
  - `GET /tales` list (filters: status=APPROVED, sort=hot|new|top)
  - `GET /tales/:id` detail
  - `POST /tales/:id/vote` vote
  - `POST /images` upload pre-signed URL or server upload
  - `POST /moderation/tales/:id/approve` (MOD/ADMIN)
  - `POST /moderation/tales/:id/reject` (MOD/ADMIN)
  - `GET /moderation/queue` (MOD/ADMIN)
- Background jobs:
  - auto moderation on submit
  - recompute hotScore
  - image processing (strip EXIF, face detect)

### Phase 2: Web app
- Public:
  - Feed page with tabs (Hot/New/Top)
  - Tale detail
  - Login
- Authenticated:
  - Compose (editor + submit)
  - Profile
  - Leaderboard
- Moderator:
  - Queue screen with approve/reject controls

### Phase 3: iOS app (Expo)
- Navigation:
  - Feed -> Detail -> Compose -> Profile -> Leaderboard
- Voice-to-text:
  - Record audio, upload to `/transcribe`, receive text draft
- Image attach:
  - Pick image, upload, attach to tale
- Auth:
  - same as web (token-based)

### Phase 4: Polish
- Cute UI elements (icons, subtle animations)
- Accessibility
- Performance (pagination / infinite scroll)
- Security hardening

---

## Additional Notes / Assumptions
- If you have to choose between “complete and shippable” vs “over-engineered,” choose shippable.
- Keep everything documented and beginner-friendly.
- When a step could fail, provide troubleshooting tips.
- Where you make an assumption, state it in comments or in README.

---

## END PROMPT

---

## Progress Log (2026-02-21)
- Scaffolded monorepo with `apps/web`, `apps/api`, `apps/ios`, `packages/shared`.
- Implemented Prisma schema, seed script, and Fastify API with core routes.
- Added BullMQ workers for moderation + hot score recompute (stub image processing).
- Built Next.js UI with feed, detail, compose, login, profile, leaderboard, moderator queue.
- Added Expo iOS starter with Supabase magic link login.
- Added basic API + web tests and root README.

## Notes / Caveats
- Image processing is stubbed (no real EXIF stripping or face detection yet).
- OpenAI integrations are placeholders.
- Supabase auth is used; API verifies JWT via `SUPABASE_JWT_SECRET`.
- iOS UI is minimal and needs full navigation + API usage.

## Next Steps
1. Implement real image pipeline: upload -> strip EXIF -> face detection -> approve/reject.
2. Wire OpenAI transcription + moderation when `OPENAI_ENABLED=true`.
3. Add vote credit updates and daily caps in `CreditLedger`.
4. Expand iOS app (feed, detail, compose, profile, leaderboard) and hook to API.
5. Add pagination/infinite scroll + featured tales logic.
6. Add richer moderation UI (reason capture, needs-edits flow).


---

## Progress Log (2026-02-21, Later)
- Wired LocalAI support in API (chat, moderation, transcription, embeddings) with env config defaults for this server.
- Added `/polish` endpoint and wired web compose to call it with LocalAI.
- Implemented iOS navigation (Feed/Detail/Compose/Profile/Leaderboard/Login) with Supabase auth + API integration.
- Added vote credit updates with daily cap (`CREDITS_DAILY_UPVOTE_CAP`).

## Notes / Caveats
- Transcription expects multipart audio upload; iOS client still needs recording + upload wiring.
- Embeddings are configured but not yet stored or used in ranking/search.


---

## Progress Log (2026-02-21, Audio + Embeddings)
- Added TaleEmbedding model and cosine similarity check for duplicate detection.
- Stored embeddings on tale creation when LocalAI is enabled.
- Added iOS audio recording + transcription upload flow in Compose.
- Added Expo audio permissions in `app.json` and `expo-av` dependency.


---

## Progress Log (2026-02-21, Semantic Search)
- Added `/tales/search?query=` endpoint using LocalAI embeddings + cosine similarity.
- Added env tuning for search pool size + minimum similarity.


---

## Progress Log (2026-02-21, Build-Out Pass)
- Added featured tales endpoint, pagination params, and "my tales" endpoint.
- Added semantic search pagination.
- Added image moderation queue endpoints and upgraded image processing (EXIF strip + metadata).
- Added web search UI, featured hero, markdown rendering, voice recording, profile edit, and my tales list.
- Added iOS search and profile edit updates.


---

## Progress Log (2026-02-21, Needs-Edits Flow)
- Added `PATCH /tales/:id` for author edits when status is NEEDS_EDITS (resubmits to PENDING).
- Exposed rejection reasons to owners/mods in tale detail.
- Added web edit page and profile edit links.
- Added iOS edit screen + profile list linking to edit.

