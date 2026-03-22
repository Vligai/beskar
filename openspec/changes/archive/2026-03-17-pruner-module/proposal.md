## Why

Long agentic loops accumulate conversation history that eventually exceeds the context window. When that happens, calls either fail with a context-length error or degrade silently as the model loses early context. Without an automated pruning strategy, agentic pipelines require manual history management — a burden that Beskar should remove.

## What Changes

- Implement `src/pruner/index.ts` — a function that takes a messages array and `PrunerConfig`, then returns a pruned array safe to send to the API
- Support three strategies defined in `PrunerStrategy`:
  - `sliding-window`: drop the oldest turns until the turn count is at or below `maxTurns`
  - `summarize`: replace the oldest N turns with a single synthetic assistant message summarizing their content
  - `importance`: score each turn by signal value (tool call presence, recency, content length) and drop the lowest-scoring turns first
- Never drop a `tool_use` assistant turn without also dropping its corresponding `tool_result` user turn (and vice versa) — tool call pairs must be pruned atomically

## Capabilities

### New Capabilities

- `pruner`: Given a messages array and config, returns a pruned messages array that fits within the configured bounds while preserving conversational integrity
- `tool-pair-guard`: Validates that any pruning operation removes tool_use/tool_result pairs atomically — never leaving an unresolved tool call in context

### Modified Capabilities

None — this is a new module.

## Impact

- **Creates**: `src/pruner/index.ts`, `src/pruner/index.test.ts` (TypeScript); `python/src/beskar/pruner.py`, `python/tests/test_pruner.py` (Python)
- **Depends on**: `src/types.ts` / `python/src/beskar/types.py` — shared type contracts from `project-setup` / `python-setup`
- **Consumed by**: `client-wrapper` change (applied to the messages array before each API call, in both languages)
