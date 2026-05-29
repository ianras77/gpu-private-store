# Crewai conversion notes

- Strategy: `converted`
- Complexity: `medium`

## Preserved decisions

- JupyterHub helper files are mounted from this local app package so the app does not depend on stale host bind paths.
- App-owned runtime state is moved under Runtipi app-data.
- The Docker socket is intentionally preserved for notebook and tool workflows.
- The AI backend currently stays on the existing RassyGPT gateway because this app expects one OpenAI-compatible endpoint for chat, embeddings, rerank, and images.
- Stable gateway aliases are used instead of stale model names:
  - `rassy-smart`
  - `rassy-embed`
  - `rassy-rerank`
  - `rassy-image`
