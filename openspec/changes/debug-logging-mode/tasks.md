## 1. Config Types

- [ ] 1.1 Add `DebugConfig` interface to `src/types.ts` with `verbose?: boolean` and `logger?: (entry: DebugEntry) => void`
- [ ] 1.2 Add `DebugEntry` interface to `src/types.ts` with `stage`, `messagesBefore`, `messagesAfter`, `estimatedTokensBefore`, `estimatedTokensAfter`, `details`
- [ ] 1.3 Add `debug?: DebugConfig | boolean | false` to `BeskarConfig` in `src/types.ts`
- [ ] 1.4 Add `DebugConfig` dataclass to `src/beskar/types.py` with `verbose: bool = False`, `logger: Optional[Callable] = None`
- [ ] 1.5 Add `debug: Optional[DebugConfig] = None` to `BeskarConfig` in `src/beskar/types.py`
- [ ] 1.6 Export `DebugConfig` and `DebugEntry` from `src/index.ts` and `src/beskar/__init__.py`

## 2. Debug Helper

- [ ] 2.1 Create `debugLog(config: BeskarConfig, entry: DebugEntry)` helper in `src/client.ts` — checks `config.debug`, resolves logger (custom or default `console.debug`), wraps in try/catch
- [ ] 2.2 Create `_debug_log(config: BeskarConfig, entry: dict)` helper in `src/beskar/client.py` — same logic with `logging.getLogger('beskar').debug` as default
- [ ] 2.3 Test: debug disabled → logger never called
- [ ] 2.4 Test: debug enabled with custom logger → logger receives correct entry
- [ ] 2.5 Test: logger throws → pipeline continues without error

## 3. Pipeline Integration (TypeScript)

- [ ] 3.1 After Step 1 (pruner): log `{ stage: 'pruner', messagesBefore, messagesAfter, details: { strategy, turnsPruned } }`
- [ ] 3.2 After Step 2 (cache): log `{ stage: 'cache', details: { breakpointsPlaced } }`
- [ ] 3.3 After Step 3 (compressor): log `{ stage: 'compressor', details: { resultsCompressed, chainsCollapsed } }`
- [ ] 3.4 After Step 5 (metrics): log `{ stage: 'metrics', details: { usage } }`
- [ ] 3.5 Test: full pipeline with debug enabled → four debug entries emitted in order

## 4. Pipeline Integration (Python)

- [ ] 4.1 After Step 1 (pruner): same debug entry as TypeScript
- [ ] 4.2 After Step 2 (cache): same
- [ ] 4.3 After Step 3 (compressor): same
- [ ] 4.4 After Step 5 (metrics): same
- [ ] 4.5 Test: full pipeline with debug enabled → four debug entries emitted in order

## 5. Verification

- [ ] 5.1 `npm run typecheck` — zero errors
- [ ] 5.2 `npm run test:coverage` — passes thresholds
- [ ] 5.3 `pytest tests/ --cov=beskar --cov-fail-under=90` — passes
- [ ] 5.4 `npm run build` — compiles without errors
