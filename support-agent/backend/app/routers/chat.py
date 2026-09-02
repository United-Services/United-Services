"""Phase 4's SSE endpoint, replacing the plain /chat from Phases 1-3
(still present in main.py for now — see its own docstring note).

SSE over WebSocket, per the plan's decision: this traffic is one-
directional (server streaming tokens/tool events to the client), and
nothing here needs the client to send a mid-stream cancel/interrupt that
would justify a full duplex WebSocket.
"""

import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agent.agent import stream_agent
from app.memory import redis_memory, transcript_store
from app.security.clerk_auth import get_current_user_id
from app.security.rate_limit import enforce_rate_limit
from app.session_context import set_current_session_id

router = APIRouter()


class ChatStreamRequest(BaseModel):
    message: str


def _sse(event_type: str, **fields) -> str:
    return f"data: {json.dumps({'type': event_type, **fields})}\n\n"


async def _event_stream(message: str, user_id: str):
    # user_id (the Clerk sub claim, verified in clerk_auth.py) is used
    # everywhere a session_id used to be — Redis's hot buffer, Postgres's
    # transcript, tickets — so the same person's history follows them
    # across browsers/devices instead of resetting per browser, and
    # can't be forged the way a client-supplied session_id could.
    set_current_session_id(user_id)
    history = redis_memory.get_history(user_id)

    redis_memory.append_turn(user_id, "user", message)
    transcript_store.append_message(user_id, "user", message)

    full_response = []
    async for event in stream_agent(message, history):
        if event["type"] == "token":
            full_response.append(event["content"])
        # Forwarded as-is — tool_start/tool_end let the client show
        # "searching docs…"/"filing a ticket…" as an intermediate state
        # instead of silence between two bursts of text, per the plan's
        # "Streaming tool-call events, not just tokens" decision.
        yield _sse(event["type"], **{k: v for k, v in event.items() if k != "type"})

    final_text = "".join(full_response)
    redis_memory.append_turn(user_id, "assistant", final_text)
    transcript_store.append_message(user_id, "assistant", final_text)

    yield _sse("done", session_id=user_id)


@router.post("/chat/stream", dependencies=[Depends(enforce_rate_limit)])
async def chat_stream(
    req: ChatStreamRequest, user_id: str = Depends(get_current_user_id)
) -> StreamingResponse:
    return StreamingResponse(
        _event_stream(req.message, user_id),
        media_type="text/event-stream",
        headers={
            # Without this, some reverse proxies (nginx's default
            # config included) buffer the whole response before
            # forwarding it, defeating the entire point of streaming.
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
        },
    )
