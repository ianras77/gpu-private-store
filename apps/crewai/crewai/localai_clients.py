import os
from typing import List, Dict, Any
import base64

import requests

LOCALAI_API_BASE = os.getenv("LOCALAI_API_BASE", "http://host.docker.internal:8111/v1")
LOCALAI_API_KEY = os.getenv("LOCALAI_API_KEY", "localai-demo-key")

EMBED_MODEL = os.getenv("LOCALAI_EMBED_MODEL", "all-MiniLM-L6-v2")
RERANK_MODEL = os.getenv("LOCALAI_RERANK_MODEL", "jina-reranker-v1-base-en")
IMAGE_MODEL = os.getenv("LOCALAI_IMAGE_MODEL", "stablediffusion")


def _headers() -> Dict[str, str]:
    h = {"Content-Type": "application/json"}
    if LOCALAI_API_KEY:
        h["Authorization"] = f"Bearer {LOCALAI_API_KEY}"
    return h


# ---------- Embeddings ----------

def embed_texts(texts: List[str]) -> List[List[float]]:
    """
    Uses LocalAI's OpenAI-compatible /embeddings endpoint.
    input: List[str] -> output: List[embedding vectors]
    """
    url = f"{LOCALAI_API_BASE}/embeddings"
    resp = requests.post(
        url,
        headers=_headers(),
        json={
            "model": EMBED_MODEL,
            "input": texts,
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    # OpenAI-compatible schema: {'data': [{'embedding': [...]} , ...]}
    return [item["embedding"] for item in data["data"]]


# ---------- Reranker ----------

def rerank_documents(
    query: str,
    documents: List[str],
    top_n: int = 5,
) -> List[Dict[str, Any]]:
    """
    Uses LocalAI's /v1/rerank endpoint with a reranker backend.
    Returns list of {index, document, score}, sorted by score desc.
    """
    url = f"{LOCALAI_API_BASE}/rerank"
    resp = requests.post(
        url,
        headers=_headers(),
        json={
            "model": RERANK_MODEL,
            "query": query,
            "documents": documents,
            "top_n": top_n,
        },
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    # LocalAI follows Jina-like rerank schema; we normalize it:
    # expected: { "results": [ { "index": int, "relevance_score": float }, ... ] }
    results = data.get("results", [])
    ranked = []
    for r in results:
        idx = r.get("index")
        score = r.get("relevance_score")
        if idx is None or idx < 0 or idx >= len(documents):
            continue
        ranked.append(
            {
                "index": idx,
                "document": documents[idx],
                "score": score,
            }
        )
    # Sort by score descending, just in case
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked


# ---------- Image generation ----------

def generate_image(
    prompt: str,
    size: str = "1024x1024",
) -> bytes:
    """
    Uses LocalAI /v1/images/generations to produce an image with 'IMAGE_MODEL'.
    Returns raw image bytes (PNG/JPEG depending on backend).
    """
    url = f"{LOCALAI_API_BASE}/images/generations"
    resp = requests.post(
        url,
        headers=_headers(),
        json={
            "model": IMAGE_MODEL,
            "prompt": prompt,
            "size": size,
        },
        timeout=300,
    )
    resp.raise_for_status()
    data = resp.json()

    # LocalAI follows OpenAI-style: data[0].b64_json
    img_b64 = data["data"][0]["b64_json"]
    return base64.b64decode(img_b64)
