## 1. Usage Mapper

- [ ] 1.1 Create `src/metrics/index.ts` and export `mapUsage(raw: Anthropic.Usage): TokenUsage`
- [ ] 1.2 Map `raw.input_tokens` → `inputTokens`, `raw.output_tokens` → `outputTokens`
- [ ] 1.3 Map `raw.cache_creation_input_tokens ?? 0` → `cacheCreationInputTokens`
- [ ] 1.4 Map `raw.cache_read_input_tokens ?? 0` → `cacheReadInputTokens`
- [ ] 1.5 Test: `mapUsage` with all four fields present → all four `TokenUsage` fields set correctly
- [ ] 1.6 Test: `mapUsage` with no cache fields → cache fields default to `0`

## 2. Pricing Constants

- [ ] 2.1 Define a `PRICING` constant object at module level: `{ inputPerMToken: 3.00, outputPerMToken: 15.00, cacheCreationPerMToken: 3.75, cacheReadPerMToken: 0.30 }` (Sonnet-class pricing, USD, as of 2026-02-20)
- [ ] 2.2 Implement `estimateCostUsd(usage: TokenUsage): number` using the `PRICING` constants
- [ ] 2.3 Implement `estimateSavingsUsd(usage: TokenUsage): number` — savings = `cacheReadTokens * (inputPricePerToken - cacheReadPricePerToken)`
- [ ] 2.4 Test: `estimateCostUsd` with known token counts returns the correct USD value
- [ ] 2.5 Test: `estimateSavingsUsd` with `cacheReadInputTokens: 1_000_000` returns correct savings

## 3. Metrics Tracker

- [ ] 3.1 Export `createMetricsTracker(config?: MetricsConfig): MetricsTracker`
- [ ] 3.2 Define `MetricsTracker` type: `{ track(usage: Anthropic.Usage): TokenUsage; summary(): MetricsSummary }`
- [ ] 3.3 Define `MetricsSummary` type in `src/types.ts`: `{ totalCalls, totalInputTokens, totalOutputTokens, totalCacheCreationTokens, totalCacheReadTokens, cacheHitRate, estimatedCostUsd, estimatedSavingsUsd }`
- [ ] 3.4 `track(raw)` maps raw usage via `mapUsage`, accumulates into running totals, invokes `config.onUsage` if set, returns the `TokenUsage`
- [ ] 3.5 `summary()` computes `cacheHitRate` as `totalCacheReadTokens / (totalInputTokens + totalCacheReadTokens)` (returns `0` if denominator is `0`)
- [ ] 3.6 `summary()` computes `estimatedCostUsd` and `estimatedSavingsUsd` from accumulated totals
- [ ] 3.7 Test: `track()` called twice → `summary().totalCalls` is `2`, tokens are summed correctly
- [ ] 3.8 Test: `track()` with cache reads → `summary().cacheHitRate` is computed correctly
- [ ] 3.9 Test: `onUsage` callback is invoked after each `track()` call with the per-call `TokenUsage`
- [ ] 3.10 Test: `summary()` with no calls → all totals are `0`, `cacheHitRate` is `0`
- [ ] 3.11 Test: `track()` returns the `TokenUsage` for that call (not the cumulative summary)

## 4. `MetricsSummary` Export

- [ ] 4.1 Add `MetricsSummary` to `src/types.ts` exports
- [ ] 4.2 Re-export `MetricsSummary` from `src/index.ts`

## 5. Verification

- [ ] 5.1 `npm run typecheck` — zero errors
- [ ] 5.2 `npm run test:coverage` — passes 90% lines/functions/statements, 85% branches thresholds
- [ ] 5.3 `npm run build` — compiles to both `dist/esm/` and `dist/cjs/` without errors
