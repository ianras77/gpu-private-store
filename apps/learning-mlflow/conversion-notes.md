# Learning MLflow Conversion Notes

- Split out of the old `learning` mega-package.
- Keeps the original custom build, basic-auth config, and dedicated artifact storage.
- Uses a dedicated Postgres container seeded with the tracked `create_dbs.sql` script so the `mlflowauth` database still exists.

