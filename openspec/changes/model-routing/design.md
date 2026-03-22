## Context

Haiku is ~20x cheaper than Sonnet per token. Many agentic pipelines alternate between simple tasks (extract a value, classify a result, format output) and complex tasks (reason about code, plan next steps, synthesize findings). Routing simple tasks to Haiku is the single highest-ROI optimization Beskar can offer.

This is V2.3 in the roadmap. It depends on per-model pricing (V2.2, already shipped).

## Goals / Non-Goals

**Goals:**
- Automatically classify calls as simple or complex based on request signals
- Route simple calls to Haiku, complex calls to Sonnet (or user-specified model)
- Allow users to override routing decisions with explicit signals
- Track routing decisions in metrics for ROI measurement

**Non-Goals:**
- Routing to non-Anthropic models (V2.10 scope)
- Routing based on response quality feedback (requires post-call analysis — future work)
- Guaranteed routing accuracy — heuristic classification is acceptable for V2

## Decisions

### Config shape

```typescript
interface RoutingConfig {
  defaultModel?: string;     // fallback for complex calls (default: 'claude-sonnet-4-20250514')
  haikuModel?: string;       // model for simple calls (default: 'claude-haiku-4-5-20251001')
  signals?: RoutingSignal[]; // custom classification rules (override defaults)
  forceModel?: string;       // bypass routing entirely — always use this model
}

type RoutingSignal = {
  condition: 'short-output' | 'no-tools' | 'extraction' | 'classification' | 'code-generation' | 'reasoning' | 'custom';
  route: 'haiku' | 'default';
  pattern?: string;          // regex for 'custom' condition type
};
```

### Default classification signals

The router evaluates in order; first match wins:

1. **System prompt contains** "code generation", "security analysis", "complex reasoning", "architecture" → **Sonnet**
2. **Active tool call chain** with > 2 pending tool_use blocks without results → **Sonnet**
3. **Last user message length** < 200 tokens AND no tool_use in conversation → **Haiku**
4. **System prompt contains** "extract", "classify", "summarize", "format" → **Haiku**
5. **Default** → Sonnet (safe fallback)

### Pipeline integration

Routing is Step 0 — before the pruner:

```
Input: messages.create(**params)
  → [0] Router       — Select model (if enabled)
  → [1] Pruner       — Reduce message history
  → [2] Cache        — Place cache breakpoints
  → [3] Compressor   — Truncate tool results
  → [4] API Call     — anthropic.messages.create()
  → [5] Metrics      — Track usage + routing decision
```

The router modifies `params.model` in-place (on the working copy, not the original). All downstream stages see the routed model.

### Metrics integration

`MetricsSummary` gains:
```typescript
routedToHaiku: number;        // count of calls routed to Haiku
routedToDefault: number;      // count of calls kept on default model
routingSavingsUsd: number;    // estimated savings vs. all-default baseline
```

### Escape hatches

- `forceModel` in config → bypass all routing logic
- User passes explicit `model` in `create()` params → routing is skipped for that call
- Individual `RoutingSignal` overrides allow fine-tuning without replacing the whole classifier

## Risks / Trade-offs

- **Haiku may produce lower quality on borderline tasks** → Mitigation: conservative default signals (Sonnet is the fallback). Users can adjust signals based on their pipeline.
- **Classification is heuristic, not ML-based** → Mitigation: acceptable for V2. Regex + length checks cover the 80% case. ML-based classification can be added as a signal type later.
- **Routing adds decision overhead to every call** → Mitigation: signal evaluation is string matching — microseconds. No API calls for classification.
- **Cache breakpoints may differ between models** → Note: Haiku requires 2048 minimum tokens (vs 1024 for Sonnet). The cache module should respect the routed model's threshold. This is a cross-cutting concern to address.

## Open Questions

- Should the router inspect previous responses (e.g., if Haiku produced a low-quality result, escalate to Sonnet)? Defer — requires stateful routing, which is a V3 concern.
- Should routing be per-turn or per-session? Per-turn (each `create()` call is independently classified). Session-level routing policies can be built on top via `forceModel`.
