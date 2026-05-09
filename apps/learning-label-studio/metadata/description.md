# Learning Label Studio

Label Studio from the old `learning` bundle, split into its own Runtipi app.

## Deployment stance

- Internal-first data-labeling workspace on the secondary node.
- Main host port: `3222`.
- The primary public edge remains `192.168.1.57`.

## Data notes

- Label project data lives in `${APP_DATA_DIR}/app-data/learning-label-studio/named/data`.
- Postgres storage lives in `${APP_DATA_DIR}/app-data/learning-label-studio/named/postgres`.

## Migration notes

- Source repo: `/data/repos/apps/learning`
- Original compose source: `/data/repos/apps/learning/docker-compose.yml`
- Host and CSRF URLs are intentionally left override-friendly through `user-config`.
