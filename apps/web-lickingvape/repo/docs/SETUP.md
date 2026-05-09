# Setup

## Prerequisites
- Docker + Docker Compose
- Optional: Node 20+ and Python 3.11+ for local dev outside Docker

## Environment
Create a `.env` file next to `infra/docker-compose.yml` (or export vars in your shell):

- `INTERNAL_TOOL_TOKEN` (required) shared token for internal tool endpoints
- `ADMIN_TOKEN` (optional but recommended) token required for /admin endpoints and the admin UI
- `PHONE_HASH_SECRET` (required) HMAC secret for hashing phone numbers
- `TWILIO_AUTH_TOKEN` (required for SMS) Twilio auth token
- `PUBLIC_BASE_URL` (required for Twilio signature validation) public HTTPS base URL for the API
- `WEB_ORIGIN` (optional) comma-separated allowed origins for CORS
- `ALLOW_PROFANITY` (default `true`)
- `REQUIRE_ADMIN_REVIEW` (default `false`)
- `SEED_DEMO_CONTENT` (default `true`) seeds starter posts and about content on first run
- `AUTH_SECRET` (required for web user auth/session tokens)
- `SESSION_TTL_DAYS` (default `30`) session lifespan
- `CAT_API_KEY` (required for worker to access Cheshire Cat endpoints)
- `CAT_USER_ID` (optional) Cheshire Cat user id header
- `CAT_REVIEW_ENDPOINT` (optional) defaults to `http://cat:80/custom/editor/review`
- `CAT_DRAFT_ENDPOINT` (optional) defaults to `http://cat:80/custom/editor/draft`
- `CAT_INTERNAL_TOKEN` (optional) extra shared header for Cat-side internal calls
- `WORLD_CONTEXT_QUERY_LIMIT` (default `4`) number of latest world lanes the API exposes by default
- `WORLD_CONTEXT_ITEMS_LIMIT` (default `4`) number of items per lane the API exposes by default
- `WORLD_CHAT_CONTEXT_ITEMS` (default `3`) number of world items Cheshire can fold into app-chat replies
- `WORLD_INGEST_ENABLED` (default `true`) turns automatic `search.rasies.com` ingestion on/off
- `WORLD_INGEST_INTERVAL_SECONDS` (default `1800`) minimum delay between ingests for the same query
- `WORLD_SEARCH_BASE_URL` (default `https://search.rasies.com/search`)
- `WORLD_SEARCH_LANGUAGE` (default `en-US`)
- `WORLD_SEARCH_SAFESEARCH` (default `0`)
- `WORLD_SEARCH_RESULTS_LIMIT` (default `6`) max stored results per query/run
- `WORLD_SEARCH_MAX_AGE_DAYS` (default `21`) drops stale search items older than this
- `WORLD_SEARCH_QUERIES` (optional) JSON array or `||`-separated list of custom ingest queries
- `WORLD_CONTEXT_ITEMS_FOR_DRAFT` (default `4`) how many ingested items the worker passes into the Cat draft prompt
- `WORLD_AUTOPUBLISH_ENABLED` (default `true`) turns scheduled night-desk posting on/off
- `WORLD_AUTOPUBLISH_INTERVAL_SECONDS` (default `14400`) minimum delay between autopilot posts
- `WORLD_AUTOPUBLISH_MAX_PER_DAY` (default `3`) hard cap for automatic posts in a rolling 24-hour window
- `WORLD_AUTOPUBLISH_STATUS` (default `published`) can be `published`, `draft`, or `queued`
- `WORLD_AUTOPUBLISH_MAX_WORDS` (default `150`) draft length cap for automatic posts
- `WORLD_AUTOPUBLISH_DISPLAY_NAME` (default `night desk`) byline used for automatic posts
- `EDITOR_WORLD_CONTEXT_QUERY_LIMIT` (default `2`) number of lanes the Cat plugin auto-loads while drafting
- `EDITOR_WORLD_CONTEXT_ITEMS_LIMIT` (default `3`) number of items per lane the Cat plugin auto-loads while drafting
- `OLLAMA_GENERAL_BASE_URL` (default `http://ollama-general:11434`) LLM endpoint used by Cheshire Cat
- `OLLAMA_EMBED_BASE_URL` (default `http://ollama-embed:11434`) embedding endpoint used by Cheshire Cat
- `OLLAMA_GENERAL_MODEL` (default `gpt-oss:20b`)
- `OLLAMA_EMBED_MODEL` (default `nomic-embed-text:latest`)

## Run locally (Docker)
```
python3 scripts/configure_cat_ollama.py
docker compose -f infra/docker-compose.yml up --build
```

Services:
- Web: http://localhost:3000
- API: http://localhost:8000
- Cheshire Cat UI/API: http://localhost:1865

## Cheshire Cat review endpoint
The worker calls Cheshire Cat at `http://cat:80/custom/editor/review` and `http://cat:80/custom/editor/draft` by default. Create an API key in Cheshire Cat and set `CAT_API_KEY` so the worker can authenticate.

## Automatic world ingest + autopublish
With the defaults above, the worker continuously:
1. Pulls fresh JSON results from `search.rasies.com`
2. Stores the latest world pulse in Postgres
3. Lets Cheshire Cat auto-load that stored pulse while drafting
4. Publishes short night-desk posts on a schedule, up to the daily cap

## Cheshire + local Ollama
If you are running local Ollama stacks on this machine (`ollama-general` and `ollama-embed`), apply:
```
python3 scripts/configure_cat_ollama.py
```
This writes `cat/data/metadata.json` so Cheshire Cat uses:
- LLM: `OLLAMA_GENERAL_BASE_URL` + `OLLAMA_GENERAL_MODEL`
- Embedder: `OLLAMA_EMBED_BASE_URL` + `OLLAMA_EMBED_MODEL`

## Twilio inbound SMS
1. Configure a Twilio Messaging Service or phone number with webhook:
   - URL: `https://YOUR_DOMAIN/webhooks/sms/twilio`
   - Method: `POST`
2. Set `PUBLIC_BASE_URL` so signature verification uses the public URL.
3. Set `TWILIO_AUTH_TOKEN` to validate `X-Twilio-Signature`.

### A2P 10DLC note
If you enable outbound SMS replies from a US 10DLC number, Twilio requires A2P 10DLC registration. This stack defaults to no outbound replies.
