## Why

The Anthropic SDK applies no prompt caching by default. Every API call re-tokenizes the system prompt, tool definitions, and any static context blocks from scratch — even when they haven't changed between turns. Cache hits save ~90% on input token cost for the cached portion. Without automatic breakpoint placement, that saving is never realized.

## What Changes

- Implement `src/cache/index.ts` — a function that takes a messages array, optional system prompt, and optional tools, then inserts `cache_control: { type: "ephemeral" }` breakpoints at optimal positions
- Respect Claude's minimum token thresholds (1024 tokens for Sonnet/Opus; callers may override via config)
- Honor the 4-breakpoint-per-request limit — only the last 4 breakpoints in a request are recognized by the API
- Prioritize stable content (system prompt, tool definitions, leading static document turns) over dynamic content (recent user messages, tool results)
- Return both the modified request and a `CacheBreakpoint[]` array describing each placement, so the metrics module can track cache activity

## Capabilities

### New Capabilities

- `cache-structurer`: Given a request (messages, system, tools), returns a new request with `cache_control` breakpoints at the highest-value positions within the 4-breakpoint limit
- `threshold-validator`: Checks whether a content block meets the minimum token threshold for the target model before applying a breakpoint

### Modified Capabilities

None — this is a new module.

## Impact

- **Creates**: `src/cache/index.ts`, `src/cache/index.test.ts`
- **Depends on**: `src/types.ts` (`CacheConfig`, `CacheBreakpoint`, `BeskarMessage`)
- **Consumed by**: `client-wrapper` change (wired into the request pipeline before each API call)
