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
- `npm test -- --run`: 44 tests passed
- `npm run build`: passed
- Runtipi Compose topology and persistent mounts: retained unchanged

## Current migration boundary

Authenticated chat now uses the Mastra agent stream route. Mastra PostgreSQL storage was
initialized additively in the live Rassy Online database; legacy threads/messages remain
available for history compatibility and are not destructively migrated. The route owns
authentication, bounded search/document context assembly, semantic agent selection, streaming,
and Mastra thread/resource identity. Studio, dynamic workflow persistence, and a full
authenticated browser qualification remain separate follow-up gates.

## Security and operations

Document tools require an authenticated user ID and selected ready document IDs; rerank
failure falls back to bounded vector similarity. Coder has no shell/workspace tool. MCP is
disabled by default. Continue to treat Runtipi managed-mirror synchronization and container
recreation as deployment steps separate from source/build qualification.

## Next extensions

Next: add authenticated route integration coverage, dual-read legacy history where needed, and
expose richer agent/tool/workflow/activity catalogs in the authenticated UI.
