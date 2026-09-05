# Mastra migration

Mastra installation is intentionally gated behind current official package and supply-chain verification. The application boundary is prepared without making an unqualified package a production dependency. The intended integration point is the Fastify API, with protected internal routes, application-owned authorization, Postgres-backed durable state, and RassyMind as the only production model layer.
