import httpx
from langchain_openai import ChatOpenAI

from app.config import settings

# Per-request ceilings on the OpenRouter call. Before these existed the
# client inherited the openai SDK's default — verified live as
# httpx.Timeout(timeout=None): no connect, read, write or pool bound at
# all. A provider that accepted the TCP connection and never answered
# blocked forever; stream_agent's `except Exception` never ran, so the
# fallback model was never tried, and the widget spun indefinitely.
# Measured twice: a never-replying stub still hanging at 20s, and one
# ordinary live turn running past 8 minutes.
#
# read=30 is per chunk of a streamed response, not the whole turn — the
# whole-turn budget is stream_agent's asyncio.timeout in agent.py.
# max_retries=1 (SDK default 2) so a dead primary costs at most two
# attempts before the chain moves on, not three per candidate.
LLM_TIMEOUT = httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0)
LLM_MAX_RETRIES = 1


def build_llm(model_name: str) -> ChatOpenAI:
    # OpenRouter is OpenAI-compatible — ChatOpenAI works unmodified once
    # base_url/api_key point at OpenRouter instead of OpenAI. See
    # https://openrouter.ai/docs for the header recommendations below.
    # Takes model_name as an argument, not read from settings.model
    # directly, so agent.py can build one of these per fallback
    # candidate (settings.model plus settings.fallback_model_list) — see
    # that module's comment on why LangChain's generic
    # `.with_fallbacks()` doesn't work with create_react_agent.
    return ChatOpenAI(
        model=model_name,
        api_key=settings.openrouter_api_key,
        base_url="https://openrouter.ai/api/v1",
        default_headers={
            "HTTP-Referer": settings.app_url,
            "X-Title": settings.app_name,
        },
        timeout=LLM_TIMEOUT,
        max_retries=LLM_MAX_RETRIES,
    )
