## 1. Config Types

- [ ] 1.1 Add `tokenEstimator?: (text: string) => number` to `BeskarConfig` in `src/types.ts`
- [ ] 1.2 Add `token_estimator: Optional[Callable[[str], int]] = None` to `BeskarConfig` in `src/beskar/types.py`
- [ ] 1.3 Export updated types from `src/index.ts` and `src/beskar/__init__.py`

## 2. Cache Module

- [ ] 2.1 Add optional `estimator?: (text: string) => number` parameter to `structureCache()` in `src/cache/index.ts`; default to `estimateTokens`
- [ ] 2.2 Replace all direct `estimateTokens()` calls in `structureCache` with the `estimator` parameter
- [ ] 2.3 Add optional `estimator: Optional[Callable[[str], int]] = None` parameter to `structure_cache()` in `src/beskar/cache.py`; default to `estimate_tokens`
- [ ] 2.4 Replace all direct `estimate_tokens()` calls in `structure_cache` with the estimator parameter
- [ ] 2.5 Test (TS): custom estimator returning double tokens → cache threshold fires at half the content length
- [ ] 2.6 Test (TS): no custom estimator → behavior unchanged (existing tests still pass)
- [ ] 2.7 Test (Python): same as 2.5–2.6

## 3. Compressor Module

- [ ] 3.1 Add optional `estimator` parameter to `compressToolResult()` in both languages
- [ ] 3.2 Replace direct `estimateTokens` calls with the estimator parameter
- [ ] 3.3 Test (TS): custom estimator → truncation boundary changes accordingly
- [ ] 3.4 Test (TS): no custom estimator → existing behavior unchanged
- [ ] 3.5 Test (Python): same as 3.3–3.4

## 4. Client Pipeline

- [ ] 4.1 In `src/client.ts` `create()`: resolve estimator from config, pass to `structureCache()` and `compressToolResult()`
- [ ] 4.2 In `src/beskar/client.py` `create()`: same resolution and pass-through
- [ ] 4.3 Test (TS): pipeline with custom estimator → estimator is invoked (verify via mock)
- [ ] 4.4 Test (Python): same as 4.3

## 5. Verification

- [ ] 5.1 `npm run typecheck` — zero errors
- [ ] 5.2 `npm run test:coverage` — passes thresholds
- [ ] 5.3 `pytest tests/ --cov=beskar --cov-fail-under=90` — passes
- [ ] 5.4 `npm run build` — compiles without errors
- [ ] 5.5 All existing tests pass without modification (backward compatibility)
