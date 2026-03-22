## 1. Summarizer Callback Type

- [ ] 1.1 Add `Summarizer` type to `src/types.ts`: `type Summarizer = (turns: BeskarMessage[]) => string`
- [ ] 1.2 Add `Summarizer` type to `src/beskar/types.py`: `Callable[[List[BeskarMessage]], str]`
- [ ] 1.3 Add `PrunerContext` interface: `{ summarizer?: Summarizer, metricsTracker?: MetricsTracker }`
- [ ] 1.4 Same in Python: `PrunerContext` dataclass

## 2. Pruner Module Changes

- [ ] 2.1 Update `pruneMessages()` signature in `src/pruner/index.ts` to accept optional `context?: PrunerContext`
- [ ] 2.2 Replace `summarize()` stub with: call `context.summarizer(prunedTurns)`, use result as summary content
- [ ] 2.3 If `context.summarizer` is not provided and strategy is `summarize`, fall back to existing placeholder (backward compat)
- [ ] 2.4 Format pruned turns for the summarizer: include role labels, tool names, truncate long content
- [ ] 2.5 Same changes in `src/beskar/pruner.py`
- [ ] 2.6 Test (TS): summarizer callback is invoked with correct turns when strategy is `summarize`
- [ ] 2.7 Test (TS): summary content appears in the prepended user message
- [ ] 2.8 Test (TS): no summarizer provided → falls back to placeholder string
- [ ] 2.9 Test (Python): same as 2.6–2.8

## 3. Client Summarizer Factory

- [ ] 3.1 In `src/client.ts`: create a `makeSummarizer(anthropic, model)` function that returns a `Summarizer` wrapping `anthropic.messages.create()` with the summarization prompt
- [ ] 3.2 Default model: `'claude-haiku-4-5-20251001'`, overridden by `PrunerConfig.summaryModel`
- [ ] 3.3 Pass the summarizer to `pruneMessages()` in Step 1 when strategy is `summarize`
- [ ] 3.4 Same in `src/beskar/client.py`
- [ ] 3.5 Test (TS): mock Anthropic client → verify summarization prompt is sent to correct model
- [ ] 3.6 Test (Python): same as 3.5

## 4. Metrics Integration

- [ ] 4.1 Add `trackSummarization(usage)` method to `MetricsTracker` in both languages
- [ ] 4.2 Add `summarizationCalls`, `summarizationInputTokens`, `summarizationOutputTokens` to `MetricsSummary`
- [ ] 4.3 In the summarizer factory: after the API call, call `tracker.trackSummarization(response.usage)` if tracker is available
- [ ] 4.4 Include summarization cost in `estimatedCostUsd` (using the summary model's pricing)
- [ ] 4.5 Test (TS): summary call usage appears in metrics summary
- [ ] 4.6 Test (Python): same

## 5. Summarization Prompt

- [ ] 5.1 Define the summarization system prompt as a constant in the pruner module
- [ ] 5.2 Format input turns: `"[{role}]: {content_preview}"` with tool names for tool_use blocks
- [ ] 5.3 Cap the formatted input to avoid exceeding the summarization model's context (8K tokens for Haiku)
- [ ] 5.4 Test: formatted turn output includes role labels and tool names

## 6. Verification

- [ ] 6.1 `npm run typecheck` — zero errors
- [ ] 6.2 `npm run test:coverage` — passes thresholds
- [ ] 6.3 `pytest tests/ --cov=beskar --cov-fail-under=90` — passes
- [ ] 6.4 `npm run build` — compiles without errors
- [ ] 6.5 All existing tests pass (backward compatibility — no summarizer = placeholder)
