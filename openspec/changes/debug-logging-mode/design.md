## Context

Beskar's pipeline is opaque — the user calls `client.messages.create()` and gets a response, but has no visibility into which optimizations fired, how many tokens were saved at each stage, or whether their config is actually doing anything. This was flagged as Issue 12 in the project review (2026-03-21) and deferred as feature work.

## Goals / Non-Goals

**Goals:**
- Provide per-stage visibility: what changed, how many messages/tokens before vs after
- Support both quick boolean toggle (`debug: true`) and structured config (`debug: { logger, verbose }`)
- Zero overhead when debug is disabled — no string formatting, no token counting for debug output
- Work identically in Python and TypeScript

**Non-Goals:**
- Full request/response logging (too verbose, security risk with API keys)
- Performance profiling or timing information (separate concern)
- Persistent log storage — output goes to the provided logger, not to disk

## Decisions

### Config shape

```typescript
// TypeScript
interface DebugConfig {
  verbose?: boolean;       // log full message diffs (default: false, just summaries)
  logger?: (entry: DebugEntry) => void;  // custom handler
}

interface BeskarConfig {
  debug?: DebugConfig | boolean | false;  // true = defaults, false/undefined = disabled
}
```

```python
# Python
@dataclass
class DebugConfig:
    verbose: bool = False
    logger: Optional[Callable[[DebugEntry], None]] = None

@dataclass
class BeskarConfig:
    debug: Optional[DebugConfig] = None
```

### Debug entry structure

```typescript
interface DebugEntry {
  stage: 'pruner' | 'cache' | 'compressor' | 'api-call' | 'metrics';
  messagesBefore: number;
  messagesAfter: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  details: Record<string, unknown>;  // stage-specific info
}
```

Stage-specific `details`:
- **pruner**: `{ strategy, turnsPruned, toolPairsPreserved }`
- **cache**: `{ breakpointsPlaced, positions: number[] }`
- **compressor**: `{ resultsCompressed, chainsCollapsed }`
- **metrics**: `{ usage: TokenUsage, estimatedCostUsd }`

### Default logger

- TypeScript: `console.debug(JSON.stringify(entry, null, 2))`
- Python: `logging.getLogger('beskar').debug(json.dumps(entry, indent=2))`

### Zero-overhead guard

Each stage wraps debug logging in `if (config.debug)` — no token estimation or string formatting runs when debug is off. The guard is a single boolean check per stage.

## Risks / Trade-offs

- **Debug output could leak sensitive content** → Mitigation: default mode logs counts only, not message content. `verbose: true` is opt-in.
- **Logger callback could throw** → Mitigation: wrap in try/catch (TS) / try/except (Python); never let debug logging break the pipeline.
- **Slight code noise in client.ts/client.py** → Mitigation: extract a `debugLog(config, entry)` helper to keep inline code minimal.

## Open Questions

- Should debug mode also log the raw API request params (minus API key)? Useful for debugging cache placement, but verbose. Defer to verbose mode only.
