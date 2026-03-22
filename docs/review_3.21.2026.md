# Beskar — Full Project Review

**Date:** 2026-03-21
**Scope:** Security, Usability, Architecture
**Version reviewed:** 0.1.0 (pre-release)

---

## Executive Summary

Beskar is a well-engineered Claude-native token optimization library with clean architecture, comprehensive testing (~2.4:1 test-to-code ratio), and strong TypeScript practices. However, **three critical bugs** must be fixed before release, and several documentation errors will confuse early adopters.

**Verdict:** V1 can ship once Issues 1–3 are resolved. The library provides real value for agentic pipelines today.

---

## 1. Architecture Review

### Pipeline Design

```
Input: messages.create(params)
  → [1] Pruner        — Reduce message history (if enabled)
  → [2] Cache         — Place cache_control breakpoints (if enabled)
  → [3] Compressor    — Collapse tool chains (if enabled)
  → [4] API Call      — anthropic.messages.create()
  → [5] Metrics       — Track usage, compute costs (if enabled)
Output: Anthropic.Message response
```

**Strengths:**
- Four independent modules with clear contracts and single responsibilities
- Non-destructive transformations throughout (immutable patterns, never mutates input)
- Drop-in replacement for SDK — same `messages.create()` interface, zero learning curve
- Composable — each module independently enabled/disabled via config (`{}` enables, `false` disables)
- Single peer dependency (Anthropic SDK) — minimal supply chain surface

**Weaknesses:**
- Pipeline order is hardcoded in `client.ts` — not configurable or reorderable
- No middleware/plugin architecture for extending with custom steps
- Compressor runs _before_ the API call, so it can't compress the current response's tool results (only historical ones) — this is correct behavior but not documented

### Module Analysis

#### Cache (`src/cache/index.ts`)
- Places `cache_control: { type: "ephemeral" }` on stable content (system → tools → leading user messages)
- Respects 4-breakpoint limit (Claude API constraint)
- Token estimation: `Math.floor(chars / 4)` — reasonable for English, biased for code/CJK
- **Bug:** System array threshold checks only last block's tokens, not total (Issue 3)

#### Pruner (`src/pruner/index.ts`)
- Three strategies: `sliding-window`, `summarize`, `importance`
- Tool pair integrity always preserved (never splits `tool_use`/`tool_result` pairs)
- Importance scoring: `recency (0.5) + toolBonus (0.3) + contentLength (0.2)`
- **Stub:** `summarize` strategy inserts a placeholder string, not an LLM summary (Issue 4)
- **Unused field:** `PrunerConfig.summaryModel` declared but never read

#### Compressor (`src/compressor/index.ts`)
- `compressToolResult()` — truncates tool results above token limit, preserves `tool_use_id`
- `collapseToolChains()` — replaces old tool call pairs with summary messages
- **Critical:** `compressToolResult()` is never called in the pipeline (Issue 1)
- **Limitation:** `collapseToolChains` only handles single-tool turns; multi-tool turns silently skipped (Issue 8)

#### Metrics (`src/metrics/index.ts`)
- Tracks: input/output/cache-creation/cache-read tokens, call count
- Derives: cache hit rate, estimated cost, estimated savings
- **Problem:** Hardcoded Sonnet 3.5 pricing — Haiku costs reported at ~3.75× actual, Opus at ~0.2× actual (Issue 5)

#### Client (`src/client.ts`)
- ~80 lines, clean orchestration of all modules
- Factory pattern: creates Anthropic SDK instance from config
- Exposes `.messages.create()` and `.metrics.summary()`

### Architecture Score: **7.5/10**
Clean and well-structured. Loses points for dead code in the pipeline and hardcoded pricing.

---

## 2. Security Review

### Threat Model

Beskar is a client-side middleware library that transforms API requests before forwarding them. It does not expose network endpoints, store data persistently, or handle authentication beyond passing an API key to the underlying SDK.

### Findings

| Check | Status | Notes |
|-------|--------|-------|
| Secrets in code | Pass | No hardcoded keys or tokens |
| API key handling | Pass | Passed directly to Anthropic SDK constructor, never logged or stored |
| Input validation | Pass | Delegated to SDK; Beskar performs structural transforms only |
| Type safety | Pass | `strict: true` in tsconfig, no `any` casts |
| Injection risks | Pass | No string interpolation in API calls, no template injection vectors |
| Sensitive data logging | Pass | No logging of message content, tool results, or API responses |
| Dependency surface | Pass | Single peer dependency (`@anthropic-ai/sdk`) — minimal attack surface |
| `.gitignore` coverage | Pass | `.env`, credentials, IDE files properly excluded |
| Supply chain | Pass | No postinstall scripts, no dynamic requires |

### Potential Concerns (Low Risk)

1. **Token estimation as a side channel:** `estimateTokens()` is deterministic and based on `text.length / 4`. If an attacker controls message content, they could craft inputs that bypass cache thresholds. Impact: suboptimal caching, not a security vulnerability.

2. **Summary injection:** When `collapseToolChains` replaces tool results with summary text (`[Tool call: ... → result truncated]`), the summary is constructed from `tool_use.input`. If tool inputs contain adversarial content, the summary could carry it forward in context. Impact: low, as the content was already in context before compression.

3. **No rate limiting or circuit breaking:** Beskar passes all calls through to the SDK. A misconfigured pruner or compressor could theoretically expand context (unlikely given immutability guarantees) but cannot cause runaway API calls beyond what the caller initiates.

### Security Score: **9/10**
Excellent security posture for a middleware library. The thin abstraction layer and delegation to the SDK minimize the attack surface.

---

## 3. Usability Review

### Getting Started Experience

**README.md has critical documentation errors** (Issue 2):
```typescript
// README shows (WRONG):
cache: { enabled: true }
compressor: { enabled: true, maxToolResultTokens: 500 }
metrics: { enabled: true }

// Actual API (CORRECT):
cache: {}
compressor: { maxToolResultTokens: 500 }
metrics: {}
```

A new user copying the README example will hit TypeScript errors immediately. This is the single biggest usability blocker.

### Configuration API

**Strengths:**
- Intuitive enable/disable pattern: `{}` enables with defaults, `false` disables, omit to skip
- Flat config shape — no nested builder patterns or fluent APIs
- `BeskarClient` constructor accepts optional `apiKey` (falls back to `ANTHROPIC_API_KEY` env var)

**Weaknesses:**
- `PrunerConfig.summaryModel` exists in the type but does nothing — misleading
- `CacheConfig.minTokenThreshold` defaults to 1024 but Haiku requires 2048 — no model-aware defaulting
- No config validation or helpful error messages for invalid combinations
- No way to know which modules are active after construction

### Developer Experience

**Strengths:**
- Drop-in replacement: swap `anthropic.messages.create()` → `client.messages.create()`
- `.metrics.summary()` gives immediate visibility into optimization impact
- `docs/index.md` is an excellent codebase reference (load once, skip reading source files)

**Weaknesses:**
- `compressToolResult()` feature silently does nothing (Issue 1) — users set `maxToolResultTokens`, see no effect, assume the library is broken
- `summarize` pruner strategy silently inserts a placeholder instead of a real summary (Issue 4) — users lose context without knowing why
- No debug/verbose mode to see what transformations were applied
- No TypeDoc or API reference beyond source code comments

### Error Handling

- Errors from the Anthropic SDK propagate unchanged — correct for middleware
- No try/catch wrapping means stack traces point to SDK internals, not Beskar
- No custom error types for Beskar-specific failures (e.g., "pruner removed all messages")

### Usability Score: **6/10**
Good API design undermined by documentation errors and silent failures. Fixing Issues 1–2 and adding basic logging would significantly improve this score.

---

## 4. Testing Review

### Coverage & Quality

| Metric | Value |
|--------|-------|
| Source lines (non-test) | ~500 |
| Test lines | ~1,200 |
| Test-to-code ratio | 2.4:1 |
| Coverage target | 90% lines/functions/statements, 85% branches |
| CI matrix | Node 18, 20, 22 |
| Framework | Vitest |

**Strengths:**
- Every module has colocated `*.test.ts` files
- Integration tests in `client.test.ts` mock the SDK properly (`vi.mock`)
- Edge cases well-covered: orphaned tool calls, empty arrays, tool pair preservation, immutability verification
- Coverage thresholds enforced in CI — PR cannot merge below threshold

**Issues:**
- Two `it()` blocks in `src/cache/index.test.ts` (lines 144–188) are orphaned outside any `describe` block — tests run but output is ungrouped (Issue 7)
- `compressToolResult()` has full test coverage but is dead code in the pipeline — tests give false confidence
- No end-to-end tests with real message sequences (multi-turn agent loops)
- No performance/benchmark tests for large context windows

### Testing Score: **8/10**
Comprehensive unit tests with enforced thresholds. Loses points for the dead code testing gap and lack of integration scenarios.

---

## 5. Critical Issues

### Issue 1: `compressToolResult()` is Dead Code — **CRITICAL**

**File:** `src/client.ts` (Step 3)
**Problem:** `compressToolResult()` is implemented, exported, and tested — but never called in the client pipeline. Only `collapseToolChains()` executes. The `maxToolResultTokens` config setting silently does nothing.

**Impact:** Tool result truncation feature is non-functional. Users who configure it see no effect.

**Fix:** Add a tool result compression pass in Step 3 before `collapseToolChains()`:
```typescript
// Step 3 — Compressor
if (self.config.compressor) {
  // Compress individual tool results first
  messages = messages.map(msg => {
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map(block =>
          block.type === 'tool_result'
            ? compressToolResult(block, self.config.compressor)
            : block
        ),
      };
    }
    return msg;
  });
  // Then collapse completed chains
  messages = collapseToolChains(messages, self.config.compressor);
}
```

---

### Issue 2: README Examples Use Non-Existent Config Fields — **CRITICAL**

**File:** `README.md`, lines 90–95
**Problem:** Examples show `{ enabled: true }` for cache/compressor/metrics — this field doesn't exist in the type definitions. Users copying the example get TypeScript errors.

**Fix:** Replace with correct syntax:
```typescript
const client = new BeskarClient({
  apiKey: process.env.ANTHROPIC_API_KEY,
  cache: {},
  pruner: { strategy: 'sliding-window', maxTurns: 20 },
  compressor: { maxToolResultTokens: 500 },
  metrics: {},
});
```

---

### Issue 3: System Array Cache Threshold Checks Only Last Block — **HIGH**

**File:** `src/cache/index.ts`, lines 43–53
**Problem:** When checking whether a system prompt array meets the minimum token threshold for caching, only the last block's token count is checked — not the total across all blocks.

**Impact:** System prompts with many small blocks (e.g., 10 blocks × 200 tokens = 2000 total) won't get cache breakpoints even though they exceed the 1024-token minimum.

**Fix:** Sum tokens across all system blocks before checking threshold:
```typescript
const totalTokens = system.reduce((sum, block) => sum + estimateTokens(block.text), 0);
if (totalTokens >= threshold) { /* place breakpoint on last block */ }
```

---

## 6. High-Priority Issues

### Issue 4: `summarize` Strategy is an Undocumented Stub

**File:** `src/pruner/index.ts`, lines 71–82
**Problem:** Returns `[Previous context: N turns summarized]` literal string — no LLM call, no semantic compression. `PrunerConfig.summaryModel` field is declared but unused.

**Recommendation:** Add JSDoc marking it as a placeholder. Document in README that `summarize` is a V2 feature.

### Issue 5: Hardcoded Sonnet 3.5 Pricing

**File:** `src/metrics/index.ts`, lines 4–9
**Problem:** All cost estimates use Sonnet 3.5 rates ($3/$15 per MTok). Haiku ($0.80/$4) and Opus ($15/$75) users get wildly inaccurate cost reporting.

**Recommendation:** Build a `PRICING_BY_MODEL` map, read `params.model` in the pipeline, pass to metrics tracker.

### Issue 6: Token Estimator is English-Biased

**Files:** `src/cache/index.ts:15`, `src/compressor/index.ts:27`
**Problem:** `Math.floor(text.length / 4)` underestimates tokens for code (~15%), JSON (~20%), and CJK text (~50%).

**Recommendation:** Accept for V1 with documentation. Allow custom `estimateTokens` function in V2 config.

---

## 7. Medium-Priority Issues

| # | Issue | File | Severity |
|---|-------|------|----------|
| 7 | Orphaned `it()` blocks outside `describe` | `cache/index.test.ts:144–188` | Low |
| 8 | `collapseToolChains` silently skips multi-tool turns | `compressor/index.ts:70` | Low |
| 9 | Duplicate `estimateTokens` in cache + compressor | Two files | Low |
| 10 | No debug/verbose mode for transformation visibility | `client.ts` | Medium |
| 11 | No custom error types for Beskar-specific failures | All modules | Low |

---

## 8. Positive Findings

### What's Done Well

1. **Immutability discipline** — Every transformation returns a new array/object. Input is never mutated. This eliminates an entire class of bugs in middleware libraries.

2. **Tool pair integrity** — The pruner _never_ splits a `tool_use`/`tool_result` pair. `findToolPairs()` builds a map and all three pruning strategies consult it. This is the hardest invariant to maintain and it's handled correctly.

3. **Test coverage culture** — 90% threshold enforced in CI, 2.4:1 test-to-code ratio, edge cases covered. This is well above industry average for a pre-release library.

4. **Minimal dependency surface** — Single peer dependency on `@anthropic-ai/sdk`. No runtime deps. Minimal supply chain risk.

5. **Domain knowledge encoded** — CLAUDE.md captures Claude-specific caching rules (4-breakpoint limit, model-specific thresholds, TTL behavior) that aren't in the Anthropic docs in one place. This is institutional knowledge that would otherwise be lost.

6. **Dual build output** — ESM and CJS with proper `package.json` generation for CJS. Works in Node, bundlers, and legacy environments.

---

## 9. Scores Summary

| Dimension | Score | Notes |
|-----------|-------|-------|
| Architecture | 7.5/10 | Clean modules, dead code in pipeline |
| Security | 9/10 | Excellent for a middleware library |
| Usability | 6/10 | Good API, bad docs, silent failures |
| Testing | 8/10 | Comprehensive, minor structural issues |
| **Overall** | **7.5/10** | **Ship-ready after fixing Issues 1–3** |

---

## 10. Recommendations by Priority

### Must Fix (Before Any Release)
1. Wire `compressToolResult()` into the pipeline (Issue 1)
2. Fix README config examples (Issue 2)
3. Fix system array token threshold check (Issue 3)

### Should Fix (Before V1 Stable)
4. Document `summarize` as a stub with JSDoc
5. Add per-model pricing map
6. Document Haiku's 2048-token cache threshold requirement

### Nice to Have (V1.x)
7. Fix orphaned test blocks
8. Document multi-tool turn limitation
9. Extract shared `estimateTokens` utility
10. Add debug/verbose logging mode

### V2 Roadmap Items
11. Real LLM-based summarization (V2.1)
12. Model routing — Haiku vs Sonnet (V2.3)
13. Streaming support (V2.7)
14. Custom token estimation functions
