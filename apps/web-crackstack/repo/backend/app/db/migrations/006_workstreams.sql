CREATE TABLE IF NOT EXISTS workstreams (
    tenant_id text NOT NULL,
    workstream_id text NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    description text,
    recipe_steps jsonb NOT NULL,
    match_signature jsonb NOT NULL,
    metadata jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, workstream_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workstreams_user
    ON workstreams (tenant_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workstream_runs (
    tenant_id text NOT NULL,
    run_id text NOT NULL,
    workstream_id text NOT NULL,
    user_id text NOT NULL,
    dataset_id text NOT NULL,
    output_version_id text,
    status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, run_id),
    FOREIGN KEY (tenant_id, workstream_id)
        REFERENCES workstreams(tenant_id, workstream_id)
        ON DELETE CASCADE,
    FOREIGN KEY (tenant_id, dataset_id)
        REFERENCES datasets(tenant_id, dataset_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workstream_runs_lookup
    ON workstream_runs (tenant_id, workstream_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workstreams TO crackstack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE workstream_runs TO crackstack_app;

ALTER TABLE workstreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE workstreams FORCE ROW LEVEL SECURITY;
ALTER TABLE workstream_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workstream_runs FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'workstreams_isolation'
    ) THEN
        CREATE POLICY workstreams_isolation ON workstreams
            USING (tenant_id = current_setting('app.tenant_id', true))
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'workstream_runs_isolation'
    ) THEN
        CREATE POLICY workstream_runs_isolation ON workstream_runs
            USING (tenant_id = current_setting('app.tenant_id', true))
            WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
    END IF;
END
$$;
