from datetime import datetime, timezone

from langchain_core.tools import tool


@tool
def get_current_time() -> str:
    """Return the current UTC date and time. Use this whenever the user
    asks what time or date it is right now."""
    return datetime.now(timezone.utc).isoformat()
