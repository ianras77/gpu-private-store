# RassyMind

`services/rassy-intelligence/src/models/rassymind.ts` normalizes
`RASSYMIND_BASE_URL` to one `/v1` suffix and uses semantic aliases. It does
not connect directly to Ollama or vLLM. Capability discovery and live model
smoke remain deployment qualification steps.
