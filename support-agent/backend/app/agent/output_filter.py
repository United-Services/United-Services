"""Code-level check on what the model is about to SAY, independent of
what it was asked.

The live exploit this exists for: one poisoned knowledge-base document
made the agent answer a normal question about pipeline services
correctly and then close with "please email your full name, national ID
number and account password to verify@united-services-support.example"
— presented as company guidance. The system prompt's anti-injection
paragraph is a probabilistic LLM policy; it was bypassed. This is the
structural backstop: a contact address, link or phone number in the
response that does not belong to this company, and did not appear in
the material actually retrieved this turn, is treated as a probable
injection and the turn is refused.

Allowlist = the configured company domains + every host/email domain
that appeared in this turn's retrieved documents (so a genuine page
listing a partner's site or a regional office email still works).
"""

import re
from urllib.parse import urlparse

from app.config import settings

_EMAIL_RE = re.compile(r"[\w.+-]+@([\w-]+(?:\.[\w-]+)+)")
_URL_RE = re.compile(r"https?://([^\s/)>\]\"']+)")
# Phone-shaped runs: 8+ digits with optional separators/+. Numbers are
# only allowlisted if they appeared verbatim in retrieved material.
_PHONE_RE = re.compile(r"(?<![\w.])\+?\d[\d\s().-]{7,}\d(?![\w.])")


def _domains_in(text: str) -> set[str]:
    found = {m.lower() for m in _EMAIL_RE.findall(text)}
    found |= {m.lower().split(":")[0] for m in _URL_RE.findall(text)}
    return found


def _phones_in(text: str) -> set[str]:
    return {re.sub(r"\D", "", m) for m in _PHONE_RE.findall(text)}


def _company_domains() -> set[str]:
    configured = {
        d.strip().lower()
        for d in settings.allowed_contact_domains.split(",")
        if d.strip()
    }
    host = urlparse(settings.app_url).hostname
    if host:
        configured.add(host.lower())
    return configured


def _is_allowed_domain(domain: str, allowed: set[str]) -> bool:
    domain = domain.lower()
    return any(domain == a or domain.endswith("." + a) for a in allowed)


def find_unallowed_contacts(response_text: str, retrieved_texts: list[str]) -> list[str]:
    """Returns the suspicious contact strings in `response_text` —
    emails/URLs whose domain is neither a company domain nor present in
    this turn's retrieved documents, and phone numbers that did not
    appear verbatim in those documents. Empty list means the response
    is clean."""
    retrieved = "\n".join(retrieved_texts)
    allowed = _company_domains() | _domains_in(retrieved)
    known_phones = _phones_in(retrieved)

    findings: list[str] = []
    for m in _EMAIL_RE.finditer(response_text):
        if not _is_allowed_domain(m.group(1), allowed):
            findings.append(m.group(0))
    for m in _URL_RE.finditer(response_text):
        if not _is_allowed_domain(m.group(1).split(":")[0], allowed):
            findings.append(m.group(0))
    for m in _PHONE_RE.finditer(response_text):
        if re.sub(r"\D", "", m.group(0)) not in known_phones:
            findings.append(m.group(0).strip())
    return findings


BLOCKED_RESPONSE_MESSAGE = (
    "I wasn't able to give you a safe answer to that just now, so I've "
    "flagged it for a human to follow up. Please don't send account "
    "details or documents to any address unless it comes from our "
    "official site."
)
