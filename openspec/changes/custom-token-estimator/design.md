## Context

The `estimateTokens(text: string): number` function (`Math.floor(text.length / 4)`) is used in:
- `cache/index.ts` / `cache.py` — to decide if content blocks meet the minimum cacheable token threshold
- `compressor/index.ts` / `compressor.py` — to estimate if a tool result exceeds `maxToolResultTokens`

The 4-chars-per-token heuristic is accurate for typical English but diverges for:
- Code: variable names, operators, and whitespace tokenize differently (~3.5 chars/token for Python, ~5 for minified JS)
- Non-ASCII: CJK characters are often 1 char = 2–4 tokens
- Structured JSON: keys repeat, values vary — actual ratio depends on content

This was flagged in the review as Issue 6 (token estimator is English-biased) and in the V2 roadmap as item 16.

## Goals / Non-Goals

**Goals:**
- Allow users to inject a custom `(text: string) => number` function
- All token estimation call sites use the injected function or fall back to the default
- Zero breaking changes — existing behavior is identical when no custom estimator is provided

**Non-Goals:**
- Shipping a built-in accurate tokenizer (too large a dependency — `tiktoken` is 3MB+)
- Async token estimation (would complicate the synchronous pipeline)
- Per-module estimator overrides (one estimator for the whole pipeline is sufficient)

## Decisions

### Config field

```typescript
interface BeskarConfig {
  tokenEstimator?: (text: string) => number;  // default: estimateTokens (length/4)
}
```

```python
@dataclass
class BeskarConfig:
    token_estimator: Optional[Callable[[str], int]] = None
```

### Estimator threading

The client resolves the estimator once at the top of `create()`:
```typescript
const estimate = config.tokenEstimator ?? estimateTokens;
```

Then passes it to each module function as a parameter:
```typescript
structureCache(request, config.cache, estimate);
compressToolResult(block, config.compressor, estimate);
```

**Alternative considered:** Module-level global override. Rejected — function parameter is explicit, testable, and thread-safe in Python.

### Module signature changes

Each module function gains an optional last parameter:
```typescript
function structureCache(
  request: CacheRequest,
  config: CacheConfig,
  estimator?: (text: string) => number
): CacheResult
```

When `estimator` is undefined, the function uses the default `estimateTokens`. This preserves backward compatibility for direct callers of module functions.

## Risks / Trade-offs

- **Custom estimator could be slow** → Mitigation: Beskar calls it once per content block, not per character. Documented expectation: estimator should be O(n) or better.
- **Custom estimator could return nonsensical values** → Mitigation: not validated. The user is responsible for providing a reasonable function. Negative values would cause cache breakpoints everywhere (harmless but wasteful).
- **Signature change on module functions** → Mitigation: parameter is optional with default, so existing callers are unaffected.

## Open Questions

- Should we provide a convenience wrapper for `tiktoken`? Defer — let users bring their own. We can add `beskar/estimators` as a separate optional package later.
