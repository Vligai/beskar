## Why

Many production agentic pipelines use streaming for latency-sensitive UX — showing partial responses as they arrive. Without streaming support, Beskar is incompatible with these use cases. Users must bypass BeskarClient entirely and call the raw Anthropic SDK for streaming calls, losing all optimization benefits (caching, pruning, compression, metrics). This is a prerequisite for real-world adoption in latency-sensitive pipelines.

## What Changes

- Extend `BeskarClient.messages.create()` to detect `stream: true` in params
- Apply all pre-call transformations (pruner, cache, compressor) as normal
- Call `anthropic.messages.stream()` instead of `anthropic.messages.create()` for streaming requests
- Accumulate usage from the stream's final `message_delta` event for metrics tracking
- Return a `Stream<MessageStreamEvent>` (TS) / iterable stream (Python)

## Capabilities

### New Capabilities

- `streaming-create`: When `stream: true` is passed, returns a streaming response while still applying all Beskar optimizations
- `stream-metrics`: Extracts usage data from stream events for metrics tracking

### Modified Capabilities

- `beskar-client`: `create()` detects `stream` param and switches to streaming API call
- `metrics-tracker`: Accepts usage from stream events (same structure as non-streaming)

## Impact

- **Modifies**: `src/client.ts`, `src/beskar/client.py` (streaming branch in create), `src/types.ts`, `src/beskar/types.py` (return type union)
- **Depends on**: `@anthropic-ai/sdk` streaming API (`anthropic.messages.stream()` / `anthropic.messages.create(stream=True)`)
- **Consumed by**: Users with latency-sensitive UIs, real-time agent interfaces, and CLI tools
