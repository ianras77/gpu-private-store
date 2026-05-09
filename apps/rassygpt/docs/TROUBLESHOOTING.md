# Troubleshooting

## Gateway is up but models are not ready

First boot may still be downloading GGUF files. Check:

```bash
docker logs -f rassygpt-general
docker logs -f rassygpt-coder
```

## Wrong GPU is used

RassyGPT uses UUID pinning. Confirm with:

```bash
nvidia-smi -L
```

Then update the Runtipi form fields or compose env values.

## llama.cpp image cannot use CUDA

Confirm NVIDIA Container Toolkit is installed on the host and Docker can run:

```bash
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi
```

## Embeddings return odd results

Embedding models sometimes require task prefixes. For Nomic, test both raw text and prefixed text such as:

```text
search_query: your query
search_document: your document
```

## Reranker endpoint fails

The gateway automatically falls back to embedding-cosine reranking. This is less powerful than a true cross-encoder reranker, but keeps RAG workflows alive instead of failing hard.
