"""Tool-call loop cap — the code-level half of the plan's Phase 5
security section: "code-level limits that don't rely on the model
behaving." A malicious or just-confused prompt trying to get the agent
stuck re-calling a tool must fail safe (escalate) rather than loop
silently and burn through the shared OpenRouter free-tier quota
rate_limit.py is separately protecting.

create_react_agent's graph alternates between its "agent" node (one
model call, which may return a tool call) and "tools" node (executes
it) — one superstep per node visit. N real tool-call round trips need
2N supersteps (agent, tools) plus 2 more for the graph to actually
finish cleanly with the real final answer, not 1 — see below.

This was originally derived from create_react_agent's documented graph
structure only (2N + 1), not verified against a live run — Phase 1's
OpenRouter account hit its free-tier daily cap before that could happen
empirically. **Now verified directly** (tests/test_agent_loop.py, a
deterministic fake model, no OpenRouter quota spent) against the actual
installed langgraph==1.2.11: 2N + 1 is wrong for this version. Below the
true boundary, langgraph 1.x doesn't even raise GraphRecursionError the
way 0.2.x did — its newer built-in `remaining_steps` tracking silently
returns a generic "Sorry, need more steps to process this request."
message instead, which stream_agent's `except GraphRecursionError`
would never catch, meaning a stuck conversation would show the user a
wrong answer instead of getting escalated. Confirmed empirically across
N=1,2,3,5,7 that 2N+2 is the real minimum that always gets the genuine
final answer; use that, not 2N+1, on any future langgraph bump — reverify
with the same test rather than trusting this derivation again blind.
"""

MAX_TOOL_CALL_ITERATIONS = 5
RECURSION_LIMIT = 2 * MAX_TOOL_CALL_ITERATIONS + 2

LOOP_GUARD_MESSAGE = (
    "I've tried a few different ways to help with this and haven't been able to resolve it. "
    "I've flagged this conversation for a human to follow up as soon as possible."
)
