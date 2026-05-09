DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles WHERE rolname = 'crackstack_app'
    ) THEN
        CREATE ROLE crackstack_app;
    END IF;
END
$$;

GRANT crackstack_app TO crackstack;

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS datasets (
    tenant_id text NOT NULL,
    dataset_id text NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    latest_version_id text,
    PRIMARY KEY (tenant_id, dataset_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dataset_versions (
    tenant_id text NOT NULL,
    dataset_id text NOT NULL,
    version_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    path text NOT NULL,
    row_count bigint NOT NULL DEFAULT 0,
    schema jsonb,
    recipe_name text,
    source_type text,
    original_filename text,
    PRIMARY KEY (tenant_id, dataset_id, version_id),
    FOREIGN KEY (tenant_id, dataset_id)
        REFERENCES datasets(tenant_id, dataset_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dataset_versions_dataset
    ON dataset_versions (tenant_id, dataset_id, created_at DESC);

GRANT USAGE ON SCHEMA public TO crackstack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenants TO crackstack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE datasets TO crackstack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dataset_versions TO crackstack_app;

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE datasets FORCE ROW LEVEL SECURITY;
ALTER TABLE dataset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_versions FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'tenants_isolation'
    ) THEN
        CREATE POLICY tenants_isolation ON tenants
            USING (tenant_id = current_setting('app.tenant_id', true))
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'datasets_isolation'
    ) THEN
        CREATE POLICY datasets_isolation ON datasets
            USING (tenant_id = current_setting('app.tenant_id', true))
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'dataset_versions_isolation'
    ) THEN
        CREATE POLICY dataset_versions_isolation ON dataset_versions
            USING (tenant_id = current_setting('app.tenant_id', true))
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
    END IF;
END
$$;
