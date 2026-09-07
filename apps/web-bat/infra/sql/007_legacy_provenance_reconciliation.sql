-- Reconcile historical BAT records without rewriting their editorial content.
-- New Mastra publications carry metadata.mastra; everything older is marked
-- as legacy provenance so operators can distinguish history from new runs.
update editorial_objects
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
  'provenance', coalesce(metadata->'provenance', '{}'::jsonb) || jsonb_build_object(
    'historical_orchestrator', 'legacy',
    'reconciled_at', now()
  )
)
where not (coalesce(metadata, '{}'::jsonb) ? 'mastra');
