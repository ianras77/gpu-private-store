# RassyGPT Project Draft

## Mission

RassyGPT is the central AI service for Ian's Runtipi ecosystem: one OpenAI-compatible endpoint, one API key, and one model catalog that every app can use.

## Principles

1. Stable first: llama.cpp/GGUF core for broad support across V100/P100/P40-era cards, while keeping the M40 reserved outside the default lanes.
2. Hardware-aware: fixed UUID lane mapping, not fragile GPU index routing.
3. Gateway-led: apps only talk to RassyGPT, never directly to backend model servers.
4. Extendible: Qdrant, image, speech, ExLlamaV3, vLLM, and future services are connectors behind the gateway.
5. Failure-tolerant: health checks keep the gateway alive while individual model backends download, restart, or get replaced.

## Initial target

Installable Runtipi app with local gateway build, llama.cpp CUDA backend services, Qdrant sidecar, docs, scripts, and optional extension manifests.
