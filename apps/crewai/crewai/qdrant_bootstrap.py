import os
from qdrant_client import QdrantClient
from qdrant_client.http import models as qm
from ollama_embeddings import embed_texts

QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "qdrant_docs")

client = QdrantClient(url=QDRANT_URL)

def ensure_collection(dim: int = 768):
    collections = [c.name for c in client.get_collections().collections]
    if QDRANT_COLLECTION not in collections:
        client.create_collection(
            collection_name=QDRANT_COLLECTION,
            vectors_config=qm.VectorParams(
                size=dim,
                distance=qm.Distance.COSINE,
            ),
        )

def index_docs(docs):
    vectors = embed_texts(docs)
    ensure_collection(dim=len(vectors[0]))
    points = [
        qm.PointStruct(id=i, vector=vectors[i], payload={"text": docs[i]})
        for i in range(len(docs))
    ]
    client.upsert(collection_name=QDRANT_COLLECTION, points=points)

if __name__ == "__main__":
    docs = [
        "CrewAI lets you orchestrate multiple agents to work together on complex tasks.",
        "Qdrant is a vector database for efficient similarity search over embeddings.",
        "Ollama lets you run open-source LLMs and embedding models locally on your machine."
    ]
    index_docs(docs)
    print("Indexed sample docs into Qdrant.")
