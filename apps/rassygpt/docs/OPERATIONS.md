# Operations Runbook

## Health

```bash
curl https://YOUR-RASSYGPT-DOMAIN/health
curl https://YOUR-RASSYGPT-DOMAIN/ready -H "Authorization: Bearer YOUR_KEY"
curl https://YOUR-RASSYGPT-DOMAIN/admin/status -H "Authorization: Bearer YOUR_KEY"
```

## Logs

```bash
docker logs -f rassygpt-gateway
docker logs -f rassygpt-general
docker logs -f rassygpt-coder
docker logs -f rassygpt-embed
```

## GPU usage

```bash
watch -n 2 nvidia-smi
```

## Model cache

Persistent model/cache data lands under the app data directory:

```text
${APP_DATA_DIR}/models/llama-cache
${APP_DATA_DIR}/models/general
${APP_DATA_DIR}/models/coder
${APP_DATA_DIR}/qdrant/storage
```

## Change routes without rebuilding

Edit:

```text
${APP_DATA_DIR}/gateway/config/routes.yaml
```

Then restart the gateway container.
