CREATE TABLE IF NOT EXISTS dataset_profiles (
    tenant_id text NOT NULL,
    dataset_id text NOT NULL,
    version_id text NOT NULL,
    profile jsonb NOT NULL,
    sample_rows jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, dataset_id, version_id),
    FOREIGN KEY (tenant_id, dataset_id, version_id)
        REFERENCES dataset_versions(tenant_id, dataset_id, version_id)
        ON DELETE CASCADE
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dataset_profiles TO crackstack_app;

ALTER TABLE dataset_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_profiles FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'dataset_profiles_isolation'
    ) THEN
        CREATE POLICY dataset_profiles_isolation ON dataset_profiles
            USING (tenant_id = current_setting('app.tenant_id', true))
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
    END IF;
END
$$;
