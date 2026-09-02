"""Phase 2, step 3: embed each chunk via Hugging Face's hosted Inference
API — no local model download, no torch. Trades that for a real
dependency: HF's free tier has rate limits and a cold-start delay when
the model isn't already loaded on their end (the wait_for_model option
below waits it out rather than erroring), so this is slower and less
predictable than the local sentence-transformers alternative it
replaces. Chosen deliberately anyway — see the repo's own note on this
trade in README.md.

Critically the *same* model at ingestion and query time — see the
plan's "Easy to miss": vectors from two different embedding models
aren't comparable. EMBEDDING_MODEL_NAME/EMBEDDING_DIM are intentionally
duplicated (not imported) in
backend/app/agent/tools/search_knowledge_base.py: ingestion/ and
backend/ are separate Docker build contexts, so there's no real
shared-package boundary to import across just for two constants and a
14-line HTTP helper. Both copies carry a "must match" comment pointing
at the other file.
"""

import json
import os
import sys
import time

import requests

EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
EMBEDDING_DIM = 384  # all-MiniLM-L6-v2's output size — Qdrant's collection is created with this.

# api-inference.huggingface.co (the old hostname most tutorials/docs
# still reference) is dead — DNS doesn't even resolve anymore. HF's
# "Inference Providers" system replaced it; this is the hf-inference
# provider's feature-extraction route, confirmed live against a real
# token (2026-09-02) to return an already-pooled flat 384-dim vector for
# this model, not per-token embeddings — _to_vector below still handles
# the per-token shape defensively in case that ever changes.
HF_API_URL = f"https://router.huggingface.co/hf-inference/models/{EMBEDDING_MODEL_NAME}/pipeline/feature-extraction"
HF_TOKEN = os.environ.get("HF_TOKEN", "")
MAX_RETRIES = 3


def embed_text(text: str) -> list[float]:
    """One HTTP call, one chunk's worth of text -> one 384-dim vector.
    Handles both response shapes HF's Inference API can return for a
    sentence-transformers model: an already-pooled flat vector, or a
    per-token 2D array (mean-pooled here to match sentence-transformers'
    own default pooling strategy for this model)."""
    if not HF_TOKEN:
        raise RuntimeError("HF_TOKEN is not set — get a free token at https://huggingface.co/settings/tokens")

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        resp = requests.post(
            HF_API_URL,
            headers={"Authorization": f"Bearer {HF_TOKEN}"},
            json={"inputs": text, "options": {"wait_for_model": True}},
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            return _to_vector(data)
        last_error = RuntimeError(f"HF Inference API {resp.status_code}: {resp.text[:300]}")
        # 503 while the model is cold-loading, or a transient rate-limit
        # 429 — both worth a short backoff-and-retry rather than
        # immediately failing the whole ingestion run over one flaky call.
        if resp.status_code in (429, 503) and attempt < MAX_RETRIES - 1:
            time.sleep(2 ** attempt)
            continue
        break
    raise last_error  # type: ignore[misc]


def _to_vector(data: object) -> list[float]:
    if isinstance(data, list) and data and isinstance(data[0], (int, float)):
        return data  # already a single pooled vector
    if isinstance(data, list) and data and isinstance(data[0], list):
        # Per-token vectors — mean-pool, matching sentence-transformers'
        # own default pooling for this model, so ingestion and any
        # future direct-model fallback stay comparable.
        dim = len(data[0])
        summed = [0.0] * dim
        for token_vec in data:
            for i, v in enumerate(token_vec):
                summed[i] += v
        return [s / len(data) for s in summed]
    raise ValueError(f"Unexpected embedding response shape: {type(data)}")


def embed_chunks(chunks: list[dict]) -> list[dict]:
    for i, chunk in enumerate(chunks):
        chunk["vector"] = embed_text(chunk["text"])
        if (i + 1) % 10 == 0:
            print(f"embedded {i + 1}/{len(chunks)}")
    return chunks


def main(input_path: str, output_path: str) -> None:
    with open(input_path) as f:
        chunks = json.load(f)
    embedded = embed_chunks(chunks)
    with open(output_path, "w") as f:
        json.dump(embedded, f)
    print(f"embedded {len(embedded)} chunk(s) -> {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: embed.py <input_chunks_json> <output_embedded_json>", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
