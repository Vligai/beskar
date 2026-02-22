import { describe, it, expect } from 'vitest';
import { compressToolResult, collapseToolChains } from './index.js';
import type { BeskarMessage } from '../types.js';
import type Anthropic from '@anthropic-ai/sdk';

// --- compressToolResult ---

describe('compressToolResult — string content', () => {
  const base: Anthropic.ToolResultBlockParam = {
    type: 'tool_result',
    tool_use_id: 'tu1',
    content: 'a'.repeat(400), // 100 tokens — below 150-token limit
  };

  it('returns block unchanged when content is below the limit', () => {
    const result = compressToolResult(base, { maxToolResultTokens: 150 });
    expect(result.content).toBe(base.content);
  });

  it('truncates content when above the limit and appends [truncated]', () => {
    // 200 chars = 50 tokens — set limit to 10 tokens → max 40 chars
    const block: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: 'tu1',
      content: 'x'.repeat(200),
    };
    const result = compressToolResult(block, { maxToolResultTokens: 10 });
    expect(typeof result.content).toBe('string');
    expect((result.content as string).endsWith('\n[truncated]')).toBe(true);
    // Should be exactly maxToolResultTokens * 4 chars + '\n[truncated]'
    expect((result.content as string).length).toBe(10 * 4 + '\n[truncated]'.length);
  });

  it('preserves tool_use_id after compression', () => {
    const block: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: 'preserve-me',
      content: 'y'.repeat(200),
    };
    const result = compressToolResult(block, { maxToolResultTokens: 5 });
    expect(result.tool_use_id).toBe('preserve-me');
  });

  it('does not mutate the original block', () => {
    const block: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: 'tu1',
      content: 'z'.repeat(200),
    };
    const originalContent = block.content;
    compressToolResult(block, { maxToolResultTokens: 5 });
    expect(block.content).toBe(originalContent);
  });

  it('returns block unchanged when maxToolResultTokens is not set', () => {
    const result = compressToolResult(base, {});
    expect(result).toBe(base);
  });
});

describe('compressToolResult — array content', () => {
  it('truncates text blocks and preserves non-text blocks', () => {
    const block: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: 'tu2',
      content: [
        { type: 'text', text: 'a'.repeat(200) },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
      ] as Anthropic.ToolResultBlockParam['content'],
    };
    const result = compressToolResult(block, { maxToolResultTokens: 10 });
    const arr = result.content as Array<{ type: string; text?: string }>;
    const textBlock = arr.find((b) => b.type === 'text');
    const imageBlock = arr.find((b) => b.type === 'image');
    expect(textBlock?.text?.endsWith('\n[truncated]')).toBe(true);
    expect(imageBlock).toBeDefined();
  });

  it('returns block unchanged when array content is below the limit', () => {
    const block: Anthropic.ToolResultBlockParam = {
      type: 'tool_result',
      tool_use_id: 'tu2',
      content: [{ type: 'text', text: 'short' }] as Anthropic.ToolResultBlockParam['content'],
    };
    const result = compressToolResult(block, { maxToolResultTokens: 150 });
    expect(result).toBe(block);
  });
});

// --- collapseToolChains ---

function makePair(id: string, name: string): [BeskarMessage, BeskarMessage] {
  return [
    {
      role: 'assistant',
      content: [{ type: 'tool_use', id, name, input: {} }],
    },
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: id, content: 'result' }],
    },
  ];
}

describe('collapseToolChains', () => {
  it('returns messages unchanged when collapseAfterTurns is not set', () => {
    const messages: BeskarMessage[] = [...makePair('t1', 'search')];
    const result = collapseToolChains(messages, {});
    expect(result).toEqual(messages);
  });

  it('does not collapse a pair within the threshold', () => {
    // pair at (2,3) in a 4-msg array → distance from end = 0 → 0 > 1 is false
    const messages: BeskarMessage[] = [
      { role: 'user', content: 'start' },
      { role: 'assistant', content: 'mid' },
      ...makePair('t1', 'search'),
    ];
    const result = collapseToolChains(messages, { collapseAfterTurns: 1 });
    expect(result.length).toBe(4);
  });

  it('collapses a pair beyond the threshold', () => {
    // pair at (0,1) in a 4-msg array → result at index 1 → distance = 3-1 = 2 > 1 → collapse
    const messages: BeskarMessage[] = [
      ...makePair('t1', 'myTool'),
      { role: 'assistant', content: 'next' },
      { role: 'user', content: 'follow' },
    ];
    const result = collapseToolChains(messages, { collapseAfterTurns: 1 });
    expect(result.length).toBe(3); // pair → 1 collapsed + 2 remaining
    expect(typeof result[0].content).toBe('string');
    expect(result[0].content).toContain('myTool');
    expect(result[0].role).toBe('assistant');
  });

  it('does not collapse multi-tool assistant turns', () => {
    const messages: BeskarMessage[] = [
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 't1', name: 'tool1', input: {} },
          { type: 'tool_use', id: 't2', name: 'tool2', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 't1', content: 'r1' },
          { type: 'tool_result', tool_use_id: 't2', content: 'r2' },
        ],
      },
      { role: 'assistant', content: 'done' },
      { role: 'user', content: 'ok' },
    ];
    const result = collapseToolChains(messages, { collapseAfterTurns: 1 });
    expect(result.length).toBe(4); // unchanged
  });

  it('does not mutate the original messages array', () => {
    const messages: BeskarMessage[] = [
      ...makePair('t1', 'tool'),
      { role: 'user', content: 'final' },
    ];
    const original = [...messages];
    collapseToolChains(messages, { collapseAfterTurns: 0 });
    expect(messages).toEqual(original);
  });

  it('handles empty messages array', () => {
    const result = collapseToolChains([], { collapseAfterTurns: 1 });
    expect(result).toEqual([]);
  });

  it('returns messages with no tool calls unchanged', () => {
    const messages: BeskarMessage[] = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ];
    const result = collapseToolChains(messages, { collapseAfterTurns: 0 });
    expect(result).toEqual(messages);
  });

  it('collapsed message has role assistant and contains tool name', () => {
    const messages: BeskarMessage[] = [
      ...makePair('t1', 'specialTool'),
      { role: 'user', content: 'later' },
      { role: 'assistant', content: 'done' },
    ];
    const result = collapseToolChains(messages, { collapseAfterTurns: 1 });
    const collapsed = result[0];
    expect(collapsed.role).toBe('assistant');
    expect(collapsed.content).toContain('specialTool');
  });
});
