# Beskar

**Claude-native token optimization for agentic pipelines.**

Beskar wraps the Anthropic SDK to automatically cut token costs in production agentic loops — through intelligent prompt caching, context pruning, tool result compression, and a metrics layer that proves what you're saving.

Named after the near-indestructible Mandalorian alloy. Token-efficient by design.

---

## The Problem

Agentic pipelines burn tokens in predictable, fixable ways:

- The same system prompt and tool definitions are re-tokenized on every turn
- Long conversation histories accumulate with no pruning strategy
- Tool results carry full verbose payloads even after they're no longer useful
- Extended thinking mode can spike costs unpredictably
- Sonnet runs tasks that Haiku could handle at 1/20th the price

In a high-volume pipeline — bug bounty tooling, research agents, code generation loops — this waste compounds fast. Beskar fixes it at the SDK layer, before your application code sees it.

---

## V1 Features

### Prompt Caching Auto-Structurer
Automatically places `cache_control` breakpoints at the optimal positions in your messages array. Respects Claude's minimum token thresholds (1024 tokens for Sonnet/Opus, 2048 for Haiku), honors the 4-breakpoint limit, and prioritizes stable content (system prompt, tool definitions, long context documents) over dynamic content. Cache hits cut input costs by ~90% on the cached portion.

### Context Window Pruner
Manages rolling context for long agentic loops. Configurable strategies: sliding window (drop oldest turns), summarization (collapse old turns into a summary message), or importance scoring. Preserves tool call integrity — never drops a `tool_use` turn without its corresponding `tool_result`.

### Tool Result Compressor
Intercepts tool results before they're appended to context. Strips non-essential fields, truncates oversized payloads, and collapses completed tool call chains into summarized form once they're no longer needed for active reasoning. Preserves `tool_use_id` linkage throughout.

### Token Metrics Layer
Wraps every API call to capture the `usage` object from Claude's response. Tracks input tokens, output tokens, cache creation tokens, and cache read tokens. Derives cache hit rate, estimated cost (by model), and tokens saved vs. an uncached baseline. Makes optimization measurable.

---

## Usage

Beskar is a drop-in replacement for `anthropic.messages.create()`.

```typescript
import { BeskarClient } from 'beskar';

const client = new BeskarClient({
  apiKey: process.env.ANTHROPIC_API_KEY,
  cache: { enabled: true },
  pruner: { strategy: 'sliding-window', maxTurns: 20 },
  compressor: { enabled: true, maxToolResultTokens: 500 },
  metrics: { enabled: true },
});

const response = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  system: 'You are a security researcher...',
  messages: conversationHistory,
});

console.log(client.metrics.summary());
// { cacheHitRate: 0.87, estimatedCost: '$0.0023', tokensSaved: 14200 }
```

---

## Roadmap

**V2 — After V1 ships with real usage data:**

- **Extended thinking budget control** — Per-call thinking budgets with task-complexity detection to toggle thinking contextually rather than globally
- **Model routing** — Automatically route subtasks to Haiku vs. Sonnet based on complexity signals (extraction vs. reasoning, output length, tool depth)
- **Output filler cleanup** — Post-processor trained on Claude's characteristic filler patterns ("Certainly!", disclaimer stacking) for reliable cleanup
- **System prompt auditor** — Scores and rewrites system prompts for token efficiency without degrading behavior
- **Model-agnostic support** — Abstract the Claude-specific layer to support other providers in V2

---

## License

MIT © 2026 Vlad Ligai
