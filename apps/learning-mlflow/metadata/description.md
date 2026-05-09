# Learning MLflow

MLflow from the old `learning` bundle, split into its own Runtipi app.

## Deployment stance

- Internal-first tracking server for experiments and artifact management on the secondary node.
- Main host port: `3221`.
- The primary public edge remains `192.168.1.57`.

## Data notes

- Artifact root lives in `${APP_DATA_DIR}/app-data/learning-mlflow/named/mlflow`.
- Metadata storage lives in `${APP_DATA_DIR}/app-data/learning-mlflow/named/postgres`.
- This package mounts the tracked `learning/mlflow` build context and auth config from the source repo.

## Migration notes

- Source repo: `/data/repos/apps/learning`
- Original compose source: `/data/repos/apps/learning/docker-compose.yml`
- The tracked `mlflow` build files were restored from the repo history so the split package can build faithfully.
