## Context

`BeskarClient` is the public API of the Beskar library. Everything else is internal. It must be a drop-in replacement for `anthropic.messages.create()` — callers swap `new Anthropic(...)` for `new BeskarClient(...)` and nothing else changes.

The pipeline order matters: pruning must happen before caching (so we don't cache breakpoints into a stale history), and compression must happen before the API call (so compressed results are what gets sent). Metrics capture must happen after the API call (it needs the response).

## Goals / Non-Goals

**Goals:**
- `BeskarClient` has a `messages.create(params)` method with the same TypeScript signature as `Anthropic.messages.create()`
- Each enabled module is applied in the correct pipeline order
- Disabled modules (config field is `false` or omitted) add zero overhead
- `client.metrics.summary()` returns the session `MetricsSummary`
- `src/index.ts` exports `BeskarClient` as a named export

**Non-Goals:**
- Streaming support in V1 — `stream: true` / `stream` method on `Anthropic.messages` is out of scope; V1 targets non-streaming calls only
- Implementing any module logic directly in `client.ts` — each module is imported from its own directory
- Exposing per-module state directly (e.g., `client.cache.breakpoints`) — the metrics summary is the only surface

## Decisions

### Class-based, not function-based

`BeskarClient` is a class because it holds state (the metrics tracker, the Anthropic SDK client instance, the config). A factory function could work but a class is more natural for a "client" abstraction and matches the Anthropic SDK's own pattern.

### Pipeline execution order

```
messages.create(params) call
  │
  ▼
1. pruner.pruneMessages(params.messages, config.pruner)   [if enabled]
  │
  ▼
2. cache.structureCache({ messages, system, tools }, config.cache)  [if enabled]
  │
  ▼
3. compressor.collapseToolChains(messages, config.compressor)  [if enabled]
  │
  ▼
4. anthropic.messages.create(modifiedParams)   [always]
  │
  ▼
5. metricsTracker.track(response.usage)   [if enabled]
  │
  ▼
return response  [unmodified — same shape as Anthropic SDK response]
```

Note: `compressor.compressToolResult` is called by the caller before appending results to the history array, not inside `messages.create()`. The collapser is applied to the full history at step 3.

### TypeScript signature

```typescript
class BeskarClient {
  constructor(config: BeskarConfig);
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
  metrics: {
    summary(): MetricsSummary;
  };
}
```

`Anthropic.MessageCreateParamsNonStreaming` is the non-streaming overload of the Anthropic SDK's create params. Using the SDK's own type ensures Beskar stays in sync with SDK changes at compile time.

### Anthropic SDK instantiation

`BeskarClient` creates one `Anthropic` instance internally, using `config.apiKey` if provided or falling back to the `ANTHROPIC_API_KEY` environment variable (which the SDK reads automatically). Callers never handle the SDK client directly.

### Module enablement check

Each module is checked at call time, not at construction time:
```typescript
const pruned = config.pruner ? pruneMessages(messages, config.pruner) : messages;
```
Simple ternary, no abstraction layer.

## Risks / Trade-offs

- **No streaming support** → Mitigation: `messages.create()` accepts only `MessageCreateParamsNonStreaming`. If a caller passes `stream: true`, TypeScript will catch it at compile time. Document this limitation clearly.
- **Pipeline is hardcoded** → Mitigation: the pipeline order is the only sensible order given the module dependencies (pruning must precede caching). No configurability needed.
- **Metrics are session-scoped** → Mitigation: one tracker instance per `BeskarClient` instance. Callers who want per-call metrics use `MetricsConfig.onUsage` callback.

## Open Questions

- Should `client.metrics` be a `MetricsTracker` instance directly, or a namespace with just `summary()`? Just `summary()` — exposing the full tracker would leak internal state and invite misuse.
- Should `BeskarClient` re-export utility functions like `compressToolResult` for callers who want to apply it manually? No — keep the public API surface small. Callers can import from the module directly if needed.
