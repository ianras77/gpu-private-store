# Install RassyGPT in Runtipi

## 1. Add the app store

Add this folder/repository as a custom app store in Runtipi. The app lives at:

```text
apps/rassygpt
```

## 2. Validate GPU UUIDs

Before first start, confirm:

```bash
nvidia-smi -L
```

Expected default map:

| Lane | Default GPU UUID |
|---|---|
| general | `GPU-da459626-429e-72e2-1fe9-b08d791ff949` |
| coder | `GPU-c7937378-74e4-b9ab-1953-342773d4e962,GPU-d48ccf91-1518-72fa-b13a-73cb480788e2` |
| fast | `GPU-c83f333f-e104-7d4c-b1c1-e0d2e8818053` |
| retrieval | `GPU-e1d104e4-bdf8-8558-a863-fa50b1168122` |

## 3. First boot

The first boot downloads several GGUF models from Hugging Face. This can take a long time and a lot of disk. The Runtipi health check only requires the gateway to be alive, so model downloads should not mark the whole app as failed.

## 4. Test

```bash
curl -s https://YOUR-RASSYGPT-DOMAIN/v1/models   -H "Authorization: Bearer YOUR_KEY" | jq
```

```bash
curl -s https://YOUR-RASSYGPT-DOMAIN/v1/chat/completions   -H "Authorization: Bearer YOUR_KEY"   -H "Content-Type: application/json"   -d '{"model":"rassy-fast","messages":[{"role":"user","content":"Give me a one sentence hello."}],"max_tokens":80}' | jq
```
