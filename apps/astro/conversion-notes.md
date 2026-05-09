# Astro conversion notes

- Strategy: `standardized product package`
- Complexity: `high`

## Standardization applied

- Replaced the old external `localai_default` dependency with the in-house Ollama services:
  - chat via `ollama-general:11434/v1`
  - embeddings via `ollama-embed:11434/v1`
- Kept the monorepo intact under `/data/repos/apps/astro` while packaging the shared API and all five branded web apps in one Runtipi product package.
- Switched to app-scoped service names to avoid shared-network collisions.
- Reserved a stable adjacent host-port block:
  - `3200` API
  - `3201` Jupiterseek
  - `3202` Maleficme
  - `3203` Saturnleo
  - `3204` Saturnseer
  - `3205` Oracleveil
- Legacy Postgres, Redis, and Qdrant volumes should be copied into `app-data` before first Runtipi boot.

## Notes

- The Esoterica book collection remains on its shared host bind mount for now.
- Browser-facing web apps need `ASTRO_PUBLIC_API_BASE` set to this node's host-visible API URL.
