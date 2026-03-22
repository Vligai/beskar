## Why

The `summarize` pruner strategy currently inserts a placeholder string (`"[Earlier context summarized]"`) instead of generating an actual summary. This means users who select the `summarize` strategy get the worst of both worlds: they lose the original turns AND don't get a meaningful summary. Long agentic pipelines (bug bounty, research, multi-step debugging) accumulate critical findings in early turns that are lost when the sliding window advances. Real summarization preserves semantic content while reducing token count.

## What Changes

- Replace the `_summarize()` / `summarize()` stub with an actual LLM call that compresses old turns into a dense summary
- Wire up `PrunerConfig.summaryModel` (currently declared but unused) to select the model for summarization
- Default to a cheap model (Haiku) for the summarization call
- Track the summarization call's token usage in the metrics module (separate from the primary call)
- Support both sync and async execution paths

## Capabilities

### New Capabilities

- `llm-summarization`: When `strategy: 'summarize'` is configured, the pruner makes a secondary LLM call to compress old turns into a dense summary before discarding them
- `summary-metrics`: The summarization call's token usage is tracked separately in metrics

### Modified Capabilities

- `context-pruner-summarize`: Changes from stub (placeholder string) to real LLM-based summarization
- `metrics-tracker`: Tracks additional `summarizationCalls` and `summarizationTokens` fields

## Impact

- **Modifies**: `src/pruner/index.ts`, `src/beskar/pruner.py` (summarize implementation), `src/metrics/index.ts`, `src/beskar/metrics.py` (summary call tracking), `src/client.ts`, `src/beskar/client.py` (passes Anthropic client to pruner for summarization calls)
- **Depends on**: `@anthropic-ai/sdk` / `anthropic` (for the summarization API call)
- **Consumed by**: Users with long-running agentic pipelines who need context preservation
