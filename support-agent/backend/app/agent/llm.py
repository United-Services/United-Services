from langchain_openai import ChatOpenAI

from app.config import settings


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
    )
