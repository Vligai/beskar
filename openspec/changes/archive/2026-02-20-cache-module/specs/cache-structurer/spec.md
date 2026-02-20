## ADDED Requirements

### Requirement: Cache breakpoints are placed at optimal positions within the 4-breakpoint limit
The `structureCache` function SHALL accept a request object containing `messages`, optional `system`, and optional `tools`, and return a new object with `cache_control: { type: "ephemeral" }` injected into content blocks at the highest-value positions. Priority order: system prompt > tool definitions > oldest static user turns. No more than 4 breakpoints SHALL be placed per request.

#### Scenario: System prompt receives a breakpoint
- **WHEN** the system prompt content exceeds the minimum token threshold
- **THEN** the last system content block has `cache_control: { type: "ephemeral" }` applied

#### Scenario: Tool definitions receive a breakpoint
- **WHEN** the tools array is present and its combined content exceeds the minimum token threshold
- **THEN** the last tool definition has `cache_control: { type: "ephemeral" }` applied

#### Scenario: 4-breakpoint limit is enforced
- **WHEN** more than 4 content blocks are eligible for breakpoints
- **THEN** only the 4 highest-priority blocks receive breakpoints — the rest are skipped

#### Scenario: Original request is not mutated
- **WHEN** `structureCache` is called with a request object
- **THEN** the input object is unchanged — the function returns a new object

### Requirement: Breakpoints are never applied below the minimum token threshold
The function SHALL skip any content block whose estimated token count is below the configured threshold. The default threshold SHALL be 1024 tokens. Callers MAY override it via `CacheConfig.minTokenThreshold`.

#### Scenario: Small content block is skipped
- **WHEN** a content block contains fewer than 1024 estimated tokens
- **THEN** no `cache_control` is added to that block

#### Scenario: Custom threshold is respected
- **WHEN** `CacheConfig.minTokenThreshold` is set to `2048`
- **THEN** only blocks estimated at 2048+ tokens receive breakpoints

### Requirement: Token estimation uses the character-length heuristic
The module SHALL estimate token counts using `Math.floor(characterCount / 4)`. This estimate is used solely for threshold gating — it does not affect billing or reported token counts.

#### Scenario: Estimation produces the expected value
- **WHEN** `estimateTokens` is called with a string of 4096 characters
- **THEN** it returns `1024`

#### Scenario: Empty string estimates zero
- **WHEN** `estimateTokens` is called with an empty string
- **THEN** it returns `0`

### Requirement: Returned breakpoints array describes all placements
The `CacheStructureResult.breakpoints` array SHALL contain one `CacheBreakpoint` entry per placed breakpoint, with `position` indicating the content block index and `estimatedTokens` indicating the estimated size. If no breakpoints are placed, the array SHALL be empty and the request SHALL be returned unchanged.

#### Scenario: No eligible content returns empty breakpoints
- **WHEN** all content blocks are below threshold
- **THEN** `breakpoints` is an empty array and the returned request equals the input

#### Scenario: Breakpoints array length matches placed count
- **WHEN** 3 breakpoints are placed on a request with 5 eligible blocks
- **THEN** `breakpoints.length` is `3`
