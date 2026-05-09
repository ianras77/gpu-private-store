# Astro Multibrand

Shared astrology product package with one API and five branded web experiences:

- `3201` Jupiterseek
- `3202` Maleficme
- `3203` Saturnleo
- `3204` Saturnseer
- `3205` Oracleveil

The shared API lives on `3200`, backed by Postgres, Redis, and Qdrant.

## Migration Notes

- Source repo: `/data/repos/apps/astro`
- App-owned state moves into `${APP_DATA_DIR}/app-data/astro/...`
- Shared Esoterica source material stays on the host bind mount for now
- Legacy LocalAI assumptions were replaced with the in-house Ollama services:
  - `ollama-general:11434/v1` for chat
  - `ollama-embed:11434/v1` for embeddings

## Routing Notes

- Keep this node LAN-first during migration.
- If any branded frontends should later go public, expose them deliberately through the primary edge node rather than directly from this secondary node.
