import os
from crewai_tools import QdrantVectorSearchTool, QdrantConfig

qdrant_tool = QdrantVectorSearchTool(
    qdrant_config=QdrantConfig(
        qdrant_url=os.getenv("QDRANT_URL", "http://qdrant:6333"),
        qdrant_api_key=None,  # local dev usually no key
        collection_name=os.getenv("QDRANT_COLLECTION", "qdrant_docs"),
    )
)
