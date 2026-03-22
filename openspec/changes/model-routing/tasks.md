## 1. Config Types

- [ ] 1.1 Add `RoutingConfig` interface to `src/types.ts` with `defaultModel`, `haikuModel`, `signals`, `forceModel`
- [ ] 1.2 Add `RoutingSignal` type to `src/types.ts` with `condition`, `route`, `pattern`
- [ ] 1.3 Add `routing?: RoutingConfig | false` to `BeskarConfig` in `src/types.ts`
- [ ] 1.4 Same types in `src/beskar/types.py` using dataclasses
- [ ] 1.5 Export types from `src/index.ts` and `src/beskar/__init__.py`

## 2. Router Module (TypeScript)

- [ ] 2.1 Create `src/router/index.ts` with `routeModel(params, config: RoutingConfig): string`
- [ ] 2.2 Implement default classification signals (system prompt keywords, tool chain depth, message length)
- [ ] 2.3 Support custom `RoutingSignal` overrides — evaluate in order, first match wins
- [ ] 2.4 If `forceModel` is set, return it immediately
- [ ] 2.5 If user passed explicit `model` in params, skip routing (return as-is)
- [ ] 2.6 Test: system prompt with "code generation" → routes to Sonnet
- [ ] 2.7 Test: short message, no tools → routes to Haiku
- [ ] 2.8 Test: custom signal overrides default classification
- [ ] 2.9 Test: forceModel bypasses all signals
- [ ] 2.10 Test: explicit model in params → routing skipped

## 3. Router Module (Python)

- [ ] 3.1 Create `src/beskar/router.py` with `route_model(params, config: RoutingConfig) -> str`
- [ ] 3.2 Implement same classification logic as TypeScript
- [ ] 3.3 Create `tests/test_router.py` with same test cases as 2.6–2.10

## 4. Client Pipeline Integration

- [ ] 4.1 In `src/client.ts`: add Step 0 before pruner — if `config.routing`, call `routeModel()` and override `params.model`
- [ ] 4.2 In `src/beskar/client.py`: same Step 0
- [ ] 4.3 Test (TS): pipeline with routing enabled → model is changed before API call
- [ ] 4.4 Test (Python): same

## 5. Metrics Integration

- [ ] 5.1 Add `routedToHaiku`, `routedToDefault`, `routingSavingsUsd` to `MetricsSummary` in both languages
- [ ] 5.2 Add `trackRouting(decision: 'haiku' | 'default')` method to `MetricsTracker`
- [ ] 5.3 Client calls `tracker.trackRouting()` after routing decision in Step 0
- [ ] 5.4 `routingSavingsUsd` = (calls routed to Haiku) × (Sonnet price - Haiku price) × avg tokens per call
- [ ] 5.5 Test: routing metrics appear in summary with correct counts

## 6. Cache Threshold Cross-Cutting

- [ ] 6.1 When routing to Haiku, cache module should use 2048 minimum token threshold (not 1024)
- [ ] 6.2 Pass routed model to `structureCache()` or adjust `CacheConfig.minTokenThreshold` dynamically
- [ ] 6.3 Test: Haiku-routed call → cache breakpoints respect 2048 threshold

## 7. Verification

- [ ] 7.1 `npm run typecheck` — zero errors
- [ ] 7.2 `npm run test:coverage` — passes thresholds (new module included)
- [ ] 7.3 `pytest tests/ --cov=beskar --cov-fail-under=90` — passes
- [ ] 7.4 `npm run build` — compiles without errors
