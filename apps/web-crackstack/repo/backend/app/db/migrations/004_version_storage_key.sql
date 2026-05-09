ALTER TABLE dataset_versions
    ADD COLUMN IF NOT EXISTS storage_key text;

GRANT UPDATE (storage_key) ON TABLE dataset_versions TO crackstack_app;
