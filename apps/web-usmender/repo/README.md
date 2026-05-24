# web-usmender

USMender is being rebuilt as a mobile-first repair messenger around a local Matrix core. Users see USMender rooms, private drafts, mediator approvals, trust controls, and mobile clients; Matrix/Synapse stays local underneath as the durable room/event substrate.

The current v0.5 implementation runs the app through the Matrix provider boundary by default while preserving the local bridge as a development fallback. See `ops/PLAN.md` for the rebuilt product plan and `ops/MATRIX_CORE_DESIGN.md` for the implementation boundary.

## Ports
| Service | Port | Purpose | Health |
|---|---:|---|---|
| web | 3294 | Primary web UI | / |
| api | 3295 | Backend API | /healthz |
| matrix-appservice | 3002 internal | USMender Matrix bridge | /healthz |
| worker | 3003 internal | Mediation/RAG job worker | /healthz |
| matrix | 8008 internal | Local Synapse homeserver | /_matrix/client/versions |
| db | 3297 | Postgres | - |

## Local Run
```bash
npm install
npm run dev:api
npm run dev:web
```

## Run with Docker
```bash
docker compose up -d --build
```

The default stack now includes the mediator service too:
- `web`
- `api`
- `postgres`
- `matrix`
- `matrix-appservice`
- `worker`
- `cat`
- `cat-support`

Current backbone highlights:
- signed mediator previews, so the approved message is the exact version that gets stored and shared
- live room updates over server-sent events for multi-user in-app messaging
- explicit room read acknowledgements so delivery/read state follows actual in-app activity
- stage-aware mediated messaging, so the room stays conversational through intake, proposal review, and voting
- dual Cheshire Cat routing, so sensitive turn-by-turn mediation stays on the primary model while structured proposal/refinement work can use a support model
- same-origin `/api` proxying in the Next app, so published deployments do not depend on browser-side `localhost` calls
- durable delivery records for invites and message nudges
- SMS-friendly invite delivery scaffolding with a console fallback and optional Twilio wiring
- local Synapse plus a USMender Matrix appservice selected as the v0.5 messaging backbone

v0.5 Matrix-core pieces:
- `@usmender/messaging-core` provider interface with local and Matrix appservice providers
- API dispatch of approved mediated messages through the messaging provider
- local Matrix appservice with health, user mapping, room creation, approved-message, and timeline endpoints
- worker service deployed and health-checkable while mediation remains inline in the API
- Synapse service in compose with local appservice registration
- compose defaults select `USMENDER_MESSAGING_PROVIDER=matrix`, with local-provider fallback still available for development

It also seeds a demo account on first boot:
- email: `initiator@usmender.dev`
- password: `password123`

The API will fall back to built-in neutral copy if no external LLM service is configured.

## Optional External Ollama Network
By default both bundled Cheshire Cat containers try `host.docker.internal:11434` for Ollama.
If you already run separate `ollama-general`, `ollama-code`, and `ollama-embed` containers on `ollama_llm-net`, use the extra compose file:

```bash
docker compose -f docker-compose.yml -f docker-compose.ai.yml up -d --build
```

That overlay keeps the same app stack and joins both Cat containers to the external Ollama network.

The Cheshire Cat plugin now exposes a `mediate_turn` endpoint that lets the API ask for a rewritten message, sender coaching, recipient framing, and the mediator's likely next prompt in one pass.
The API routes proposal drafting, proposal refinement, and closeout guidance through a support Cat when available, then falls back to the primary Cat so the room keeps moving if the secondary model is down.

## Health
- Check `ops/ports.yaml` for each service-specific health path.

## Optional SMS / text handoff

The API now supports a delivery abstraction for invite links and message nudges.

- Default: `USMENDER_SMS_PROVIDER=console`
- Optional SMS provider: `USMENDER_SMS_PROVIDER=twilio`
- Public room / invite links use `USMENDER_PUBLIC_WEB_URL`

Twilio-related variables:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`
- `USMENDER_TWILIO_STATUS_CALLBACK_URL`
