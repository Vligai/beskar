## ADDED Requirements

### Requirement: `pruneMessages` returns a new messages array within the configured bound
The `pruneMessages` function SHALL accept a `BeskarMessage[]` and a `PrunerConfig`, and return a new array. It SHALL NOT mutate the input array. It SHALL dispatch to the strategy specified in `config.strategy`.

#### Scenario: Output is a new array reference
- **WHEN** `pruneMessages` is called with any strategy
- **THEN** the returned array is not the same object reference as the input

#### Scenario: Short array is returned unchanged
- **WHEN** the messages array length is at or below `maxTurns`
- **THEN** the returned array contains all input messages

### Requirement: Sliding window keeps the last `maxTurns` messages
The `sliding-window` strategy SHALL retain the last `maxTurns` messages and drop the oldest ones. If the cut point falls inside a tool_use/tool_result pair, the cut SHALL shift earlier to keep the pair intact.

#### Scenario: Basic window trim
- **WHEN** strategy is `sliding-window`, `maxTurns` is `4`, and messages array has 10 entries
- **THEN** the returned array contains the last 4 messages

#### Scenario: Cut point shifted to preserve tool pair
- **WHEN** the cut point would separate a `tool_use` assistant turn from its `tool_result` user turn
- **THEN** the cut shifts earlier to include both turns, returning more than `maxTurns` messages

#### Scenario: Minimum of one message always retained
- **WHEN** `maxTurns` is `0`
- **THEN** the returned array contains at least one message (the most recent)

### Requirement: Summarize strategy replaces old turns with a synthetic message
The `summarize` strategy SHALL replace all turns older than `maxTurns` with a single user-role message of the form `"[Previous context: N turns summarized]"`. The retained window follows the synthetic message.

#### Scenario: Older turns replaced by summary
- **WHEN** strategy is `summarize`, `maxTurns` is `4`, and messages array has 8 entries
- **THEN** the returned array has 5 entries: 1 synthetic summary message followed by 4 retained messages

#### Scenario: Synthetic message has correct role
- **WHEN** summarize strategy runs
- **THEN** the first message in the returned array has `role: "user"`

### Requirement: Importance strategy drops lowest-scoring turns first
The `importance` strategy SHALL score each message by recency, tool-call presence, and content length, then drop the lowest-scoring messages until the array is within `maxTurns`. Tool_use/tool_result pairs SHALL be dropped atomically — either both turns are dropped or neither is.

#### Scenario: Lowest-scoring non-tool messages dropped first
- **WHEN** strategy is `importance` and there are messages with and without tool calls
- **THEN** tool-call messages receive a higher score and are dropped last

#### Scenario: Tool pair atomicity
- **WHEN** a tool_use/tool_result pair has the lowest combined importance score
- **THEN** both turns of the pair are dropped together — never one without the other

### Requirement: Tool call pairs are never orphaned by pruning
No strategy SHALL produce a messages array where a `tool_use` assistant block exists without a corresponding `tool_result` user block (or vice versa).

#### Scenario: All strategies preserve tool call integrity
- **WHEN** any pruning strategy runs on a messages array containing tool call pairs
- **THEN** every remaining `tool_use` block in the output has a matching `tool_result` block by `tool_use_id`
