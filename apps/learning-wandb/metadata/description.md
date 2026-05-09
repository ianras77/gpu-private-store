# Learning W&B

Weights & Biases Local from the old `learning` bundle, split into its own Runtipi app.

## Deployment stance

- Internal-first experiment dashboard on the secondary node.
- Main host port: `3226`.
- The primary public edge remains `192.168.1.57`.

## Data notes

- Persisted W&B env data lives in `${APP_DATA_DIR}/app-data/learning-wandb/named/env`.

## Migration notes

- Source repo: `/data/repos/apps/learning`
- Original compose source: `/data/repos/apps/learning/docker-compose.yml`
- License and API key are intentionally expected from `user-config`, not baked into the shared store package.
