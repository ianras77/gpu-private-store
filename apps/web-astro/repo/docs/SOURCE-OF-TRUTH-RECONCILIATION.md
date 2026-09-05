# Source-of-truth reconciliation

Recorded 2026-09-05 before implementation.

## Starting locations

| Role | Location | SHA | Ownership |
|---|---|---|---|
| Canonical application | `/data/apps/2-Migrated/web-astrology` | `210fd39b4dab061a2a5d397683dc48f0dfab23fc` | `ianras77/web-astrology` |
| Runtipi vendored application | `apps/web-astro/repo` | `b9726bb5f4b8093da10eeae612c45dcfadb3ae7d` | app-store package checkout |

The surrounding app-store checkout has unrelated dirty changes. They were not cleaned, reset, or included in this work.

## Meaningful divergence

The vendored copy contains the richer `ReadingOutput.guideSections` schema and corresponding five-brand reading renderers. The canonical checkout has the same core deterministic Swiss implementation and legacy reading contracts but does not contain that deployed-only guide rendering. The vendored copy also contains RassyMind environment routing in `reading-core`; this remains compatibility infrastructure pending the intelligence-layer migration.

The two trees are not byte-identical: the vendored package is a deployed/application-store snapshot, while the canonical checkout is the product repository. A semantic comparison was performed using package/file inventories and symbol-level searches; generated `node_modules`, Vitest result files, backups, and deployment metadata are not product source.

## Resolution

`ianras77/web-astrology` remains canonical for product source. The useful deployed-only guide-section behavior is preserved in the vendored source and must be upstreamed through a reviewed change before the next export. This implementation adds versioned deterministic contracts additively and does not overwrite either checkout.

## Repeatable synchronization contract

The release process uses `pnpm export:runtipi -- --apply` from the canonical checkout context (override `ASTRO_CANONICAL_REPO` when needed). It copies canonical files into `repo/`, preserves deployment-only vendored files, never deletes extras, and records the source commit/tree hash in `.source-provenance.json`. A dry run is the default. `pnpm verify:source-sync` remains the CI gate and must pass after intentional deployment-only differences are reviewed.

## Future drift gate

CI should compare canonical `HEAD` against the recorded source metadata and run a semantic manifest check covering workspace packages, API routes, Prisma schema/migrations, brand IDs, and report schemas. Generated deployment files may differ only through the documented allowlist.

The executable gate is `pnpm verify:source-sync` (or `ASTRO_CANONICAL_REPO=/path pnpm verify:source-sync`). It compares tracked source files, reports both SHAs and the drift counts, emits a JSON artifact when passed `--json`, and exits non-zero when the trees differ. Release automation must review intentional deployment-only differences and record the exported source SHA before publishing.
