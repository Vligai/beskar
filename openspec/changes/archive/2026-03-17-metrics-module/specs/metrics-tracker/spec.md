## ADDED Requirements

### Requirement: `mapUsage` converts Anthropic Usage to `TokenUsage`
The `mapUsage` function SHALL accept an `Anthropic.Usage` object and return a `TokenUsage` value. It SHALL map `input_tokens` → `inputTokens`, `output_tokens` → `outputTokens`, and default `cache_creation_input_tokens` and `cache_read_input_tokens` to `0` if absent.

#### Scenario: All four fields present
- **WHEN** the Anthropic Usage object has all four fields
- **THEN** all four `TokenUsage` fields are set to their respective values

#### Scenario: Cache fields absent
- **WHEN** the Anthropic Usage object has only `input_tokens` and `output_tokens`
- **THEN** `cacheCreationInputTokens` and `cacheReadInputTokens` are both `0`

### Requirement: `createMetricsTracker` returns a stateful tracker
`createMetricsTracker` SHALL accept an optional `MetricsConfig` and return a `MetricsTracker` with `track(raw: Anthropic.Usage): TokenUsage` and `summary(): MetricsSummary` methods. Each `track()` call SHALL accumulate token counts into internal running totals.

#### Scenario: Multiple `track()` calls accumulate totals
- **WHEN** `track()` is called twice with different usage values
- **THEN** `summary().totalCalls` is `2` and token totals are the sum of both calls

#### Scenario: `track()` returns the per-call TokenUsage
- **WHEN** `track()` is called
- **THEN** it returns the `TokenUsage` for that single call, not the cumulative totals

#### Scenario: `summary()` returns zero totals before any calls
- **WHEN** `summary()` is called on a freshly created tracker
- **THEN** all numeric fields are `0`

### Requirement: `summary()` derives cache hit rate, cost, and savings
`MetricsSummary` SHALL include `cacheHitRate` as `totalCacheReadTokens / (totalInputTokens + totalCacheReadTokens)`. It SHALL include `estimatedCostUsd` and `estimatedSavingsUsd` derived from hardcoded Anthropic pricing constants.

#### Scenario: Cache hit rate calculation
- **WHEN** total input tokens are `900_000` and total cache read tokens are `100_000`
- **THEN** `cacheHitRate` is `0.1`

#### Scenario: Cache hit rate is 0 with no cache reads
- **WHEN** `totalCacheReadTokens` is `0`
- **THEN** `cacheHitRate` is `0` (no division-by-zero error)

#### Scenario: Estimated cost reflects pricing constants
- **WHEN** `totalInputTokens` is `1_000_000` with all other token counts at `0`
- **THEN** `estimatedCostUsd` is `3.00` (Sonnet-class input pricing)

#### Scenario: Estimated savings reflect cache read discount
- **WHEN** `totalCacheReadTokens` is `1_000_000` with no cache creation or output tokens
- **THEN** `estimatedSavingsUsd` reflects the difference between input price and cache read price for those tokens

### Requirement: `onUsage` callback is invoked after each `track()` call
If `MetricsConfig.onUsage` is provided, it SHALL be called synchronously after each `track()` call with the per-call `TokenUsage`.

#### Scenario: Callback receives per-call usage
- **WHEN** `onUsage` is set and `track()` is called with specific usage values
- **THEN** the callback is invoked with a `TokenUsage` matching those values

#### Scenario: No callback configured → no error
- **WHEN** `MetricsConfig` is not provided or `onUsage` is omitted
- **THEN** `track()` completes without errors
