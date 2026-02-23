## 1. Usage Mapper

- [x] 1.1 Create `src/metrics/index.ts` and export `mapUsage(raw: Anthropic.Usage): TokenUsage`
- [x] 1.2 Map `raw.input_tokens` → `inputTokens`, `raw.output_tokens` → `outputTokens`
- [x] 1.3 Map `raw.cache_creation_input_tokens ?? 0` → `cacheCreationInputTokens`
- [x] 1.4 Map `raw.cache_read_input_tokens ?? 0` → `cacheReadInputTokens`
- [x] 1.5 Test: `mapUsage` with all four fields present → all four `TokenUsage` fields set correctly
- [x] 1.6 Test: `mapUsage` with no cache fields → cache fields default to `0`

## 2. Pricing Constants

- [x] 2.1 Define a `PRICING` constant object at module level: `{ inputPerMToken: 3.00, outputPerMToken: 15.00, cacheCreationPerMToken: 3.75, cacheReadPerMToken: 0.30 }` (Sonnet-class pricing, USD, as of 2026-02-20)
- [x] 2.2 Implement `estimateCostUsd(usage: TokenUsage): number` using the `PRICING` constants
- [x] 2.3 Implement `estimateSavingsUsd(usage: TokenUsage): number` — savings = `cacheReadTokens * (inputPricePerToken - cacheReadPricePerToken)`
- [x] 2.4 Test: `estimateCostUsd` with known token counts returns the correct USD value
- [x] 2.5 Test: `estimateSavingsUsd` with `cacheReadInputTokens: 1_000_000` returns correct savings

## 3. Metrics Tracker

- [x] 3.1 Export `createMetricsTracker(config?: MetricsConfig): MetricsTracker`
- [x] 3.2 Define `MetricsTracker` type: `{ track(usage: Anthropic.Usage): TokenUsage; summary(): MetricsSummary }`
- [x] 3.3 Define `MetricsSummary` type in `src/types.ts`: `{ totalCalls, totalInputTokens, totalOutputTokens, totalCacheCreationTokens, totalCacheReadTokens, cacheHitRate, estimatedCostUsd, estimatedSavingsUsd }`
- [x] 3.4 `track(raw)` maps raw usage via `mapUsage`, accumulates into running totals, invokes `config.onUsage` if set, returns the `TokenUsage`
- [x] 3.5 `summary()` computes `cacheHitRate` as `totalCacheReadTokens / (totalInputTokens + totalCacheReadTokens)` (returns `0` if denominator is `0`)
- [x] 3.6 `summary()` computes `estimatedCostUsd` and `estimatedSavingsUsd` from accumulated totals
- [x] 3.7 Test: `track()` called twice → `summary().totalCalls` is `2`, tokens are summed correctly
- [x] 3.8 Test: `track()` with cache reads → `summary().cacheHitRate` is computed correctly
- [x] 3.9 Test: `onUsage` callback is invoked after each `track()` call with the per-call `TokenUsage`
- [x] 3.10 Test: `summary()` with no calls → all totals are `0`, `cacheHitRate` is `0`
- [x] 3.11 Test: `track()` returns the `TokenUsage` for that call (not the cumulative summary)

## 4. `MetricsSummary` Export

- [x] 4.1 Add `MetricsSummary` to `src/types.ts` exports
- [x] 4.2 Re-export `MetricsSummary` from `src/index.ts`

## 5. Python Implementation (`python/src/beskar/metrics.py`)

- [x] 5.1 Define `PRICING` dict: `input_per_m_tokens: 3.00, output_per_m_tokens: 15.00, cache_creation_per_m_tokens: 3.75, cache_read_per_m_tokens: 0.30`
- [x] 5.2 Implement `map_usage(raw: anthropic.types.Usage) -> TokenUsage` — map fields, default cache fields to `0` if `None`
- [x] 5.3 Implement `estimate_cost_usd(usage: TokenUsage) -> float` and `estimate_savings_usd(usage: TokenUsage) -> float` using `PRICING`
- [x] 5.4 Implement `create_metrics_tracker(config: MetricsConfig | None = None) -> MetricsTracker`; `track()` accumulates totals, calls `on_usage` if set, returns per-call `TokenUsage`; `summary()` derives `cache_hit_rate` (0.0 if denominator is 0), cost, savings
- [x] 5.5 Write `python/tests/test_metrics.py`:
  - Test: `map_usage` with all fields → all `TokenUsage` fields correct
  - Test: `map_usage` with no cache fields → cache fields default to `0`
  - Test: two `track()` calls → `summary().total_calls == 2`, tokens summed
  - Test: `track()` returns per-call `TokenUsage` not cumulative
  - Test: `cache_hit_rate` computed correctly; `0.0` when no cache reads
  - Test: `on_usage` callback invoked after each `track()`
  - Test: no config → `track()` completes without error

## 6. TypeScript Verification

- [x] 6.1 `npm run typecheck` — zero errors
- [x] 6.2 `npm run test:coverage` — passes 90% lines/functions/statements, 85% branches thresholds
- [x] 6.3 `npm run build` — compiles to both `dist/esm/` and `dist/cjs/` without errors

## 7. Python Verification

- [x] 7.1 `mypy python/src/` — zero errors
- [x] 7.2 `pytest python/tests/test_metrics.py --cov=beskar.metrics --cov-fail-under=90` — passes
