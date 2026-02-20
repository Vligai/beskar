## Why

Tool results carry full verbose payloads — raw HTML pages, large JSON API responses, extensive file contents — even after their information has been consumed by the model. These bloated `tool_result` turns accumulate in context and drive up input token costs on every subsequent call. Beskar can intercept and compress them before they're appended, and collapse entire completed tool-call chains into compact summary messages once they're no longer needed for active reasoning.

## What Changes

- Implement `src/compressor/index.ts` — functions that operate on a messages array to reduce tool result token footprint
- `compressToolResult`: takes a single tool result content block and applies truncation/stripping to bring it under `maxToolResultTokens`; preserves `tool_use_id` linkage throughout
- `collapseToolChains`: scans the messages array for completed tool-use/tool-result pairs older than `collapseAfterTurns` and replaces each pair with a single summarizing assistant message
- Never removes the `tool_use_id` reference or breaks the pairing that the Anthropic API requires for valid conversation structure

## Capabilities

### New Capabilities

- `tool-result-compressor`: Truncates oversized tool result content blocks to a configurable token limit before they're added to context
- `tool-chain-collapser`: Replaces completed tool-call chains (tool_use + tool_result pairs) older than a threshold with a single compact summary turn

### Modified Capabilities

None — this is a new module.

## Impact

- **Creates**: `src/compressor/index.ts`, `src/compressor/index.test.ts`
- **Depends on**: `src/types.ts` (`CompressorConfig`, `BeskarMessage`)
- **Consumed by**: `client-wrapper` change (applied after tool results are appended, before the next API call)
