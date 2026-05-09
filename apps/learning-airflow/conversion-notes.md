# Learning Airflow Conversion Notes

- Split out of the old `learning` mega-package.
- Uses a dedicated Postgres service instead of the old shared learning-wide cluster.
- Keeps the original Airflow image, executor mode, Docker socket mount, and admin bootstrap pattern.

