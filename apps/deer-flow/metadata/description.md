DeerFlow is ByteDance's agentic workspace for research, writing, web search, file operations, and multi-step workflows.

This Runtipi packaging vendors the upstream source, persists DeerFlow state under `app-data/deer-flow`, and seeds a minimal first-boot configuration automatically.

The seeded default is wired to the local Ollama stack in this store through `ollama-proxy`, using `gpt-oss:20b` as the general model and `qwen2.5-coder:7b` as the coding model.

Persistent state is split into:

- `app-data/deer-flow/named/runtime-config` for `config.yaml`, `extensions_config.json`, and the auth secret
- `app-data/deer-flow/named/deer-flow-home` for memory, agents, thread workspaces, uploads, outputs, and the SQLite checkpointer
