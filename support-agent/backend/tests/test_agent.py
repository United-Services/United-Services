"""stream_agent (app/agent/agent.py) tested end-to-end at the level
app/routers/chat.py actually calls it — real create_react_agent graphs
built from a fake model (swapped into module-level _agents), real
astream_events, real GraphRecursionError/langgraph-internal-cap
handling. escalate_to_human's DB write is stubbed out (this exercises
the streaming/escalation logic, not Postgres)."""

import asyncio

import pytest
from langgraph.prebuilt import create_react_agent

import app.agent.agent as agent_module
from app.agent.guardrails import MAX_TOOL_CALL_ITERATIONS
from app.agent.tools.dummy import get_current_time
from app.session_context import set_current_session_id


@pytest.fixture(autouse=True)
def _session_context():
    set_current_session_id("test-user")
    yield


class _FakeEscalateTool:
    def __init__(self):
        self.calls = []

    def invoke(self, args):
        self.calls.append(args)


@pytest.fixture
def escalation_calls(monkeypatch):
    # escalate_to_human is a langchain StructuredTool (a pydantic model)
    # — can't monkeypatch an attribute directly onto the instance
    # (pydantic rejects assigning a field that isn't declared), so the
    # module-level name itself is swapped for a plain stand-in instead.
    fake = _FakeEscalateTool()
    monkeypatch.setattr(agent_module, "escalate_to_human", fake)
    return fake.calls


def _set_single_agent(monkeypatch, model):
    compiled = create_react_agent(model, [get_current_time], prompt="test agent")
    monkeypatch.setattr(agent_module, "_agents", [("test-model", compiled)])


def _run_stream(message="hi", history=None):
    async def collect():
        return [event async for event in agent_module.stream_agent(message, history or [])]

    return asyncio.run(collect())


def test_normal_turn_streams_tokens_and_tool_events(monkeypatch, fake_model_factory, escalation_calls):
    model = fake_model_factory(script=[("get_current_time", {})], final_content="It is currently that time.")
    _set_single_agent(monkeypatch, model)

    events = _run_stream("what time is it?")

    kinds = [e["type"] for e in events]
    assert kinds[:2] == ["tool_start", "tool_end"]
    assert kinds[2:] == ["token"] * len(kinds[2:])  # word-chunked, but nothing else interleaved
    assert "".join(e["content"] for e in events if e["type"] == "token") == "It is currently that time."
    assert escalation_calls == []


def test_stuck_conversation_escalates_instead_of_looping_forever(monkeypatch, fake_model_factory, escalation_calls):
    # Whichever way langgraph internally ends a stuck turn (raising
    # GraphRecursionError, or its own silent "need more steps"
    # non-answer — both observed live across langgraph versions, see
    # test_agent_loop.py), the client must see the same loop-guard
    # message and a ticket must get filed, never silence and never the
    # raw internal non-answer text.
    model = fake_model_factory(always_loop=True, script=[("get_current_time", {})])
    _set_single_agent(monkeypatch, model)

    events = _run_stream("please just keep trying forever")

    assert len(escalation_calls) == 1
    token_text = "".join(e["content"] for e in events if e["type"] == "token")
    assert agent_module.LOOP_GUARD_MESSAGE in token_text
    assert "need more steps" not in token_text


def test_short_answer_with_no_tool_call_is_not_treated_as_stuck(monkeypatch, fake_model_factory, escalation_calls):
    # A turn that never needed a tool at all (script empty) must not
    # trip the "tool calls happened but no text ever came out" stuck-
    # conversation detector — that check is specifically gated on at
    # least one real tool call having happened.
    model = fake_model_factory(script=[], final_content="Hello! How can I help?")
    _set_single_agent(monkeypatch, model)

    events = _run_stream("hi")

    assert escalation_calls == []
    assert "".join(e["content"] for e in events if e["type"] == "token") == "Hello! How can I help?"


def test_mid_stream_failure_does_not_retry_or_duplicate_output(monkeypatch, escalation_calls):
    # Live-verified separately that a model failing *before* any output
    # (bad model id, 400 from OpenRouter) correctly falls back to the
    # next candidate. Forcing a failure *after* real tokens have already
    # reached the client isn't reproducible on demand against a live
    # API, so this covers it deterministically instead: once
    # yielded_anything is true, stream_agent must surface the
    # interruption plainly and stop — not silently retry a second model
    # and either duplicate or contradict what the user already saw.
    from langchain_core.language_models import BaseChatModel
    from langchain_core.messages import AIMessageChunk
    from langchain_core.outputs import ChatGenerationChunk

    class DiesMidStream(BaseChatModel):
        @property
        def _llm_type(self) -> str:
            return "dies-mid-stream"

        def bind_tools(self, tools, **kwargs):
            return self

        def _generate(self, messages, stop=None, run_manager=None, **kwargs):
            raise NotImplementedError

        def _stream(self, messages, stop=None, run_manager=None, **kwargs):
            yield ChatGenerationChunk(message=AIMessageChunk(content="Partial answer"))
            raise ConnectionError("simulated connection drop mid-response")

    class NeverCalled(BaseChatModel):
        @property
        def _llm_type(self) -> str:
            return "never-called"

        def bind_tools(self, tools, **kwargs):
            return self

        def _generate(self, messages, stop=None, run_manager=None, **kwargs):
            raise AssertionError("fallback model must not run after real output was already streamed")

    dying_agent = create_react_agent(DiesMidStream(), [get_current_time], prompt="test agent")
    fallback_agent = create_react_agent(NeverCalled(), [get_current_time], prompt="test agent")
    monkeypatch.setattr(agent_module, "_agents", [("dying-model", dying_agent), ("fallback-model", fallback_agent)])

    events = _run_stream("hi")

    token_text = "".join(e["content"] for e in events if e["type"] == "token")
    assert "Partial answer" in token_text
    assert "interrupted" in token_text
    assert escalation_calls == []  # a transient connection drop isn't the same as a stuck conversation
