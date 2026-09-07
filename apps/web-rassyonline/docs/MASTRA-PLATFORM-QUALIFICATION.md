# Mastra platform qualification

## Implemented

Mastra `1.63.2` is installed in the Next.js web container. A canonical Mastra instance and
registries now define the Rassy, Researcher, Knowledge, Coder, and Utility agents; typed web
search and user-scoped document-search tools; semantic RassyMind lane/capability metadata; a
safe workflow catalog; opt-in MCP configuration; and declarative skills guidance.

RassyMind remains the model provider through its OpenAI-compatible `/v1` endpoint. Existing
Qdrant embedding/reranking, SearXNG, authentication, threads, uploads, and Runtipi three-
service topology are preserved. No physical model names or credentials are exposed.

## Validation

- `npm run lint`: passed
- `npm test -- --run`: 40 tests passed
- `npm run build`: passed
- Runtipi Compose topology and persistent mounts: retained unchanged

## Explicit migration boundary

The existing chat route remains the compatibility implementation for streaming, legacy thread
persistence, and current UI behavior. It has not yet been replaced by an agent stream because
Mastra memory and route streaming parity need an additive schema migration and dedicated
integration tests before enabling them against existing production data. Mastra PostgreSQL
storage, dynamic workflow persistence, Studio, user activity UI, and live deployment are not
claimed by this phase.

## Security and operations

Document tools require an authenticated user ID and selected ready document IDs; rerank
failure falls back to bounded vector similarity. Coder has no shell/workspace tool. MCP is
disabled by default. Continue to treat Runtipi managed-mirror synchronization and container
recreation as deployment steps separate from source/build qualification.

## Next extensions

Add an agent-stream adapter with abort/error tests, perform an additive Mastra Postgres schema
migration, dual-read then migrate thread memory, and expose agent/tool/workflow/activity
catalogs in the existing authenticated UI before switching the default chat path.
