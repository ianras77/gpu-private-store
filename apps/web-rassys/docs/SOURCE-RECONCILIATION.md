# Source reconciliation

Date: 2026-09-05

## Findings

- The active release tree is `gpu-private-store/apps/web-rassys`, tracked by
  the parent `gpu-private-store` repository on `codex/rassys-2.0`. The
  inspected parent baseline is `ce448927d93b43206e24e7cd58a0936c33ffa2cb`.
- The closest standalone checkout is `/data/apps/2-Migrated/web-rassy`, whose
  baseline is `6ca94ba` (`Merge remote web-rassy updates`). It is not the
  active release checkout and must not overwrite the app-store tree. Its
  remote is `https://github.com/ianras77/web-rassy.git`; verified `HEAD` and
  `main` both resolve to `6ca94ba159d505554f3ea7c0f793e606fd69eea1`.
- The active app-store subtree contains 331 tracked files; the standalone
  checkout contains 245. These are different layouts/releases, so a blind
  directory replacement is invalid.
- The managed source mirror is `/data/runtipi/apps/gpu-private-store/web-rassys/apps/web-rassys`.
  Its recorded app version is `1.0.27`, while this active source is `1.0.28`;
  the `config.json` and `docker-compose.yml` hashes differ. The mirror is
  therefore behind this source and was not overwritten during this work.

## Mirror diff accounting

The managed mirror contains only the Runtipi package surface (Compose,
configuration, metadata and assets), not the full application source. The
verified release differences are:

- `config.json`: version `1.0.27` -> `1.0.28`; adds the generated
  `RASSY_INTELLIGENCE_INTERNAL_TOKEN` field.
- `docker-compose.yml`: adds the `rassy-intelligence` build/service,
  internal-token and intelligence URL wiring to web/radio, and the Mastra
  schema/database settings.
- `docker-compose.yml`: preserves newer radio behavior in the active source:
  locked queue/set sizing is `7`, transition default is `4.5` seconds, and
  the existing radio services remain present.
- No managed-mirror application source files were found to merge; the
  deployed-only application behavior is represented by the active source
  checkout and its parent Git history, not by this nine-file package mirror.
- The active tree has later deployed-only work, including radio intelligence,
  channel routes, homepage/live-line behavior, Liquidsoap changes, and
  scheduler/controller hardening. The parent history currently records these
  under commits such as `3a7a3abb`, `8ac08bed`, and `c417bbfd`.

## Policy

The active app-store implementation is the release source until a standalone
`ianras77/web-rassy` checkout is explicitly attached to this workspace. A
future canonical sync must merge the app-store subtree into that repository,
preserving the newer deployed behavior, then change the Runtipi manifest to
consume an immutable image/release. The app-store package must not become a
second independently edited application source after that cutover.

## Release and rollback

Release order is: scoped parent commit -> CI/build/test -> immutable image or
Runtipi build -> managed backup -> deploy -> endpoint and user-flow proof.
Rollback is the previous parent commit plus the previous image/tag and the
documented Runtipi backup restore procedure. No data migration is permitted
without a tested restore and explicit migration record.

## Open reconciliation gate

The canonical remote was verified, but it is represented here only by the
older standalone checkout. Exact file-level deployed-only diff accounting
against the deployed Runtipi mirror still requires a read of the managed
mirror and a scoped release comparison. Until that comparison and a clean
canonical upstream merge are performed, this app-store subtree remains the
safe release source and must not be overwritten by `6ca94ba`.
