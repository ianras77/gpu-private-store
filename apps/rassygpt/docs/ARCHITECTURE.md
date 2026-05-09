# Architecture

RassyGPT is built as a federation with one public face.

```text
Apps / agents / Open WebUI / Cheshire Cat / coding tools
        ↓
Runtipi + Traefik
        ↓
RassyGPT gateway /v1
        ↓
llama.cpp general, coder, fast, embed, rerank services
        ↓
Qdrant, optional image/audio/exl3 services
```

## Why llama.cpp/GGUF is the default core

This hardware has four V100s plus P100/P40-era cards for the default lanes, with the M40 excluded from the RassyGPT stack. The stable path is a runtime with broad CUDA support and strong GGUF coverage. vLLM and ExLlamaV3 are powerful, but are kept as optional extension lanes because Volta/Pascal cards are more likely to hit unsupported quantization kernels or build-specific CUDA issues.

## Public model names

| Public name | Role | Hardware lane |
|---|---|---|
| `rassy-smart` | default router for `/v1/chat/completions` | chooses the best lane |
| `rassy-general` | all-purpose reasoning/writing | GPU 7, V100 32GB |
| `rassy-coder` | primary code/repo work | GPUs 0 + 2, V100 16GB + V100 16GB |
| `rassy-coder-secondary` | worker/secondary code lane | GPU 6, V100 12GB |
| `rassy-fast` | routing, summaries, cheap tasks | P40 24GB |
| `rassy-embed` | embeddings | GPU 5, P100 16GB |
| `rassy-rerank` | reranking | GPU 5, P100 16GB |
| `rassy-image` | image generation | RTX 2080 Ti |
| `rassy-audio` | TTS/STT | RTX 2080 Ti |

The M40 UUID `GPU-787cf3b9-e1d7-1712-bd12-60cf740bade8` is intentionally not present in the install-time form or runtime environment.

## Smart routing

`rassy-smart` is the default chat model. It routes code, repo, debugging, and implementation requests to the coder lanes; short code tasks use `rassy-coder-secondary`, heavier code tasks use `rassy-coder`, short utility prompts can use `rassy-fast`, and general conversation uses `rassy-general`.

## Security boundary

Only the gateway is exposed through Runtipi/Traefik. Backends live on the internal Docker network and should not be directly exposed unless you intentionally add them to the main network.
