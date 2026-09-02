"""Phase 2, step 1: pull the site's real public pages so the agent has
something grounded to answer from — the whole point of RAG per the plan
("the model answers from your actual current docs instead of from
whatever it memorized in training").

Deliberately scrapes rendered HTML rather than reading source files
directly: it's the same content a visitor actually sees (locale text,
service descriptions, etc. come from next-intl at render time, not from
a single markdown file), and it naturally excludes anything gated behind
auth — the crawl only ever requests plain public routes.

Deliberately excludes the repo's internal engineering docs (docs/*.md —
deployment secrets structure, credentials checklists, disaster-recovery
runbooks). Those are real files but the wrong kind of "docs" here: this
knowledge base backs a public-facing chat widget, and internal
ops/security documentation must never be retrievable through it.
"""

import json
import os
import sys
from dataclasses import asdict, dataclass
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

SITE_BASE_URL = os.environ.get("SITE_BASE_URL", "http://localhost:8080")
LOCALE = os.environ.get("SCRAPE_LOCALE", "en")

# Plain marketing/informational pages only — no admin, no auth-gated
# dashboards, no the ticket-submission form itself (a form has nothing
# to retrieve; its existence is better surfaced as a tool later, not as
# a knowledge-base chunk).
PUBLIC_PATHS = [
    "",
    "about",
    "vision",
    "services",
    "projects",
    "careers",
    "contact",
]

OUTPUT_PATH = os.environ.get(
    "SCRAPE_OUTPUT_PATH", os.path.join(os.path.dirname(__file__), "output", "scraped_pages.json")
)


@dataclass
class ScrapedPage:
    url: str
    title: str
    text: str


def extract_text(html: str) -> tuple[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else ""

    # main if the page has one, else body — either way this is the
    # visible-text extraction, not raw markup; chunk.py works on plain
    # prose, not HTML.
    root = soup.find("main") or soup.body or soup
    text = root.get_text(separator="\n", strip=True)
    # Collapse the run of blank lines get_text tends to leave behind from
    # deeply nested empty divs.
    lines = [line for line in text.splitlines() if line.strip()]
    return title, "\n".join(lines)


def scrape() -> list[ScrapedPage]:
    pages: list[ScrapedPage] = []
    for path in PUBLIC_PATHS:
        url = urljoin(f"{SITE_BASE_URL}/{LOCALE}/", path)
        try:
            resp = requests.get(url, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as exc:
            print(f"skip {url}: {exc}", file=sys.stderr)
            continue
        title, text = extract_text(resp.text)
        if not text:
            print(f"skip {url}: no extractable text (page may be client-rendered-only)", file=sys.stderr)
            continue
        pages.append(ScrapedPage(url=url, title=title, text=text))
        print(f"scraped {url} ({len(text)} chars)")
    return pages


def main() -> None:
    pages = scrape()
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump([asdict(p) for p in pages], f, indent=2)
    print(f"wrote {len(pages)} page(s) to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
