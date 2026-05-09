# Multi-Brand Astrology Platform Codex Build Prompt

Paste the prompt below into Codex (or your codegen agent). It is designed to generate a **single monorepo** that builds **4 branded websites + 4 branded iOS apps** from one shared backbone (natal chart + LLM reading), with per-brand “lens” modules and theming.

---

```text
You are a senior full-stack engineer + product designer building a white-label astrology platform.

GOAL
Create a single monorepo that builds:
- 4 branded websites (Next.js) at:
  - jupiterseek.com
  - saturnseer.com
  - saturnleo.com
  - maleficme.com
- 4 branded iOS apps (Expo React Native), one per brand, each with its own bundle id, app name, icon, splash, and theme.

The products must share a common backbone:
1) Birth data intake: date, exact time, location
2) Geo + timezone resolution
3) Natal chart calculation: planets, signs, houses, angles, aspects
4) LLM-based “full birth chart reading” generated from structured chart data
5) A minimal, elegant UI (spare typography, generous whitespace, high contrast)
6) Brand-specific “focus lens” layered on top of the same core chart.

CONSTRAINTS
- The UI must feel minimal and premium, but must NOT copy any competitor.
- Ship an architecture that scales: shared packages, strict types, tests.
- Make the system replicable: add a new brand by adding a config file + assets.
- Keep all core astrology logic in shared packages.
- Ensure privacy & security best practices: minimize stored birth info, encrypt sensitive fields, clear consent, easy deletion.

LICENSING REQUIREMENT (IMPORTANT)
Astrology calculation must be modular with two engines:
A) SwissEphemerisEngine (server-side only) with a placeholder note that Swiss Ephemeris is dual-licensed and closed-source commercial use requires the Professional License.
B) AstronomyEngineEngine (MIT) as default fallback for development.
Code must compile and run using AstronomyEngine by default, and the Swiss engine can be enabled by env var + installing native deps.

(Background: Swiss Ephemeris licensing is AGPL or professional; do not embed it client-side. Make an interface so we can swap engines later.)

TECH STACK
- TypeScript everywhere
- Monorepo using pnpm + turborepo
- Web: Next.js (App Router), Tailwind or CSS Modules, minimal component set
- Mobile: Expo (iOS first), TypeScript, shared UI tokens
- API: Node (Fastify or Next.js route handlers) + Zod validation
- DB: Postgres + Prisma
- Auth: email magic link (or passkeys-ready) using a provider like Supabase Auth or Clerk (choose one and implement cleanly)
- Caching: Redis optional (feature-flag) for expensive readings
- Observability: structured logs; basic request ids; error boundary
- Testing: Vitest unit tests + Playwright smoke tests for the 4 sites

REPO STRUCTURE
/apps
  /api                # REST/JSON endpoints: chart, reading, user profile
  /web-jupiterseek
  /web-saturnseer
  /web-saturnleo
  /web-maleficme
  /mobile             # single Expo app with multi-brand builds
/packages
  /astro-core          # types, chart model, aspects, house math, engine interface
  /astro-engine-astro  # Astronomy Engine implementation (MIT)
  /astro-engine-swiss  # Swiss implementation stub (server-only)
  /reading-core        # prompt builder, safety filters, output schema
  /ui                  # shared UI primitives, typography, spacing, tokens
  /brands              # per-brand config + assets pointers
  /utils               # geo, timezone, formatting, caching helpers
/infra
  docker-compose.yml   # postgres (and redis optional)
/docs
  architecture.md
  brand-playbook.md
  prompt-design.md

BRANDS (COMMON CORE + DISTINCT LENS)
Create a config per brand: name, domain, tone keywords, taboo list, UI tokens, and “focus modules”.

Define each brand lens as follows (make it configurable):
1) jupiterseek
   - Focus: growth, opportunity, meaning, “expansion paths”
   - UX Modules: “Luck Ledger” (opportunities by house), “Quest prompts” (actions)
   - Voice: optimistic, incisive, not cheesy, not guru-ish
2) saturnseer
   - Focus: discipline, boundaries, responsibility, time, earned confidence
   - UX Modules: “Reality Check” (where to commit), “Structure plans”
   - Voice: calm, direct, slightly austere but kind
3) saturnleo
   - Focus: leadership + creative authority under pressure; ego refinement; visibility with integrity
   - UX Modules: “Crown & Anvil” (creative discipline), “Stagecraft” (public self)
   - Voice: regal minimalism; sharp but warm
4) maleficme
   - Focus: shadow work, friction, desire, conflict patterns, transformation (Mars/Saturn vibe)
   - UX Modules: “Hard Truths” (challenge patterns), “Transmute” (practices)
   - Voice: candid, edgy but not cruel; never insulting

ASTROLOGY FEATURES (MUST IMPLEMENT)
Input:
- birthDate (YYYY-MM-DD)
- birthTime (HH:mm) with “unknown time” option:
  - if unknown time: compute chart without houses/angles, and clearly label uncertainty
- birthLocation: text + geocoding -> lat/lon

Timezone:
- Determine IANA timezone from lat/lon (use a library such as geo-tz or tz-lookup)
- Convert local birth datetime -> UTC -> Julian day

Natal Chart Model:
- Planets: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto
- Optional points: Asc, MC, North Node, Chiron (feature flag)
- Houses: Placidus default + Whole Sign option
- Aspects: conjunction, opposition, trine, square, sextile (+ orb config)

Output:
- A normalized JSON chart object with degrees, sign, house, retrograde where applicable
- A chart “wheel” visualization (SVG on web; react-native-svg on mobile)

Note: For chart drawing, you may use an MIT-licensed SVG wheel renderer (or implement a minimal one). Keep it deterministic and themeable.

LLM READING (MUST IMPLEMENT)
Create an endpoint POST /v1/reading/natal that:
- Accepts chart JSON + brand id + user preferences (length: short/standard/deep)
- Produces:
  - Overview (5–8 lines)
  - Big Three (Sun/Moon/Rising if time known; else Sun/Moon + “presentation style” guess)
  - Planet-by-planet interpretations (concise)
  - House themes (if time known)
  - Aspect highlights (top 6 by tightness + relevance scoring)
  - Brand Lens Section (the differentiator)
  - Actionables (3–5 concrete prompts)
- Enforce a strict JSON schema output (Zod) so UI never breaks.
- Add safety filters: no medical diagnosis, no legal/financial instructions, no determinism (“you will die”), no fear-mongering.
- Add a disclaimer: entertainment/spiritual reflection, not professional advice.

PROMPT ENGINEERING (IMPLEMENT)
Create /packages/reading-core with:
- systemPrompt (global rules)
- brandPrompt(brandConfig) (voice + lens)
- builder that turns chart JSON into compact “chart facts” tokens
- output schema validation + repair loop (max 1 retry)
- caching by (userId + chartHash + brand + length)

PRODUCT UX (WEB + iOS)
Flows:
1) Landing page (brand story, minimal, 1 CTA)
2) Birth intake page (fast, elegant)
3) “Chart Reveal” page:
   - show wheel
   - show placements grid
   - show 3–5 highlight bullets (fast gratification)
4) “Full Reading” page:
   - sections collapsed/expandable
   - share card generator (OG image on web; share sheet on iOS)
5) Account page:
   - save charts
   - delete account & data

DESIGN SYSTEM
- Use brand tokens: background, text, accent, font stack, spacing scale
- Default to a minimal black/white base with one accent per brand
- Microinteractions: subtle fade/slide, no loud animations
- Accessibility: semantic headings, color contrast, reduced motion support

DATA MODEL (PRISMA)
Tables:
- User (id, email, createdAt)
- ChartProfile (id, userId, label, birthDate, birthTime, timeUnknown, lat, lon, timezone, chartJson, createdAt)
- Reading (id, chartProfileId, brandId, length, readingJson, createdAt)

Encryption:
- Encrypt raw birth details at rest (at minimum birthTime + precise coordinates), or store only chartJson and coarse location label after calculation.

API ENDPOINTS
- POST /v1/geo/resolve  (location text -> candidates with lat/lon + display name)
- POST /v1/chart/natal  (birth input -> chartJson)
- POST /v1/reading/natal (chartJson -> readingJson)
- GET /v1/me
- GET /v1/charts
- POST /v1/charts
- DELETE /v1/charts/:id
- DELETE /v1/account

BRAND BUILD SYSTEM
Implement a /packages/brands directory with:
- brands.ts exporting a BrandId union and configs
- assets placeholders: icons/splashes paths per brand

Web:
- each /apps/web-<brand> imports brand config and uses same shared App component

Mobile:
- expo config plugin or app.config.ts that builds per brand:
  - APP_BRAND=jupiterseek -> name/icon/bundle id/theme
  - scripts: pnpm ios:jupiterseek, ios:saturnseer, ios:saturnleo, ios:maleficme

DELIVERABLES
- Fully working local dev:
  - pnpm i
  - docker compose up
  - pnpm db:migrate
  - pnpm dev
- Seed script that creates 1 demo user + 2 demo charts
- Unit tests for:
  - timezone conversion
  - aspect detection
  - chart JSON schema
  - reading schema validation
- Playwright smoke test for each web app: intake -> chart -> reading renders

DOCUMENTATION
Write /docs/architecture.md explaining multi-brand setup.
Write /docs/brand-playbook.md explaining how to add a new brand.
Write /docs/prompt-design.md showing the system prompt + brand lens prompt format (no secrets).

IMPLEMENTATION DETAILS
- Use Zod for all request/response validation.
- Keep chart calculation server-side.
- Add rate limiting to reading endpoint.
- Add a “time unknown” path that skips houses/ascendant and alters the reading accordingly.
- Keep the UI minimal and fast, SSR where appropriate on web.

Now generate all code files required, with clean formatting and comments only where useful.
Do not leave TODOs for core features. Stub only the Swiss Ephemeris engine with clear interface and compile-time guards.

Start by outputting a high-level checklist, then generate the repository file tree, then generate each file.
```

---

## Quick sanity check notes (already baked into the prompt)

- The file-generation command uses a **quoted heredoc** so:
  - backticks stay intact
  - `$VARS` do not expand
  - nothing gets mangled by your shell

- The build prompt itself avoids “nested code fence” problems by containing exactly one fenced block (` ```text `) inside the markdown file.

