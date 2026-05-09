# Backend Risk Register

## Open risks

| Risk | Type | Severity | Current mitigation | Next action |
|---|---|---|---|---|
| Search upstream returns irrelevant domains for broad queries | Data quality | High | relevance score + political signal filter + blocked domains + skip reasons | introduce domain credibility allowlist and query classifier before fetch |
| Embedding endpoint unavailable (`EMBEDDING_API_URL`) blocks new vector writes when fallback disabled | Infra/dependency | High | readiness now degrades; embedding failures logged | point env to reachable embedding service and add alert on embedding failure rate |
| LLM fallback endpoint unavailable (`LLM_API_URL`) | Infra/dependency | Medium | Cheshire Cat primary path still active; readiness reports degraded | add circuit-breaker metrics and optional second fallback model endpoint |
| Legacy low-quality source rows already persisted before hardening | Data debt | Medium | new ingestion filters prevent most future junk | run one-time archival/cleanup job for low-score historical sources |
| Worker query plan can still include broad editorial directives that attract noisy search results | Pipeline quality | Medium | skip/fetch/relevance counters visible in logs and summaries | add preflight query linting + denylist terms |
| Social style gate can over-block during low-signal windows | Editorial operations | Medium | drafts retained instead of publishing weak output | tune thresholds by reviewing false rejects over 1-2 weeks |
| Trend uniqueness migration not auto-applied outside local environment | Operational debt | Medium | migration script created (`infra/sql/003_trend_observation_uniqueness.sql`) | wire migration execution into deployment pipeline |

## Scaling concerns

- Search+fetch is sequential per query in worker stage; high query packs increase cycle latency.
- Revision history growth can become heavy without retention strategy.
- Qdrant collection has no shard/tier strategy yet for sustained growth.

## Editorial/safety concerns

- Source grounding is improved but still dependent on query quality and available source corpus.
- Cat output can still drift if voice memory is polluted by poor drafts; style gate reduces this but does not eliminate it.
- Draft/publish separation is respected, but direct-publish mode still requires active operator oversight.

## Technical debt

- No formal migration runner; SQL scripts are manual/compose-init driven.
- Integration tests for live HTTP clients (search/cat/qdrant/social) should be expanded with transport mocks.
- Retrieval reranking is heuristic and can be upgraded with stronger relevance scoring.
