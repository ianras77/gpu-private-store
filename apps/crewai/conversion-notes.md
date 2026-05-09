# Crewai conversion notes

- Strategy: `converted`
- Complexity: `medium`

## Preserved decisions

- JupyterHub helper files come from the source repo rather than ad-hoc app-data bind files.
- App-owned runtime state is moved under Runtipi app-data.
- The Docker socket is intentionally preserved for notebook and tool workflows.
- The AI backend currently stays on the existing host gateway at `8111` because this app expects one OpenAI-compatible endpoint for chat, embeddings, rerank, and images.
- Stable gateway aliases are used instead of stale model names:
  - `chat-smart`
  - `embed-nomic-text`
  - `rerank-bge-m3`
  - `image-dreamshaper`
