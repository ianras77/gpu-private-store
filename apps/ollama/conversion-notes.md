# Ollama conversion notes

- Strategy: `auto-with-manual-review`
- Complexity: `high`

## Notes

- The legacy external `ollama_llm-net` network was removed from the Runtipi package.
- Cross-app consumers should use the shared `tipi_main_network` and talk to `ollama-proxy`, `ollama-general`, or `ollama-embed` by service name.
- The proxy remains on `11435` to preserve existing node-local tooling, while the role-specific raw listeners stay loopback-only.
