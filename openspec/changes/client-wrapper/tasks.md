## 1. `BeskarClient` Class

- [ ] 1.1 Create `src/client.ts` and export `class BeskarClient`
- [ ] 1.2 Constructor accepts `BeskarConfig`; instantiates `new Anthropic({ apiKey: config.apiKey })` internally
- [ ] 1.3 Constructor initializes `createMetricsTracker(config.metrics || undefined)` and stores it privately
- [ ] 1.4 Expose `messages` object with a `create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>` method
- [ ] 1.5 Expose `metrics` object with a `summary(): MetricsSummary` method that delegates to the internal tracker

## 2. Request Pipeline

- [ ] 2.1 In `messages.create()`, extract `messages`, `system`, and `tools` from params
- [ ] 2.2 Step 1 — Pruner: if `config.pruner` is set (not `false`), call `pruneMessages(messages, config.pruner)`; otherwise use messages as-is
- [ ] 2.3 Step 2 — Cache: if `config.cache` is set (not `false`), call `structureCache({ messages, system, tools }, config.cache)` and use the returned modified request fields
- [ ] 2.4 Step 3 — Compressor (chain collapse): if `config.compressor` is set (not `false`), call `collapseToolChains(messages, config.compressor)` on the current messages
- [ ] 2.5 Step 4 — API call: call `this.anthropic.messages.create({ ...params, messages, system, tools })` with the processed fields
- [ ] 2.6 Step 5 — Metrics: if metrics tracker is active, call `tracker.track(response.usage)` with the response usage
- [ ] 2.7 Return the Anthropic API response unchanged

## 3. Module Guard Logic

- [ ] 3.1 Test: `config.pruner: false` → `pruneMessages` is never called
- [ ] 3.2 Test: `config.cache: false` → `structureCache` is never called
- [ ] 3.3 Test: `config.compressor: false` → `collapseToolChains` is never called
- [ ] 3.4 Test: no module fields in config → all modules skipped, API called with original params

## 4. Tests (`src/client.test.ts`)

- [ ] 4.1 Mock `@anthropic-ai/sdk` with `vi.mock('@anthropic-ai/sdk')` — never make real API calls
- [ ] 4.2 Test: `messages.create()` returns the mocked Anthropic response unchanged
- [ ] 4.3 Test: with `cache` enabled, the params passed to the mocked SDK include `cache_control` on system/tools
- [ ] 4.4 Test: with `pruner` enabled and a messages array exceeding `maxTurns`, the mocked SDK receives a pruned array
- [ ] 4.5 Test: with `metrics` enabled, `client.metrics.summary()` after one call reflects the mocked response's usage
- [ ] 4.6 Test: `MetricsConfig.onUsage` callback is invoked after each `messages.create()` call
- [ ] 4.7 Test: `BeskarClient` constructed with no module config → SDK called with original params, `metrics.summary()` returns zeroed totals

## 5. Update `src/index.ts`

- [ ] 5.1 Add `export { BeskarClient } from './client.js'` to `src/index.ts`
- [ ] 5.2 Verify the export resolves correctly from both ESM and CJS build outputs

## 6. Python `BeskarClient` (`python/src/beskar/client.py`)

- [ ] 6.1 Implement `class BeskarClient` with `__init__(self, config: BeskarConfig)`; create `anthropic.Anthropic(api_key=config.api_key)` internally; initialize `create_metrics_tracker(config.metrics)`
- [ ] 6.2 Expose `self.messages` as inner `_MessagesNamespace` with `create(self, **params) -> anthropic.types.Message`
- [ ] 6.3 Expose `self.metrics` as inner `_MetricsNamespace` with `summary() -> MetricsSummary`
- [ ] 6.4 Pipeline: (1) `prune_messages` if `config.pruner`, (2) `structure_cache` if `config.cache`, (3) `collapse_tool_chains` if `config.compressor`, (4) `self._anthropic.messages.create(**modified_params)`, (5) `tracker.track(response.usage)` if `config.metrics` — return response unchanged
- [ ] 6.5 Update `python/src/beskar/__init__.py` to export `BeskarClient`
- [ ] 6.6 Write `python/tests/test_client.py` with `unittest.mock.patch('anthropic.Anthropic')`:
  - Test: `messages.create()` returns mocked response
  - Test: with `cache` config → mock SDK receives `cache_control` on system
  - Test: with `pruner` config → mock SDK receives pruned messages
  - Test: with `metrics` config → `client.metrics.summary().total_calls == 1` after one call
  - Test: `on_usage` callback invoked
  - Test: no module config → SDK called with original params

## 7. TypeScript Verification

- [ ] 7.1 `npm run typecheck` — zero errors
- [ ] 7.2 `npm run test:coverage` — passes 90% lines/functions/statements, 85% branches thresholds across all modules
- [ ] 7.3 `npm run build` — compiles to both `dist/esm/` and `dist/cjs/` without errors
- [ ] 7.4 Manual check: `import { BeskarClient } from 'beskar'` resolves from built output

## 8. Python Verification

- [ ] 8.1 `mypy python/src/` — zero errors
- [ ] 8.2 `pytest python/tests/ --cov=beskar --cov-fail-under=90` — full suite passes
- [ ] 8.3 `pip install -e python/` in a fresh venv → `from beskar import BeskarClient` works
