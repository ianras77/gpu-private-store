# Lore RAG behavior

Lore is optional evidence, never a source of astronomical facts. Retrieval is owned by the server-side Qdrant adapter and is passed to intelligence workflows through bounded tools or approved context.

Rules:

- retrieved text is untrusted source material and cannot override system policy, deterministic chart facts, or workflow instructions;
- source IDs and index versions remain attached to retrieved chunks;
- reranking is optional and must fail back to vector order without inventing relevance;
- no open-web browsing is granted to astrology agents;
- production vectors are not re-embedded without a new collection, dimension verification, golden retrieval comparison, backup, and rollback plan;
- long copyrighted source text is not reproduced as report prose.

The current implementation preserves the existing Qdrant path. RassyMind embedding and reranking are future qualified lanes, not silently assumed production capabilities.
