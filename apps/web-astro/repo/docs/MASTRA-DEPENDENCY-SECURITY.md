# Mastra dependency security

Selected package: `@mastra/core@1.64.0`, exact-pinned in the workspace manifest and lockfile. The first integration is a local tool/registry boundary only; no Studio, hosted service, community adapter, or public Mastra route is enabled.

Before production activation, repeat the package audit against the current official registry/repository provenance, inspect the complete transitive diff, qualify the exact workflow/storage APIs used, and retain a rollback image. The current workspace has not performed a live production dependency audit. RassyMind remains the only production model infrastructure layer.
