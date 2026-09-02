"""Carries the current request's session_id from main.py's /chat handler
down into tool functions (create_ticket, get_ticket_status,
escalate_to_human) without it ever being something the model can supply
or override as a tool argument.

This matters specifically because of the plan's "commonly goes wrong"
warning for Phase 3: "sequential or guessable IDs without an
authorization check let one user read another user's ticket." If
session_id were just another tool parameter, a malicious or confused
model call (or a prompt-injection attempt — see Phase 5) could pass
someone else's session id directly. Reading it from a contextvar set by
trusted server code, instead, means the ownership boundary can't be
argued around from inside a tool call no matter what the model sends.
"""

from contextvars import ContextVar

_current_session_id: ContextVar[str | None] = ContextVar("current_session_id", default=None)


def set_current_session_id(session_id: str) -> None:
    _current_session_id.set(session_id)


def get_current_session_id() -> str:
    session_id = _current_session_id.get()
    if session_id is None:
        # Every real request path (main.py's /chat) sets this before
        # invoking the agent — reaching here means a tool ran outside
        # that path (e.g. a bare script/test), which is a programming
        # error worth failing loudly on rather than silently scoping to
        # nothing.
        raise RuntimeError("No session_id set in context — tools must run within a request that set one")
    return session_id
