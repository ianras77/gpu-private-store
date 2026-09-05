# Lore index inventory

The application preserves the existing Qdrant adapter and collection. This repository does not have production Qdrant credentials or a live collection connection during source qualification, so the following fields remain runtime inventory gates rather than guessed values:

| Field | Source-qualified value |
|---|---|
| Collection | `ASTRO_LORE_COLLECTION` / legacy `QDRANT_COLLECTION` at runtime |
| Vector dimension | Not verified in this workspace |
| Distance metric | Not verified in this workspace |
| Embedding model | Existing ingestor configuration; live model not verified |
| Index version | `ASTRO_LORE_INDEX_VERSION` when supplied; otherwise runtime collection metadata |
| Payload keys/chunking | Existing `apps/api/src/lib/esoterica*` adapter; live payload inventory pending |

No production collection is re-embedded or altered by this migration. A qualified migration must export collection metadata, verify embedding dimensions, run retrieval golden tests, and use a versioned cutover with rollback.

## Live environment probe (2026-09-05)

The Runtipi host has a healthy `rassymind-qdrant-1` container, but no `web-astro` Qdrant container is running. Its only visible collection is `rassymind_qwen3e8_q8_4096_v1`, with 4096-dimensional cosine vectors and 2 points; this is RassyMind infrastructure, not evidence about the astrology lore collection and is intentionally not used for lore qualification. The application lore collection therefore remains unqualified until the web-astro-owned Qdrant data source is available.
