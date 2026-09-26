# Search and Mastra integration plan

## Diagnosis

Search is invoked in the right request path, but query construction can destroy intent: the current Mastra special case replaces every Mastra query with `Mastra AI`. That makes release, memory, agent, and troubleshooting questions indistinguishable. Generic token overlap then allows weak results through, and the model receives a source board without a durable description of why those sources were selected.

## Execution plan

1. Preserve the user’s complete focused query and add only bounded entity disambiguation (never replace subject terms).
2. Make ranking field-aware and coverage-aware: phrase/entity matches and title matches lead; single-token or URL-only matches cannot pass multi-term searches.
3. Keep search evidence as a first-class Mastra context contract: query, intent, freshness, source quality, and insufficiency are explicit to the agent.
4. Keep the route’s preflight and Mastra tools coherent: preflight supplies evidence once, research agents synthesize it, and fallback tools remain available when preflight is empty.
5. Add regression coverage for intent preservation, ambiguous entities, weak-result rejection, source provenance, and multi-turn research behavior.
6. Qualify source, build, and the real managed endpoint with exact multi-word and current-information prompts.

## Acceptance criteria

- “Mastra release”, “Mastra memory”, and “Mastra AI” remain distinct upstream queries.
- A result covering the whole topic outranks a result matching one generic word.
- Off-topic/low-coverage result sets become explicit empty evidence rather than misleading citations.
- Mastra answers use returned source content and cite only returned URLs.
- Local-only mode cannot invoke external search.
