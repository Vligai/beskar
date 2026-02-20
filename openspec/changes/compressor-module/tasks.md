## 1. Tool Result Compressor

- [ ] 1.1 Create `src/compressor/index.ts` and export `compressToolResult(block: Anthropic.ToolResultBlockParam, config: CompressorConfig): Anthropic.ToolResultBlockParam`
- [ ] 1.2 Estimate token count of the tool result content using `Math.floor(contentLength / 4)`
- [ ] 1.3 If estimated tokens exceed `config.maxToolResultTokens`, truncate the content string to `maxToolResultTokens * 4` characters and append `"\n[truncated]"`
- [ ] 1.4 If `config.maxToolResultTokens` is not set, return the block unchanged
- [ ] 1.5 Preserve `tool_use_id` and `type: "tool_result"` on the returned block — never alter them
- [ ] 1.6 Return a new block object — never mutate the input
- [ ] 1.7 Test: tool result with content below limit → returned block is unchanged (content identical)
- [ ] 1.8 Test: tool result with content above limit → content is truncated to `maxToolResultTokens * 4` chars + `"\n[truncated]"` suffix
- [ ] 1.9 Test: `tool_use_id` is preserved after compression
- [ ] 1.10 Test: input block is not mutated — original block is unchanged after call
- [ ] 1.11 Test: `maxToolResultTokens` not set → block returned unchanged

## 2. Tool Chain Collapser

- [ ] 2.1 Export `collapseToolChains(messages: BeskarMessage[], config: CompressorConfig): BeskarMessage[]`
- [ ] 2.2 If `config.collapseAfterTurns` is not set, return messages unchanged
- [ ] 2.3 Identify collapsible pairs: assistant turn with a single `tool_use` block immediately followed by a user turn with the matching `tool_result` block, where the pair's distance from the end of the array exceeds `collapseAfterTurns`
- [ ] 2.4 Replace each collapsible pair with a single assistant message: `"[Tool: {tool_name} — result collapsed after {N} turns]"`
- [ ] 2.5 Skip pairs where the assistant turn contains more than one `tool_use` block (multi-tool turns not collapsed in V1)
- [ ] 2.6 Return a new array — never mutate the input
- [ ] 2.7 Test: pair within `collapseAfterTurns` → not collapsed
- [ ] 2.8 Test: pair beyond `collapseAfterTurns` → replaced with synthetic assistant message
- [ ] 2.9 Test: pair with multiple tool_use blocks → not collapsed
- [ ] 2.10 Test: `collapseAfterTurns` not set → messages returned unchanged
- [ ] 2.11 Test: original messages array is not mutated
- [ ] 2.12 Test: collapsed synthetic message has role `"assistant"` and content containing the tool name

## 3. Edge Cases

- [ ] 3.1 Test: empty messages array → returns empty array
- [ ] 3.2 Test: messages with no tool calls → returned unchanged by `collapseToolChains`
- [ ] 3.3 Test: tool result with array content (multiple content blocks) → only text blocks are truncated; non-text blocks are preserved

## 4. Verification

- [ ] 4.1 `npm run typecheck` — zero errors
- [ ] 4.2 `npm run test:coverage` — passes 90% lines/functions/statements, 85% branches thresholds
- [ ] 4.3 `npm run build` — compiles to both `dist/esm/` and `dist/cjs/` without errors
