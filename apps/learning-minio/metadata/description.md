# Learning MinIO

MinIO from the old `learning` bundle, split into its own Runtipi app.

## Deployment stance

- Internal-first object storage on the secondary node.
- Console host port: `3224`.
- S3 API host port: `3225`.
- The primary public edge remains `192.168.1.57`.

## Data notes

- Object data lives in `${APP_DATA_DIR}/app-data/learning-minio/named/data`.

## Migration notes

- Source repo: `/data/repos/apps/learning`
- Original compose source: `/data/repos/apps/learning/docker-compose.yml`
- Split out so object storage can be managed and backed up independently from the rest of the learning stack.

## RassyCodex notes

- MinIO does not call the model gateway directly.
- It supports the RassyCodex learning stack as durable object storage for datasets, artifacts, exports, and evaluation assets.
- Keep credentials in `app.env` or Runtipi user config; do not bake them into the appstore package.
