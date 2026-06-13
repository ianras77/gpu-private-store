# Learning Airflow

Apache Airflow from the old `learning` bundle, split into its own Runtipi app.

## Deployment stance

- Internal-first service for DAG orchestration and scheduled workflows on the secondary node.
- Main host port: `3220`.
- The primary public edge remains `192.168.1.57`.

## Data notes

- DAGs live in `${APP_DATA_DIR}/app-data/learning-airflow/named/dags`.
- Logs live in `${APP_DATA_DIR}/app-data/learning-airflow/named/logs`.
- Metadata storage lives in `${APP_DATA_DIR}/app-data/learning-airflow/named/postgres`.

## Migration notes

- Source repo: `/data/repos/apps/learning`
- Original compose source: `/data/repos/apps/learning/docker-compose.yml`
- Split reason: the original `learning` folder bundled several separate products that should not ship as one fake app.

## RassyCodex notes

- Airflow webserver and scheduler containers receive RassyCodex OpenAI-compatible env defaults.
- DAGs can call `http://host.docker.internal:8844/v1` with `AIRFLOW_RASSYCODEX_API_KEY`.
- Canonical aliases are `rassy-codex` for chat/coding and `rassy-embed` for embeddings.
