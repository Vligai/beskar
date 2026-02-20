## 1. Tool Pair Detection

- [ ] 1.1 Implement `findToolPairs(messages: BeskarMessage[]): Map<string, { useIndex: number, resultIndex: number }>` — maps `tool_use_id` to the indices of the assistant and user turns containing it
- [ ] 1.2 Test: messages with one tool_use/tool_result pair → map has one entry with correct indices
- [ ] 1.3 Test: messages with no tool calls → map is empty
- [ ] 1.4 Test: assistant turn with multiple tool_use blocks → all tool_use_ids are mapped to the same assistant turn index

## 2. Core `pruneMessages` Function

- [ ] 2.1 Create `src/pruner/index.ts` and export `pruneMessages(messages: BeskarMessage[], config: PrunerConfig): BeskarMessage[]`
- [ ] 2.2 Return a new array — never mutate the input
- [ ] 2.3 If messages length is 0 or 1, return the input unchanged (nothing to prune)
- [ ] 2.4 Dispatch to the strategy implementation based on `config.strategy`

## 3. Sliding Window Strategy

- [ ] 3.1 Implement `slidingWindow(messages, maxTurns): BeskarMessage[]` — keeps the last `maxTurns` messages
- [ ] 3.2 If the cut point falls within a tool pair (the cut would separate a tool_use from its tool_result), shift the cut point earlier to keep the pair intact
- [ ] 3.3 Never return fewer than 1 message regardless of `maxTurns` value
- [ ] 3.4 Test: 10-message array with `maxTurns: 4` → returns last 4 messages
- [ ] 3.5 Test: cut point lands on a tool_use → cut shifts to before that tool_use's assistant turn, returning more than `maxTurns` messages
- [ ] 3.6 Test: `maxTurns` equal to or greater than array length → returns full array unchanged
- [ ] 3.7 Test: `maxTurns: 0` → returns last 1 message (minimum floor)

## 4. Summarize Strategy

- [ ] 4.1 Implement `summarize(messages, config): BeskarMessage[]` — replaces turns older than `maxTurns` with a single synthetic user message
- [ ] 4.2 Synthetic message format: `"[Previous context: {N} turns summarized]"` with role `"user"`
- [ ] 4.3 Ensure the synthetic summary turn is the first element of the returned array, followed by the retained window
- [ ] 4.4 Test: 8-message array with `maxTurns: 4` → array of 5 (1 summary + 4 retained)
- [ ] 4.5 Test: synthetic message has role `"user"` and content matching the expected format

## 5. Importance Strategy

- [ ] 5.1 Implement `scoreMessage(message: BeskarMessage, index: number, total: number): number` — returns 0–1 based on: recency (index/total), tool_use presence (+0.3 bonus), content length (normalized)
- [ ] 5.2 Implement `importancePrune(messages, maxTurns): BeskarMessage[]` — score all messages, drop the lowest-scoring ones until under limit, respecting tool pair atomicity
- [ ] 5.3 When dropping a message in a tool pair, drop both turns of the pair
- [ ] 5.4 Test: messages without tool calls — lowest-scoring (oldest, shortest) are dropped first
- [ ] 5.5 Test: low-scoring message in a tool pair → both turns of the pair are dropped together

## 6. Edge Cases

- [ ] 6.1 Test: empty messages array → returns empty array
- [ ] 6.2 Test: messages with only tool_use/tool_result pairs → sliding window preserves pairs
- [ ] 6.3 Test: all three strategies return a new array (not the same reference as input)

## 7. Verification

- [ ] 7.1 `npm run typecheck` — zero errors
- [ ] 7.2 `npm run test:coverage` — passes 90% lines/functions/statements, 85% branches thresholds
- [ ] 7.3 `npm run build` — compiles to both `dist/esm/` and `dist/cjs/` without errors
