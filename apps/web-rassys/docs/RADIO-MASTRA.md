# Radio intelligence migration

Radio-controller prefers the intelligence service for listener replies,
library enrichment, embeddings and reranking, while deterministic candidate
selection, cooldowns, leases and queue commits remain in radio-controller.
Failures fall back to the existing path so playout is not dependent on AI.
