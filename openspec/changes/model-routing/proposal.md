## Why

Token cost reduction from model routing is multiplicative, not additive. A pipeline doing 80% extraction/classification tasks and 20% reasoning tasks could cut costs by 15x by routing simple calls to Haiku (~20x cheaper per token) while keeping Sonnet/Opus for complex reasoning. This dwarfs the savings from caching and compression alone. With per-model pricing now in place (V2.2 — already shipped), the metrics module can accurately measure routing savings.

## What Changes

- Add a `routing` config option to `BeskarConfig`
- Implement a task classifier that inspects the request (system prompt signals, message length, tool call depth, output expectations) and decides: Haiku or Sonnet
- The router overrides `params.model` before the API call — all other pipeline stages (cache, pruner, compressor, metrics) are unaffected
- Routing decisions are logged in metrics for measurement

## Capabilities

### New Capabilities

- `model-router`: Classifies each API call as "simple" or "complex" and routes to the appropriate model
- `routing-metrics`: Tracks how many calls were routed to each model and the cost delta vs. all-Sonnet baseline

### Modified Capabilities

- `beskar-client`: Pipeline gains a Step 0 (model routing) before pruner
- `metrics-tracker`: Tracks per-model call counts and routing savings

## Impact

- **Creates**: `src/router/index.ts`, `src/beskar/router.py` (new module), `src/router/index.test.ts`, `tests/test_router.py`
- **Modifies**: `src/client.ts`, `src/beskar/client.py` (adds routing step), `src/types.ts`, `src/beskar/types.py` (config), `src/metrics/index.ts`, `src/beskar/metrics.py` (routing metrics)
- **Depends on**: Per-model pricing (already shipped)
- **Consumed by**: Users running mixed-complexity agentic pipelines
