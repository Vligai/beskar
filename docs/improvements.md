# Beskar — Code Review: Improvement Suggestions

Review date: 2026-03-01. All issues found by reading source against CLAUDE.md spec and domain rules.

Severity levels: **Critical** (wrong behavior), **High** (user-facing accuracy/usability gap), **Medium** (correctness concern under edge cases), **Low** (code quality / future friction).

---

## Issue 1 — `compressToolResult` is dead code in the pipeline

**Severity: Critical**
**File:** `src/client.ts:52–55`, `src/compressor/index.ts:6–49`

`compressToolResult()` is implemented, tested, and exported, but never called in `client.ts`. Step 3 of the pipeline only calls `collapseToolChains()`. Tool result truncation silently does nothing regardless of `maxToolResultTokens` config.

**Fix:** Add a pass in Step 3 that iterates over all messages, finds `tool_result` blocks in user messages, and applies `compressToolResult()` to each before calling `collapseToolChains()`.

---

## Issue 2 — README usage examples use non-existent config fields

**Severity: Critical**
**File:** `README.md:91–95`

The TypeScript usage example shows:
```ts
cache: { enabled: true },
compressor: { enabled: true, maxToolResultTokens: 500 },
metrics: { enabled: true },
```

None of these types have an `enabled` field. `CacheConfig`, `CompressorConfig`, and `MetricsConfig` use `false` at the outer level to disable (e.g., `cache: false`), not an inner `enabled` flag. This will confuse users who copy-paste the README example — TypeScript will type-error, or in looser setups, the unknown field will silently be ignored.

**Correct usage:**
```ts
cache: {},
compressor: { maxToolResultTokens: 500 },
metrics: {},
```

**Fix:** Update README examples to match actual types.

---

## Issue 3 — `summarize` pruner strategy is an undocumented stub

**Severity: High**
**File:** `src/pruner/index.ts:71–82`

The `summarize` strategy does not summarize. It drops old turns and prepends a literal string:
```
[Previous context: 4 turns summarized]
```
The `summaryModel` field in `PrunerConfig` is never read. A user who configures `strategy: 'summarize'` expecting semantic compression will get silent context loss.

**Fix (near-term):** Add a JSDoc comment on the exported function and in `types.ts` stating that `summarize` currently inserts a placeholder. Mark `summaryModel` as reserved for future use.

**Fix (V2.1):** Implement actual LLM-based summarization as described in the roadmap.

---

## Issue 4 — System array caching checks last-block tokens, not total

**Severity: High**
**File:** `src/cache/index.ts:43–53`

When the system prompt is an array of blocks, the threshold check reads:
```ts
const tokens = estimateTokens(system[lastIdx].text);
if (tokens >= threshold) { /* place breakpoint */ }
```

This checks only the last block's character count. A system prompt with ten small blocks totaling 5000 tokens but a last block of 100 tokens will not get a cache breakpoint, even though placing one on the last block would cache all 5000 tokens.

The breakpoint on the last block caches all content before it too — so the threshold test should be on the total system token count, not just the last block.

**Fix:**
```ts
const totalTokens = system.reduce((sum, block) => sum + estimateTokens(block.text), 0);
if (totalTokens >= threshold) { /* place breakpoint on last block */ }
```

---

## Issue 5 — Token estimator is English-biased

**Severity: Medium**
**File:** `src/cache/index.ts:15–17`, `src/compressor/index.ts:27`

`estimateTokens` and the inline estimate in `compressToolResult` both use `text.length / 4`. This is a reasonable approximation for English prose (~4 chars per token on average), but diverges significantly in practice:

- **Code:** Often tokenizes more densely (whitespace, identifiers). Off by 10–25%.
- **JSON:** Mixed — property names and strings are English-like, but structural chars inflate it. Off by ~20%.
- **Non-ASCII / CJK:** A single Chinese character counts as 1 `text.length` unit but is typically 1–2 tokens. Severely underestimates token count, potentially leading to missed cache opportunities.

For V1 this is acceptable. For V2 it should be addressable via an optional user-provided token counter:

```ts
cache?: {
  minTokenThreshold?: number
  estimateTokens?: (text: string) => number  // custom estimator
} | false
```

---

## Issue 6 — Pricing constants are model-agnostic

**Severity: Medium**
**File:** `src/metrics/index.ts:4–9`

`PRICING` uses Sonnet 3.5 rates and is applied to all models:
```ts
export const PRICING = {
  inputPerMToken: 3.0,
  outputPerMToken: 15.0,
  cacheCreationPerMToken: 3.75,
  cacheReadPerMToken: 0.3,
};
```

When BeskarClient is used with Haiku ($0.80/$4 per MTok) or Opus ($15/$75 per MTok), reported costs are incorrect by a factor of 3–5×. `estimatedCostUsd` and `estimatedSavingsUsd` in `MetricsSummary` become misleading.

**Fix:** Build a `PRICING_BY_MODEL` map and read the model from `params.model` inside `client.ts`, passing it to `tracker.track()`. Fall back to Sonnet rates for unknown models.

---

## Issue 7 — No streaming support

**Severity: Medium (adoption blocker)**
**File:** `src/client.ts:15`

`messages.create()` only accepts `MessageCreateParamsNonStreaming`. Users who rely on streaming (common in latency-sensitive agentic UIs) cannot use BeskarClient for those calls. They must bypass the wrapper, losing all optimization.

This is a known gap for V2.7. However, documenting it explicitly in `README.md` would prevent user confusion.

---

## Issue 8 — Test file structure: orphaned `it()` blocks in cache tests

**Severity: Low**
**File:** `src/cache/index.test.ts:144–188`

Two `it()` calls appear at the top level of the file, outside any `describe` block. They were likely meant to be inside `describe('structureCache — message breakpoints', ...)` (line 113) but a closing `}` was placed prematurely at line 142.

Vitest will still run these tests (it supports top-level `it()`), but they will not be grouped under a describe and will appear disconnected in test output. Test reporters and coverage tools may also handle them inconsistently.

**Fix:** Move the two orphaned `it()` calls (lines 144–188) inside the `describe('structureCache — message breakpoints', ...)` block by removing the premature closing brace at line 142 and adding it after line 188.

---

## Issue 9 — `collapseToolChains` skips multi-tool turns silently

**Severity: Low**
**File:** `src/compressor/index.ts:70–71`

Only single-tool-use assistant turns are collapsed:
```ts
if (toolUseBlocks.length === 1) {
```

In practice, agents often issue multiple parallel tool calls in one turn (e.g., fetching 3 URLs simultaneously). Those chains are never collapsed regardless of `collapseAfterTurns`. The behavior is silently inconsistent: some old tool chains get collapsed, others don't, depending on how many tools were called per turn.

This is a reasonable V1 simplification but should be documented (JSDoc on `collapseToolChains` and in the config type for `collapseAfterTurns`).

---

## Issue 10 — `metrics.track()` skipped when `metrics: false`, but tracker always created

**Severity: Low (minor inefficiency)**
**File:** `src/client.ts:25`, `src/client.ts:66–68`

```ts
this.tracker = createMetricsTracker(config.metrics || undefined);
```

The tracker is always instantiated, even when `metrics: false`. This is intentional (so `client.metrics.summary()` always works), but when `metrics: false` the `track()` call is guarded away, so the tracker accumulates nothing. The `config.metrics || undefined` coercion converts `false` → `undefined`, which is fine. No bug, just worth knowing.

---

## Issue 11 — Haiku cache threshold not defaulted by model

**Severity: Low**
**File:** `src/cache/index.ts:27`, `src/types.ts:8–10`

Claude docs: minimum cacheable size is **1024 tokens for Sonnet/Opus** and **2048 for Haiku**. `CacheConfig.minTokenThreshold` defaults to 1024. If a user calls BeskarClient with a Haiku model and cache enabled but no explicit threshold, Beskar will attempt to cache blocks below the actual Haiku minimum, wasting cache breakpoints.

**Fix (simple):** Document this in `CacheConfig` JSDoc. **Fix (proper):** Accept a `model` hint in BeskarClient constructor and auto-set the threshold based on model family.

---

## Quick Wins (low effort, high value)

In order of effort:

1. Fix README usage examples (Issue 2) — 5-minute edit
2. Document `summarize` stub in types.ts (Issue 3) — 5-minute edit
3. Add JSDoc to `collapseToolChains` about multi-tool limitation (Issue 9) — 5-minute edit
4. Fix test structure in `cache/index.test.ts` (Issue 8) — move 2 `it()` blocks
5. Fix system array threshold check (Issue 4) — 3-line change
6. Wire `compressToolResult` into the pipeline (Issue 1) — ~15 lines in `client.ts`
