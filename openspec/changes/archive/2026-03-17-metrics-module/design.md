## Context

Every Anthropic API response includes a `usage` object with token counts. For cached requests, it also includes `cache_creation_input_tokens` (tokens written to cache this call) and `cache_read_input_tokens` (tokens served from cache). These four numbers are everything needed to compute cost and cache effectiveness.

The metrics module is a thin accumulator — it doesn't make decisions or modify requests. It wraps `usage` capture and provides a summary interface. Its output is the evidence that Beskar's other modules are working.

## Goals / Non-Goals

**Goals:**
- Map every Anthropic API response's `usage` to a `TokenUsage` value (handling missing cache fields gracefully)
- Accumulate per-call values into a running session-level `MetricsSummary`
- Derive cache hit rate, estimated cost, and tokens saved vs. uncached baseline
- Invoke the `MetricsConfig.onUsage` callback after each call if configured

**Non-Goals:**
- Persisting metrics across process restarts (in-memory only in V1)
- Exact cost calculation — pricing constants are hardcoded at module level and will need updating if Anthropic changes prices
- Per-model adaptive pricing — V1 uses a single default pricing table; V2 can add model-specific overrides

## Decisions

### Function-based, not class-based

Export `createMetricsTracker(config?) → MetricsTracker` — a factory function that returns an object with `track(usage)` and `summary()` methods. This is a closure over accumulated state, not a class instance. Keeps the API simple.

**Alternative considered:** Pure functions with state passed in (functional accumulator pattern). Rejected — the metrics tracker is inherently stateful across calls within a session. A factory-returned object with internal state is the clearest model.

### `TokenUsage` mapping

The Anthropic `Usage` object uses snake_case (`input_tokens`, `cache_creation_input_tokens`, etc.). The mapping function converts to `TokenUsage` camelCase format and defaults absent cache fields to `0`. This is a boundary function — it's the only place in Beskar where Anthropic's raw response shape is handled.

### `MetricsSummary` shape

```typescript
interface MetricsSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  cacheHitRate: number;         // cacheRead / (cacheRead + input)
  estimatedCostUsd: number;     // derived from pricing constants
  estimatedSavingsUsd: number;  // vs. uncached baseline
}
```

`MetricsSummary` is a snapshot — calling `summary()` returns the current state without resetting it.

### Pricing constants

V1 hardcodes pricing for the primary model tier (Sonnet-class):
- Input tokens: $3.00 / 1M
- Output tokens: $15.00 / 1M
- Cache creation: $3.75 / 1M
- Cache read: $0.30 / 1M

Tokens saved vs. baseline = `cacheReadTokens` for each call, since those would otherwise be billed as full input tokens. The savings in USD = `cacheReadTokens * (inputPrice - cacheReadPrice)`.

**Alternative considered:** Accept a pricing config object so callers can supply their own rates. Rejected for V1 — premature configurability. The pricing table is in a single constants object at the top of the module, easy to update.

### `onUsage` callback timing

The callback is called synchronously after `track(usage)` updates the internal state. The callback receives only the per-call `TokenUsage`, not the cumulative summary — callers who need the summary can call `summary()` from within the callback.

## Risks / Trade-offs

- **Hardcoded pricing goes stale** → Mitigation: pricing constants are co-located in one place at the top of the module. A comment notes the date they were set. V2 can add a config override.
- **Cache hit rate calculation** → `cacheReadTokens / (totalInputTokens + cacheReadTokens)`. This treats cache reads as the "cached portion" of total effective input. Edge case: if all tokens are cache reads (fully cached call), rate = 1.0. This is correct.
- **In-memory only** → Sessions that restart lose their metrics. This is explicit in the docs.

## Open Questions

- Should `summary()` be a method or a property? Method — it derives values from accumulated state each time it's called, so a property getter would be misleading about the computation involved.
- Should `track()` return anything? Return the per-call `TokenUsage` for convenience — allows `const usage = tracker.track(response.usage)` without a separate read.
