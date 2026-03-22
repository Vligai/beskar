## Why

Beskar's `estimateTokens()` uses a `length / 4` heuristic tuned for English prose. This diverges significantly for code (more chars per token in some languages), non-ASCII text (Unicode chars = 1 char but often 2–4 tokens), and structured data like JSON. The cache module uses this estimate to decide whether content meets the minimum cacheable threshold — an inaccurate estimate means cache breakpoints get placed on too-small content (wasted) or skipped on large-enough content (missed savings). The compressor also uses it for truncation boundaries.

## What Changes

- Add an optional `tokenEstimator` function to `BeskarConfig` that replaces the default `estimateTokens()` heuristic everywhere it's used
- All modules (cache, compressor) call through a shared estimator reference rather than importing `estimateTokens` directly
- Default behavior is unchanged — the `length / 4` heuristic remains the fallback

## Capabilities

### New Capabilities

- `custom-token-estimator`: Users can provide their own token counting function (e.g., wrapping `tiktoken` or Anthropic's tokenizer) via `BeskarConfig.tokenEstimator`

### Modified Capabilities

- `cache-structurer`: Uses the configured estimator instead of hardcoded `estimateTokens`
- `tool-result-compressor`: Uses the configured estimator for truncation boundary calculation

## Impact

- **Modifies**: `src/types.ts`, `src/beskar/types.py` (config field), `src/cache/index.ts`, `src/beskar/cache.py`, `src/compressor/index.ts`, `src/beskar/compressor.py`, `src/client.ts`, `src/beskar/client.py` (passes estimator to modules)
- **Depends on**: None
- **Consumed by**: Users with multilingual content, code-heavy pipelines, or accuracy requirements
