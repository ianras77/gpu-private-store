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

## Downstream app wiring

Internal OpenAI-compatible `/v1` clients should still send the RassyGPT bearer key. For the currently connected Runtipi apps, that means setting the app-specific env hooks such as `JOGMANIA_ADVENTURE_LLM_API_KEY` and `TRT_LOCALAI_API_KEY` from the local RassyGPT key. Keep `RASSYGPT_ALLOW_INTERNAL_OLLAMA_COMPAT` for Ollama-style `/api/*` compatibility rather than opening all `/v1` traffic without auth.


## Stability policy

`rassy-smart` routes very large prompts to the 32k coder lane instead of the 16k general slot. Transient upstream transport failures return structured `503` responses so callers can retry cleanly without ASGI traceback noise.

## Change routes without rebuilding

Edit:

```text
${APP_DATA_DIR}/gateway/config/routes.yaml
```

Then restart the gateway container.
