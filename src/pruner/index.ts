import type { BeskarMessage, PrunerConfig } from '../types.js';

type AnyBlock = { type: string; id?: string; tool_use_id?: string; text?: string };
type ToolPairEntry = { useIndex: number; resultIndex: number };

function getContentText(message: BeskarMessage): string {
  const { content } = message;
  if (typeof content === 'string') return content;
  return (content as AnyBlock[])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
}

function hasToolUse(message: BeskarMessage): boolean {
  const { content } = message;
  if (typeof content === 'string') return false;
  return (content as AnyBlock[]).some((b) => b.type === 'tool_use');
}

export function findToolPairs(messages: BeskarMessage[]): Map<string, ToolPairEntry> {
  const pairs = new Map<string, ToolPairEntry>();

  for (let i = 0; i < messages.length; i++) {
    const { role, content } = messages[i];
    if (typeof content === 'string') continue;
    const blocks = content as AnyBlock[];

    if (role === 'assistant') {
      for (const block of blocks) {
        if (block.type === 'tool_use' && block.id) {
          const entry = pairs.get(block.id) ?? { useIndex: -1, resultIndex: -1 };
          entry.useIndex = i;
          pairs.set(block.id, entry);
        }
      }
    } else if (role === 'user') {
      for (const block of blocks) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          const entry = pairs.get(block.tool_use_id) ?? { useIndex: -1, resultIndex: -1 };
          entry.resultIndex = i;
          pairs.set(block.tool_use_id, entry);
        }
      }
    }
  }

  return pairs;
}

function slidingWindow(messages: BeskarMessage[], maxTurns: number): BeskarMessage[] {
  if (maxTurns >= messages.length) return messages.slice();

  let cut = messages.length - maxTurns;
  // Floor: never cut everything
  if (cut >= messages.length) cut = messages.length - 1;

  // Shift cut earlier to preserve tool pairs that would be split
  const pairs = findToolPairs(messages);
  for (const { useIndex, resultIndex } of pairs.values()) {
    if (useIndex < 0 || resultIndex < 0) continue;
    // If assistant turn (useIndex) is before cut and tool result is at/after cut, shift to preserve
    if (useIndex < cut && resultIndex >= cut) {
      cut = useIndex;
    }
  }

  return messages.slice(cut);
}

function summarize(messages: BeskarMessage[], maxTurns: number): BeskarMessage[] {
  if (maxTurns >= messages.length) return messages.slice();

  const retained = messages.slice(messages.length - maxTurns);
  const numSummarized = messages.length - retained.length;
  const summary: BeskarMessage = {
    role: 'user',
    content: `[Previous context: ${numSummarized} turns summarized]`,
  };

  return [summary, ...retained];
}

export function scoreMessage(message: BeskarMessage, index: number, total: number): number {
  const recency = total > 0 ? (index / total) * 0.5 : 0;
  const toolBonus = hasToolUse(message) ? 0.3 : 0;
  const text = getContentText(message);
  const lengthScore = Math.min(text.length / 5000, 0.2);
  return recency + toolBonus + lengthScore;
}

function importancePrune(messages: BeskarMessage[], maxTurns: number): BeskarMessage[] {
  if (maxTurns >= messages.length) return messages.slice();

  const pairs = findToolPairs(messages);
  const total = messages.length;

  // Map each index to its pair's id (if part of a pair)
  const indexToPairId = new Map<number, string>();
  for (const [id, { useIndex, resultIndex }] of pairs.entries()) {
    if (useIndex >= 0) indexToPairId.set(useIndex, id);
    if (resultIndex >= 0) indexToPairId.set(resultIndex, id);
  }

  // Build logical units (standalone or paired)
  const processedIndices = new Set<number>();
  const units: Array<{ indices: number[]; score: number }> = [];

  for (let i = 0; i < messages.length; i++) {
    if (processedIndices.has(i)) continue;

    const pairId = indexToPairId.get(i);
    if (pairId !== undefined) {
      const { useIndex, resultIndex } = pairs.get(pairId)!;
      const pairIndices = [useIndex, resultIndex].filter((idx) => idx >= 0);
      const score = Math.min(...pairIndices.map((idx) => scoreMessage(messages[idx], idx, total)));
      units.push({ indices: pairIndices, score });
      pairIndices.forEach((idx) => processedIndices.add(idx));
    } else {
      units.push({ indices: [i], score: scoreMessage(messages[i], i, total) });
      processedIndices.add(i);
    }
  }

  // Sort ascending by score; drop lowest-scoring until within maxTurns
  const unitsByScore = [...units].sort((a, b) => a.score - b.score);
  const droppedIndices = new Set<number>();
  let remaining = messages.length;

  for (const unit of unitsByScore) {
    if (remaining <= maxTurns) break;
    // Never drop below 1 total message
    if (remaining - unit.indices.length < 1) break;
    unit.indices.forEach((idx) => droppedIndices.add(idx));
    remaining -= unit.indices.length;
  }

  return messages.filter((_, i) => !droppedIndices.has(i));
}

export function pruneMessages(messages: BeskarMessage[], config: PrunerConfig): BeskarMessage[] {
  if (messages.length <= 1) return messages.slice();

  const maxTurns = config.maxTurns ?? messages.length;

  switch (config.strategy) {
    case 'sliding-window':
      return slidingWindow(messages, maxTurns);
    case 'summarize':
      return summarize(messages, maxTurns);
    case 'importance':
      return importancePrune(messages, maxTurns);
  }
}
