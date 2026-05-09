# RassyGPT

RassyGPT is a Runtipi-native, hardware-aware OpenAI-compatible AI gateway for Ian Rasmussen's multi-GPU rig. It exposes one clean `/v1` API while routing requests to specialized local model lanes:

- `rassy-general` on the V100 32GB for all-purpose work
- `rassy-coder` across the two V100 16GB cards for code
- `rassy-coder-secondary` on the V100 12GB for worker code tasks
- `rassy-fast` on the P40 24GB for quick utility tasks
- `rassy-embed` and `rassy-rerank` on the P100 for retrieval
- `rassy-image` plus `rassy-audio` on the RTX 2080 Ti through LocalAI
- integrated internal Qdrant storage with an external connector mode
- the M40 is excluded from the RassyGPT stack and is not assigned to any lane

This is designed to be the single AI front door for Open WebUI, Cheshire Cat, coding agents, RAG workflows, custom apps, and future Runtipi services.
