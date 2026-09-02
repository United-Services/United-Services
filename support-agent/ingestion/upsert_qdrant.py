"""Phase 2, step 4: upsert embedded chunks into Qdrant.

Idempotent by construction: qdrant's upsert() overwrites whatever point
already has a given ID, and clean_chunk_job.py already derives that ID
deterministically from (source_url, chunk_index) — so re-running the
whole pipeline updates existing chunks in place instead of duplicating
the knowledge base, which is the exact failure mode the plan's "Stable
chunk IDs" and "commonly goes wrong" sections both call out.
"""

import json
import os
import sys
import uuid

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from embed import EMBEDDING_DIM

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
COLLECTION_NAME = os.environ.get("QDRANT_COLLECTION", "site_docs")
UPSERT_BATCH_SIZE = 100


def chunk_id_to_point_id(chunk_id: str) -> str:
    # Qdrant point IDs must be an unsigned int or a UUID — not an
    # arbitrary string. uuid5 deterministically derives a real UUID from
    # our sha256 chunk_id, so the same (source_url, chunk_index) still
    # always maps to the same Qdrant point id, preserving idempotency.
    return str(uuid.uuid5(uuid.NAMESPACE_URL, chunk_id))


def ensure_collection(client: QdrantClient) -> None:
    if client.collection_exists(COLLECTION_NAME):
        return
    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
    )
    print(f"created collection '{COLLECTION_NAME}' (dim={EMBEDDING_DIM}, cosine)")


def upsert_chunks(client: QdrantClient, chunks: list[dict]) -> int:
    points = [
        PointStruct(
            id=chunk_id_to_point_id(c["chunk_id"]),
            vector=c["vector"],
            # Metadata per chunk (source URL, title, scrape date) — this
            # is what lets the agent cite where an answer came from, and
            # what lets a human spot stale content later, per the plan's
            # "Metadata per chunk" decision.
            payload={
                "chunk_id": c["chunk_id"],
                "source_url": c["source_url"],
                "title": c["title"],
                "chunk_index": c["chunk_index"],
                "text": c["text"],
                "scraped_at": c["scraped_at"],
            },
        )
        for c in chunks
    ]
    for i in range(0, len(points), UPSERT_BATCH_SIZE):
        client.upsert(collection_name=COLLECTION_NAME, points=points[i : i + UPSERT_BATCH_SIZE])
    return len(points)


def main(input_path: str) -> None:
    with open(input_path) as f:
        chunks = json.load(f)
    client = QdrantClient(url=QDRANT_URL)
    ensure_collection(client)
    count = upsert_chunks(client, chunks)
    print(f"upserted {count} point(s) into '{COLLECTION_NAME}'")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: upsert_qdrant.py <embedded_chunks_json>", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1])
