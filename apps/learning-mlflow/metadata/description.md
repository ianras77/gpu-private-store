# Learning MLflow

MLflow from the old `learning` bundle, split into its own Runtipi app.

## Deployment stance

- Internal-first tracking server for experiments and artifact management on the secondary node.
- Main host port: `3221`.
- The primary public edge remains `192.168.1.57`.

## Data notes

- Artifact root lives in `${APP_DATA_DIR}/app-data/learning-mlflow/named/mlflow`.
- Metadata storage lives in `${APP_DATA_DIR}/app-data/learning-mlflow/named/postgres`.
- This package builds from its local `mlflow` directory and generates the MLflow auth config at container startup.

## Migration notes

- Original source repo: `/data/repos/apps/learning`
- Original compose source: `/data/repos/apps/learning/docker-compose.yml`
- The tracked `mlflow` build files were restored from the repo history so the split package can build faithfully.

## RassyCodex notes

- MLflow receives RassyCodex OpenAI-compatible env defaults for model evaluation and experiment logging code.
- Use `MLFLOW_RASSYCODEX_API_KEY` for the standalone gateway key.
- The default gateway URL is `http://host.docker.internal:8844/v1`.
