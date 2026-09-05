# Mastra baseline

The pre-migration application used `packages/reading-core` as a monolithic model orchestration path (`callLLM`) with a legacy `ReadingOutput` contract. The vendored copy already supported RassyMind as an opt-in OpenAI-compatible backend and preserved `guideSections`.

Current state: `@mastra/core@1.64.0` is now exact-pinned in `packages/astro-intelligence/package.json` and `pnpm-lock.yaml`. The local registry and workflow APIs compile and test successfully. Mastra package provenance, transitive audit, durable storage, and production runtime qualification remain release gates documented in `MASTRA-DEPENDENCY-SECURITY.md`.
