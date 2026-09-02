from functools import lru_cache

import requests
from langchain_core.tools import tool
from qdrant_client import QdrantClient

from app.config import settings

# Must match ingestion/embed.py's EMBEDDING_MODEL_NAME/EMBEDDING_DIM/
# HF_API_URL/_to_vector exactly — see that file's module docstring for
# why this is a deliberate duplication, not an import, across the
# ingestion/backend Docker build-context boundary.
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
# api-inference.huggingface.co is dead (DNS doesn't resolve) — this is
# the current "Inference Providers" route, confirmed live 2026-09-02.
# See ingestion/embed.py's matching comment.
HF_API_URL = f"https://router.huggingface.co/hf-inference/models/{EMBEDDING_MODEL_NAME}/pipeline/feature-extraction"
COLLECTION_NAME = "site_docs"

# Below this cosine similarity, a "match" is really just the least-bad
# option in the collection, not something the model should treat as
# grounding. This is the actual mechanism behind the plan's "Grounding,
# not guessing" decision — the tool itself refuses to hand back a weak
# match, rather than relying on the system prompt alone to notice.
SIMILARITY_THRESHOLD = 0.35
TOP_K = 4


def _embed_query(text: str) -> list[float]:
    if not settings.hf_token:
        raise RuntimeError("HF_TOKEN is not set — get a free token at https://huggingface.co/settings/tokens")
    resp = requests.post(
        HF_API_URL,
        headers={"Authorization": f"Bearer {settings.hf_token}"},
        json={"inputs": text, "options": {"wait_for_model": True}},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, list) and data and isinstance(data[0], (int, float)):
        return data
    if isinstance(data, list) and data and isinstance(data[0], list):
        dim = len(data[0])
        summed = [0.0] * dim
        for token_vec in data:
            for i, v in enumerate(token_vec):
                summed[i] += v
        return [s / len(data) for s in summed]
    raise ValueError(f"Unexpected embedding response shape: {type(data)}")


@lru_cache(maxsize=1)
def _get_qdrant_client() -> QdrantClient:
    return QdrantClient(url=settings.qdrant_url)


@tool
def search_knowledge_base(query: str) -> str:
    """Search United Services Egypt's actual site content (services,
    about, vision, projects, careers, contact info) for passages
    relevant to the user's question. Always use this before answering
    any question about the company, its services, or its policies —
    never answer those from general knowledge."""
    client = _get_qdrant_client()
    if not client.collection_exists(COLLECTION_NAME):
        return (
            "The knowledge base hasn't been ingested yet (no "
            f"'{COLLECTION_NAME}' collection in Qdrant) — tell the user "
            "you don't have documentation available right now."
        )

    query_vector = _embed_query(query)

    hits = client.query_points(
        collection_name=COLLECTION_NAME,
        query=query_vector,
        limit=TOP_K,
        score_threshold=SIMILARITY_THRESHOLD,
    ).points

    if not hits:
        return (
            "No documentation found above the relevance threshold for "
            "this query — say you don't have documentation on this "
            "topic rather than answering from general knowledge."
        )

    parts = []
    for hit in hits:
        payload = hit.payload or {}
        parts.append(
            f"[source: {payload.get('title', 'untitled')} — {payload.get('source_url', '')}]\n"
            f"{payload.get('text', '')}"
        )
    return "\n\n---\n\n".join(parts)
