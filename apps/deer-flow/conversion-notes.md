# DeerFlow conversion notes

- Strategy: `self-contained packaging`
- Complexity: `high`

## Applied

- Vendored the upstream `bytedance/deer-flow` source tree under `repo/`
- Wrapped DeerFlow in a native Runtipi `docker-compose.yml` with `x-runtipi` metadata
- Seeded a first-boot `config.yaml`, `extensions_config.json`, and auth secret into persistent app-data
- Defaulted to the gateway-backed runtime with one worker so SQLite-backed persistence is safe by default
- Switched the seeded model config to the local Ollama stack through `ollama-proxy`
- Installed DeerFlow's optional `ollama` backend dependency in the packaged backend image
- Kept upstream skills available by mounting the vendored `repo/skills` tree read-only

## Follow-up

- If your local Ollama model names differ from `gpt-oss:20b` and `qwen2.5-coder:7b`, update the generated `config.yaml`
- If you want Docker-based sandbox containers or higher concurrency, we can extend this package with a stronger persistence backend
