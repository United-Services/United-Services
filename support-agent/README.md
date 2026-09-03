# AI Support Assistant

A chat assistant for the United Services Egypt website. It answers
questions about the company using the site's own content, can file a
support ticket on a visitor's behalf, and knows when to hand a
conversation off to a real person.

Lives as a chat button in the bottom-right corner of the main site.

## What it can do

- **Answer questions grounded in the real site**, not guesses — it
  looks up the company's actual services, projects, and info before
  answering, and says so plainly if it doesn't have documentation on
  something rather than making an answer up.
- **File a support ticket** — it double-checks the details with the
  visitor before filing anything.
- **Hand off to a human** — if a visitor asks to speak to a person, or
  if the assistant genuinely can't help after trying, it flags the
  conversation for the team and files a ticket automatically so it gets
  picked up quickly.
- **Remembers the conversation** — a visitor can ask a follow-up
  question and the assistant remembers what was just said.
- **Keeps working during an outage** — if the primary database has a
  problem, it automatically switches to a backup rather than going
  down; if one AI model is temporarily unavailable, it tries a backup
  model too.
- **Stays within budget** — it's built on free AI models, with limits in
  place so one visitor can't use up the shared quota for everyone else.

## Current status

The whole thing has been built and tested piece by piece — the AI
conversation, the document search, the ticket filing, the automatic
backups, the safety limits, and the chat widget on the site itself.
Everything runs locally for now; nothing has been deployed to a live
server yet.

---

The rest of this document is the full engineering detail — what was
built in each phase, how it was tested, and a few honest notes on what
hasn't been verified yet.

---

## Engineering detail: Phases 1–6 (verified)

Agent skeleton + OpenRouter tool-calling proof with automatic
per-model-outage fallback (Phase 1), RAG ingestion — scrape → Spark
clean/chunk → embed → Qdrant, plus the `search_knowledge_base` tool
(Phase 2), real tool side effects —
`create_ticket`/`get_ticket_status`/`escalate_to_human` against
Postgres, with automatic Supabase → local-Postgres failover matching
the main United-Services backend's design (Phase 3), SSE streaming with
real cross-turn conversation memory (Phase 4), guardrails — a per-IP
rate limit, a code-level tool-call loop cap that escalates instead of
looping silently, and prompt-injection defense (Phase 5), then the
React widget and full `docker-compose.yml`, with DB-backed CORS
matching the main backend's own `AllowedOrigin` pattern (Phase 6). All
verified live, not just wired — see below (two pieces specifically
flagged as reasoned-through rather than live-recalibrated, for an
honest reason stated where each applies).

## What's here

```
support-agent/
  backend/
    app/
      main.py                    # FastAPI: /health (+ db mode); mounts chat_router + CORS
      config.py                   # pydantic Settings — reads backend/.env
      session_context.py          # contextvar carrying the trusted session_id into tools
      routers/
        chat.py                    # POST /chat/stream — SSE, rate-limited
      memory/
        redis_memory.py            # live conversation buffer, 30-min TTL, capped history
        transcript_store.py        # durable copy into Postgres (one JSON column per session)
      security/
        rate_limit.py               # per-IP throttle on /chat/stream, Redis-backed
        auth.py                     # ticket ownership check (factored out of Phase 3's tool)
        cors.py                     # DB-backed CORS allowlist (allowed_origins table), cached
      agent/
        llm.py                     # ChatOpenAI, model name parameterized for fallback candidates
        agent.py                   # LangGraph create_react_agent + system prompt + streaming + fallback
        guardrails.py               # tool-call loop cap (recursion_limit) + escalation message
        tools/
          dummy.py                  # get_current_time()
          search_knowledge_base.py  # Qdrant similarity search, grounding threshold
          create_ticket.py          # files a ticket — model must confirm details first
          get_ticket_status.py      # session-scoped lookup (ownership check via security/auth.py)
          escalate_to_human.py      # flags the session + files a high-priority ticket
      db/
        models.py                  # Ticket, ConversationSession, TranscriptMessage, AllowedOrigin
        session.py                  # resolves the active (primary/local) engine per call
      failover/
        manager.py                  # Supabase<->local Postgres health-check + mode flip
        mirror_sync.py              # periodic primary->local data sync while on primary
    alembic/                    # migrations — applied to BOTH primary and local on boot
    requirements.txt
    Dockerfile
  # No separate frontend/ here — the chat widget lives inside the main
  # site's own Next.js app instead (../frontend, repo root):
  #   frontend/components/ChatWidget.tsx  — floating launcher + panel
  #   frontend/lib/useChatStream.ts       — fetch + manual SSE parsing
  # Mounted once in frontend/app/[locale]/layout.tsx, so it's on every
  # page. Originally built as a standalone Vite app meant to be
  # iframe-embedded (see Phase 6 below for that reasoning) — moved into
  # the main app directly instead, once asked for.
  ingestion/
    scrape.py                  # pulls the site's real public pages
    embed.py                   # embeds via Hugging Face's hosted Inference API — no local model/torch
    upsert_qdrant.py           # idempotent upsert by stable chunk id
    spark_jobs/
      clean_chunk_job.py        # real PySpark job, local[*] mode — clean + chunk
    requirements.txt
  dags/
    doc_ingestion_dag.py       # Airflow DAG: scrape -> Spark -> embed -> upsert
  airflow/
    Dockerfile                 # apache/airflow + JDK + ingestion/'s deps
  postgres-init/
    01-create-airflow-db.sql   # local Postgres: app's failover-standby db + airflow's metadata db
  docker-compose.yml           # postgres, qdrant, redis, backend, airflow
  docker-compose.override.yml  # local-dev only: source mounts, --reload, 127.0.0.1-only host ports
```

## Setup

No `.env` file in this project — `app/config.py` reads credentials
directly from the main United-Services backend's own `.env`
(`<repo-root>/backend/.env`), resolved via a fixed relative path so it
works regardless of which directory the process is launched from. Same
Supabase project, same Redis (Upstash), same OpenRouter/HF
credentials — one less set of secrets to manage separately. That file
already has `OPENROUTER_API_KEY`, `MODEL`, and `HF_TOKEN` added
alongside the main backend's own `DATABASE_URL`/`REDIS_URL` — nothing to
copy or configure here to get a local `uvicorn --reload` run talking to
real infrastructure.

The one adaptation needed: the main backend's `DATABASE_URL` is
Prisma's connection string shape
(`postgresql://...?pgbouncer=true`, Supabase's pooler on `:6543`) — not
directly usable by SQLAlchemy. `config.py`'s `database_url` field has a
validator that adds the `+psycopg` driver marker and strips
`pgbouncer=true` (a Prisma-only flag psycopg doesn't understand)
automatically; nothing else in this app touches the raw value.

```bash
cd support-agent/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head              # schema on Supabase (primary) — confirmed live, see below
alembic -x db=local upgrade head  # schema on the local standby too (needs a local Postgres running)
uvicorn app.main:app --reload
```

Local-only settings that have no equivalent in the main backend's `.env`
(`LOCAL_DATABASE_URL`, `QDRANT_URL`, `FALLBACK_MODELS`,
`RATE_LIMIT_PER_MINUTE`) keep their own sensible defaults in
`config.py` — override any of them the normal way (an actual
environment variable takes priority over the `.env` file).

Or the whole stack via Docker — live-verified end to end (all 6
services healthy, real DAG run against the real site, real chat
requests through the real agent): `docker compose up --build` from
`support-agent/`.

Two separate `.env` files, neither committed (both gitignored), doing
two different jobs:

- **`support-agent/.env`** — compose-level substitution vars only
  (`POSTGRES_USER`/`POSTGRES_PASSWORD`, `QDRANT_API_KEY`,
  `REDIS_PASSWORD`, `AIRFLOW_ADMIN_USER`/`PASSWORD`, `SITE_BASE_URL`,
  `HF_TOKEN`). `docker compose` reads this automatically because it
  sits next to `docker-compose.yml` — no flag needed. `POSTGRES_PASSWORD`/
  `QDRANT_API_KEY`/`REDIS_PASSWORD` have **no insecure fallback default**
  (`docker compose up` hard-fails with `set X in .env` if missing) —
  confirmed live during the security review that the old defaults left
  Qdrant/Redis fully unauthenticated and Postgres on a guessable
  password, all three reachable from the local network, not just
  localhost. Generate real random values for local dev
  (`python3 -c "import secrets; print(secrets.token_urlsafe(32))"`), or
  fetch real ones with `AWS_PROFILE=united-services
  scripts/fetch-secrets-support-agent.sh` at the repo root (see below).
- **`support-agent/backend/.env.support-agent`** — the backend
  *container's* own scoped secrets (`DATABASE_URL`, `HF_TOKEN`,
  `OPENROUTER_API_KEY`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`,
  `MODEL`). **Not** the main backend's `../backend/.env` — confirmed
  live via `docker inspect` that pointing the container at that shared
  file (the original design) leaked the *entire* platform's secret set
  into it (live AWS IAM keys, Clerk webhook secret, GeoIP license,
  Betterstack token — none of which this service touches). Generate it
  with `AWS_PROFILE=united-services
  scripts/fetch-secrets-support-agent.sh` (repo root) — reads from a
  support-agent-only SSM prefix (`/united-services/support-agent/<env>/`),
  separate from the platform's own `/united-services/<env>/`, so
  support-agent's own deploy role never needs read access to the
  platform's shared secrets at all. (A bare host-mode `uvicorn --reload`
  run, not through Docker, still reads the shared `../backend/.env`
  directly via `config.py`'s path traversal — that's a local-dev
  convenience for running outside Docker, unrelated to what the
  container gets.)

Once up:
- Backend: `http://localhost:8000`
- Airflow UI: `http://localhost:8090` (admin login from `support-agent/.env`)
- Qdrant: `http://localhost:6333/dashboard` — needs the `api-key`
  request header now (or `docker-compose.override.yml`'s
  `127.0.0.1:6333` mapping plus that header from a local tool); a bare
  browser tab hitting the dashboard URL with no header gets a 401.

Trigger the ingestion DAG once from the Airflow UI (or `airflow dags
trigger doc_ingestion_dag` inside the scheduler container) before
`search_knowledge_base` has anything to retrieve — it starts empty.

## Embeddings: hosted, not local

The plan's original suggestion was a local `sentence-transformers`
model — free, self-hosted, consistent with the rest of the stack. Built
that way first, then switched: `sentence-transformers` pulls in `torch`,
which bloated both the backend and ingestion Docker images by 600MB–2GB
for a single small model. `embed.py` and `search_knowledge_base.py` now
call Hugging Face's hosted Inference API instead (`requests`, no model
download) — same `all-MiniLM-L6-v2` model, same 384-dim vectors, just
computed remotely. Real trade-offs that come with this, worth knowing
going in:

- Needs an `HF_TOKEN` (free, no payment method — the fine-grained token
  needs only the "Make calls to Inference Providers" permission).
- Adds a network dependency and per-call latency to both ingestion and
  every live query — the free-tier "cold start" delay (`wait_for_model`)
  can add several seconds the first time a model isn't already warm on
  HF's end.
- The endpoint itself moved once already: `api-inference.huggingface.co`
  (what most tutorials/docs still reference) no longer resolves at all —
  it's `router.huggingface.co/hf-inference/models/.../pipeline/feature-extraction`
  now. Confirmed live 2026-09-02; re-verify if this ever breaks again.

## Supabase primary + local Postgres failover

Same design as the main United-Services backend's `FailoverService`
(`backend/src/failover/failover.service.ts` in the repo root): an
independent health-check loop pings the primary every 5s; 3 consecutive
failures flips `app/db/session.py`'s `get_db_session()` (used by all
three ticket tools) onto the local standby; 3 consecutive successes
fails back. Same thresholds, same reentrancy guard against an
overlapping slow check double-counting toward the threshold.

- `app/failover/manager.py` — the health-check loop + mode state,
  running on a background thread from FastAPI's lifespan startup hook.
- `app/failover/mirror_sync.py` — copies `conversation_sessions` then
  `tickets` (parent before child, matching the FK) from primary to
  local every 10 minutes, only while on primary — same idempotent-upsert
  + reverse-order delete-reconciliation shape as the main backend's
  `DbMirrorSyncService`, scaled down for a two-table schema.
- `GET /health` reports the current mode (`{"database_mode":
  "primary"|"local"}`) — same pattern as the main backend's health
  endpoint exposing failover state for free.

**Known limitation, stated plainly:** this does *not* include the main
backend's `FailoverWriteLog`/reconciliation-on-recovery system — a write
made while running on the local standby is not automatically replayed
back to Supabase once primary recovers (confirmed directly: a ticket
written to local during a real failover test was overwritten by the
next primary→local mirror sync, since primary never learned it
existed). That's an intentional scope cut for a portfolio-scale ticket
system, not an oversight — the honest fix, if this ever needed to be
real, is the same write-log/replay design the main backend already has,
just not rebuilt here for two small tables.

**Update — now actually running against the real Supabase project, not
just two throwaway Postgres containers standing in for it:** once
`config.py` started reading `DATABASE_URL` from the main backend's own
`.env`, connected for real, confirmed no table-name collision with the
main backend's existing (Prisma-managed, quoted/`PascalCase`) `Ticket`/
`AllowedOrigin` tables — SQLAlchemy's unquoted lowercase
`tickets`/`allowed_origins` are genuinely distinct tables at the Postgres
level, checked directly (`pg_tables`) before touching anything, not
assumed. Ran `alembic upgrade head` against it for real: all four tables
created cleanly. Filed a real ticket through `create_ticket` and read it
back through `get_ticket_status` against the live database, then deleted
that test data immediately after — this repo doesn't own a corner of
production to leave test rows sitting in. Confirmed Redis (Upstash, also
read from the main backend's `.env`) connects too; every key this app
writes is prefixed `support-agent:` (see `redis_memory.py`/
`rate_limit.py`), so there's no risk of colliding with whatever key
patterns the main backend's own Redis usage relies on.

## Streaming + memory (Phase 4)

`POST /chat/stream` replaces the old plain `/chat` — Server-Sent Events,
not WebSocket, per the plan's decision: this traffic is one-directional
(server streaming tokens/tool events to the client), nothing here needs
the client to send a mid-stream cancel.

- `{"type": "tool_start", "tool": "..."}` / `{"type": "tool_end", ...}`
  — lets a client show "searching docs…" as an intermediate state
  instead of silence, per the plan's "Streaming tool-call events, not
  just tokens" decision. Built from `astream_events(version="v2")`,
  confirmed live to actually fire these around real tool calls (not
  just exist in the API surface) — see the trace in "Verified" below.
- `{"type": "token", "content": "..."}` — real text deltas. The first
  LLM call in a tool-calling turn (the one deciding *whether* to call a
  tool) streams empty-content chunks representing the tool-call
  structure itself, not visible text — filtered out in `agent.py` so
  the client only ever sees tokens with real content.
- `{"type": "done", "session_id": "..."}` — final event, carries the
  session_id back exactly like the old `/chat` response body did.

Redis (`app/memory/redis_memory.py`) holds the hot buffer every turn
reads and appends to — 30-minute sliding TTL (refreshed on every
append, so an active conversation never expires mid-use; an abandoned
one is reclaimed instead of accumulating forever) and capped at 20
messages so context can't grow unbounded across a long conversation —
the plan's two explicit "commonly goes wrong" items for this phase.
Postgres (`app/memory/transcript_store.py`) holds the durable copy —
what a human would actually read if a conversation gets escalated. Same
failover-aware `get_db_session()` every other Postgres write in this
app uses.

**Update, after this phase was first built:** the durable copy
originally lived in its own `transcript_messages` table, one row per
message — a design that grows without bound (every prompt and every
response its own row, forever). Replaced with one JSON array column
(`ConversationSession.transcript`) on the *session's own row* instead —
every message across every conversation that `session_id` has ever had
lives in one growing JSON blob, one row per browser (the `session_id`
lives in `localStorage` and is reused indefinitely across visits — see
`frontend/lib/useChatStream.ts` in the main site — so in a system with
no login this is the closest thing to a stable "user" identity
available; "one record per user" and "one record per session" are the
same thing here). Appended via a single atomic
`UPDATE ... SET transcript = transcript || :entry::jsonb`, not a
Python-side read-then-write — two concurrent turns for the same session
(two open tabs, say) each get their own atomic append instead of racing
to overwrite the same in-memory list. The explicit trade being made: a
long-running visitor's transcript is one blob that moves together on
every read/write, not independently queryable message-by-message — the
right trade for what this table is actually for (a human occasionally
reading one visitor's full history when a ticket escalates), the wrong
one if this ever needed cross-conversation search/analytics over
individual messages. Verified live against the real Supabase database:
confirmed exactly one row accumulates three appended messages in
correct chronological order, not three rows, then confirmed the same
through the actual `/chat/stream` endpoint end to end.

## Guardrails (Phase 5)

Per the plan's security section, defended on two layers — a system
prompt instruction the model can be talked out of on its own is not a
real boundary:

**Code-level, doesn't rely on the model behaving:**
- `app/security/rate_limit.py` — per-IP throttle on `/chat/stream`
  (`RATE_LIMIT_PER_MINUTE`, default 10/min), Redis-backed. Rate-limits
  the *endpoint*, not just relying on OpenRouter's own limiting — this
  account is on a shared free-tier daily cap (hit twice during this
  project's own development; see Phase 4's notes and this phase's
  verification below), and a single client hammering the endpoint can
  exhaust that for every other user before OpenRouter's side ever
  notices.
- `app/agent/guardrails.py` — caps tool-call iterations per turn at 5
  (`RECURSION_LIMIT = 2 * 5 + 1`, passed to LangGraph's
  `recursion_limit` config) and catches `GraphRecursionError` in
  `agent.py`'s `stream_agent` to **escalate** (call
  `escalate_to_human`, filing a real ticket) rather than just reply with
  an apology — a stuck conversation actually reaches a human instead of
  silently dead-ending. This is what "the agent hits its tool-call cap
  without resolving the request," one of the plan's two explicit
  escalation triggers, actually does in code (the other trigger, "user
  explicitly asks for a human," is the system prompt's job).
- `app/security/auth.py` — the ticket-ownership check, factored out of
  Phase 3's `get_ticket_status` tool now that Phase 5 makes the security
  posture explicit. Same check, same behavior, just its own module.

**System-prompt level** (`agent.py`'s `SYSTEM_PROMPT`): explicit
instructions that the model's tools/instructions are fixed and cannot be
changed by anything in the conversation — including messages claiming
to be a system update, a developer, or an instruction to
ignore/forget/replace prior instructions — and that the system prompt
itself must never be revealed verbatim, even if asked directly "for
debugging." This is the softer, talk-around-able layer; the code-level
limits above are what actually holds regardless of whether the model is
convinced.

## Widget + full stack (Phase 6)

**Update, after this phase was first built:** the widget was moved out
of this repo's own `support-agent/frontend/` (a standalone Vite app,
iframe-embedded — the design described just below) and into the main
site's own Next.js app instead — `frontend/components/ChatWidget.tsx` +
`frontend/lib/useChatStream.ts` in the repo root, mounted once in
`frontend/app/[locale]/layout.tsx`. Same component logic (SSE parsing,
message state, tool-activity indicator), restyled to the main site's
own `theme.tsx` palette instead of hardcoded colors, rendered as a
floating launcher + panel rather than a full-page iframe target. The
standalone `support-agent/frontend/` directory, its Dockerfile, and the
`frontend` service in `docker-compose.yml` no longer exist — CORS's
default allowed origins (below) now point at the main app's own local
dev addresses (`:3000` for plain `next dev`, `:8080` for this repo's
local nginx proxy) instead of the widget's old standalone ports. The
"why iframe first" reasoning right below is kept as-written for the
historical record of the decision that was actually reversed, not as a
description of the current architecture.

**Iframe first** (superseded — see above), per the plan's decision:
`frontend/` builds to a
small static site (`docker compose up` serves it via nginx on
`:8081`) meant to be embedded as `<iframe src="http://.../">` on the
real site — isolates the widget's CSS/JS from the host page's own, and
keeps CORS to one explicit origin instead of "whatever page happens to
load the script." A direct-mount script-tag widget is a real upgrade
later, once this is proven, not a Phase 6 requirement.

`useChatStream.ts` — `EventSource` can't send a POST body, so this is
`fetch()` plus a hand-rolled `ReadableStream` reader parsing SSE's
`"data: ...\n\n"` framing directly (simple enough not to need a
dedicated client library). Session id persisted in `localStorage` so
reloading the iframe doesn't lose ticket/escalation continuity within
the same browser.

**CORS: DB-backed, not a static list — this changed mid-phase.** The
first pass used a plain `CORS_ALLOWED_ORIGINS` env var (still what most
FastAPI CORS tutorials show). Replaced with the same pattern the main
United-Services backend already uses for its own `AllowedOrigin` model:
an `allowed_origins` Postgres table, no admin UI, no API to add a
row — an origin gets added the same deliberate way any other direct
database write does:

```sql
INSERT INTO allowed_origins (id, origin, created_at)
VALUES (gen_random_uuid()::text, 'https://your-real-domain.com', now());
```

`app/security/cors.py` caches the table in memory, refreshed every 30s
by a background thread (not queried per-request — this is checked on
every single request including every SSE stream, and a synchronous DB
round-trip on that hot path isn't worth it for a list that changes
rarely). Starlette's stock `CORSMiddleware` only accepts a fixed list at
app-construction time with no supported hook for "recheck this
per-request against something that can change without a restart," so
this is a small custom `BaseHTTPMiddleware` instead — same behavior
(handles the OPTIONS preflight directly, sets
`Access-Control-Allow-Origin` on real responses), checked against the
cache. `alembic/versions/..._add_allowed_origins.py`'s migration both
creates the table and seeds it with the widget's own docker-compose
origin (`:8081`) and its Vite dev-server origin (`:5173`) — that's the
actual "added in the db" step for local dev; nothing extra to configure
out of the box.

**Startup ordering**: `qdrant` didn't have a healthcheck before this
phase (`docker-compose.yml`'s original `depends_on: qdrant: condition:
service_started` just meant "the container process exists," not "it's
actually accepting connections yet" — exactly the plan's own "commonly
goes wrong" line: "the backend starting before either is ready is one
of the most common first-run failures in a compose stack this size").
Added a `/dev/tcp` healthcheck (the qdrant image has bash but no
curl/wget) and upgraded `backend`'s dependency to
`condition: service_healthy`.

`docker-compose.override.yml` (applied automatically alongside
`docker-compose.yml`, no flag needed): source-mounts + `--reload` for
local dev. Kept deliberately thin — the plan's own "commonly goes
wrong" line for this file is env vars drifting between it and the base
compose file, so it never redefines a connection URL or secret that
already lives in `docker-compose.yml`/`backend/.env`.

## Fallback models (added after Phase 5)

Requested after this project's own development repeatedly hit
OpenRouter's account-wide free-tier daily cap (see Phase 4/5's notes).
`app/agent/agent.py` now builds one fully-compiled `create_react_agent`
per candidate model — `settings.model` first, then
`settings.fallback_model_list` in order (`FALLBACK_MODELS` env var,
comma-separated) — and tries them in sequence in both `run_agent` and
`stream_agent`. **Stated plainly, the same way this project treats
every other limitation:** this helps for a per-model/per-provider outage
(the 404s and shared-pool 429s Phase 1's own testing hit against
several other free models) but does *nothing* for the account-wide
daily cap specifically, since that cap is shared across every free
model on the account — falling back to a different free model doesn't
get around a limit that already covers all of them. It's the right fix
for the more common flakiness the plan's "Reality check" describes, not
a workaround for the specific failure this project hit most often
during its own testing.

Why not LangChain's generic `Runnable.with_fallbacks()`: confirmed by
reading `chat_agent_executor.py`'s own `_should_bind_tools` check, not
assumed — `create_react_agent` requires its `model` argument to be a
`BaseChatModel` or an already-`.bind_tools()`-bound `RunnableBinding`,
and `.with_fallbacks()` always returns a `RunnableWithFallbacks`,
neither of those two accepted types. Building one compiled agent per
candidate and trying them in sequence sidesteps that typing conflict
entirely — and compiling a LangGraph graph is cheap (no network call),
so there's no real cost to building several up front.

## Security remediation (2026-09-03)

A combined review (static code audit, live penetration test against the
real running local stack, and an infra/Docker audit) found and this
project fixed, in order of severity:

- **Qdrant had zero authentication** — confirmed live: listed
  collections, pulled real document payloads, created and deleted a
  throwaway collection with no credential at all. Now requires
  `QDRANT__SERVICE__API_KEY` (`app/agent/tools/search_knowledge_base.py`
  and `ingestion/upsert_qdrant.py` both pass it).
- **The backend container inherited the platform's entire secret set**,
  not just its own — confirmed live via `docker inspect` (live AWS IAM
  keys, Clerk webhook secret, GeoIP license, Betterstack token, none of
  which this service touches). Now reads a scoped
  `backend/.env.support-agent`, populated from its own SSM prefix
  (`/united-services/support-agent/<env>/`, separate from the
  platform's `/united-services/<env>/`) — see the Setup section above
  and `scripts/fetch-secrets-support-agent.sh`/`scripts/push-secrets.sh`
  at the repo root.
- **Redis and Postgres had no/weak authentication**, all three
  (including Qdrant) reachable from the local network on `0.0.0.0`, not
  just localhost. Redis now requires `--requirepass`; Postgres's
  insecure fallback default is gone (`POSTGRES_PASSWORD` now required,
  no default); all three host port mappings moved out of the base
  `docker-compose.yml` into `docker-compose.override.yml`, bound to
  `127.0.0.1` only.
- **The backend container ran as root** — confirmed live via `docker
  exec ... whoami`. `Dockerfile` now creates and switches to a
  non-root `appuser`, and is pinned to `python:3.12.7-slim` instead of
  the floating `python:3.12-slim` tag.
- **CSRF gap on `/chat/stream` via a `__session` cookie fallback** — a
  state-changing endpoint reachable purely from a signed-in browser's
  ambient cookie, with no CSRF token and no preflight-blocking header
  (CORS blocks a cross-site page from *reading* the response, not the
  request from *firing*). `app/security/clerk_auth.py` is Bearer-only
  now; the widget already only ever sent a Bearer header, so no
  frontend change was needed.
- **The Clerk JWT's `iss` claim was never checked** — RS256 pinning
  itself was already solid (verified live: alg-confusion and forged-
  signature attempts all correctly rejected), but nothing pinned
  verification to this one specific Clerk instance. Now derived from
  `CLERK_PUBLISHABLE_KEY` (the same publishable-key-decoding trick
  Clerk's own SDKs use), not a hardcoded domain string, so it stays
  correct across dev/staging/prod instances without manual upkeep.
- **Prompt-injection defense was entirely prompt-based, no code-level
  enforcement** — anything in a scraped page became trusted-looking
  tool output with nothing structurally stopping an embedded
  instruction. `search_knowledge_base` now wraps retrieved chunks in
  `<untrusted_document>` tags, and `SYSTEM_PROMPT` explicitly instructs
  the model to treat their contents as reference material only. Defense
  in depth, not a substitute for the Qdrant auth fix above — verified
  live that this doesn't change normal answer quality (a real query
  against the real scraped knowledge base, real grounded answer back).

All of the above verified against the real running stack, not just
code review — curl/redis-cli/psql against the hardened services
directly, `docker exec ... whoami`, and a real end-to-end chat request
through the real agent after every change. 22 tests in `tests/`,
including new ones for the issuer check and the removed cookie
fallback, all passing in CI (`Support-agent — tests`, now a required
branch-protection check alongside `Secret scan (gitleaks)` — the latter
was itself not required at the time this review's own CI placeholder
tripped it, which is exactly why it's required now).

**Deliberately not done by this remediation, left as an explicit
decision for a human:** rotating the AWS IAM key pair and the Clerk
secret key that were reachable outside their intended scope while the
container had the platform's full secret set — both should be treated
as compromised regardless of whether exploitation is provable, and both
require console access no automated process here has.

## Verified — Phase 6 is done

1. **Widget build** — `npm run build` (`tsc --noEmit && vite build`)
   clean, and the same build run for real inside the multi-stage
   Docker image (`docker build ./frontend`), confirmed to actually
   produce a working static site: ran the built container, `curl`'d it,
   got a real `200` and the right `<title>`.
2. **CORS, live against real Postgres** — booted the backend with a
   real `allowed_origins` table (seeded by the migration): an OPTIONS
   preflight from `http://localhost:5173` (a seeded origin) got `200`
   with the correct `Access-Control-Allow-Origin` header, including on
   the *actual* `/chat/stream` POST response, not just the preflight; a
   preflight from an arbitrary unseeded origin got `400` with no CORS
   header at all (a browser would then block the real request). Then
   the specific point of this design: `INSERT`ed a brand-new origin
   directly into the running Postgres instance while the server kept
   running, confirmed it was still rejected immediately after (cache not
   yet refreshed), waited past the 30s refresh interval, confirmed it
   was then accepted — no restart, no redeploy.
3. **Fallback models, without spending any OpenRouter quota** — same
   fake-`BaseChatModel` technique as Phase 5's loop-guard test (fake
   models that raise on `_generate` or return a scripted streaming
   response, deterministic and repeatable): confirmed a failing primary
   correctly falls through to a working second candidate and streams its
   real output; confirmed that when *every* candidate fails before
   producing output, the turn escalates the same way the loop guard
   does — a real high-priority ticket, confirmed in Postgres, not just a
   message shown to the user with nothing behind it.
4. `docker compose config` validated clean with the full merged
   stack — `docker-compose.yml` + `docker-compose.override.yml`
   together, including the new `frontend` service and `qdrant`'s
   healthcheck.

**Not verified — stated plainly:** the fallback logic's mid-stream
failure path (a model that fails *after* already streaming some real
tokens to the client — the code explicitly does not retry in that case,
surfacing an interruption message instead, see `agent.py`'s comment on
why) was reviewed but not exercised with a fake model scripted to fail
partway through a stream; the logic is a straightforward `if
yielded_anything` branch, lower-risk than the paths that were tested,
but it's still an honest gap to name rather than imply full coverage.
Also not run: the complete stack together via a single `docker compose
up` (Airflow's webserver/scheduler plus the JDK+PySpark image, the
backend, and the widget, all at once) — each piece has been built and
tested individually (including the widget against a live backend with
real CORS, real streaming, real Postgres) and `docker compose config`
confirms the wiring resolves correctly, but the full aggregate boot
sequence together, one time, hasn't been watched end to end the way
every individual service has been.

## Verified — Phase 5 is done

1. **Rate limiter** — tested directly against real Redis: 10 requests
   from one IP all succeeded, the 11th through 13th were rejected with
   `429` and the expected message. A second, different IP was
   confirmed *not* blocked by the first IP's exhausted limit — separate
   Redis keys per IP, verified by inspecting the actual keys.
2. **Tool-call loop guard — verified without spending any OpenRouter
   quota**, using a fake `BaseChatModel` that always returns a tool call
   (deterministic and repeatable, unlike hoping a real model loops):
   - Confirmed `RECURSION_LIMIT = 11` (for `MAX_TOOL_CALL_ITERATIONS =
     5`) lets exactly 5 full tool-call round trips complete and blocks
     the 6th with `GraphRecursionError` — the model was called exactly 6
     times before the graph raised, precisely matching the intended "5
     iterations, then stop" semantics.
   - Then verified `stream_agent`'s actual exception-handling path (not
     just the raw graph behavior): swapped the fake model into the real
     module-level `_agent` and ran it through the real `stream_agent`
     function — got exactly 5 `tool_start`/`tool_end` pairs, then the
     loop-guard message, with no crash.
   - Confirmed in Postgres that this actually escalated for real: a
     high-priority ticket titled "Escalated: Agent hit its tool-call
     iteration limit without resolving the request." and the session's
     `needs_human_review` flag, both set — not just a message shown to
     the user with nothing behind it.
3. **Ownership check refactor** (`get_ticket_status` now calling
   `security/auth.py`'s `owns_ticket`) — re-ran the exact cross-session
   test from Phase 3's verification against real Postgres; identical
   behavior confirmed after the refactor.

**Not verified — stated plainly:** the prompt-injection system-prompt
defense needs a real model call to mean anything (a fake model can't
tell you whether a real one resists "ignore previous instructions").
OpenRouter's account-wide free-tier daily cap (50 requests) was already
exhausted from earlier phases' testing before this phase started, and
attempting even one more call during Phase 5 confirmed it's still
exhausted (resets 2026-09-03 00:00 UTC — confirmed via the API's own
`X-RateLimit-Reset` header, converted). The system prompt language
itself is written and reasoned through the same way the rest of this
project treats things it can explain but hasn't yet run — this is the
one piece of Phase 5 that genuinely needs a live model call to actually
confirm, and it's flagged here rather than quietly assumed to work
because the code looks right.

## Verified — Phase 4 is done

Live end to end against real OpenRouter, real Redis, and real Postgres:

1. `POST /chat/stream` — real `tool_start`/`tool_end`/`token`/`done`
   events over the wire (`curl -N`), token deltas arriving as actual
   incremental text (`"It"`, `" is"`, `" currently"`, ...), not the
   whole answer in one chunk.
2. **Conversation memory actually works across turns** — the specific
   gap flagged during Phase 3 testing (each `/chat` call had no history
   of prior turns). Sent "what time is it right now?", then in a
   *second, separate* request with the same `session_id` sent "what did
   I just ask you?" — the agent correctly answered `"what time is it
   right now?"`, proving the Redis-backed history round-trips into the
   next turn's context rather than each call starting fresh.
3. Redis state inspected directly: correct `[{"role": "user", ...},
   {"role": "assistant", ...}]` shape, TTL present and counting down
   (~1800s as set).
4. Postgres inspected directly: both turns durably persisted,
   independent of Redis's TTL. (At the time this table was
   `transcript_messages`, one row per message — since consolidated into
   a single `transcript` JSON column per session; see the "Update, after
   this phase was first built" note above.)
5. A duplicate `tool_start` SSE event was caught live during an
   `escalate_to_human` call — traced it down to LangGraph's
   `astream_events` emitting more than one `on_tool_start` for what the
   database proved was a single actual execution (exactly one ticket
   created, not two). Fixed by deduping on the event's `run_id` in
   `agent.py` rather than tool name, so two *genuinely* separate calls
   to the same tool in one turn still each get their own event pair.
   **Caveat, stated plainly:** OpenRouter's account-wide free-tier daily
   cap (50 requests/day) was hit immediately after implementing this
   fix, before it could be re-verified live — the fix is a defensible,
   narrowly-scoped correction for exactly what was observed, but
   re-confirm the dedup itself fires correctly once quota resets, rather
   than trusting this note alone.

## Verified — Phase 3 is done

Tested against two real (throwaway, not mocked) Postgres containers
standing in for Supabase/local — the mechanism itself doesn't care
whether "primary" is actually Supabase, only that it's a reachable
Postgres, so this validates the real code path:

1. `create_ticket`/`get_ticket_status`/`escalate_to_human` — all three
   invoked directly against a real Postgres. Cross-session ownership
   confirmed: a ticket filed under one `session_id` returns "No ticket
   found" (not a distinct "exists but isn't yours" — that would itself
   leak which ticket numbers are real) when looked up from a different
   session, identical to the response for a genuinely nonexistent
   ticket id.
2. Malformed tool arguments (`priority: "urgent"`, outside the
   `Literal["low","medium","high"]` schema) — confirmed this raises a
   clean Pydantic `ValidationError`, and confirmed LangGraph's
   `ToolNode` (`handle_tool_errors=True`, the actual installed default)
   catches exactly this and hands it back to the model as a retryable
   message instead of crashing the request.
3. The full agent loop, live against OpenRouter — asked it to file a
   ticket; it correctly restated the subject/description/priority and
   asked for confirmation before calling `create_ticket`, matching the
   system prompt's "confirm before mutating" instruction (Phase 4's
   missing conversation memory means the *next* turn doesn't remember
   this exchange yet — expected at this phase, not a bug; see Phase 4).
4. Failover, end to end: booted against two real Postgres containers,
   filed a ticket (landed in primary), stopped the primary container,
   watched `/health`'s `database_mode` stay `"primary"` through 2 failed
   checks (10s) and flip to `"local"` on the 3rd (15s) — then filed
   another ticket and confirmed it landed in the *local* database, not
   primary. Restarted primary, watched 3 successful checks flip mode
   back. Ran `mirror_sync.sync_once()` directly: confirmed it skips
   entirely while on local mode, and confirmed a real ticket on primary
   gets correctly upserted into local (parent `conversation_sessions`
   row before the child `tickets` row).
5. Alembic migrations applied cleanly against both databases
   independently (`alembic upgrade head` / `alembic -x db=local upgrade
   head`), autogenerate produced the correct FK/column types on the
   first pass.

## Verified — Phase 2 is done

Every stage tested against real components, not mocked — a standalone
Qdrant container (`docker run qdrant/qdrant`), the real PySpark job in
local mode, the real Hugging Face Inference API (with a real token, not
a stub), and the real OpenRouter agent from Phase 1, all wired together
end to end:

1. `scrape.py`'s HTML extraction — tested against a synthetic page with
   a `<script>` tag: script content correctly stripped, real prose
   preserved.
2. `clean_chunk_job.py`'s chunking/cleaning/ID logic — unit-tested
   directly: 220-word chunks with verified 40-word overlap between
   adjacent chunks, empty-text edge case handled, chunk IDs
   deterministic (same input twice → same ID) and distinct across
   different chunks.
3. The actual Spark job — ran for real via `spark-submit` (`local[*]`
   master) against synthetic scraped pages, produced correctly-shaped
   chunk records. (Needed Python 3.12 — PySpark 3.5.4 doesn't get along
   with 3.14's pickling; the Airflow image already pins 3.12, so this
   only mattered for local testing.)
4. `embed.py` — ran for real against HF's live API, produced 384-dim
   vectors matching `EMBEDDING_DIM` and matching a raw `curl` test of
   the same endpoint byte-for-byte.
5. `upsert_qdrant.py` — ran twice against a real Qdrant instance;
   `points_count` stayed at 5 both times, confirming idempotent upsert
   (not duplicate-on-rerun).
6. `search_knowledge_base` — queried "when was the company founded"
   against the real Qdrant data (no keyword overlap with the ingested
   "founded in 2005" text) and correctly retrieved it via semantic
   similarity, using the same HF-hosted embedding path as ingestion.
7. The full agent loop, live against OpenRouter — asked "when was the
   company founded?", got the right grounded answer. In an earlier pass
   (before the embedding-source switch, same logic otherwise) also asked
   "what services does the company offer?" — deliberately outside the
   tiny test corpus — and traced the actual messages: the model called
   `search_knowledge_base`, got "no documentation found above the
   relevance threshold," and correctly told the user it didn't know
   rather than answering from training data — confirming the "Grounding,
   not guessing" behavior actually holds, not just that the threshold
   constant exists in the code.

Not yet tested: the Airflow DAG itself end-to-end inside Docker (the
webserver/scheduler/JDK+PySpark image is too heavy to spin up and tear
down repeatedly during development) and a real scrape against this
site's actual pages (needs the frontend/backend dev servers running,
which this session doesn't control — see `scrape.py`'s graceful 502
handling, confirmed working when they weren't running). Both are
mechanical rather than risky: every stage they'd exercise is already
proven correct individually above.

## Verified — Phase 1 is done

Live-tested against a real OpenRouter key on 2026-09-02, straight
through `/chat`, not just a dummy-key wiring check:

| Model | Result |
|---|---|
| `meta-llama/llama-3.3-70b-instruct:free` | Pulled from the free tier entirely (404, "paid version available") |
| `nvidia/nemotron-3-super-120b-a12b:free` | 404 from OpenRouter's own provider |
| `z-ai/glm-5.2:free` | Sustained 429 rate limits on the shared free pool |
| `google/gemma-4-31b-it:free` | Sustained 429 rate limits on the shared free pool |
| `minimax/minimax-m3:free` | Called the tool correctly most of the time, but denied having a time tool on one run and hallucinated a stale date on another — 2 failures in 5 tries, not reliable enough |
| **`nvidia/nemotron-3.5-lightning:free`** | **9/9 correct, genuine tool calls (verified via the actual LangGraph message trace, not just plausible-looking text), 4–10s latency** |

`config.py` defaults to the last one. If OpenRouter's free-tier lineup
shifts again, re-run the reliability check below before trusting a new
default — one or two successful replies isn't enough, per the
`minimax-m3` result above.

## Re-running the reliability check

```bash
for i in 1 2 3 4 5; do
  curl -s --max-time 25 -X POST http://localhost:8000/chat \
    -H "Content-Type: application/json" \
    -d '{"message": "what time is it right now?"}'
  echo
done
```

Watch for: a real current timestamp every time (not a stale/hallucinated
one, not a denial that the tool exists). To confirm a response came from
an actual tool call rather than a lucky guess, trace it directly:

```bash
source .venv/bin/activate
python3 -c "
from app.agent.agent import _agent
result = _agent.invoke({'messages': [('user', 'what time is it right now?')]})
for m in result['messages']:
    print(type(m).__name__, getattr(m, 'tool_calls', None) or '', str(m.content)[:100])
"
```

A real run shows `AIMessage` (with a `tool_calls` entry) → `ToolMessage`
(the actual return value) → `AIMessage` (the final answer). If there's
no `ToolMessage` in between, the model answered without calling
anything — that's the failure mode to watch for.

## Known version pin note

`langgraph==0.2.62`'s `create_react_agent` takes the system prompt as
`state_modifier=`, not `prompt=` (that's a newer/older-version name,
depending which tutorial you're reading — see `agent.py`'s comment).
If you bump `langgraph` later, check that signature again before
assuming old code still matches.
