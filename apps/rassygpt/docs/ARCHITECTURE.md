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

This hardware has four V100s plus P100/P40/M40-era cards. The stable path is a runtime with broad CUDA support and strong GGUF coverage. vLLM and ExLlamaV3 are powerful, but are kept as optional extension lanes because Volta/Pascal cards are more likely to hit unsupported quantization kernels or build-specific CUDA issues.

## Public model names

| Public name | Role | Hardware lane |
|---|---|---|
| `rassy-general` | all-purpose reasoning/writing | GPU 7, V100 32GB |
| `rassy-coder` | code/repo work | GPUs 0 + 2, V100 16GB + V100 16GB |
| `rassy-fast` | routing, summaries, cheap tasks | GPU 6, V100 12GB |
| `rassy-embed` | embeddings | GPU 5, P100 16GB |
| `rassy-rerank` | reranking | GPU 5, P100 16GB |
| `rassy-image` | optional image connector | external or extension |
| `rassy-audio` | optional TTS/STT connector | external or extension |

## Security boundary

Only the gateway is exposed through Runtipi/Traefik. Backends live on the internal Docker network and should not be directly exposed unless you intentionally add them to the main network.
