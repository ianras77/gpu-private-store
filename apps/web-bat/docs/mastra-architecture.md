# BAT 2.0 Mastra architecture

The Runtipi topology keeps the existing Next.js, FastAPI, Postgres, Qdrant,
Redis, and social-publisher services. `bat-mastra` is the authenticated
editorial control plane; the FastAPI application remains the deterministic data
plane for source policy, ingestion, retrieval, persistence, and publishing.

Agents use an OpenAI-compatible provider pointed at `${RASSYMIND_BASE_URL}/v1`
with the semantic `${RASSYMIND_MODEL}` alias and server-side
`RASSYMIND_API_KEY`; they do not connect directly to BAT-local Ollama.

Mastra currently exposes:

- capability discovery at `GET /v1/capabilities`;
- bounded source research at `POST /v1/workflows/research`;
- typed source-visible report artifacts at `POST /v1/workflows/report`;
- Researcher, Analyst, Writer, Queen, Fact Checker, Report Writer, and Social
  Editor agent definitions.

All non-health runtime requests require `Authorization: Bearer
BAT_INTERNAL_SERVICE_TOKEN`. Source text is untrusted evidence, never model
instructions. Reports cannot claim freshness without approved source records.

The legacy Python editorial path remains the compatibility implementation while
each workflow is qualified. Cheshire Cat and its persisted data are retained in
this staged migration until parity and data-export checks prove retirement safe.
