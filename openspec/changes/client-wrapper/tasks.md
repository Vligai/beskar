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

## 6. Verification

- [ ] 6.1 `npm run typecheck` — zero errors
- [ ] 6.2 `npm run test:coverage` — passes 90% lines/functions/statements, 85% branches thresholds across all modules
- [ ] 6.3 `npm run build` — compiles to both `dist/esm/` and `dist/cjs/` without errors
- [ ] 6.4 Manual check: `import { BeskarClient } from 'beskar'` resolves `BeskarClient` class from the built output
