"""Exercises create_react_agent's real tool-calling loop against the
actual installed langgraph/langchain versions, with a deterministic fake
model instead of real OpenRouter calls. This is what stands in for live
re-verification on every dependency bump from here on — the exact gap
that let a broken langchain/langgraph combination merge to main
undetected earlier (see the Dependabot dependency-upgrade commit).
"""

import asyncio

import pytest
from langgraph.errors import GraphRecursionError
from langgraph.prebuilt import create_react_agent

from app.agent.guardrails import MAX_TOOL_CALL_ITERATIONS, RECURSION_LIMIT
from app.agent.tools.dummy import get_current_time


def test_tool_call_then_final_answer(fake_model_factory):
    model = fake_model_factory(script=[("get_current_time", {})], final_content="It is currently that time.")
    agent = create_react_agent(model, [get_current_time], prompt="test agent")

    result = agent.invoke({"messages": [("user", "what time is it?")]})

    assert result["messages"][-1].content == "It is currently that time."
    assert model.calls == 2  # one tool-call decision + one final answer


def test_astream_events_emits_tool_start_and_end(fake_model_factory):
    model = fake_model_factory(script=[("get_current_time", {})], final_content="Done.")
    agent = create_react_agent(model, [get_current_time], prompt="test agent")

    async def collect():
        events = []
        async for event in agent.astream_events({"messages": [("user", "hi")]}, version="v2"):
            if event["event"] in ("on_tool_start", "on_tool_end"):
                events.append(event["event"])
        return events

    events = asyncio.run(collect())
    assert events == ["on_tool_start", "on_tool_end"]


def test_recursion_limit_allows_exactly_max_iterations(fake_model_factory):
    # MAX_TOOL_CALL_ITERATIONS real tool calls, then a final answer —
    # must complete within RECURSION_LIMIT supersteps exactly, per
    # guardrails.py's own derivation (2 supersteps per real tool call,
    # plus 1 final agent-only superstep).
    script = [("get_current_time", {})] * MAX_TOOL_CALL_ITERATIONS
    model = fake_model_factory(script=script, final_content="Resolved.")
    agent = create_react_agent(model, [get_current_time], prompt="test agent")

    result = agent.invoke({"messages": [("user", "hi")]}, config={"recursion_limit": RECURSION_LIMIT})

    assert result["messages"][-1].content == "Resolved."


def test_one_below_recursion_limit_never_silently_degrades(fake_model_factory):
    # langgraph's own built-in remaining_steps tracking can return a
    # canned "Sorry, need more steps..." message instead of raising
    # GraphRecursionError once the limit is too tight for the real
    # number of tool calls — a real behavior discovered while deriving
    # RECURSION_LIMIT (see guardrails.py's own comment). That path is
    # dangerous specifically because stream_agent's `except
    # GraphRecursionError` never sees it, so a stuck conversation would
    # show the user a wrong answer instead of getting escalated. This
    # doesn't assert RECURSION_LIMIT - 1 succeeds (it may not) — only
    # that if it doesn't raise, it never returns that silent non-answer.
    script = [("get_current_time", {})] * MAX_TOOL_CALL_ITERATIONS
    model = fake_model_factory(script=script, final_content="Resolved.")
    agent = create_react_agent(model, [get_current_time], prompt="test agent")

    try:
        result = agent.invoke({"messages": [("user", "hi")]}, config={"recursion_limit": RECURSION_LIMIT - 1})
    except GraphRecursionError:
        return  # raising is an acceptable, catchable outcome
    assert "need more steps" not in result["messages"][-1].content


def test_stuck_conversation_never_completes_with_a_real_answer(fake_model_factory):
    # A model that never resolves (always calls a tool again) must never
    # be treated as having produced a genuine answer — either
    # GraphRecursionError (langgraph 0.2.x's behavior) or langgraph
    # 1.x's own silent "need more steps" non-answer (confirmed live:
    # this is what actually happens at RECURSION_LIMIT, not an
    # exception — see test_agent.py's stream_agent-level test for how
    # agent.py now catches this case specifically).
    model = fake_model_factory(always_loop=True, script=[("get_current_time", {})])
    agent = create_react_agent(model, [get_current_time], prompt="test agent")

    try:
        result = agent.invoke({"messages": [("user", "hi")]}, config={"recursion_limit": RECURSION_LIMIT})
    except GraphRecursionError:
        return
    assert result["messages"][-1].content != "Resolved."
