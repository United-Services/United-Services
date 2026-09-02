from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Credentials live in the main United-Services backend's own .env, not a
# separate copy here (there is no backend/.env in this project anymore —
# deleted deliberately, per the instruction that led to this file's
# current shape). This resolves to
# <repo-root>/backend/.env regardless of which directory the process is
# actually launched from.
MAIN_BACKEND_ENV_FILE = Path(__file__).resolve().parents[3] / "backend" / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(MAIN_BACKEND_ENV_FILE), extra="ignore")

    openrouter_api_key: str
    # Free-tier model availability/names on OpenRouter shift over time —
    # verify this is still live at https://openrouter.ai/models?max_price=0
    # before relying on it. Swapping models is just changing this value;
    # nothing else in the agent code is model-specific.
    #
    # Chosen after live-testing several free models against the
    # get_current_time tool (2026-09-02): meta-llama/llama-3.3-70b-
    # instruct:free had been pulled from the free tier entirely;
    # nvidia/nemotron-3-super-120b-a12b:free 404'd on OpenRouter's own
    # provider; z-ai/glm-5.2:free and google/gemma-4-31b-it:free both hit
    # sustained 429 rate limits on their shared free pool;
    # minimax/minimax-m3:free genuinely called the tool most of the time
    # but flat-out denied having a time tool on one run and hallucinated a
    # stale date on another (2 failures in 5 tries) — not reliable enough
    # to build RAG/tickets on top of. nemotron-3.5-lightning:free went
    # 9-for-9 on real, verified tool calls (confirmed via the actual
    # LangGraph message trace, not just plausible-looking output) with
    # 4-10s latency. Re-verify this if OpenRouter's free-tier lineup
    # shifts again.
    model: str = "nvidia/nemotron-3.5-lightning:free"
    # Tried in order after `model` fails — for a per-model/per-provider
    # outage (the 404s and shared-pool 429s Phase 1's own testing hit
    # against several other free models), not for OpenRouter's
    # account-wide free-tier *daily* cap: that cap is shared across every
    # free model on the account, so falling back to a different free
    # model does nothing once it's hit (confirmed live — see README's
    # Phase 5 notes on the "free-models-per-day" 429). Comma-separated;
    # pick from https://openrouter.ai/models?max_price=0 and re-verify
    # reliability the same way agent.py's own comment documents for the
    # primary model — don't add one untested.
    fallback_models: str = "minimax/minimax-m3:free"

    @property
    def fallback_model_list(self) -> list[str]:
        return [m.strip() for m in self.fallback_models.split(",") if m.strip()]

    # OpenRouter's own docs recommend these for attribution/analytics on
    # their dashboard — not required for requests to succeed, but a
    # missing-headers issue is easy to mistake for an auth failure, so
    # they're set unconditionally rather than left optional.
    app_url: str = "http://localhost:8000"
    app_name: str = "United Services Support Agent"

    qdrant_url: str = "http://localhost:6333"
    # Free token from https://huggingface.co/settings/tokens — used by
    # search_knowledge_base to embed the query via HF's hosted Inference
    # API (see ingestion/embed.py's module docstring for why this
    # replaced a local sentence-transformers/torch install).
    hf_token: str = ""

    # Read from the main backend's own DATABASE_URL — same Supabase
    # project, same credentials, one less secret to manage separately.
    # That value is Prisma's connection string shape
    # (postgresql://...?pgbouncer=true, via Supabase's pooler on :6543)
    # — not directly usable by SQLAlchemy: no +psycopg driver marker, and
    # `pgbouncer` isn't a libpq connection parameter psycopg understands
    # (it's a Prisma-specific flag), so passing it through verbatim would
    # fail at connect time. The validator below adapts it; nothing else
    # in this app should read the raw un-adapted value.
    database_url: str

    @field_validator("database_url")
    @classmethod
    def _adapt_database_url_for_sqlalchemy(cls, v: str) -> str:
        parts = urlsplit(v)
        scheme = "postgresql+psycopg"
        # Drop pgbouncer=true (and any other Prisma-only query params) —
        # SQLAlchemy/psycopg have no use for them and psycopg errors on
        # an unrecognized connection parameter.
        return urlunsplit((scheme, parts.netloc, parts.path, "", parts.fragment))

    # The docker-compose `postgres` service (or 127.0.0.1:5433 for local
    # `uvicorn --reload` runs against `docker compose up postgres`) — the
    # always-on local standby FailoverManager fails over to. Genuinely
    # local-only, so not something the main backend's .env would ever
    # have a value for — kept as its own default here.
    local_database_url: str = "postgresql+psycopg://support_agent:support_agent@localhost:5433/support_agent"

    # Phase 4 — the live conversation buffer (app/memory/redis_memory.py).
    # Read from the main backend's own REDIS_URL (Upstash) — same
    # reasoning as database_url above. redis-py accepts rediss:// as-is,
    # no adaptation needed the way the DB URL requires.
    redis_url: str = "redis://localhost:6379"

    # Verifies the same Clerk session token the main site's own
    # ClerkAuthGuard verifies (backend/src/auth/clerk-auth.guard.ts) —
    # /chat/stream requires a signed-in visitor now (the widget itself
    # gates on this client-side; this is the actual enforcement). Reused
    # from the main backend's .env, same Clerk application.
    clerk_secret_key: str

    # Phase 5 — per-IP throttle on /chat/stream (app/security/rate_limit.py).
    # Deliberately conservative: OpenRouter's free tier is a shared
    # account-wide daily cap (confirmed live during this project's own
    # development — see README's Phase 4 notes), so this protects that
    # budget, not just this one client's fair share of it.
    rate_limit_per_minute: int = 10


settings = Settings()
