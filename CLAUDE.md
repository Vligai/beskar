# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Beskar

Beskar is a Claude-native token optimization library. It wraps the Anthropic SDK to automatically reduce token costs in agentic pipelines — through prompt caching, context pruning, tool result compression, and token metrics. It targets production agentic loops (bug bounty tools, multi-step agents, repetitive pipelines) where token waste is the primary cost driver.

**V1 scope:** prompt caching auto-structuring, context window pruning, tool result compression, token metrics layer.
**V2 scope (future):** extended thinking budget control, model routing (Sonnet vs Haiku), output filler cleanup, system prompt auditor, model-agnostic support.

## Domain Knowledge: Claude-Specific Rules

This is the core expertise Beskar encodes. Get these right.

### Prompt Caching
- Cache breakpoints are set via `cache_control: { type: "ephemeral" }` on a content block.
- Minimum cacheable size: **1024 tokens** for Sonnet/Opus, **2048 tokens** for Haiku.
- TTL: **5 minutes** for most models, **1 hour** for Claude 3.5 Sonnet and newer models when using the Batches API.
- Only the **last 4** cache breakpoints in a request are honored; earlier ones are ignored.
- Caching applies to: system prompt blocks, tool definitions, leading conversation turns. It does NOT retroactively cache mid-conversation user/assistant turns.
- Cache hits save ~90% on input token cost for the cached portion.
- Strategy: place breakpoints after stable content (system prompt, tool defs, long context docs), not after dynamic content (user messages, tool results).

### Extended Thinking
- Enabled via `thinking: { type: "enabled", budget_tokens: N }`.
- Budget range: 1,024 – 32,000 tokens (up to 100K with some models). Token usage is unpredictable and can spike.
- Thinking tokens are billed as output tokens (expensive). Visible in `usage.cache_creation_input_tokens` is separate.
- Beskar should allow per-call budget overrides and task-complexity-based toggling, not just a global on/off.

### Tool Use Format
- Tool results must use `role: "user"` with `type: "tool_result"` content blocks.
- The full tool input is echoed back in context as an assistant message — this is unavoidable overhead.
- Compressible: `tool_result` content can be truncated/summarized; only the `tool_use_id` linkage must be preserved.
- Collapsible: once a tool call chain is no longer needed for current reasoning, the full exchange can be replaced with a single summary message.

### Model Routing (V2)
- Haiku is ~20x cheaper than Sonnet per token.
- Routing signals: task classification (extraction vs. reasoning), output length expectation, presence of code generation, tool call depth.

## Architecture

Four independent modules, composable as middleware over the raw Anthropic SDK client.

```
src/
  cache/       # Prompt caching auto-structurer
  pruner/      # Context window management for agentic loops
  compressor/  # Tool result and turn compression
  metrics/     # Token usage tracking, cost estimation, cache hit rates
  client.ts    # BeskarClient — wraps Anthropic SDK, applies modules in pipeline
  types.ts     # Shared types (BeskarConfig, TokenBudget, CacheBreakpoint, etc.)
```

### Module Responsibilities

**`cache/`** — Given a messages array and system prompt, restructures content blocks to place `cache_control` breakpoints optimally. Must check minimum token thresholds before applying. Tracks which breakpoints are within the 4-breakpoint limit.

**`pruner/`** — Manages a rolling context window for long agentic loops. Strategies: sliding window (drop oldest turns), summarization (replace old turns with a compressed summary turn), semantic importance scoring (drop low-signal turns). Must never drop turns that contain unresolved tool calls.

**`compressor/`** — Intercepts tool results before they're appended to context. Strips large non-essential fields (e.g., raw HTML, verbose JSON). Collapses completed tool call chains (tool_use + tool_result pairs) into a single summary assistant message once those results are no longer referenced.

**`metrics/`** — Wraps each API call to capture `usage` from the response. Tracks: input tokens, output tokens, cache creation tokens, cache read tokens. Derives: cache hit rate, estimated cost (using current Anthropic pricing), tokens saved vs. uncached baseline.

**`client.ts`** — `BeskarClient` is the main entry point. Accepts a `BeskarConfig` that enables/configures each module. Exposes the same interface as `Anthropic.messages.create()` so it's a drop-in replacement.

## Key Design Constraints

- **Drop-in replacement** for `anthropic.messages.create()` — no user-side API changes required beyond swapping the client.
- **Non-destructive** — original message semantics must be preserved. Compression/pruning must never break tool call linkage (`tool_use_id` pairing).
- **Measurable** — every optimization must be quantifiable. The metrics module is not optional; it's how we prove Beskar works.
- **Opt-in per feature** — each module can be independently disabled. Users may want caching without pruning, etc.

## Testing Standards

**These are non-negotiable and apply to every module change:**

- Every function with logic must have a corresponding `*.test.ts` file colocated in the same directory.
- Coverage thresholds enforced in CI: **90% lines/functions/statements, 85% branches**. A task is not complete until its tests pass these thresholds locally (`npm run test:coverage`).
- `src/types.ts` and `src/index.ts` are excluded from coverage (type-only, no executable lines).
- Test files use Vitest (`describe`, `it`, `expect`). No Jest.
- For functions that call the Anthropic SDK, use `vi.mock('@anthropic-ai/sdk')` — never make real API calls in tests.

### Commands

```bash
npm test                # run all tests (no coverage)
npm run test:coverage   # run with coverage — must pass thresholds
npm run typecheck       # tsc --noEmit, zero errors required
npm run build           # compile to dist/esm/ and dist/cjs/
```

### CI Pipeline

`.github/workflows/ci.yml` runs on every push and PR to `main`:
1. Typecheck (`tsc --noEmit`)
2. Test with coverage (`vitest run --coverage`) — fails if thresholds not met
3. Build (`tsc` dual output)

Tested against Node 18, 20, and 22.

## OpenSpec Workflow

This repo uses OpenSpec for structured change management. Use the `/opsx:new` skill to start a new feature change, `/opsx:ff` to fast-forward through artifact creation, and `/opsx:apply` to implement tasks. See `.claude/commands/opsx/` for available commands.
