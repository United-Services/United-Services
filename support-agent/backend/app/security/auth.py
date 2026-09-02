"""Session/ticket ownership checks — factored out from
get_ticket_status.py (Phase 3) into its own module, per the plan's
Phase 5 file layout. Same check, same reasoning: "sequential or
guessable IDs without an authorization check let one user read another
user's ticket" (the plan's own "commonly goes wrong" line for Phase 3,
which is exactly why this lives under app/security/ now that Phase 5
makes the security posture explicit rather than incidental).
"""

from app.db.models import Ticket


def owns_ticket(ticket: Ticket | None, session_id: str) -> bool:
    return ticket is not None and ticket.session_id == session_id
