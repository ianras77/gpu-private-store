# Publishing Guidelines

BAT publishing is an agentic editorial loop with a separate release gate. Drafts are not a storage destination; they are temporary work-in-progress rows that must resolve into `approved`, `published`, or `rejected`.

## Active Draft Standard

An active draft stays in the queue only while all of these are true:

- It is inside the backlog publish window.
- It has no prompt leakage, placeholder title, or placeholder body.
- It has not exhausted the editorial rework attempt cap.
- It has enough grounded current sources to support the selected angle.
- It still has a viable Trump/current-news focus.

Drafts that fail those requirements are rejected from the active queue with metadata explaining why.

## Agentic Editing Loop

The queen cycle runs a bounded cleanup and editing pass before release:

1. Prune stale, leaked, placeholder, or exhausted drafts.
2. Rework viable drafts against the editorial style gate and grounding rules.
3. Promote drafts to `approved` only when the publish recommendation is true and the style gate passes.
4. Release only items that pass the publishing oversight checks.

The system should spend edit budget on drafts that can become publishable, not on drafts that have already proven stale or weak.

## Oversight Release Gate

A piece can go live only if it passes the oversight gate:

- status is `draft` or `approved`
- not rework-blocked
- inside the publish window
- no prompt leak or placeholder content
- Trump/current-news focus is intact
- publish recommendation is true
- style gate passes
- source freshness and grounded-source counts pass

Manual publish endpoints still require approval when manual review is enabled.

## Rejection Policy

Use `rejected` rather than deleting rows. This keeps audit history, source diagnostics, and revision records while removing bad drafts from the active queue.

Common rejection reasons:

- `stale_queue_window`
- `attempt_cap_reached`
- `placeholder_or_prompt_leak`
- `outside_current_news_window`
- `needs_more_grounding`

The active queue should trend toward fewer stale drafts over time. A growing draft count means the editing/rejection loop is failing and should be investigated before increasing generation volume.
