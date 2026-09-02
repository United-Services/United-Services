from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.failover.manager import get_failover_manager, init_failover_manager
from app.failover.mirror_sync import start_mirror_sync_loop
from app.routers.chat import router as chat_router
from app.security.cors import DynamicCORSMiddleware, start_cors_refresh_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    manager = init_failover_manager(settings.database_url, settings.local_database_url)
    manager.start()
    start_mirror_sync_loop(manager)
    start_cors_refresh_loop()
    yield
    manager.stop()


app = FastAPI(title="United Services Support Agent", lifespan=lifespan)

# DB-backed allowlist (app/security/cors.py), not a static origins list
# — see that module's docstring. Added before the router is mounted so
# it wraps every route including /chat/stream.
app.add_middleware(DynamicCORSMiddleware)

app.include_router(chat_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "database_mode": get_failover_manager().mode}
