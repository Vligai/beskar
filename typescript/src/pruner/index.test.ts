import { describe, expect, it } from 'vitest';
import { findToolPairs, pruneMessages, scoreMessage } from './index.js';
import type { BeskarMessage } from '../types.js';

// --- Test helpers ---

const makeUser = (text: string): BeskarMessage => ({ role: 'user', content: text });
const makeAssistant = (text: string): BeskarMessage => ({ role: 'assistant', content: text });
const makeToolUse = (id: string): BeskarMessage => ({
  role: 'assistant',
  content: [{ type: 'tool_use', id, name: 'fn', input: {} }],
});
const makeToolResult = (toolUseId: string): BeskarMessage => ({
  role: 'user',
  content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }],
});

// --- findToolPairs ---

describe('findToolPairs', () => {
  it('maps one tool_use/tool_result pair to correct indices', () => {
    const msgs = [makeUser('q'), makeToolUse('id1'), makeToolResult('id1')];
    const pairs = findToolPairs(msgs);
    expect(pairs.size).toBe(1);
    expect(pairs.get('id1')).toEqual({ useIndex: 1, resultIndex: 2 });
  });

  it('returns empty map when no tool calls exist', () => {
    const msgs = [makeUser('u'), makeAssistant('a'), makeUser('u2')];
    expect(findToolPairs(msgs).size).toBe(0);
  });

  it('maps multiple tool_use blocks in one assistant turn to the same useIndex', () => {
    const msgs: BeskarMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'a', name: 'f1', input: {} },
          { type: 'tool_use', id: 'b', name: 'f2', input: {} },
        ],
      },
      makeToolResult('a'),
      makeToolResult('b'),
    ];
    const pairs = findToolPairs(msgs);
    expect(pairs.get('a')?.useIndex).toBe(0);
    expect(pairs.get('b')?.useIndex).toBe(0);
    expect(pairs.get('a')?.resultIndex).toBe(1);
    expect(pairs.get('b')?.resultIndex).toBe(2);
  });

  it('skips string-content messages', () => {
    const msgs = [makeUser('hello'), makeAssistant('hi')];
    expect(findToolPairs(msgs).size).toBe(0);
  });
});

// --- sliding-window ---

describe('pruneMessages — sliding-window', () => {
  const sw = (msgs: BeskarMessage[], maxTurns: number) =>
    pruneMessages(msgs, { strategy: 'sliding-window', maxTurns });

  it('keeps the last maxTurns messages', () => {
    const msgs = Array.from({ length: 10 }, (_, i) => makeUser(`m${i}`));
    const result = sw(msgs, 4);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual(makeUser('m6'));
    expect(result[3]).toEqual(makeUser('m9'));
  });

  it('shifts cut to preserve a tool pair that would be split', () => {
    const msgs = [
      makeUser('u1'),          // 0
      makeAssistant('a1'),     // 1
      makeToolUse('tool1'),    // 2 — tool_use
      makeToolResult('tool1'), // 3 — paired tool_result
      makeUser('recent'),      // 4
    ];
    // maxTurns=2 → cut=3; useIndex(2) < 3 && resultIndex(3) >= 3 → shift to 2
    const result = sw(msgs, 2);
    expect(result).toHaveLength(3); // shifted, so 3 not 2
    expect(result[0]).toEqual(msgs[2]);
    expect(result[1]).toEqual(msgs[3]);
    expect(result[2]).toEqual(msgs[4]);
  });

  it('returns full array when maxTurns >= length', () => {
    const msgs = [makeUser('a'), makeUser('b'), makeUser('c')];
    const result = sw(msgs, 10);
    expect(result).toHaveLength(3);
    expect(result).not.toBe(msgs);
  });

  it('returns last 1 message when maxTurns is 0', () => {
    const msgs = [makeUser('old'), makeUser('new')];
    const result = sw(msgs, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(makeUser('new'));
  });
});

// --- summarize ---

describe('pruneMessages — summarize', () => {
  const sum = (msgs: BeskarMessage[], maxTurns: number) =>
    pruneMessages(msgs, { strategy: 'summarize', maxTurns });

  it('returns 1 summary + maxTurns messages for 8-message array', () => {
    const msgs = Array.from({ length: 8 }, (_, i) => makeUser(`m${i}`));
    const result = sum(msgs, 4);
    expect(result).toHaveLength(5);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toBe('[Previous context: 4 turns summarized]');
    expect(result[1]).toEqual(msgs[4]);
    expect(result[4]).toEqual(msgs[7]);
  });

  it('returns full array when maxTurns >= length', () => {
    const msgs = [makeUser('a'), makeUser('b')];
    const result = sum(msgs, 5);
    expect(result).toHaveLength(2);
    expect(result).not.toBe(msgs);
  });
});

// --- importance ---

describe('pruneMessages — importance', () => {
  const imp = (msgs: BeskarMessage[], maxTurns: number) =>
    pruneMessages(msgs, { strategy: 'importance', maxTurns });

  it('drops oldest, shortest messages first (no tool calls)', () => {
    const msgs = [
      makeUser('x'), // 0 — oldest, shortest → lowest score
      makeUser('y'), // 1
      makeUser('z'), // 2 — newest
    ];
    const result = imp(msgs, 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(makeUser('y'));
    expect(result[1]).toEqual(makeUser('z'));
  });

  it('drops both turns of a tool pair atomically', () => {
    const msgs = [
      makeToolUse('tool1'),    // 0 — has tool bonus but oldest
      makeToolResult('tool1'), // 1 — paired; no tool bonus, low recency → pair minScore is low
      makeUser('u1'),          // 2
      makeUser('u2'),          // 3 — newest
    ];
    // pair minScore=min(score(0), score(1))=min(0.3, 0.125)=0.125 — lower than u1(0.25) and u2(0.375)
    // Drop pair → remaining=2. Both tool messages gone atomically.
    const result = imp(msgs, 2);
    expect(result).toHaveLength(2);
    const hasToolBlock = result.some((m) => {
      const c = m.content;
      if (typeof c === 'string') return false;
      return (c as Array<{ type: string }>).some(
        (b) => b.type === 'tool_use' || b.type === 'tool_result',
      );
    });
    expect(hasToolBlock).toBe(false);
  });
});

// --- scoreMessage ---

describe('scoreMessage', () => {
  it('scores a message with tool_use higher than one without', () => {
    expect(scoreMessage(makeToolUse('id'), 0, 4)).toBeGreaterThan(
      scoreMessage(makeUser('text'), 0, 4),
    );
  });

  it('scores later messages higher (recency)', () => {
    const msg = makeUser('x');
    expect(scoreMessage(msg, 3, 4)).toBeGreaterThan(scoreMessage(msg, 0, 4));
  });

  it('scores longer content higher (up to cap)', () => {
    const short = makeUser('hi');
    const long = makeUser('a'.repeat(10000));
    expect(scoreMessage(long, 0, 4)).toBeGreaterThan(scoreMessage(short, 0, 4));
  });

  it('handles array content for length scoring', () => {
    const msg: BeskarMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: 'hello world' }],
    };
    expect(scoreMessage(msg, 0, 4)).toBeGreaterThan(0);
  });
});

// --- edge cases ---

describe('pruneMessages — edge cases', () => {
  it('returns empty array unchanged', () => {
    const result = pruneMessages([], { strategy: 'sliding-window', maxTurns: 4 });
    expect(result).toHaveLength(0);
  });

  it('returns single-message array unchanged', () => {
    const msgs = [makeUser('only')];
    const result = pruneMessages(msgs, { strategy: 'sliding-window', maxTurns: 4 });
    expect(result).toHaveLength(1);
  });

  it('sliding-window preserves tool pairs when cut lands exactly at pair boundary', () => {
    const msgs = [
      makeToolUse('t1'),    // 0
      makeToolResult('t1'), // 1
      makeToolUse('t2'),    // 2
      makeToolResult('t2'), // 3
    ];
    // maxTurns=2 → cut=2; pair t2: useIndex(2) < 2? No → no shift
    const result = pruneMessages(msgs, { strategy: 'sliding-window', maxTurns: 2 });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(msgs[2]);
    expect(result[1]).toEqual(msgs[3]);
  });

  it('all three strategies return a new array reference', () => {
    const msgs = [makeUser('a'), makeUser('b'), makeUser('c')];
    expect(pruneMessages(msgs, { strategy: 'sliding-window', maxTurns: 2 })).not.toBe(msgs);
    expect(pruneMessages(msgs, { strategy: 'summarize', maxTurns: 2 })).not.toBe(msgs);
    expect(pruneMessages(msgs, { strategy: 'importance', maxTurns: 2 })).not.toBe(msgs);
  });

  it('importance never drops below 1 message even with extreme maxTurns', () => {
    const msgs = [makeUser('a'), makeUser('b')];
    const result = pruneMessages(msgs, { strategy: 'importance', maxTurns: 0 });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  // --- branch coverage for uncovered paths ---

  it('uses messages.length as default when maxTurns is omitted (no pruning)', () => {
    // covers: config.maxTurns ?? messages.length (line 144)
    const msgs = [makeUser('a'), makeUser('b'), makeUser('c')];
    const result = pruneMessages(msgs, { strategy: 'sliding-window' });
    expect(result).toHaveLength(3);
  });

  it('importance returns full array when maxTurns >= length', () => {
    // covers: importancePrune early-return true branch (line 93)
    const msgs = [makeUser('a'), makeUser('b'), makeUser('c')];
    const result = pruneMessages(msgs, { strategy: 'importance', maxTurns: 10 });
    expect(result).toHaveLength(3);
    expect(result).not.toBe(msgs);
  });

  it('sliding-window skips incomplete pair (tool_result without tool_use)', () => {
    // covers: useIndex < 0 → continue in slidingWindow (line 61)
    const msgs: BeskarMessage[] = [
      makeUser('u1'),
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'orphan', content: 'ok' }] },
      makeUser('recent'),
    ];
    const result = pruneMessages(msgs, { strategy: 'sliding-window', maxTurns: 2 });
    expect(result).toHaveLength(2);
  });

  it('importance handles orphaned tool_use (no matching tool_result)', () => {
    // covers: if (resultIndex >= 0) false branch (line 102)
    const msgs = [
      makeToolUse('orphan'), // no corresponding tool_result
      makeUser('u1'),
      makeUser('recent'),
    ];
    const result = pruneMessages(msgs, { strategy: 'importance', maxTurns: 2 });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('importance handles orphaned tool_result (no matching tool_use)', () => {
    // covers: if (useIndex >= 0) false branch (line 101)
    const msgs: BeskarMessage[] = [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'orphan', content: 'ok' }] },
      makeUser('u1'),
      makeUser('recent'),
    ];
    const result = pruneMessages(msgs, { strategy: 'importance', maxTurns: 2 });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

// --- findToolPairs branch coverage ---

describe('findToolPairs — branch coverage', () => {
  it('creates new entry when tool_result precedes its tool_use', () => {
    // covers: ?? fallback on user path (line 40) creating a new entry
    const msgs: BeskarMessage[] = [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'rev', content: 'ok' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'rev', name: 'fn', input: {} }] },
    ];
    const pairs = findToolPairs(msgs);
    expect(pairs.size).toBe(1);
    expect(pairs.get('rev')).toEqual({ useIndex: 1, resultIndex: 0 });
  });
});

// --- scoreMessage branch coverage ---

describe('scoreMessage — branch coverage', () => {
  it('returns 0 recency when total is 0', () => {
    // covers: total > 0 ? ... : 0 false branch (line 85)
    const score = scoreMessage(makeUser('x'), 0, 0);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(0.5); // no recency contribution
  });
});
