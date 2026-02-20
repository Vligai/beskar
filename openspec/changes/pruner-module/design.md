## Context

Agentic loops can run for dozens or hundreds of turns. Each turn adds to the messages array, which is sent in full to the API on every call. Claude's context window (200K tokens for Sonnet) sounds large, but tool result bloat, verbose assistant responses, and accumulated history fill it faster than expected. The pruner's job is to keep the messages array within a safe size without breaking the conversation's logical integrity.

The primary constraint: tool_use and tool_result turns are paired by `tool_use_id`. If a `tool_use` assistant turn is in context, its corresponding `tool_result` user turn must also be present (and vice versa). Dropping one without the other produces an invalid request that the API will reject.

## Goals / Non-Goals

**Goals:**
- Keep the messages array within a configurable turn count or size bound
- Preserve tool call integrity — prune tool_use/tool_result pairs atomically
- Support all three `PrunerStrategy` values defined in shared types
- Be deterministic — same input + config always produces same output

**Non-Goals:**
- Counting tokens in messages to enforce a token budget (that requires the counting API or approximation — V2 concern)
- Cross-session memory or summarization that persists beyond a single `prune()` call
- The summarize strategy generating a real summary by calling the Anthropic API (V1: generate a placeholder summary; V2: optionally call a model)

## Decisions

### Function shape: `pruneMessages(messages, config) → BeskarMessage[]`

Pure function. Takes the full messages array and `PrunerConfig`. Returns a new array. Does not call the API, does not mutate input.

**Sliding window:** Keep the last `maxTurns` turns, but never cut in the middle of a tool pair. If the cut point lands inside a tool_use/tool_result pair, shift the cut point earlier to preserve the pair.

**Summarize:** Replace turns older than the window with a single synthetic user message: `"[Previous context summarized: N turns]"`. A placeholder in V1; the `summaryModel` field is reserved for V2 when an actual summarization call is added.

**Importance scoring:** Score each turn 0–1 based on: recency (newer = higher), presence of tool calls (higher), assistant turn length (longer = potentially higher signal). Drop the lowest-scoring turns first, again respecting tool pair atomicity.

### Tool pair detection

A turn is part of a tool pair if:
- It's an assistant turn containing a `tool_use` content block, OR
- It's a user turn containing a `tool_result` content block

Pairs are identified by matching `tool_use_id`. Before dropping any turn, check if it belongs to a pair — if so, drop both or neither.

### Minimum retained turns

Never prune below 1 turn (the most recent user message). If `maxTurns` is set to 0 or the entire history would be dropped, retain the last turn regardless.

## Risks / Trade-offs

- **Sliding window cuts mid-pair** → Mitigation: tool pair guard shifts the cut point to preserve pair integrity. This may result in retaining slightly more turns than `maxTurns` in edge cases.
- **Summarize strategy placeholder** → Mitigation: the synthetic summary message clearly identifies itself as a placeholder. V2 will replace it with a real model call. Callers should not rely on summary content in V1.
- **Importance scoring subjectivity** → Mitigation: the scoring function is deterministic and documented. Weights are fixed constants in V1, not configurable (avoids premature configurability).

## Open Questions

- Should `maxTurns` count messages or turn pairs (user+assistant)? Count individual messages for simplicity — aligns with the `messages` array indexing that callers already use.
- What happens if the messages array has no tool calls? The tool pair guard is a no-op — sliding window and importance strategies work identically.
