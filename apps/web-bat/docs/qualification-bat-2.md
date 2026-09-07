# BAT 2.0 qualification

## Current result

- Python suite: 192 passed.
- Mastra TypeScript build: passed.
- Mastra report schema tests: 2 passed.
- Next.js production build: passed; 23 routes generated.
- Compose configuration: passed.
- Local runtime Mastra health: passed.
- Local authenticated research workflow: passed; empty source corpus correctly
  returned a weak-evidence warning.
- Local report run creation, artifact persistence, publication, and slug lookup:
  passed. The smoke report correctly remained fact-check failed because no
  approved sources were available.
- Live source ingestion produced policy-approved sources; the authenticated
  Mastra research workflow returned three source records and no weak-evidence
  warning.
- A three-chapter source-visible report was persisted, published, and served by
  the rebuilt web container at `/reports/[slug]`.
- Protected RassyMind credentials were loaded from the RassyMind environment
  without being printed or committed. Capability discovery reported all six
  semantic lanes available, and live Mastra story generation returned grounded
  `rassy-mind` output through the OpenAI-compatible chat surface.
- Report API: implemented with internal-token protection for run creation and publication.
- Public and admin report routes: implemented.

## Runtime boundary

The app remains in staged migration. Existing Python editorial generation and
Cheshire compatibility are preserved while Mastra research/report contracts are
qualified. No claim is made here of live RassyMind, Postgres, Qdrant, X, or
managed-Runtipi proof; those require the protected runtime environment.

## Remaining qualification gates

1. Apply `infra/sql/005_report_runtime.sql` to existing installations using the
   supported database migration path.
2. Run an authenticated Mastra research/report request against live BAT API and
   RassyMind.
3. Persist a returned artifact, verify citations, then approve and publish it.
4. Only after parity evidence remove Cheshire and BAT-local legacy model paths.

## Legacy retirement audit

The legacy runtime retirement cutover is complete: the Cheshire container was
stopped and removed from the active Compose topology, and BAT-local Ollama/Cat
environment wiring was removed. Compatibility modules remain in source for
rollback/data-export history, but no Cheshire or Ollama process is active.
Mastra capability discovery, research, source-grounded story generation, and
report publication are live through RassyMind.
