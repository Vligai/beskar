## Context

The Anthropic caching API allows marking content blocks with `cache_control: { type: "ephemeral" }`. When the same request prefix (up to and including a marked block) appears in a subsequent call, the API returns it from cache and charges ~10% of normal input token cost for that portion.

The module must be stateless — it transforms a request object into a modified request object. No persistent state between calls is needed because the cache key is determined entirely by request content on the API side.

## Goals / Non-Goals

**Goals:**
- Automatically place breakpoints at the highest-value positions given the 4-breakpoint limit
- Never apply a breakpoint to a content block that doesn't meet the minimum token threshold
- Return `CacheBreakpoint[]` metadata so the metrics module can track cache activity
- Handle both system-as-string and system-as-ContentBlock-array formats

**Non-Goals:**
- Exact token counting — approximate counts (char/4 heuristic) are acceptable for V1; the API silently ignores breakpoints below its actual threshold
- Caching mid-conversation turns — Claude only caches from the start of the request up to a breakpoint; dynamic turns at the tail are never cacheable
- Per-model threshold auto-detection — caller provides `CacheConfig.minTokenThreshold`, or the module uses a safe default of 1024

## Decisions

### Function shape: `structureCache(request, config?) → { request, breakpoints }`

Pure function. Takes the full request params (messages, system, tools) and an optional `CacheConfig`. Returns the modified request and a list of placed `CacheBreakpoint` entries. No side effects, no mutation.

**Alternative considered:** Class with state to track breakpoints across calls. Rejected — stateless transformation is simpler to test, compose, and reason about.

### Token estimation: `Math.floor(text.length / 4)`

Claude uses roughly 4 characters per token on average. This heuristic is conservative for code (code tends to have more tokens per char) and slightly generous for prose, but never dangerously wrong. False negatives (skipping a valid breakpoint) are harmless — the optimization is just missed. False positives (applying a breakpoint to content below the API threshold) result in the API silently ignoring the breakpoint — also harmless.

**Alternative considered:** Using the API's token counting endpoint before each call. Rejected for V1 — adds an extra API round-trip and latency. Can be added as a `preciseCount: true` option in V2.

### Breakpoint placement priority

Given the 4-breakpoint limit, priority order:
1. System prompt — if provided as a block array, mark the last block; if a string, convert to a single block, apply, then serialize back
2. Tool definitions — if the tools array exists, mark after the last tool definition
3. Leading static user turns — scan messages from oldest, mark large user content blocks (e.g., documents pasted as context)
4. Any other content above threshold, from oldest to newest

Dynamic content (the most recent user message, all tool results) is never cached.

### Input immutability

Returns a new request object with `cache_control` injected via spread. The input object is never mutated.

## Risks / Trade-offs

- **Token estimation inaccuracy** → Mitigation: default threshold is 1024. If the estimate is just above 1024 but actual tokens are below, the API silently ignores the breakpoint — the only cost is a missed cache opportunity.
- **4-breakpoint limit not obvious to callers** → Mitigation: the returned `CacheBreakpoint[]` array is transparent — it only contains applied placements, so callers can see exactly what was cached.
- **System prompt as string vs. array** → Mitigation: normalize early — convert string system to a single-element array, process uniformly, then return in the same format the caller provided.

## Open Questions

- Should `tools` array breakpoints include each individual tool or just the last? Claude's API caches the prefix up to the breakpoint, so marking the last tool is sufficient to cache all preceding ones as well. Mark only the last.
- What if the system prompt and tools combined are still below threshold? Return the request unchanged, empty breakpoints array. No partial application.
