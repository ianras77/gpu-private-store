# Cheshire retirement record

Cheshire has been removed from the Compose runtime. Compatibility code remains
only as a disabled rollback surface while the canonical path is qualified.

Migrated-first callers currently include notebook drafting, radio listener
generation, DM narration, DM embeddings, radio embeddings/reranking, music
librarian enrichment, and public curios. They retain bounded compatibility
fallbacks.

The current direct legacy surface is explicitly inventoried as follows:

- `apps/web/src/lib/cheshire-client.ts`: compatibility transport used by DM
  fallback, admin thought fallback and public-curio fallback.
- `apps/web/src/lib/dm/cheshire.ts`: compatibility adapter and embedding
  fallback; the intelligence provider is attempted first.
- `services/radio-controller/src/dj/rassy.ts`: legacy direct transport for
  the bounded DJ fallback path.
- `services/radio-controller/src/library/track-intelligence.ts`: direct
  analysis/embedding/rerank fallback paths.
- `services/cheshire-proxy`: retained only as source/build compatibility code;
  it is no longer a Compose service.

These are not yet deleted from source because live fallback and failure
behavior must remain recoverable until the production qualification is closed.

Set `RASSY_INTELLIGENCE_REQUIRE_CANONICAL=true` in a staging deployment to
disable the web and radio compatibility transports while leaving the rollback
code present.
This is the required proving mode for the no-Cheshire staging test below.

Retirement requires:

1. Live RassyMind capability discovery through the intelligence service.
2. Contract tests for every migrated caller, including invalid structured
   output and 429/503 behavior.
3. Live radio, DM, notebook, and public-curio smoke tests with the protected
   Runtipi environment.
4. No remaining production imports of `cheshire-client` or direct legacy
   gateway calls, except an explicitly time-boxed rollback adapter.
5. A deployment with the Cheshire service disabled in a staging copy, followed
   by radio continuity and DM idempotency proof.
6. Backup, rollback image, and previous Compose project identity recorded.

The runtime cutover is now canonical-only by default. Final source deletion,
commit/push and managed deployment still require the listed live qualification
and backup gates.
