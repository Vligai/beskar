## Context

Tool results are structurally required to stay in context — the Anthropic API will reject a request that contains a `tool_use` assistant turn without its corresponding `tool_result` user turn. But the content of a tool result can be freely modified, as long as the `tool_use_id` linkage is preserved and the block type remains `tool_result`.

Two distinct compression opportunities:
1. **Per-result truncation**: Before a tool result is appended to context, cap its content length at `maxToolResultTokens`. This keeps each result from ballooning the context.
2. **Chain collapsing**: Once a tool-use/tool-result pair is older than `collapseAfterTurns` turns from the current end of context, replace the entire assistant+user turn pair with a single short assistant message summarizing that the tool was called and what it returned. This removes the structural overhead of the pair while retaining the semantic gist.

## Goals / Non-Goals

**Goals:**
- Reduce token footprint of tool results without breaking `tool_use_id` pairing
- Provide both per-result and per-chain compression independently
- Never produce an invalid messages array (no orphaned tool_use or tool_result blocks)

**Non-Goals:**
- Semantic understanding of tool result content — truncation is positional (trim to token estimate), not semantic
- Compressing non-tool messages (regular user/assistant turns are handled by the pruner)
- Lossless compression — this is lossy by design; the compressor is explicitly opt-in

## Decisions

### Two exported functions: `compressToolResult` and `collapseToolChains`

`compressToolResult(block, config) → ContentBlock`: Takes a single tool_result content block. If its estimated token count exceeds `maxToolResultTokens`, truncates the text content to that limit and appends a `[truncated]` marker. Returns a new block — never mutates input.

`collapseToolChains(messages, config) → BeskarMessage[]`: Scans the messages array for tool_use/tool_result pairs whose distance from the end of the array exceeds `collapseAfterTurns`. Replaces each qualifying pair with a single synthetic assistant message: `"[Tool call: {tool_name} — result summarized after {N} turns]"`. Returns a new array.

**Alternative considered:** Single `compress(messages, config)` function that does both. Rejected — keeping them separate allows the client-wrapper to call them at different pipeline stages (tool result compression happens immediately; chain collapsing happens at the start of each call).

### Token estimation for truncation

Same `Math.floor(text.length / 4)` heuristic as the cache module. Truncation target is `maxToolResultTokens * 4` characters. Appends `"\n[truncated]"` at the cut point.

### Tool pair identification for collapse

A collapsible pair consists of:
- An assistant turn containing exactly one `tool_use` block (multi-tool turns are not collapsed in V1 — too complex)
- The immediately following user turn containing the matching `tool_result` block

Pairs where the assistant turn has multiple tool_use blocks are left intact.

### Synthetic collapse message format

`"[Tool: {tool_name} | Result summarized — called {N} turns ago]"` as an assistant role message. This retains enough context for the model to understand a tool was used, without preserving the full payload.

## Risks / Trade-offs

- **Truncated tool results lose information** → Mitigation: this is opt-in via `CompressorConfig`. Callers who need full fidelity don't set `maxToolResultTokens`.
- **Collapsed chains lose the tool result payload** → Mitigation: `collapseAfterTurns` defaults to a conservative value (the caller sets it explicitly — no silent default collapsing). The model generally doesn't need exact tool results from 10+ turns ago.
- **Multi-tool turns not collapsed in V1** → Mitigation: noted in the synthetic summary message logic. Multi-tool pair collapsing can be added in V2.

## Open Questions

- Should `collapseToolChains` be applied before or after `compressToolResult` in the pipeline? After — compress first (reduce individual result size), then collapse (remove entire old pairs). This order is most efficient.
- What is the default for `collapseAfterTurns`? No default — the field is optional and chain collapsing is disabled if unset. Explicit opt-in only.
