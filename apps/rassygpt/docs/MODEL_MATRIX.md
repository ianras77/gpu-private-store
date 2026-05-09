# Model Matrix

These defaults are chosen for Ian's hardware and for runtime compatibility over leaderboard theatrics.

| Lane | Default model | Why |
|---|---|---|
| general | `unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF:UD-Q4_K_XL` | Strong general 30B-class instruct model that can fit the V100 32GB lane. |
| coder | `unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF:UD-Q4_K_XL` | Code-specialized 30B-class MoE-style model for the dual V100 lane. |
| fast | `unsloth/Qwen3-8B-GGUF:Qwen3-8B-Q4_K_M.gguf` | Fast Qwen3 utility model for routing/summaries. |
| embed | `nomic-ai/nomic-embed-text-v1.5-GGUF:nomic-embed-text-v1.5.Q8_0.gguf` | Compact embedding model with llama.cpp compatibility. |
| rerank | `klnstpr/bge-reranker-v2-m3-Q8_0-GGUF:bge-reranker-v2-m3-q8_0.gguf` | GGUF reranker model; gateway falls back to embedding cosine if the backend endpoint is unavailable. |

## Safer fallback models

If first boot is too heavy, replace general/coder with 14B or 8B GGUF models and restart. The gateway model names do not change, so every connected app keeps working.
