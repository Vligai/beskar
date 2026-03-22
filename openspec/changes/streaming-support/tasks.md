## 1. Stream Detection

- [ ] 1.1 In `src/client.ts` `create()`: check `params.stream === true` to branch into streaming path
- [ ] 1.2 In `src/beskar/client.py` `create()`: check `params.get('stream') is True`
- [ ] 1.3 Test (TS): `stream: true` → streaming path is taken
- [ ] 1.4 Test (TS): `stream: false` or absent → non-streaming path (existing behavior)
- [ ] 1.5 Test (Python): same as 1.3–1.4

## 2. BeskarStream Wrapper (TypeScript)

- [ ] 2.1 Create `BeskarStream` class in `src/client.ts` (or `src/stream.ts`) that wraps the SDK's `Stream<MessageStreamEvent>`
- [ ] 2.2 Proxy all stream events (iterable/async iterable interface)
- [ ] 2.3 On `message_stop` event: extract `usage` from the accumulated message, call `tracker.track(usage, model)`
- [ ] 2.4 Expose `.finalMessage()` that delegates to the underlying stream
- [ ] 2.5 Test: BeskarStream yields all events from the underlying stream in order
- [ ] 2.6 Test: metrics are tracked after stream completion
- [ ] 2.7 Test: stream error before completion → no metrics tracked, error propagated

## 3. BeskarStream Wrapper (Python)

- [ ] 3.1 Create `BeskarStream` class in `src/beskar/client.py` (or `src/beskar/stream.py`) wrapping the SDK's `MessageStream`
- [ ] 3.2 Implement `__iter__` and `__enter__`/`__exit__` (context manager) proxying to underlying stream
- [ ] 3.3 On stream completion: extract usage, call `tracker.track()`
- [ ] 3.4 Expose `.get_final_message()` delegating to underlying stream
- [ ] 3.5 Test: same as 2.5–2.7

## 4. Client Integration (TypeScript)

- [ ] 4.1 In streaming branch: apply Steps 1–3 (pruner, cache, compressor) to params as normal
- [ ] 4.2 Call `anthropic.messages.stream(modifiedParams)` instead of `.create()`
- [ ] 4.3 Wrap the SDK stream in `BeskarStream`, passing the tracker
- [ ] 4.4 Return `BeskarStream` to caller
- [ ] 4.5 Add overloaded type signatures for `create()` based on `stream` parameter
- [ ] 4.6 Test: streaming call with pruner/cache/compressor → optimizations applied to input, stream returned
- [ ] 4.7 Test: mock SDK `.stream()` → verify modified params are passed through

## 5. Client Integration (Python)

- [ ] 5.1 Same as 4.1–4.4 using `anthropic.messages.create(stream=True)` or `anthropic.messages.stream()`
- [ ] 5.2 Return type annotation: `Union[anthropic.types.Message, BeskarStream]`
- [ ] 5.3 Test: same as 4.6–4.7

## 6. Pre-Call Pipeline Verification

- [ ] 6.1 Test (TS): streaming call with all modules enabled → pruner, cache, compressor all fire before stream starts
- [ ] 6.2 Test (Python): same
- [ ] 6.3 Test: cache breakpoints are correctly placed on streaming requests

## 7. Verification

- [ ] 7.1 `npm run typecheck` — zero errors (overloaded return types resolve correctly)
- [ ] 7.2 `npm run test:coverage` — passes thresholds
- [ ] 7.3 `pytest tests/ --cov=beskar --cov-fail-under=90` — passes
- [ ] 7.4 `npm run build` — compiles without errors
- [ ] 7.5 All existing non-streaming tests pass unchanged
