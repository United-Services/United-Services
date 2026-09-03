# Pinned to a specific patch, not the floating python:3.12-slim tag —
# every other image in this project pins similarly (apache/airflow:
# 2.10.4-python3.12, qdrant/qdrant:v1.12.4). Re-check the current 3.12.x
# tag list at apply time; floating tags drift, this doesn't.
FROM python:3.12.7-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

# No USER directive previously meant uvicorn/alembic ran as root inside
# the container for no reason — confirmed live via `docker exec ...
# whoami`. A non-root user removes that as a free privilege-escalation
# step if the app itself is ever compromised (e.g. a future dependency
# RCE). chown after both COPYs, not before, so it covers everything the
# process actually touches at runtime.
RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
# Migrations run against both Supabase (primary) and the local standby
# on every container start, before the app accepts traffic —
# `alembic upgrade head` is a no-op if already current, so this is safe
# to run unconditionally rather than only on first deploy. Both need the
# schema for failover to actually work at request time (see
# alembic/env.py's comment). If Supabase is unreachable at boot, that
# migration step fails loudly rather than silently skipping — worth
# knowing about immediately, not discovering the first time a request
# needs a table that was never created there.
# `exec` before the final command replaces the shell process with
# uvicorn instead of leaving it as a child — without it, `docker stop`'s
# SIGTERM goes to the shell wrapping this whole chain, not to uvicorn
# directly, and shutdown only completes after Docker's forced-kill
# timeout instead of a clean graceful stop.
CMD alembic upgrade head && alembic -x db=local upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000
