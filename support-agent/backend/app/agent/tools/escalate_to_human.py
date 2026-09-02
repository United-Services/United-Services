from langchain_core.tools import tool

from app.db.models import ConversationSession, Ticket
from app.db.session import get_db_session
from app.session_context import get_current_session_id


@tool
def escalate_to_human(reason: str) -> str:
    """Flag this conversation for human review AND file a high-priority
    ticket for it — use when the user explicitly asks to speak to a
    person, or when you cannot help them after a genuine attempt
    (searching docs, filing a ticket if appropriate). This does not
    contact anyone in real time; it queues the conversation for a human
    to pick up as soon as possible. Always tell the user you've done
    this and that a human will follow up."""
    session_id = get_current_session_id()
    with get_db_session() as db:
        session = db.get(ConversationSession, session_id)
        if session is None:
            session = ConversationSession(id=session_id)
            db.add(session)
        session.needs_human_review = True
        session.escalation_reason = reason

        # Highest priority, always — an escalation is by definition the
        # "couldn't resolve this any other way" path, so the ticket it
        # produces should sort to the front of whatever a human works
        # through, not compete on priority with a routine request.
        ticket = Ticket(
            session_id=session_id,
            subject=f"Escalated: {reason[:150]}",
            description=reason,
            priority="high",
        )
        db.add(ticket)
        db.flush()
        ticket_id = ticket.id

    return (
        f"This conversation has been flagged for human review and ticket #{ticket_id} "
        "was filed at high priority. Tell the user a human will follow up as soon as possible."
    )
