# Learning Qdrant

Qdrant from the old `learning` bundle, split into its own Runtipi app.

## Deployment stance

- Internal-first vector database on the secondary node.
- Main host port: `3223`.
- This package is intended for API clients and other apps rather than a primary browser UI.

## Data notes

- Vector storage lives in `${APP_DATA_DIR}/app-data/learning-qdrant/named/storage`.

## Migration notes

- Source repo: `/data/repos/apps/learning`
- Original compose source: `/data/repos/apps/learning/docker-compose.yml`
- Split out so vector storage can be managed independently from the other learning tools.

## RassyCodex notes

- This app is an optional learning-stack Qdrant instance; RassyCodex also runs its own internal Qdrant under `/data/apps/rassycodex`.
- Keep this app for separate experiments, dataset indexes, or workflows that should not share the RassyCodex internal memory collection.
- RassyCodex model clients should still call the gateway at `http://host.docker.internal:8844/v1`.
