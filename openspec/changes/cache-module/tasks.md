## 1. Token Estimation

- [ ] 1.1 Implement `estimateTokens(text: string): number` using `Math.floor(text.length / 4)` — export it so tests can exercise it directly
- [ ] 1.2 Test: `estimateTokens("a".repeat(4096))` returns `1024`
- [ ] 1.3 Test: `estimateTokens("")` returns `0`

## 2. Core `structureCache` Function

- [ ] 2.1 Create `src/cache/index.ts` and export `structureCache(request: CacheStructureRequest, config?: CacheConfig): CacheStructureResult`
- [ ] 2.2 Define `CacheStructureRequest` locally: `{ messages: BeskarMessage[], system?: string | Anthropic.TextBlockParam[], tools?: Anthropic.Tool[] }`
- [ ] 2.3 Define `CacheStructureResult` locally: `{ request: CacheStructureRequest, breakpoints: CacheBreakpoint[] }`
- [ ] 2.4 Read `minTokenThreshold` from `config?.minTokenThreshold` — default to `1024` if absent
- [ ] 2.5 Track placed breakpoints count — stop placing once count reaches 4

## 3. System Prompt Breakpoint

- [ ] 3.1 If `system` is a string, serialize it to estimate tokens; if above threshold, convert to a single `TextBlockParam` with `cache_control` and return as array
- [ ] 3.2 If `system` is already a `TextBlockParam[]`, add `cache_control` to the last block if its text exceeds threshold
- [ ] 3.3 Test: system string above threshold → returned request has system as array with `cache_control` on last block
- [ ] 3.4 Test: system string below threshold → returned request has system unchanged, no breakpoint placed

## 4. Tool Definitions Breakpoint

- [ ] 4.1 If `tools` is provided and non-empty, compute combined estimated token count across all tool descriptions + schemas
- [ ] 4.2 If combined count exceeds threshold and breakpoint limit not reached, add `cache_control` to the last tool in the array
- [ ] 4.3 Test: tools array above threshold → last tool gets `cache_control`
- [ ] 4.4 Test: tools array below threshold → no breakpoint placed on tools

## 5. Leading Message Breakpoints

- [ ] 5.1 Scan messages from oldest to newest; for each user turn with large text content blocks, add `cache_control` to the last content block of that turn if it exceeds threshold and limit not reached
- [ ] 5.2 Skip the most recent user message (dynamic — not cacheable in practice)
- [ ] 5.3 Test: old user message with large content above threshold gets a breakpoint
- [ ] 5.4 Test: most recent user message is never given a breakpoint

## 6. 4-Breakpoint Limit

- [ ] 6.1 Track placed breakpoints across system, tools, and messages; stop placing once 4 are applied
- [ ] 6.2 Test: request with 6 eligible blocks results in exactly 4 breakpoints placed
- [ ] 6.3 Test: returned `CacheStructureResult.breakpoints` length matches the number actually placed

## 7. Immutability

- [ ] 7.1 Use spread/Object.assign to build new objects; never mutate input `request`, `messages`, or content blocks
- [ ] 7.2 Test: original request object is identical (deep equal) after `structureCache` returns

## 8. Edge Cases

- [ ] 8.1 Test: empty messages array, no system, no tools → returns original request unchanged, empty breakpoints array
- [ ] 8.2 Test: all content below threshold → returns original request unchanged, empty breakpoints array
- [ ] 8.3 Test: custom `minTokenThreshold: 2048` → only blocks above 2048 get breakpoints

## 9. Python Implementation (`python/src/beskar/cache.py`)

- [ ] 9.1 Implement `estimate_tokens(text: str) -> int` using `len(text) // 4`
- [ ] 9.2 Implement `structure_cache(request: CacheRequest, config: CacheConfig | None = None) -> CacheResult` — same logic as TypeScript; `CacheRequest` is a `TypedDict`, `CacheResult` is a dataclass with `request` and `breakpoints: list[CacheBreakpoint]`
- [ ] 9.3 Apply system prompt breakpoint: if `system` is a string above threshold, convert to a list with `cache_control` on the last block; if already a list, mark the last block
- [ ] 9.4 Apply tool definitions breakpoint on last tool if combined content exceeds threshold
- [ ] 9.5 Apply leading message breakpoints (skip most recent user message); enforce max 4 total
- [ ] 9.6 Never mutate the input request — return new dicts/lists
- [ ] 9.7 Write `python/tests/test_cache.py`:
  - Test: system string above threshold → system becomes list with `cache_control` on last block
  - Test: system below threshold → unchanged
  - Test: tools above threshold → last tool gets `cache_control`
  - Test: 4-breakpoint limit enforced with 6 eligible blocks
  - Test: `estimate_tokens("a" * 4096)` returns `1024`
  - Test: input dict is not mutated
  - Test: empty request → unchanged, empty breakpoints

## 10. TypeScript Verification

- [ ] 10.1 `npm run typecheck` — zero errors
- [ ] 10.2 `npm run test:coverage` — passes 90% lines/functions/statements, 85% branches thresholds
- [ ] 10.3 `npm run build` — compiles to both `dist/esm/` and `dist/cjs/` without errors

## 11. Python Verification

- [ ] 11.1 `mypy python/src/` — zero errors
- [ ] 11.2 `pytest python/tests/test_cache.py --cov=beskar.cache --cov-fail-under=90` — passes
