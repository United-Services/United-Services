"""Phase 2's one and only DAG: scrape -> chunk (Spark) -> embed -> upsert.

Per the plan's own "Overkill · Apache Airflow" note: this is a single
linear pipeline with no backfills, no SLA alerting, and no multi-team
DAG graph — the actual justification for Airflow here is the resume
line, not a scheduling need a cron job couldn't meet. Built anyway,
exactly as specified, since that trade was made explicitly rather than
by default.

Runs daily and skips backfilling old missed runs (catchup=False) — a
stale knowledge base for a day is harmless; re-running every missed day
in sequence on first deploy is not useful here.
"""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator

INGESTION_DIR = "/opt/airflow/ingestion"
OUTPUT_DIR = f"{INGESTION_DIR}/output"
SCRAPED_PAGES = f"{OUTPUT_DIR}/scraped_pages.json"
CHUNKS = f"{OUTPUT_DIR}/chunks.json"
EMBEDDED_CHUNKS = f"{OUTPUT_DIR}/embedded_chunks.json"

default_args = {
    "owner": "support-agent",
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    dag_id="doc_ingestion_dag",
    description="scrape site -> Spark clean/chunk -> embed -> upsert to Qdrant",
    default_args=default_args,
    schedule="@daily",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["support-agent", "rag"],
) as dag:
    scrape = BashOperator(
        task_id="scrape_site",
        bash_command=f"mkdir -p {OUTPUT_DIR} && python {INGESTION_DIR}/scrape.py",
    )

    chunk = BashOperator(
        task_id="clean_and_chunk_spark",
        bash_command=(
            f"spark-submit {INGESTION_DIR}/spark_jobs/clean_chunk_job.py "
            f"{SCRAPED_PAGES} {CHUNKS}"
        ),
    )

    embed = BashOperator(
        task_id="embed_chunks",
        bash_command=f"python {INGESTION_DIR}/embed.py {CHUNKS} {EMBEDDED_CHUNKS}",
    )

    upsert = BashOperator(
        task_id="upsert_to_qdrant",
        bash_command=f"python {INGESTION_DIR}/upsert_qdrant.py {EMBEDDED_CHUNKS}",
    )

    scrape >> chunk >> embed >> upsert
