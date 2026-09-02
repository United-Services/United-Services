# Extends the official Airflow image with what the ingestion DAG's
# BashOperator tasks actually need to run *inside this same container*:
# a JVM (PySpark requires one even in local[*] mode) and ingestion/'s
# own Python deps. Deliberately not a separate Spark master/worker
# service — local[*] mode means spark-submit runs its own in-process
# Spark context wherever it's invoked, which is exactly what the plan's
# cost table means by "spark (local mode)": the cost is real (this
# image is heavier for it), but it isn't a second network hop to a
# standalone Spark service, which the plan's own reality-check flags as
# unnecessary extra integration surface for a workload this small.
FROM apache/airflow:2.10.4-python3.12

USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jdk-headless \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
ENV JAVA_HOME=/usr/lib/jvm/default-java

USER airflow
COPY ingestion/requirements.txt /opt/airflow/ingestion-requirements.txt
RUN pip install --no-cache-dir -r /opt/airflow/ingestion-requirements.txt
