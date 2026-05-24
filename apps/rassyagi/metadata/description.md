# RassyAGI

RassyAGI is the adjunct layer for the RassyGPT stack. It packages LocalRecall for scoped semantic memory, LocalAGI v2.8.1 for controlled agent orchestration, and a small OpenAI-compatible gateway that keeps RassyGPT as the backend model provider.

Use direct RassyGPT for normal coding and production traffic. Use RassyAGI when a trusted workflow needs memory injection, a LocalAGI `call_agents` hop, or an isolated experimental endpoint that should not disturb the main RassyGPT gateway.

Default local endpoints:

- Gateway: `9115`
- LocalAGI side UI/API: `9114`
- LocalRecall side API: `9113`
