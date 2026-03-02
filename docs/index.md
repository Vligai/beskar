# Beskar — Codebase Index

> Token-efficient reference. Load this file instead of reading raw source when using Claude Code on this repo.

---

## Project at a Glance

**Purpose:** Drop-in wrapper over `anthropic.messages.create()` that auto-reduces token costs in agentic pipelines via prompt caching, context pruning, tool result compression, and token metrics.

**Stack:** TypeScript (ESM + CJS dual build), Node 18+. Python stub exists (`python/`) but has no source files yet.

**Version:** 0.1.0 (V1). V2 features are roadmapped — see `docs/roadmap.md`.

---

## File Map

```
src/
  types.ts           # Shared types only — no logic, excluded from coverage
  index.ts           # Public re-exports only — no logic, excluded from coverage
  client.ts          # BeskarClient — pipeline orchestrator
  client.test.ts     # Integration tests for BeskarClient (mocks SDK)
  cache/
    index.ts         # structureCache(), estimateTokens()
    index.test.ts    # Unit tests for cache module
  pruner/
    index.ts         # pruneMessages(), findToolPairs(), scoreMessage()
    index.test.ts    # Unit tests for pruner module
  compressor/
    index.ts         # compressToolResult(), collapseToolChains()
    index.test.ts    # Unit tests for compressor module
  metrics/
    index.ts         # createMetricsTracker(), mapUsage(), estimateCostUsd(), estimateSavingsUsd(), PRICING
    index.test.ts    # Unit tests for metrics module

python/
  pyproject.toml     # Python package config (no source files yet)

docs/
  index.md           # This file
  roadmap.md         # V1 assessment + V2 feature roadmap
  improvements.md    # Code review findings and suggested fixes

CLAUDE.md            # Domain knowledge + architecture guide (authoritative)
vitest.config.ts     # Coverage thresholds: 90% lines/functions/statements, 85% branches
package.json         # Scripts: test, test:coverage, typecheck, build
```

---

## Config Shape (BeskarConfig)

```ts
{
  apiKey?: string

  cache?: {
    minTokenThreshold?: number   // default: 1024. Haiku needs 2048
  } | false

  pruner?: {
    strategy: 'sliding-window' | 'summarize' | 'importance'
    maxTurns?: number
    summaryModel?: string        // declared but not yet used — summarize is a stub
  } | false

  compressor?: {
    maxToolResultTokens?: number  // truncate tool results above this token count
    collapseAfterTurns?: number   // collapse tool pairs older than N turns from end
  } | false

  metrics?: {
    onUsage?: (usage: TokenUsage) => void
  } | false
}
```

**To disable a module:** set it to `false`. **To enable with defaults:** pass `{}`.

---

## Pipeline Order in client.ts

```
messages.create(params)
  → [1] pruneMessages()           if config.pruner
  → [2] structureCache()          if config.cache
  → [3] collapseToolChains()      if config.compressor
  → [4] anthropic.messages.create()
  → [5] tracker.track(usage)      if config.metrics
  → return response
```

---

## Key Exports (src/index.ts)

- `BeskarClient` — main class
- Types: `BeskarConfig`, `BeskarMessage`, `CacheBreakpoint`, `CacheConfig`, `CompressorConfig`, `MetricsConfig`, `MetricsSummary`, `PrunerConfig`, `PrunerStrategy`, `TokenUsage`

---

## Module Contracts

### cache/index.ts
- `estimateTokens(text)` → `Math.floor(text.length / 4)` (rough, English-optimized)
- `structureCache(request, config?)` → `{ request, breakpoints }`
  - Places `cache_control: { type: "ephemeral" }` on stable content
  - Honors 4-breakpoint limit; skips most-recent user message
  - Order of attempt: system → tools → leading user messages
  - Immutable — never mutates input

### pruner/index.ts
- `findToolPairs(messages)` → `Map<id, { useIndex, resultIndex }>`
- `scoreMessage(msg, index, total)` → `0.0–1.0` (recency 0.5 + toolBonus 0.3 + length 0.2)
- `pruneMessages(messages, config)` → new array
  - `sliding-window`: drops oldest, shifts cut to never split tool pairs
  - `summarize`: drops oldest, prepends placeholder summary message (NOT an LLM call — stub)
  - `importance`: drops lowest-scored units, keeps tool pairs atomic
  - Never drops below 1 message; always returns new array reference

### compressor/index.ts
- `compressToolResult(block, config)` → truncated block (preserves tool_use_id)
  - Only active when `maxToolResultTokens` is set
  - Handles string content and array content (preserves non-text blocks)
- `collapseToolChains(messages, config)` → new messages array
  - Only active when `collapseAfterTurns` is set
  - Only collapses single-tool-use turns (multi-tool turns are skipped)
  - Threshold: `distanceFromEnd > collapseAfterTurns`

### metrics/index.ts
- `PRICING` — hardcoded Sonnet 3.5 rates (`$3/$15/$3.75/$0.30` per MTok) — no per-model routing
- `mapUsage(raw)` → `TokenUsage` (null-safe for cache fields)
- `estimateCostUsd(usage)` → USD float
- `estimateSavingsUsd(usage)` → savings from cache reads only (not pruning/compression)
- `createMetricsTracker(config?)` → `{ track(raw), summary() }`
  - `track()` returns per-call `TokenUsage`
  - `summary()` returns cumulative `MetricsSummary`
  - Always accessible even when `metrics: false` (returns zeros)

---

## Critical Invariants

1. **Tool pair integrity** — never drop a `tool_use` message without its `tool_result` and vice versa. `findToolPairs()` is the shared utility.
2. **4-breakpoint limit** — only 4 `cache_control` breakpoints per request are honored by Claude.
3. **Skip last user message** for caching — dynamic content; would never cache-hit.
4. **BeskarMessage = Anthropic.MessageParam** — type alias only, not a wrapper. SDK type changes surface at compile time.
5. **Non-destructive** — all transformations return new objects/arrays.

---

## Commands

```bash
npm test                # run tests (no coverage)
npm run test:coverage   # run with coverage — must hit thresholds
npm run typecheck       # tsc --noEmit
npm run build           # dual ESM + CJS output to dist/
```

---

## Known Issues (see docs/improvements.md for detail)

1. README usage examples show `cache: { enabled: true }` — field doesn't exist; should be `cache: {}`
2. `summarize` pruning strategy is a stub — inserts placeholder, no actual LLM summarization
3. `estimateTokens` is English-biased; fails for code-heavy or non-ASCII content
4. Pricing constants are model-agnostic (Sonnet 3.5 rates applied to all models)
5. No streaming support — `messages.create()` is NonStreaming only
6. System array caching checks last-block tokens, not total array tokens
7. `compressToolResult()` is never called in the client pipeline (only `collapseToolChains` is)
8. Two `it()` calls in `cache/index.test.ts` are outside any `describe` block (lines 144–188)
9. Python package has no source files
