## Context

The pruner's `summarize` strategy is documented as a V1 stub. `PrunerConfig.summaryModel` is declared in both languages but unused. The current behavior: when `strategy: 'summarize'` and `maxTurns` is exceeded, old turns are dropped and a single message `"[Earlier context summarized]"` is prepended. No LLM call is made.

This is V2.1 in the roadmap — the highest-priority V2 feature by ROI.

## Goals / Non-Goals

**Goals:**
- Replace stub with a real LLM call that summarizes pruned turns into a dense paragraph
- Use a cheap model (Haiku) by default to minimize cost overhead
- Track summarization cost separately so users can measure the overhead
- Preserve tool call context in summaries (mention which tools were called and key results)

**Non-Goals:**
- Streaming the summarization call (it's an internal optimization, not user-facing)
- Caching the summary across calls (summaries are turn-specific, not reusable)
- Supporting non-Anthropic models for summarization (V2.10 scope)

## Decisions

### Summarization prompt

```
Summarize the following conversation turns into a dense paragraph.
Preserve: key findings, tool call results, decisions made, and any unresolved questions.
Omit: greetings, filler, tool call mechanics, and redundant information.

Turns to summarize:
{formatted_turns}
```

The formatted turns include role labels and tool names but strip verbose tool result content.

### Model selection

```typescript
// PrunerConfig (already declared)
summaryModel?: string;  // default: 'claude-haiku-4-5-20251001'
```

If `summaryModel` is not set, defaults to Haiku. The pruner needs access to an Anthropic client instance to make the call.

### Client integration

The client passes its `_anthropic` instance (or a summary-specific client) to `pruneMessages()` when the strategy is `summarize`:

```typescript
// In client.ts Step 1:
if (config.pruner) {
  messages = await pruneMessages(messages, config.pruner, {
    anthropic: self.anthropic,
    metricsTracker: self.tracker,
  });
}
```

This means `pruneMessages` gains an optional `context` parameter for summarization resources. When strategy is not `summarize`, the context is unused.

### Async implications

The summarization call is async. This requires:
- TypeScript: `create()` returns `Promise<Message>` (or uses `await` internally — already async if streaming is added)
- Python: `_summarize()` calls `anthropic.messages.create()` synchronously (the Python SDK is sync by default)

**Breaking change consideration:** If `create()` is currently synchronous, making it async is a breaking change. Alternative: make the summarization call synchronous in both languages (the Python SDK is sync, and the TS SDK has a sync mode). This keeps `create()` synchronous.

### Summary message format

The summary replaces all pruned turns with a single user message:

```typescript
{
  role: 'user',
  content: `[Context summary — ${prunedCount} turns summarized]\n\n${llmSummary}`
}
```

### Metrics tracking

The summarization call's usage is tracked via a separate `tracker.trackSummarization(usage)` method:
- `MetricsSummary` gains `summarizationCalls: number` and `summarizationTokens: { input, output }`
- The summarization cost is included in `estimatedCostUsd` but broken out in the summary

## Risks / Trade-offs

- **Summarization adds latency** → Mitigation: uses Haiku (fast), only fires when turns exceed `maxTurns` (not every call). Can add a `dryRun` option later.
- **Summarization adds cost** → Mitigation: Haiku is ~20x cheaper than Sonnet. A 1000-token summary call costs ~$0.0008. Tracked in metrics so users can measure overhead vs. savings.
- **Summary quality varies** → Mitigation: the prompt is specific about what to preserve. Users can override `summaryModel` to use Sonnet for higher quality.
- **Makes `create()` async (TS) or adds a nested API call (both)** → Mitigation: only when strategy is `summarize`. Other strategies remain unaffected.

## Open Questions

- Should we cache summaries for identical turn sequences? Probably not — the overhead of hashing turns likely exceeds the cost of a Haiku call. Revisit if users report redundant summarization.
- Should `pruneMessages` accept the full Anthropic client or just a `summarize(turns) → string` function? The function approach is more testable. Decision: accept a `summarizer` callback, and the client provides one that wraps the Anthropic call.
