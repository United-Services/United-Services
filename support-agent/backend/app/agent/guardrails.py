"""Tool-call loop cap — the code-level half of the plan's Phase 5
security section: "code-level limits that don't rely on the model
behaving." A malicious or just-confused prompt trying to get the agent
stuck re-calling a tool must fail safe (escalate) rather than loop
silently and burn through the shared OpenRouter free-tier quota
rate_limit.py is separately protecting.

create_react_agent's graph alternates between its "agent" node (one
model call, which may return a tool call) and "tools" node (executes
it) — one supersteps per node visit. N real tool-call round trips need
2N supersteps (agent, tools) plus one final agent-only superstep that
ends the turn with a plain-text answer and no further tool call. LangGraph
raises GraphRecursionError if completing the turn would need more
supersteps than `recursion_limit` allows.

This mapping is derived from create_react_agent's documented graph
structure, not recalibrated against a live run in this project — Phase
1's OpenRouter account hit its free-tier daily cap (see README's Phase 4
notes) before this could be empirically re-confirmed the same way every
earlier phase's behavior was. Re-verify the exact recursion_limit
boundary once quota allows, per the note in README's Phase 5 section,
before treating the mapping below as load-bearing rather than
reasoned-through.
"""

MAX_TOOL_CALL_ITERATIONS = 5
RECURSION_LIMIT = 2 * MAX_TOOL_CALL_ITERATIONS + 1

LOOP_GUARD_MESSAGE = (
    "I've tried a few different ways to help with this and haven't been able to resolve it. "
    "I've flagged this conversation for a human to follow up as soon as possible."
)
