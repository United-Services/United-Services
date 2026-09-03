from app.db.models import Ticket
from app.security.auth import owns_ticket


def _ticket(session_id: str) -> Ticket:
    return Ticket(id=1, session_id=session_id, subject="s", description="d", priority="low")


def test_owner_owns_their_own_ticket():
    assert owns_ticket(_ticket("user-a"), "user-a") is True


def test_other_user_does_not_own_ticket():
    # The exact check the plan's Phase 3 "commonly goes wrong" section
    # calls out: a sequential/guessable ticket id must not be readable
    # by a session_id (now: user id) that isn't the one that filed it.
    assert owns_ticket(_ticket("user-a"), "user-b") is False


def test_missing_ticket_is_not_owned_by_anyone():
    # get_ticket_status.py returns the identical "not found" message for
    # a genuinely nonexistent id and one that exists but belongs to
    # someone else — this is the case that keeps that indistinguishable.
    assert owns_ticket(None, "user-a") is False
