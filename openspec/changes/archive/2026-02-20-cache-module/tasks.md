## 1. Token Estimation

- [x] 1.1 Implement `estimateTokens(text: string): number` using `Math.floor(text.length / 4)` — export it so tests can exercise it directly
- [x] 1.2 Test: `estimateTokens("a".repeat(4096))` returns `1024`
- [x] 1.3 Test: `estimateTokens("")` returns `0`

## 2. Core `structureCache` Function

- [x] 2.1 Create `src/cache/index.ts` and export `structureCache(request: CacheStructureRequest, config?: CacheConfig): CacheStructureResult`
- [x] 2.2 Define `CacheStructureRequest` locally: `{ messages: BeskarMessage[], system?: string | Anthropic.TextBlockParam[], tools?: Anthropic.Tool[] }`
- [x] 2.3 Define `CacheStructureResult` locally: `{ request: CacheStructureRequest, breakpoints: CacheBreakpoint[] }`
- [x] 2.4 Read `minTokenThreshold` from `config?.minTokenThreshold` — default to `1024` if absent
- [x] 2.5 Track placed breakpoints count — stop placing once count reaches 4

## 3. System Prompt Breakpoint

- [x] 3.1 If `system` is a string, serialize it to estimate tokens; if above threshold, convert to a single `TextBlockParam` with `cache_control` and return as array
- [x] 3.2 If `system` is already a `TextBlockParam[]`, add `cache_control` to the last block if its text exceeds threshold
- [x] 3.3 Test: system string above threshold → returned request has system as array with `cache_control` on last block
- [x] 3.4 Test: system string below threshold → returned request has system unchanged, no breakpoint placed

## 4. Tool Definitions Breakpoint

- [x] 4.1 If `tools` is provided and non-empty, compute combined estimated token count across all tool descriptions + schemas
- [x] 4.2 If combined count exceeds threshold and breakpoint limit not reached, add `cache_control` to the last tool in the array
- [x] 4.3 Test: tools array above threshold → last tool gets `cache_control`
- [x] 4.4 Test: tools array below threshold → no breakpoint placed on tools

## 5. Leading Message Breakpoints

- [x] 5.1 Scan messages from oldest to newest; for each user turn with large text content blocks, add `cache_control` to the last content block of that turn if it exceeds threshold and limit not reached
- [x] 5.2 Skip the most recent user message (dynamic — not cacheable in practice)
- [x] 5.3 Test: old user message with large content above threshold gets a breakpoint
- [x] 5.4 Test: most recent user message is never given a breakpoint

## 6. 4-Breakpoint Limit

- [x] 6.1 Track placed breakpoints across system, tools, and messages; stop placing once 4 are applied
- [x] 6.2 Test: request with 6 eligible blocks results in exactly 4 breakpoints placed
- [x] 6.3 Test: returned `CacheStructureResult.breakpoints` length matches the number actually placed

## 7. Immutability

- [x] 7.1 Use spread/Object.assign to build new objects; never mutate input `request`, `messages`, or content blocks
- [x] 7.2 Test: original request object is identical (deep equal) after `structureCache` returns

## 8. Edge Cases

- [x] 8.1 Test: empty messages array, no system, no tools → returns original request unchanged, empty breakpoints array
- [x] 8.2 Test: all content below threshold → returns original request unchanged, empty breakpoints array
- [x] 8.3 Test: custom `minTokenThreshold: 2048` → only blocks above 2048 get breakpoints

## 9. Python Implementation (`python/src/beskar/cache.py`)

- [x] 9.1 Implement `estimate_tokens(text: str) -> int` using `len(text) // 4`
- [x] 9.2 Implement `structure_cache(request: CacheRequest, config: CacheConfig | None = None) -> CacheResult` — same logic as TypeScript; `CacheRequest` is a `TypedDict`, `CacheResult` is a dataclass with `request` and `breakpoints: list[CacheBreakpoint]`
- [x] 9.3 Apply system prompt breakpoint: if `system` is a string above threshold, convert to a list with `cache_control` on the last block; if already a list, mark the last block
- [x] 9.4 Apply tool definitions breakpoint on last tool if combined content exceeds threshold
- [x] 9.5 Apply leading message breakpoints (skip most recent user message); enforce max 4 total
- [x] 9.6 Never mutate the input request — return new dicts/lists
- [x] 9.7 Write `python/tests/test_cache.py`:
  - Test: system string above threshold → system becomes list with `cache_control` on last block
  - Test: system below threshold → unchanged
  - Test: tools above threshold → last tool gets `cache_control`
  - Test: 4-breakpoint limit enforced with 6 eligible blocks
  - Test: `estimate_tokens("a" * 4096)` returns `1024`
  - Test: input dict is not mutated
  - Test: empty request → unchanged, empty breakpoints

## 10. TypeScript Verification

- [x] 10.1 `npm run typecheck` — zero errors
- [x] 10.2 `npm run test:coverage` — passes 90% lines/functions/statements, 85% branches thresholds
- [x] 10.3 `npm run build` — compiles to both `dist/esm/` and `dist/cjs/` without errors

## 11. Python Verification

- [x] 11.1 `mypy python/src/` — zero errors
- [x] 11.2 `pytest python/tests/test_cache.py --cov=beskar.cache --cov-fail-under=90` — passes
