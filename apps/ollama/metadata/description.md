# Ollama

Ollama provides the shared multi-GPU inference layer for this secondary node.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: internal-only by default.

## Migration notes

- Source tree today: `/data/apps/ollama`
- Recommended source repo target: `/data/repos/apps/ollama`
- Conversion strategy: `auto-with-manual-review`
- Migration complexity: `high`
- The original compose stack used an external `ollama_llm-net` network. This Runtipi package normalizes that to the standard per-app network plus the shared `tipi_main_network`, so downstream apps can reach `ollama-general`, `ollama-embed`, and `ollama-proxy` without recreating legacy compose networking.

## Production linkage contract

- Preferred app endpoint: `http://ollama-proxy:8080/v1` for OpenAI-compatible clients.
- Native Ollama endpoint: `http://ollama-proxy:8080/api`.
- Shared knowledge endpoint: `http://ollama-proxy:8080/api/knowledge`.
- Direct role listeners are internal service endpoints only: `ollama-general:11434`, `ollama-code:11434`, and `ollama-embed:11434`.
- Strict model allowlisting stays enabled by default. Consumers should use the configured model names directly rather than stale aliases.
- The proxy is wired for the shared learning Qdrant service at `http://qdrant:6333` and the `ollama_gpu_private_store_knowledge` collection. Keep the knowledge health check out of the container healthcheck so Ollama can still serve chat if the separate vector app is being restarted.
- Langflow and Airflow should carry the full endpoint set: `OLLAMA_BASE_URL`, `OLLAMA_API_BASE`, `OLLAMA_OPENAI_BASE_URL`, `OLLAMA_KNOWLEDGE_URL`, `OPENAI_BASE_URL`, `OPENAI_API_BASE`, `QDRANT_URL`, `MLFLOW_TRACKING_URI`, `WANDB_BASE_URL`, `MINIO_ENDPOINT`, `LANGFLOW_URL`, and `LABEL_STUDIO_URL` as applicable.
- MLflow stores artifacts through the shared MinIO API at `http://minio:9000`; MinIO, W&B, Label Studio, Tika, and Qdrant are linked by shared-network service names rather than by host IPs.
- Tika text extraction can feed the knowledge API by posting extracted content to `/api/knowledge/upsert` with document metadata.

## Data notes

- Runtipi app-data convention: migrate app-owned state into `${APP_DATA_DIR}/app-data/ollama/...`.
- Keep source code in the app repo and keep external shared media/model libraries on explicit host paths when needed.

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- This is an internal API service, not a browser UI app.
- Main proxy endpoint stays on `11435` to preserve the existing Ollama client and tooling convention on this node.
- Role-specific direct listeners remain loopback-only on `8090`, `8091`, `8092`, and `11437`.

- Bind mount `/data/models/ollama-general/ollama` -> `/root/.ollama`
- Bind mount `/data/models/ollama-code/ollama` -> `/root/.ollama`
- Bind mount `/data/models/ollama-embed/ollama` -> `/root/.ollama`

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.
