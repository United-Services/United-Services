import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ConversationSession(Base):
    """One row per authenticated user. The id is the Clerk user id (the
    verified JWT's "sub" claim — see app/security/clerk_auth.py), not a
    client-supplied value, since /chat/stream now requires a signed-in
    visitor (frontend's ChatWidget.tsx only renders the chat form once
    Clerk confirms isSignedIn). Before that requirement existed this was
    keyed by a random id the browser generated and stored in
    localStorage — easy to spoof, and reset by a new browser/private
    window. Now it's the same real person's history regardless of which
    device or browser they sign in from. Holds every message across
    every conversation this user has ever had, as one JSON array, rather
    than one database row per message —
    the deliberate trade being made here: a long-running or repeat
    visitor's transcript is one growing JSON blob in one row instead of
    an ever-growing number of rows, at the cost of the whole transcript
    moving together on every read/write instead of being queryable
    message-by-message. Right trade for what this table is actually for
    (a human occasionally reading one visitor's full history when a
    ticket escalates), wrong trade if this table needed message-level
    querying (search across all transcripts, analytics, etc.) — it
    doesn't, so this is the appropriate design here, not a default one
    would reach for on a general-purpose chat log.
    """

    __tablename__ = "conversation_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    # Set by escalate_to_human — this is the actual mechanism behind the
    # plan's "What 'escalate' actually does" decision: marking the
    # session as needing human review in Postgres, at minimum.
    needs_human_review: Mapped[bool] = mapped_column(Boolean, default=False)
    escalation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # [{"role": "user"|"assistant", "content": str, "at": isoformat str}, ...]
    # in chronological order, across every conversation this user has
    # ever had (any device, any browser) — appended to via a single
    # atomic JSONB `||` UPDATE (see transcript_store.py), not a
    # read-modify-write, so two concurrent turns for the same user (e.g.
    # two open tabs) can't silently drop one one's worth of messages.
    transcript: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)

    tickets: Mapped[list["Ticket"]] = relationship(back_populates="session")


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("conversation_sessions.id"), nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    # A plain string, not a DB enum — create_ticket's Pydantic-derived
    # tool schema (a Literal type) is what actually constrains the
    # allowed values the model can pass; a DB-level enum would just be a
    # second, redundant place that constraint could drift out of sync.
    priority: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    session: Mapped["ConversationSession"] = relationship(back_populates="tickets")


class AllowedOrigin(Base):
    """CORS allowlist, DB-backed — same pattern as the main
    United-Services backend's own AllowedOrigin model/rule
    (docs/BUSINESS_RULES.md rule 13 there): no admin UI, no API to add
    one, rows added directly via DB access (see README's Phase 6 section
    for the exact command). CORSMiddleware.py caches this table's
    contents in memory (refreshed periodically) rather than querying it
    on every request — see that module's own comment on the refresh
    interval.
    """

    __tablename__ = "allowed_origins"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    origin: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
