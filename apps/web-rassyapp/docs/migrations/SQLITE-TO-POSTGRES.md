# SQLite to PostgreSQL Migration

Status: design and verification plan; no live migration has been performed.

The current Runtipi app uses SQLite at `DATABASE_URL=file:/data/dev.db`. The
database must remain available as a rollback source until export, import,
row-count checks, representative reads, and application startup against
Postgres all pass.

## Required sequence

1. Stop write-producing application services or enter maintenance mode.
2. Copy and checksum `dev.db`; verify the copy opens and contains the expected
   tables and row counts.
3. Export existing records, preserving IDs and timestamps.
4. Provision a private, pinned Postgres service and apply the Prisma schema.
5. Import users, sessions, threads/messages, personas, memories, workspaces,
   routines, Studio projects, and related records.
6. Compare counts and representative records, including relationships and
   JSON fields.
7. Start a qualification instance using the Postgres URL and run the full
   application/integration suite.
8. Switch the managed environment only after qualification passes.
9. Keep the SQLite backup, Cat state, Qdrant state, and restore instructions
   until a defined rollback window expires.

## Acceptance checks

- No duplicate IDs or lost records.
- Existing login, threads, workspaces, routines, and Studio projects remain
  readable.
- A new workflow run can be queued and claimed exactly once.
- A worker restart does not lose a leased run after lease expiry.
- Postgres is on a private network and is not publicly exposed.

Do not use `prisma db push` against the live database as a migration strategy.
Use a reviewed migration/export process and record the backup location and
restore command in the deployment runbook.
