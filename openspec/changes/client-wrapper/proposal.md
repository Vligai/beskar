## Why

The four optimization modules (cache, pruner, compressor, metrics) are independently useful but need a composition layer that wires them together in the correct order around an actual Anthropic API call. Without `BeskarClient`, callers would have to manually invoke each module, handle the Anthropic SDK directly, and track metrics themselves. The client wrapper is what makes Beskar a drop-in replacement for `anthropic.messages.create()`.

## What Changes

- Implement `src/client.ts` — `BeskarClient` class that accepts a `BeskarConfig`, instantiates the configured modules, and exposes a `messages.create()` method with the same signature as the Anthropic SDK
- Pipeline order: (1) prune context → (2) structure cache → (3) compress tool results → (4) call Anthropic API → (5) capture metrics
- Modules that are disabled (config field is `false` or omitted) are skipped with zero overhead
- Expose `client.metrics.summary()` returning a `MetricsSummary` for the current session
- Update `src/index.ts` to export `BeskarClient` as a named export (first runtime export from the barrel)

## Capabilities

### New Capabilities

- `BeskarClient`: Drop-in replacement for `Anthropic` — accepts the same `messages.create()` params and returns the same response type, with optimization applied transparently
- `metrics-accessor`: `client.metrics.summary()` returns aggregated token usage, cost, and cache hit rate for all calls made through this client instance

### Modified Capabilities

- `src/index.ts`: Gains a runtime export (`BeskarClient`) alongside the existing type-only exports

## Impact

- **Creates**: `src/client.ts`, `src/client.test.ts`
- **Modifies**: `src/index.ts` (adds `BeskarClient` export)
- **Depends on**: all four module changes (`cache-module`, `pruner-module`, `compressor-module`, `metrics-module`) and `src/types.ts`
- **This is the final V1 change** — all modules must be implemented before this change can be completed
