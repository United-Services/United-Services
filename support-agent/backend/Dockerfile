FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY alembic ./alembic
COPY alembic.ini .

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
