## Context

The Anthropic SDK supports streaming via:
- TypeScript: `anthropic.messages.stream()` returns a `Stream<MessageStreamEvent>` with a `.finalMessage()` method
- Python: `anthropic.messages.create(stream=True)` returns a `MessageStream` iterable; also `anthropic.messages.stream()` as a context manager with `.get_final_message()`

BeskarClient currently only supports the non-streaming path. The pre-call pipeline (pruner → cache → compressor) is input-only and doesn't need to change for streaming. Only the API call (Step 4) and metrics (Step 5) are affected.

## Goals / Non-Goals

**Goals:**
- Support `stream: true` parameter in `create()` — same optimization pipeline, streaming response
- Extract metrics from the stream's final event without consuming the stream
- Return the same type the SDK returns (transparent pass-through for streaming)

**Non-Goals:**
- Modifying the stream content (no post-processing of streamed chunks — V2.5 output filler cleanup would need a separate streaming adapter)
- Supporting Server-Sent Events or custom transport — we wrap the SDK's streaming, not implement our own
- Async generator support beyond what the SDK provides

## Decisions

### Detection

```typescript
// In create():
const isStreaming = params.stream === true;
```

If streaming, call `anthropic.messages.stream()`. If not, call `anthropic.messages.create()` as before.

### Return type (TypeScript)

```typescript
create(params: MessageCreateParams & { stream: true }): Stream<MessageStreamEvent>;
create(params: MessageCreateParams & { stream?: false }): Message;
create(params: MessageCreateParams): Message | Stream<MessageStreamEvent>;
```

Use overloads so callers get the correct return type based on the `stream` parameter.

### Return type (Python)

```python
def create(self, **params: Any) -> Union[anthropic.types.Message, MessageStream]:
```

Python doesn't have overloads in the same way, but the return type union is sufficient. Callers who pass `stream=True` know they'll get a stream.

### Metrics from streaming

The SDK's `Stream` object provides a `.finalMessage()` (TS) / `.get_final_message()` (Python) that includes full `usage` data. The challenge: we need to call this after the stream is consumed, but the caller controls consumption.

**Approach: wrap the stream**

Create a `BeskarStream` wrapper that:
1. Proxies all stream events to the caller
2. On the `message_stop` event, captures `usage` and calls `tracker.track()`
3. Exposes the same interface as the SDK's `Stream`

```typescript
class BeskarStream extends Stream<MessageStreamEvent> {
  // Intercepts events, tracks metrics on completion
}
```

### Pre-call pipeline

No changes needed. The pipeline operates on `params.messages` (input side). Streaming vs non-streaming doesn't affect input transformations.

### Pipeline order with streaming

```
Input: messages.create(**params, stream: true)
  → [1] Pruner        — Same as non-streaming
  → [2] Cache         — Same as non-streaming
  → [3] Compressor    — Same as non-streaming
  → [4] API Call      — anthropic.messages.stream() instead of .create()
  → [5] Metrics       — Deferred to stream completion (via BeskarStream wrapper)
Output: BeskarStream (wraps SDK Stream)
```

## Risks / Trade-offs

- **BeskarStream wrapper adds complexity** → Mitigation: the wrapper is thin — proxies events, intercepts completion. ~50 lines per language.
- **Metrics are deferred until stream ends** → Acceptable: non-streaming metrics are also only available after the call returns. Stream consumers call `.summary()` when ready.
- **Stream type compatibility** → Risk: if the SDK's `Stream` type changes, `BeskarStream` must be updated. Mitigation: extend the SDK class rather than reimplementing it.
- **Error handling in streams** → The wrapper must propagate stream errors correctly. If the stream errors before `message_stop`, no metrics are captured for that call.

## Open Questions

- Should `BeskarStream` support `for await...of` iteration directly, or require callers to use `.on('event')` handlers? Follow whatever the SDK's `Stream` supports — maintain interface parity.
- Should we add a `stream()` convenience method alongside `create()` (matching the SDK pattern)? Consider for usability, but `create(stream: true)` is the primary interface.
