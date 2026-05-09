# Prompt inventory

Prompt files live in `apps/api/prompts`.

- `cat_editor_system.md`: master voice and safety rules
- `lead_story.md`: lead object generation
- `theme_take.md`: recurring-theme take generation
- `trend_observation.md`: trend summary framing
- `homepage_layout_proposal.md`: layout rationale helper
- `x_post_generation.md`: short/long/thread social drafts
- `thread_generation.md`: explicit thread skeleton generation
- `voice_memory_update.md`: post-cycle memory updates
- `story_rejection_rationale.md`: rejection reasoning template
- `headline_generation.md`: multi-headline variant generation

The analysis engine now feeds the lead, theme, and X prompts with:

- a persisted analysis brief
- tone-lane guidance
- link roles
- open loops
- story-target recommendations
