# Learning MLflow Conversion Notes

- Split out of the old `learning` mega-package.
- Keeps the original custom build and dedicated artifact storage.
- Generates the basic-auth config in the container so Runtipi does not depend on stale host bind files.
- Uses a dedicated Postgres container seeded with the tracked `create_dbs.sql` script so the `mlflowauth` database still exists.

