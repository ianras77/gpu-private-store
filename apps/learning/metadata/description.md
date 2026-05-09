# Learning

Learning exposes a primary web interface. with persistent supporting data services.

## Deployment stance

- Secondary-node role: this app is packaged for the private Runtipi node on `192.168.1.162`.
- Primary edge remains `192.168.1.57` (`runtipi.rasies.com`).
- Recommended exposure: internal-only by default.

## Migration notes

- Source tree today: `/data/apps/learning`
- Recommended source repo target: `/data/repos/apps/learning`
- Conversion strategy: `manual`
- Migration complexity: `high`

## Data notes

- Runtipi app-data convention: migrate app-owned state into `${APP_DATA_DIR}/app-data/learning/...`.
- Keep source code in the app repo and keep external shared media/model libraries on explicit host paths when needed.

## Port notes

- Reserve `80` and `443` on this node for Runtipi itself.
- Main web UIs should be reached through the Runtipi local domain rather than a copied legacy host port.
- Database, cache, and vector-store helper services are intentionally de-published by default in generated packages to reduce collisions.

- Named volume `redis` mounted to `/data`
- Bind mount `/data/apps/learning/init-scripts` -> `/docker-entrypoint-initdb.d`
- Named volume `pg` mounted to `/var/lib/postgresql/data`
- Named volume `airflow_dags` mounted to `/opt/airflow/dags`
- Named volume `airflow_logs` mounted to `/opt/airflow/logs`
- Bind mount `/var/run/docker.sock` -> `/var/run/docker.sock`
- Named volume `mlflow` mounted to `/mlflow`
- Bind mount `/data/apps/learning/mlflow/basic_auth.ini` -> `/etc/mlflow/basic_auth.ini`
- Named volume `minio` mounted to `/data`
- Named volume `qdrant` mounted to `/qdrant/storage`
- Named volume `db_labelstudio` mounted to `/var/lib/postgresql/data`
- Named volume `labelstudio` mounted to `/label-studio/data`
- Named volume `wandb` mounted to `/vol/env`

## Edge-routing notes

- Do not let this node become the public edge by accident.
- If this app should be reachable externally later, proxy it from the primary node rather than moving edge duties here.

## Manual follow-up blockers

- docker socket mounts should stay manual unless intentionally preserved
- multiple independently exposed UI/API services suggest app splitting
