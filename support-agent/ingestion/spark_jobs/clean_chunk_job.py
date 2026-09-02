"""Phase 2, step 2: clean + chunk the scraped pages, as a real PySpark
job (local mode) — per the locked-in spec. See the plan's own "Overkill
· Apache Spark" note: a few hundred KB to low tens of MB of site text is
a workload a single Python process would chew through in seconds, so
this is architecture chosen for the resume line, not because the data
volume needs distributed processing. Kept here exactly because it was
asked for as spec'd, not the "honest recommendation" alternative.

Run standalone (local[*] master, no cluster needed):
    spark-submit clean_chunk_job.py <input_json> <output_json>
"""

import hashlib
import json
import re
import sys
from datetime import datetime, timezone

from pyspark.sql import Row, SparkSession
from pyspark.sql.types import ArrayType, StringType, StructField, StructType

CHUNK_WORDS = 220
CHUNK_OVERLAP_WORDS = 40


def clean_text(text: str) -> str:
    # Collapse runs of whitespace the site's own layout/markup produces
    # (nav items, footer columns) without altering actual sentence
    # content — this is "cleaning," not summarizing.
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chunk_text(text: str) -> list[str]:
    # Word-count chunking with overlap, not naive fixed-character
    # slicing — a fixed-char cut can land mid-word/mid-sentence, exactly
    # what the plan's "commonly goes wrong" list calls out. Overlap means
    # a fact stated right at a chunk boundary is still retrievable
    # whichever of the two adjacent chunks matches the query.
    words = text.split()
    if not words:
        return []
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + CHUNK_WORDS, len(words))
        chunks.append(" ".join(words[start:end]))
        if end == len(words):
            break
        start = end - CHUNK_OVERLAP_WORDS
    return chunks


def stable_chunk_id(source_url: str, chunk_index: int) -> str:
    # Deterministic, not a fresh UUID per run — the exact "Stable chunk
    # IDs" decision the plan calls out: without this, every DAG run
    # would duplicate the whole knowledge base in Qdrant instead of
    # updating it in place.
    raw = f"{source_url}:{chunk_index}"
    return hashlib.sha256(raw.encode()).hexdigest()


def process_partition(rows):
    scraped_at = datetime.now(timezone.utc).isoformat()
    for row in rows:
        cleaned = clean_text(row.text)
        for i, chunk in enumerate(chunk_text(cleaned)):
            yield Row(
                chunk_id=stable_chunk_id(row.url, i),
                source_url=row.url,
                title=row.title,
                chunk_index=i,
                text=chunk,
                scraped_at=scraped_at,
            )


def main(input_path: str, output_path: str) -> None:
    spark = SparkSession.builder.appName("doc-chunk-clean").master("local[*]").getOrCreate()

    with open(input_path) as f:
        pages = json.load(f)
    input_schema = StructType(
        [
            StructField("url", StringType(), False),
            StructField("title", StringType(), False),
            StructField("text", StringType(), False),
        ]
    )
    df = spark.createDataFrame(pages, schema=input_schema)

    chunk_rdd = df.rdd.mapPartitions(process_partition)
    chunks_df = spark.createDataFrame(chunk_rdd)

    # collect() is fine at this scale (see the module docstring) — the
    # output goes to a single local JSON file for embed.py to read next,
    # not to a distributed sink, so there's no benefit to writing
    # Spark's own partitioned output format here.
    chunks = [row.asDict() for row in chunks_df.collect()]
    with open(output_path, "w") as f:
        json.dump(chunks, f, indent=2)
    print(f"wrote {len(chunks)} chunk(s) to {output_path}")

    spark.stop()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: clean_chunk_job.py <input_json> <output_json>", file=sys.stderr)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
