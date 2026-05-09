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

## Fast model and vector storage

Persistent model/cache and vector data lands under `RASSYGPT_FAST_STORAGE_DIR`, which defaults to:

```text
/models-fast/rassygpt
```

That directory holds llama.cpp caches, per-lane model directories, optional media/model caches, and Qdrant storage.

## Change routes without rebuilding

Edit:

```text
${APP_DATA_DIR}/gateway/config/routes.yaml
```

Then restart the gateway container.
