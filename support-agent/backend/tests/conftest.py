"""Shared fixtures — a deterministic fake chat model so the agent's
tool-calling loop, streaming event shapes, and recursion-limit behavior
can be tested without spending real OpenRouter quota (the account's
free-tier daily cap was hit more than once during this project's own
development — see support-agent/README.md's Phase 4/5 notes). Mirrors
what was validated by hand against the real langgraph/langchain
versions during the Dependabot dependency upgrade.
"""

from collections.abc import Iterator
from typing import Any

import pytest
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult


class ScriptedFakeChatModel(BaseChatModel):
    """Returns tool calls from `script` in order, then a final plain-text
    `AIMessage` once the script is exhausted. `script` entries are
    `(tool_name, args)` pairs. Set `always_loop=True` to never exhaust
    the script (used for the recursion-limit test).

    Implements `_stream`, not just `_generate` — real ChatOpenAI streams
    real token deltas via on_chat_model_stream, which is what
    agent.py's stream_agent actually forwards to the client. A
    `_generate`-only fake produced zero on_chat_model_stream events for
    a final answer (confirmed live the first time a test asserted on
    streamed token content, not just event *kinds*) — a gap in the test
    double, not something agent.py did wrong, but one that would have
    silently hidden a real streaming regression."""

    script: list[tuple[str, dict]] = []
    final_content: str = "Done."
    always_loop: bool = False
    calls: int = 0

    @property
    def _llm_type(self) -> str:
        return "scripted-fake"

    def bind_tools(self, tools, **kwargs):
        return self

    def _next_message(self) -> AIMessage:
        index = self.calls
        self.calls += 1
        if self.always_loop or index < len(self.script):
            name, args = self.script[index % max(len(self.script), 1)] if self.script else ("noop", {})
            return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": f"call_{index}"}])
        return AIMessage(content=self.final_content)

    def _generate(self, messages: list[BaseMessage], stop=None, run_manager=None, **kwargs: Any) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=self._next_message())])

    def _stream(self, messages: list[BaseMessage], stop=None, run_manager=None, **kwargs: Any) -> Iterator[ChatGenerationChunk]:
        msg = self._next_message()
        if msg.tool_calls:
            # Real providers commonly deliver a tool call's arguments
            # incrementally too, but a single whole-tool-call chunk is
            # enough to exercise create_react_agent's aggregation
            # correctly and is what several real providers do in
            # practice for short argument sets.
            yield ChatGenerationChunk(
                message=AIMessageChunk(content="", tool_calls=msg.tool_calls, tool_call_chunks=[
                    {"name": tc["name"], "args": "{}", "id": tc["id"], "index": 0} for tc in msg.tool_calls
                ])
            )
            return
        # Split into a few word-boundary chunks so a test can tell real
        # incremental streaming happened, not just one chunk with the
        # whole answer.
        words = msg.content.split(" ")
        for i, word in enumerate(words):
            piece = word if i == 0 else " " + word
            yield ChatGenerationChunk(message=AIMessageChunk(content=piece))


@pytest.fixture
def fake_model_factory():
    return ScriptedFakeChatModel
