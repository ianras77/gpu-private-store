# RassyGPT

RassyGPT is a Runtipi-native, hardware-aware OpenAI-compatible AI gateway for Ian Rasmussen's multi-GPU rig. It exposes one clean `/v1` API while routing requests to specialized local model lanes:

- `rassy-general` on the V100 32GB for all-purpose work
- `rassy-coder` across the two V100 16GB cards for code
- `rassy-fast` on the V100 12GB for quick utility tasks
- `rassy-embed` and `rassy-rerank` on the P100 for retrieval
- optional image and audio connectors for ComfyUI, Speaches, LocalAI, or other OpenAI-compatible services
- integrated internal Qdrant storage with an external connector mode
- the M40 is retained as a reserved GPU and is not part of the default LLM lanes

This is designed to be the single AI front door for Open WebUI, Cheshire Cat, coding agents, RAG workflows, custom apps, and future Runtipi services.
