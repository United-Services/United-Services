from typing import Literal

from langchain_core.tools import tool

from app.db.models import ConversationSession, Ticket
from app.db.session import get_db_session
from app.session_context import get_current_session_id


@tool
def create_ticket(subject: str, description: str, priority: Literal["low", "medium", "high"]) -> str:
    """File a support ticket. Before calling this, restate the subject,
    description, and priority you're about to file back to the user and
    get their explicit confirmation — this tool has a real side effect
    (a ticket a human will act on), unlike search_knowledge_base's
    read-only lookups, so don't call it on a guess at what the user
    wants filed."""
    session_id = get_current_session_id()
    with get_db_session() as db:
        # Auto-create the session row on first ticket for this session_id
        # rather than requiring a separate "start session" step — the
        # FK from Ticket.session_id needs a real ConversationSession row
        # to point at, and there's no earlier point in this simple flow
        # where one would naturally get created otherwise.
        if db.get(ConversationSession, session_id) is None:
            db.add(ConversationSession(id=session_id))
            db.flush()

        ticket = Ticket(
            session_id=session_id,
            subject=subject,
            description=description,
            priority=priority,
        )
        db.add(ticket)
        db.flush()
        ticket_id = ticket.id

    return f"Ticket #{ticket_id} filed (priority: {priority}). The user can reference this number for follow-up."
