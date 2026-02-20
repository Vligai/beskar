## Why

Without metrics, there's no way to know if Beskar is working or how much it's saving. Token optimization that can't be measured can't be trusted or tuned. The metrics module is what turns Beskar from "a thing that probably helps" into "a thing that saves $X per day, with a cache hit rate of Y%." It's non-optional infrastructure for production use.

## What Changes

- Implement `src/metrics/index.ts` — functions that capture the `usage` object from every Anthropic API response and accumulate statistics across calls
- Map Anthropic's raw `Usage` response (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`) into Beskar's `TokenUsage` type
- Derive: cache hit rate (cache reads / total input), estimated cost per call (using hardcoded Anthropic pricing by model), tokens saved vs. uncached baseline
- Expose a `MetricsSummary` snapshot that aggregates all calls in a session: total tokens, total cost, cumulative tokens saved, overall cache hit rate
- Invoke the optional `MetricsConfig.onUsage` callback after each call with the per-call `TokenUsage`

## Capabilities

### New Capabilities

- `usage-mapper`: Maps an Anthropic `Usage` response object to a `TokenUsage` value, defaulting absent cache fields to `0`
- `metrics-tracker`: Accumulates per-call `TokenUsage` values into a running `MetricsSummary` (total tokens, cost, savings, hit rate)
- `cost-estimator`: Derives estimated USD cost from token counts using current Anthropic model pricing constants

### Modified Capabilities

None — this is a new module.

## Impact

- **Creates**: `src/metrics/index.ts`, `src/metrics/index.test.ts` (TypeScript); `python/src/beskar/metrics.py`, `python/tests/test_metrics.py` (Python)
- **Depends on**: `src/types.ts` / `python/src/beskar/types.py` — shared type contracts from `project-setup` / `python-setup`
- **Consumed by**: `client-wrapper` change (called after each API response to capture usage, in both languages)
