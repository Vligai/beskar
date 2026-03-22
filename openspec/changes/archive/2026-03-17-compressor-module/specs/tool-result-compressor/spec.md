## ADDED Requirements

### Requirement: `compressToolResult` truncates oversized tool result content
The `compressToolResult` function SHALL accept a `ToolResultBlockParam` and a `CompressorConfig`, and return a new block. If the content's estimated token count exceeds `config.maxToolResultTokens`, the text content SHALL be truncated to `maxToolResultTokens * 4` characters with `"\n[truncated]"` appended. If `maxToolResultTokens` is not set, the block SHALL be returned unchanged.

#### Scenario: Content below limit is unchanged
- **WHEN** the tool result content is below `maxToolResultTokens`
- **THEN** the returned block content is identical to the input

#### Scenario: Content above limit is truncated
- **WHEN** the tool result content exceeds `maxToolResultTokens` estimated tokens
- **THEN** content is truncated to `maxToolResultTokens * 4` characters with `"\n[truncated]"` appended

#### Scenario: `tool_use_id` is always preserved
- **WHEN** `compressToolResult` runs on any block
- **THEN** the returned block has the same `tool_use_id` as the input

#### Scenario: Input block is not mutated
- **WHEN** `compressToolResult` is called
- **THEN** the original block object is unchanged after the function returns

#### Scenario: `maxToolResultTokens` not set → block unchanged
- **WHEN** `config.maxToolResultTokens` is undefined
- **THEN** the returned block is identical to the input

### Requirement: `collapseToolChains` replaces old tool pairs with synthetic summary messages
The `collapseToolChains` function SHALL accept a `BeskarMessage[]` and a `CompressorConfig`, and return a new array. Each assistant+user turn pair (single `tool_use` + matching `tool_result`) whose distance from the end of the array exceeds `collapseAfterTurns` SHALL be replaced with a single assistant message: `"[Tool: {tool_name} — result collapsed after {N} turns]"`. If `collapseAfterTurns` is not set, the array SHALL be returned unchanged.

#### Scenario: Pair within threshold is not collapsed
- **WHEN** a tool pair is within `collapseAfterTurns` turns of the end of the array
- **THEN** that pair is retained in the output unchanged

#### Scenario: Pair beyond threshold is collapsed
- **WHEN** a tool pair is more than `collapseAfterTurns` turns from the end
- **THEN** both turns are replaced by a single assistant message containing the tool name

#### Scenario: Multi-tool assistant turns are not collapsed
- **WHEN** an assistant turn contains more than one `tool_use` block
- **THEN** that turn and its tool results are not collapsed

#### Scenario: `collapseAfterTurns` not set → array unchanged
- **WHEN** `config.collapseAfterTurns` is undefined
- **THEN** the returned array is identical in content to the input

#### Scenario: Original messages array is not mutated
- **WHEN** `collapseToolChains` is called
- **THEN** the input array and its message objects are unchanged after the function returns

### Requirement: No tool call pairing is broken by compression
Neither function SHALL produce output where a `tool_use` block exists without a corresponding `tool_result` block (or vice versa). The `tool_use_id` linkage SHALL be preserved throughout all compression operations.

#### Scenario: Compressed result retains `tool_use_id`
- **WHEN** a tool result is compressed
- **THEN** the returned block's `tool_use_id` matches the input's `tool_use_id`

#### Scenario: Collapsed pair does not leave orphaned blocks
- **WHEN** a tool_use/tool_result pair is collapsed
- **THEN** neither a `tool_use` nor a `tool_result` block with that `tool_use_id` remains in the output
