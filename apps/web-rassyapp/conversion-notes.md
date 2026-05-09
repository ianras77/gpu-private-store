# Web Rassy App conversion notes

- Strategy: `auto-with-manual-review`
- Complexity: `medium`

## Notes

- The legacy external Ollama network was removed from the Runtipi package.
- `cheshire-cat-core` reaches `ollama-general` and `ollama-embed` through `tipi_main_network`.
- Cheshire Cat and Qdrant helper services remain internal-only by default.
- The direct host-facing app port is aligned to `3194` so it does not collide with the `web-rassy` support-service block on `3187-3189`.
