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

GRANT USAGE ON SCHEMA public TO crackstack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenants TO crackstack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE datasets TO crackstack_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE dataset_versions TO crackstack_app;
