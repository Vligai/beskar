import { describe, expect, it } from 'vitest';
import { estimateTokens, structureCache } from './index.js';
import type { CacheStructureRequest } from './index.js';

// 4096 chars = 1024 tokens (just at the default threshold)
const AT_THRESHOLD = 'a'.repeat(4096);
// 4097 chars = 1024 tokens (above threshold)
const ABOVE_THRESHOLD = 'a'.repeat(4097);
// 100 chars = 25 tokens (well below)
const BELOW_THRESHOLD = 'a'.repeat(100);

// --- estimateTokens ---

describe('estimateTokens', () => {
  it('returns 1024 for a 4096-char string', () => {
    expect(estimateTokens('a'.repeat(4096))).toBe(1024);
  });

  it('returns 0 for an empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('floors fractional results', () => {
    expect(estimateTokens('abc')).toBe(0); // 3/4 = 0.75 → 0
  });
});

// --- system prompt ---

describe('structureCache — system string', () => {
  it('converts system string above threshold to array with cache_control on last block', () => {
    const req: CacheStructureRequest = { messages: [], system: ABOVE_THRESHOLD };
    const { request, breakpoints } = structureCache(req);

    expect(Array.isArray(request.system)).toBe(true);
    const sys = request.system as Array<{ type: string; cache_control?: { type: string } }>;
    expect(sys[sys.length - 1].cache_control).toEqual({ type: 'ephemeral' });
    expect(breakpoints).toHaveLength(1);
  });

  it('leaves system string below threshold unchanged', () => {
    const req: CacheStructureRequest = { messages: [], system: BELOW_THRESHOLD };
    const { request, breakpoints } = structureCache(req);

    expect(request.system).toBe(BELOW_THRESHOLD);
    expect(breakpoints).toHaveLength(0);
  });

  it('adds cache_control to last block of system array above threshold', () => {
    const req: CacheStructureRequest = {
      messages: [],
      system: [
        { type: 'text', text: BELOW_THRESHOLD },
        { type: 'text', text: ABOVE_THRESHOLD },
      ],
    };
    const { request, breakpoints } = structureCache(req);

    const sys = request.system as Array<{ cache_control?: unknown }>;
    expect(sys[0].cache_control).toBeUndefined();
    expect(sys[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(breakpoints).toHaveLength(1);
  });

  it('leaves system array unchanged when last block is below threshold', () => {
    const req: CacheStructureRequest = {
      messages: [],
      system: [{ type: 'text', text: BELOW_THRESHOLD }],
    };
    const { request, breakpoints } = structureCache(req);

    const sys = request.system as Array<{ cache_control?: unknown }>;
    expect(sys[0].cache_control).toBeUndefined();
    expect(breakpoints).toHaveLength(0);
  });
});

// --- tools ---

describe('structureCache — tools', () => {
  const bigTool = {
    name: 'big_tool',
    description: ABOVE_THRESHOLD,
    input_schema: { type: 'object' as const, properties: {} },
  };
  const smallTool = {
    name: 'small',
    description: BELOW_THRESHOLD,
    input_schema: { type: 'object' as const, properties: {} },
  };

  it('adds cache_control to last tool when combined size is above threshold', () => {
    const req: CacheStructureRequest = { messages: [], tools: [bigTool] };
    const { request, breakpoints } = structureCache(req);

    const tools = request.tools as Array<{ cache_control?: unknown }>;
    expect(tools[tools.length - 1].cache_control).toEqual({ type: 'ephemeral' });
    expect(breakpoints).toHaveLength(1);
  });

  it('places no breakpoint when tools are below threshold', () => {
    const req: CacheStructureRequest = { messages: [], tools: [smallTool] };
    const { request, breakpoints } = structureCache(req);

    const tools = request.tools as Array<{ cache_control?: unknown }>;
    expect(tools[0].cache_control).toBeUndefined();
    expect(breakpoints).toHaveLength(0);
  });
});

// --- leading messages ---

describe('structureCache — message breakpoints', () => {
  const makeUserMsg = (text: string) => ({
    role: 'user' as const,
    content: text,
  });

  it('adds breakpoint to old user message with large content', () => {
    const req: CacheStructureRequest = {
      messages: [makeUserMsg(ABOVE_THRESHOLD), makeUserMsg('recent')],
    };
    const { request, breakpoints } = structureCache(req);

    expect(breakpoints).toHaveLength(1);
    // The old message should have its content wrapped with cache_control
    const oldMsg = request.messages[0];
    expect(Array.isArray(oldMsg.content)).toBe(true);
    const content = oldMsg.content as Array<{ cache_control?: unknown }>;
    expect(content[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('never adds breakpoint to the most recent user message', () => {
    const req: CacheStructureRequest = {
      messages: [makeUserMsg(ABOVE_THRESHOLD)],
    };
    const { request, breakpoints } = structureCache(req);

    expect(breakpoints).toHaveLength(0);
    expect(request.messages[0].content).toBe(ABOVE_THRESHOLD);
  });
});

  it('adds breakpoint to old user message with large array content (text block)', () => {
    const req: CacheStructureRequest = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: BELOW_THRESHOLD },
            { type: 'text', text: ABOVE_THRESHOLD },
          ],
        },
        { role: 'user', content: 'recent' },
      ],
    };
    const { request, breakpoints } = structureCache(req);

    expect(breakpoints).toHaveLength(1);
    const content = request.messages[0].content as Array<{ cache_control?: unknown }>;
    expect(content[0].cache_control).toBeUndefined();
    expect(content[1].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('skips user message with array content but no text blocks', () => {
    const req: CacheStructureRequest = {
      messages: [
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'id1', content: ABOVE_THRESHOLD }],
        },
        { role: 'user', content: 'recent' },
      ],
    };
    const { breakpoints } = structureCache(req);
    expect(breakpoints).toHaveLength(0);
  });

  it('skips user message with array content where text blocks are below threshold', () => {
    const req: CacheStructureRequest = {
      messages: [
        { role: 'user', content: [{ type: 'text', text: BELOW_THRESHOLD }] },
        { role: 'user', content: 'recent' },
      ],
    };
    const { breakpoints } = structureCache(req);
    expect(breakpoints).toHaveLength(0);
  });

// --- 4-breakpoint limit ---

describe('structureCache — 4-breakpoint limit', () => {
  it('places at most 4 breakpoints even with 6 eligible blocks', () => {
    // system (1) + tools (1) + 4 old user messages, but only 4 total slots
    const oldMsg = { role: 'user' as const, content: ABOVE_THRESHOLD };
    const req: CacheStructureRequest = {
      messages: [oldMsg, oldMsg, oldMsg, oldMsg, { role: 'user' as const, content: 'recent' }],
      system: ABOVE_THRESHOLD,
      tools: [
        {
          name: 'big',
          description: ABOVE_THRESHOLD,
          input_schema: { type: 'object' as const, properties: {} },
        },
      ],
    };
    const { breakpoints } = structureCache(req);
    expect(breakpoints.length).toBeLessThanOrEqual(4);
    expect(breakpoints).toHaveLength(4);
  });

  it('returned breakpoints length matches number actually placed', () => {
    const req: CacheStructureRequest = { messages: [], system: ABOVE_THRESHOLD };
    const { request: _r, breakpoints } = structureCache(req);
    expect(breakpoints).toHaveLength(1);
  });
});

// --- immutability ---

describe('structureCache — immutability', () => {
  it('does not mutate the input request', () => {
    const originalSystem = ABOVE_THRESHOLD;
    const req: CacheStructureRequest = {
      messages: [{ role: 'user', content: ABOVE_THRESHOLD }],
      system: originalSystem,
    };
    const originalMessages = req.messages;

    structureCache(req);

    expect(req.system).toBe(originalSystem);
    expect(req.messages).toBe(originalMessages);
  });
});

// --- edge cases ---

describe('structureCache — edge cases', () => {
  it('returns original request unchanged with empty input', () => {
    const req: CacheStructureRequest = { messages: [] };
    const { request, breakpoints } = structureCache(req);

    expect(breakpoints).toHaveLength(0);
    expect(request.messages).toEqual([]);
  });

  it('returns unchanged request when all content is below threshold', () => {
    const req: CacheStructureRequest = {
      messages: [{ role: 'user', content: BELOW_THRESHOLD }],
      system: BELOW_THRESHOLD,
    };
    const { breakpoints } = structureCache(req);
    expect(breakpoints).toHaveLength(0);
  });

  it('respects custom minTokenThreshold of 2048', () => {
    // AT_THRESHOLD is exactly 1024 tokens — below 2048, so no breakpoint
    const req: CacheStructureRequest = { messages: [], system: AT_THRESHOLD };
    const { breakpoints } = structureCache(req, { minTokenThreshold: 2048 });
    expect(breakpoints).toHaveLength(0);
  });

  it('applies breakpoint at exactly the threshold (inclusive)', () => {
    // AT_THRESHOLD = exactly 1024 tokens
    const req: CacheStructureRequest = { messages: [], system: AT_THRESHOLD };
    const { breakpoints } = structureCache(req);
    expect(breakpoints).toHaveLength(1);
  });
});
