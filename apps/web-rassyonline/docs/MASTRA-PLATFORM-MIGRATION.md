# Mastra platform migration

## Current architecture

The Runtipi package runs one Next.js web container with Postgres and Qdrant. Authentication, thread persistence, document isolation, embedding, vector search, optional reranking, SearXNG, RassyMind transport, SSE parsing, and response persistence currently meet in `apps/web/src/app/api/chat/route.ts`.

## Problems

The route is difficult to extend safely: model selection, context assembly, tools, and transport are coupled. There is no canonical agent/tool/workflow registry, and the existing thread tables are not exposed as an agent memory abstraction.

## Target architecture

Mastra is the server-side application-intelligence layer inside the existing web container. RassyMind remains the only model gateway; Postgres and Qdrant remain durable services. Agents select semantic RassyMind lanes, tools enforce user scope, and workflows provide deterministic multi-step orchestration. The Next.js route remains responsible for authentication, product state, and streaming adaptation.

## Retained and replaced

Existing users, threads, messages, documents, uploads, vectors, auth, admin surfaces, Runtipi topology, and graceful rerank/search fallbacks are retained. Manual orchestration is progressively moved into `src/mastra`; direct transport helpers remain the compatibility boundary until streaming parity is proven.

## Data migration and rollout

This phase is additive and non-destructive. Existing tables and Qdrant collections are not dropped. Mastra storage is configured for new memory/workflow metadata only after its schema migration is explicitly run against the existing Postgres service. Agent/tool registries and workflows are code-owned first; persisted dynamic definitions are deferred until validation and authorization are implemented.

Rollout is: install and typecheck Mastra, validate the provider and registries with mocks, migrate one experience at a time, then qualify the Runtipi image and live endpoints. Rollback is package/image rollback; no legacy data migration is required for this phase.
