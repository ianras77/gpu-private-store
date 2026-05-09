# Workflow V2: Directed Research + Analysis Engine + Voice Memory + Publish First

## What changed

- Research is now directed by a runtime query plan:
  - `research_directive` memory (editor-owned queries)
  - top active themes
  - default query pack fallback
- Analysis is now a first-class stage between research and writing:
  - persisted `analysis_briefs` for sitewide and hot-theme lanes
  - tone lanes and link roles derived from the freshest source mix
  - a dedicated `analysis_directive` control for sharpening the read before drafting
- Voice memory is injected into every editorial/social generation pass.
- Published outputs feed back into `voice_wins` memory, so style compounds over time.
- Direct publish can be enabled at runtime without changing env files.
- X can be used in two places:
  - research ingestion (`x_research_enabled`)
  - live posting (`x_live_posting` + valid token)

## Runtime controls

Use `GET/POST /api/v1/admin/system-settings` or `/admin/settings`.

- `direct_publish`: bypass draft hold for generation endpoints and worker cycles
- `x_research_enabled`: include X recent search ingestion in researcher cycles
- `x_live_posting`: allow live X dispatch (otherwise force dry-run)
- `research_directive`: query lines prepended to each research cycle
- `analysis_directive`: the intelligence pass between research and writing; use it to steer contradiction hunting, tone, and consequence
- `voice_blueprint`: long-form voice anchor
- `live_vibe`: short-form response anchor

## Live short-form endpoint

`POST /api/v1/social/live`

Payload:

```json
{
  "prompt": "React to this development in queen voice",
  "intent": "response",
  "publish_now": true,
  "platform": "x"
}
```

## Publish-first endpoints

- `POST /api/v1/editorial/generate-and-publish`
- `POST /api/v1/homepage/generate-and-publish`
- `POST /api/v1/social/live`
- `POST /api/v1/admin/pipeline/run-now`

## Analysis endpoints

- `GET /api/v1/analysis`: analysis dashboard for sitewide and theme briefs
- `POST /api/v1/analysis/refresh`: rebuild persisted analysis briefs using the current directives
- `/admin/analysis`: operator view for tone lanes, topic/tone map, link roles, and open loops
