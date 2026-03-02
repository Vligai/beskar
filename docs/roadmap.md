# Beskar Roadmap

---

## V1 Status Assessment

### What ships in V1

| Module | Status | Notes |
|--------|--------|-------|
| Prompt cache auto-structurer | Complete | 4-breakpoint limit respected; system/tools/messages all handled |
| Context pruner — sliding-window | Complete | Tool pair integrity preserved |
| Context pruner — importance | Complete | Atomic pair dropping |
| Context pruner — summarize | Stub | Placeholder string only; no LLM call |
| Tool result compressor (truncation) | Complete | `compressToolResult` implemented and tested |
| Tool chain collapse | Complete | `collapseToolChains`; single-tool turns only |
| Token metrics + cost estimation | Complete | Pricing hardcoded to Sonnet 3.5 rates |
| BeskarClient pipeline | Complete | All modules wired; drop-in for `messages.create()` |
| TypeScript dual build (ESM + CJS) | Complete | |
| Test coverage ≥90% | Complete | Thresholds enforced in CI |
| Python implementation | Not started | `pyproject.toml` exists; no source |

### V1 Gaps (must fix before declaring V1 stable)

**P0 — Correctness:**
- `compressToolResult()` is implemented and tested but **never called** in `client.ts`. Tool result truncation silently does nothing. The client only calls `collapseToolChains`. Add a pass in Step 3 to compress individual tool results before (or as part of) chain collapse.
- `README.md` usage examples show `cache: { enabled: true }`, `compressor: { enabled: true, ... }`, and `metrics: { enabled: true }`. None of these fields exist on the config types. Correct usage is `cache: {}`, `compressor: { maxToolResultTokens: 500 }`, `metrics: {}`.

**P1 — Accuracy:**
- Pricing constants are hardcoded to one model. When users call Haiku or Opus through BeskarClient, reported costs are wrong. At minimum, accept a `model` hint in `MetricsConfig` or read the model from the request params to select the right price tier.
- `estimateTokens()` uses `length / 4`, which is accurate for typical English prose but diverges for code (more chars per token in some languages) and for non-ASCII (Unicode chars = 1 char but often 2–4 tokens). This causes the cache threshold check to fire incorrectly. Consider a tiered estimator or exposing a user-provided token counter.
- System array cache threshold: checks only the last block's token count, not the total system size. A system prompt with 10 small blocks totaling 2000 tokens but a last block of 100 tokens will not get a cache breakpoint. Fix: sum all block tokens before checking threshold.

**P2 — Usability:**
- `summarize` strategy documentation: the config field `summaryModel` is declared but unused. Either implement real summarization or explicitly document that `summarize` is a sliding-window variant that prepends a placeholder.
- `collapseToolChains` only handles single-tool turns. Document this limitation clearly.
- `cache.minTokenThreshold` doesn't adapt to model. Haiku requires 2048, not 1024. Consider accepting the model name at construction time and defaulting the threshold accordingly.

---

## V2 Roadmap

Priority ordering is based on expected ROI (cost reduction per implementation effort) for production agentic pipelines. Each item includes what V1 data to collect to validate it.

---

### V2.1 — Real Summarization for Context Pruning

**What:** Replace the `summarize` stub with an actual LLM call. When the pruner strategy is `summarize`, Beskar makes a secondary call to compress old turns into a dense summary before discarding them.

**Why now:** The sliding-window strategy loses context; importance scoring is heuristic. Real summarization preserves semantic content while reducing token count — critical for long research/bug-bounty pipelines where old turns contain key findings.

**Design notes:**
- Default to a cheap model (Haiku) for the summarization call to minimize cost overhead.
- `PrunerConfig.summaryModel` is already declared — wire it up.
- The summary call itself should be tracked in metrics (separate from the primary call).
- Summarization should be async; the pipeline already uses `await`.
- Consider a dry-run mode: estimate compression ratio before committing.

**V1 data to collect:** Distribution of `maxTurns` values users configure, and how often pruning fires (turns pruned / total turns).

---

### V2.2 — Per-Model Pricing in Metrics

**What:** Accept a model identifier and use the correct price tier for cost estimation.

**Why now:** With model routing coming in V2.3, cost estimates must be per-model to be actionable. Reporting Haiku calls at Sonnet prices hides the routing benefit.

**Design:**
```ts
// Extend MetricsConfig:
metrics?: {
  onUsage?: (usage: TokenUsage) => void
  model?: string   // e.g. 'claude-haiku-4-5' — used to pick pricing tier
} | false
```
Or read the model from `params.model` inside `client.ts` and pass it to the tracker.

**Pricing tiers to support:** Haiku 4.5, Sonnet 4.6, Opus 4.6 (and their cache creation/read rates). Maintain a `PRICING_BY_MODEL` map; fall back to Sonnet rates for unknown models.

---

### V2.3 — Model Routing (Haiku vs. Sonnet)

**What:** Automatically route simple subtasks to Haiku (~20× cheaper per token) and keep Sonnet/Opus for reasoning-heavy calls.

**Why:** Token cost reduction from routing is multiplicative, not additive. A pipeline doing 80% extraction tasks and 20% reasoning tasks could cut costs by 15× with routing, far exceeding cache savings alone.

**Routing signals (task classification):**
- Short output expected (< 200 tokens) → Haiku
- No tool calls in the request → Haiku candidate
- System prompt mentions code generation, security analysis, or complex reasoning → Sonnet
- Active tool call chain with > 2 pending results → Sonnet
- User message is short and extraction-like (regex match, summarize, classify) → Haiku

**API:**
```ts
routing?: {
  enabled: boolean
  haikusModel?: string   // default: 'claude-haiku-4-5-20251001'
  signals?: RoutingSignal[]  // override default classification logic
} | false
```

**V1 data needed:** Log `params.model`, message lengths, tool call depths. Measure % of calls that would qualify for Haiku routing.

---

### V2.4 — Extended Thinking Budget Control

**What:** Per-call thinking budget with task-complexity toggling — not a global on/off.

**Why:** Thinking tokens are billed as output tokens (expensive). Enabling thinking globally for an agentic loop wastes budget on trivial turns. Contextual toggling (off for tool result parsing, on for planning turns) can cut thinking costs by 40–80%.

**Design:**
```ts
thinking?: {
  budgetTokens: number               // base budget
  taskComplexityThreshold?: number   // auto-scale if estimated complexity > N
  forceOnPatterns?: string[]         // regex patterns in user message → always enable
  forceOffPatterns?: string[]        // regex patterns → always disable
} | false
```

BeskarClient injects `thinking: { type: "enabled", budget_tokens: N }` into params when the call qualifies. Merges with any thinking config the user already passed.

**Note:** Budget range 1,024–32,000 tokens; some models support up to 100K. Track actual thinking token usage in metrics (`usage.thinking_input_tokens` once available).

---

### V2.5 — Output Filler Cleanup

**What:** Post-process Claude responses to strip characteristic filler patterns ("Certainly!", "Of course!", disclaimer stacking, unnecessary preambles).

**Why:** Output tokens are billed at 5× the cost of input tokens. Repeated filler in agentic loops (where each response becomes context for the next turn) compounds: filler output becomes filler input.

**Design:** Applied as Step 6 in the pipeline (after API call, before returning response). Uses a configurable list of regex patterns. Provides a `fillersRemoved` count in the `TokenUsage` struct.

**V1 data to collect:** Sample output token distributions; measure what fraction of output is filler via spot-check on response texts.

---

### V2.6 — System Prompt Auditor

**What:** Static analyzer that scores a system prompt for token efficiency and suggests rewrites.

**Why:** System prompts are often written by humans and contain redundant instructions, verbose examples, and low-signal boilerplate. Trimming 30% of a system prompt that's sent on every turn saves 30% of cache creation cost permanently.

**API:**
```ts
import { auditSystemPrompt } from 'beskar/audit';

const report = auditSystemPrompt(systemPrompt);
// {
//   tokenEstimate: 1842,
//   issues: [
//     { type: 'verbose-preamble', severity: 'medium', suggestion: '...' },
//     { type: 'duplicate-instruction', severity: 'high', lines: [12, 34] },
//   ],
//   optimizedVersion: '...'  // Beskar's rewrite proposal
// }
```

**Note:** The `optimizedVersion` requires an LLM call. Consider making it opt-in.

---

### V2.7 — Streaming Support

**What:** Extend `BeskarClient.messages.create()` to accept and return streaming responses.

**Why:** Many production agentic pipelines use streaming for latency-sensitive UX. Without streaming support, Beskar is incompatible with these use cases — users must bypass the client.

**Design:** Detect `stream: true` in params; apply all pre-call transformations (pruner, cache, compressor) as normal, then call `anthropic.messages.stream()`. Accumulate usage from the stream's final `message_delta` event for metrics tracking. Return a `Stream<MessageStreamEvent>`.

This is a prerequisite for real-world adoption in latency-sensitive pipelines.

---

### V2.8 — Session State Snapshots

**What:** Serialize and restore the optimized context state — pruned message history, metrics summary, active cache breakpoints — so a fresh `BeskarClient` instance can resume a prior session without replaying raw turn history.

**Why:** Agentic pipelines increasingly spawn a new agent instance (fresh context) for each discrete task rather than running one infinitely-growing conversation. Without a handoff mechanism, the new instance starts blind — losing compressed findings, tool chain outcomes, and established context. Beskar is uniquely positioned to export a *compressed* snapshot rather than raw history, so the handoff payload is already optimized.

**Design:**
```ts
// Export from a completed or mid-run session:
const snapshot = client.exportSnapshot();
// { messages: BeskarMessage[], metrics: SessionMetrics, cacheBreakpoints: CacheBreakpoint[] }

// Restore in a new instance (e.g., a spawned sub-agent):
const subAgent = new BeskarClient(config, { snapshot });
```

- The snapshot format is JSON-serializable for persistence to disk or KV store.
- `messages` in the snapshot are already pruned/compressed — not raw history.
- Cache breakpoints are included so the new instance knows what's already cached within TTL, avoiding redundant cache creation costs.
- Snapshot export should be opt-in via `snapshots: { enabled: true }` in `BeskarConfig`.

**V1 data to collect:** Mean message count and token size at handoff points in multi-step pipelines.

---

### V2.9 — Cross-Agent Cache Coordination

**What:** When multiple parallel agent instances share the same stable prefix (identical system prompt, tool definitions, or long-context documents), coordinate cache breakpoint creation so the first agent to run pays the creation cost and subsequent agents within the TTL window get cache hits.

**Why:** Parallel execution patterns are common in multi-step pipelines — a planning stage fans out to N worker agents that all receive the same system prompt and tool definitions. Without coordination, each worker independently creates cache entries for the same content, paying creation cost N times and warming the cache only once. A shared coordination layer eliminates N-1 redundant creation charges.

**Design:**
- A `CacheCoordinator` instance is shared across `BeskarClient` instances in the same process (or process group via a lightweight IPC adapter).
- Before applying cache breakpoints, the cache module queries the coordinator: "has this prefix hash been cached in the last 5 minutes?"
- If yes, skip cache creation for that block (hit is guaranteed). If no, create and register the hash.
- The coordinator is pluggable: in-process (default), Redis-backed (for distributed agents), or file-backed (for subprocess-based orchestration).

```ts
import { CacheCoordinator } from 'beskar/coordination';

const coordinator = new CacheCoordinator(); // in-process default

const agents = workers.map(() => new BeskarClient({ ...config, coordinator }));
```

**V2.8 data to collect:** Cache creation event frequency across parallel calls with identical prefixes.

---

### V2.10 — Model-Agnostic Provider Layer

**What:** Abstract the Claude-specific layer so Beskar can wrap other providers (OpenAI, Gemini, local models via OpenAI-compatible APIs).

**Why (long-term):** Enterprise users often run multi-provider pipelines. Beskar's pruning and compression logic is provider-agnostic; only the cache breakpoint format and pricing are Claude-specific.

**Design:** Extract a `Provider` interface with `createMessage()`, `supportsPromptCaching()`, and `pricingForModel()` methods. `AnthropicProvider` is the default. Users can inject a custom provider.

**Defer until:** V2 features above are proven. This is scope expansion, not optimization.

---

## Feature Priority Summary

| # | Feature | Impact | Effort | V1 Data Required |
|---|---------|--------|--------|-----------------|
| V2.1 | Real summarization | High | Medium | Turn distribution |
| V2.2 | Per-model pricing | Medium | Low | None |
| V2.3 | Model routing | Very High | High | Call classification data |
| V2.4 | Thinking budget control | High | Medium | Thinking token usage |
| V2.5 | Output filler cleanup | Medium | Low | Filler frequency |
| V2.6 | System prompt auditor | Medium | High | Prompt size distribution |
| V2.7 | Streaming support | High (adoption) | Medium | None |
| V2.8 | Session state snapshots | High (multi-agent) | Medium | Handoff token size |
| V2.9 | Cross-agent cache coordination | High (multi-agent) | Medium | Parallel creation frequency |
| V2.10 | Provider agnostic | Low (near-term) | Very High | None |

Recommended V2 sequencing: **V2.2 → V2.7 → V2.1 → V2.8 → V2.9 → V2.3 → V2.4 → V2.5 → V2.6 → V2.10**

Rationale: Fix pricing accuracy first (low effort, needed for routing ROI measurement), unlock streaming adoption, then add multi-agent handoff (V2.8 + V2.9) — these share design surface with the snapshot/coordinator layer and unblock a distinct class of users before tackling the higher-effort optimization features.
