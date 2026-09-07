# Reports

Reports are first-class BAT artifacts stored in `report_artifacts` and linked to
durable `report_runs`. A report contains a versioned schema, executive summary,
findings, chapters, source IDs, source notes, and fact-check metadata.

Creation and publication are internal service operations protected by
`BAT_INTERNAL_SERVICE_TOKEN`. Public readers only receive artifacts whose
status is `published`; admin readers can inspect all persisted report states.
Sources remain evidence and never become model instructions.
