from langchain_core.tools import tool

from app.db.models import Ticket
from app.db.session import get_db_session
from app.security.auth import owns_ticket
from app.session_context import get_current_session_id


@tool
def get_ticket_status(ticket_id: int) -> str:
    """Look up the status of a support ticket by its number. Only works
    for tickets filed in this same conversation session."""
    session_id = get_current_session_id()
    with get_db_session() as db:
        ticket = db.get(Ticket, ticket_id)
        # Scoped to the requesting session, not just "does this id
        # exist" — the exact ownership check the plan's Phase 3
        # "commonly goes wrong" section calls out. A ticket that exists
        # but belongs to a different session returns the identical
        # "not found" message a genuinely nonexistent id would, rather
        # than a distinct "exists but isn't yours" — that distinction
        # would itself leak whether a given ticket number is real.
        if not owns_ticket(ticket, session_id):
            return f"No ticket #{ticket_id} found in this conversation."
        return (
            f"Ticket #{ticket.id}: {ticket.subject} — status: {ticket.status}, "
            f"priority: {ticket.priority}, filed {ticket.created_at.isoformat()}."
        )
