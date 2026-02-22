import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn();
  return { mockCreate };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { BeskarClient } from './client.js';

// 4097 chars ≈ 1024 tokens — above the 1024-token cache threshold
const LARGE_SYSTEM = 'x'.repeat(4097);

function makeUsage(overrides: Partial<Anthropic.Usage> = {}): Anthropic.Usage {
  return {
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    ...overrides,
  };
}

function makeResponse(usage: Anthropic.Usage = makeUsage()): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'hi' }],
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage,
  };
}

const BASE_PARAMS: Anthropic.MessageCreateParamsNonStreaming = {
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'hello' }],
};

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue(makeResponse());
});

// --- Task 4.2: returns mocked response unchanged ---

describe('BeskarClient — response passthrough', () => {
  it('returns the Anthropic response unchanged', async () => {
    const response = makeResponse(makeUsage({ input_tokens: 200 }));
    mockCreate.mockResolvedValueOnce(response);
    const client = new BeskarClient({});
    const result = await client.messages.create(BASE_PARAMS);
    expect(result).toBe(response);
  });
});

// --- Task 4.3: cache enabled → params include cache_control ---

describe('BeskarClient — cache enabled', () => {
  it('passes cache_control on system to the SDK when cache is enabled', async () => {
    const client = new BeskarClient({ cache: {} });
    await client.messages.create({ ...BASE_PARAMS, system: LARGE_SYSTEM });

    const calledParams = mockCreate.mock.calls[0][0];
    const sys = calledParams.system as Array<{ cache_control?: { type: string } }>;
    expect(Array.isArray(sys)).toBe(true);
    expect(sys[sys.length - 1].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('does not add cache_control when cache config is false', async () => {
    const client = new BeskarClient({ cache: false });
    await client.messages.create({ ...BASE_PARAMS, system: LARGE_SYSTEM });

    const calledParams = mockCreate.mock.calls[0][0];
    expect(typeof calledParams.system).toBe('string');
  });
});

// --- Task 4.4: pruner enabled → SDK receives pruned array ---

describe('BeskarClient — pruner enabled', () => {
  it('delivers a pruned messages array to the SDK when maxTurns is exceeded', async () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'reply1' },
      { role: 'user', content: 'msg2' },
      { role: 'assistant', content: 'reply2' },
      { role: 'user', content: 'msg3' },
    ];
    const client = new BeskarClient({
      pruner: { strategy: 'sliding-window', maxTurns: 3 },
    });
    await client.messages.create({ ...BASE_PARAMS, messages });

    const calledParams = mockCreate.mock.calls[0][0];
    expect(calledParams.messages.length).toBe(3);
  });

  it('passes messages unchanged when pruner is false', async () => {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
      { role: 'assistant', content: 'd' },
      { role: 'user', content: 'e' },
    ];
    const client = new BeskarClient({ pruner: false });
    await client.messages.create({ ...BASE_PARAMS, messages });

    const calledParams = mockCreate.mock.calls[0][0];
    expect(calledParams.messages.length).toBe(5);
  });
});

// --- Task 4.5: metrics enabled → summary reflects usage ---

describe('BeskarClient — metrics enabled', () => {
  it('reflects response usage in summary after one call', async () => {
    const usage = makeUsage({ input_tokens: 300, output_tokens: 75 });
    mockCreate.mockResolvedValueOnce(makeResponse(usage));

    const client = new BeskarClient({ metrics: {} });
    await client.messages.create(BASE_PARAMS);

    const summary = client.metrics.summary();
    expect(summary.totalCalls).toBe(1);
    expect(summary.totalInputTokens).toBe(300);
    expect(summary.totalOutputTokens).toBe(75);
  });

  it('accumulates totals across multiple calls', async () => {
    const client = new BeskarClient({ metrics: {} });
    await client.messages.create(BASE_PARAMS);
    await client.messages.create(BASE_PARAMS);
    await client.messages.create(BASE_PARAMS);

    expect(client.metrics.summary().totalCalls).toBe(3);
  });
});

// --- Task 4.6: onUsage callback invoked ---

describe('BeskarClient — onUsage callback', () => {
  it('invokes onUsage after each messages.create() call', async () => {
    const onUsage = vi.fn();
    const usage = makeUsage({ input_tokens: 50 });
    mockCreate.mockResolvedValue(makeResponse(usage));

    const client = new BeskarClient({ metrics: { onUsage } });
    await client.messages.create(BASE_PARAMS);
    await client.messages.create(BASE_PARAMS);

    expect(onUsage).toHaveBeenCalledTimes(2);
    expect(onUsage.mock.calls[0][0].inputTokens).toBe(50);
  });
});

// --- Task 4.7 + 3.4: no module config ---

describe('BeskarClient — no module config', () => {
  it('calls SDK with the original params when no modules are configured', async () => {
    const client = new BeskarClient({});
    await client.messages.create(BASE_PARAMS);

    const calledParams = mockCreate.mock.calls[0][0];
    expect(calledParams.messages).toEqual(BASE_PARAMS.messages);
    expect(calledParams.system).toBeUndefined();
  });

  it('returns zeroed MetricsSummary before any calls', () => {
    const client = new BeskarClient({});
    const summary = client.metrics.summary();
    expect(summary.totalCalls).toBe(0);
    expect(summary.totalInputTokens).toBe(0);
    expect(summary.estimatedCostUsd).toBe(0);
  });

  it('returns zeroed MetricsSummary when metrics config is false', async () => {
    const client = new BeskarClient({ metrics: false });
    await client.messages.create(BASE_PARAMS);
    const summary = client.metrics.summary();
    expect(summary.totalCalls).toBe(0);
  });
});

// --- Task 3.1-3.3: module guard logic ---

describe('BeskarClient — module guards', () => {
  it('config.compressor: false → collapseToolChains never applied', async () => {
    // An old tool pair that would be collapsed if compressor were active
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu1', name: 'search', input: {} }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'result' }],
      },
      { role: 'assistant', content: 'next' },
      { role: 'user', content: 'follow-up' },
    ];
    const client = new BeskarClient({ compressor: false });
    await client.messages.create({ ...BASE_PARAMS, messages });

    const calledMessages = mockCreate.mock.calls[0][0].messages;
    expect(calledMessages.length).toBe(4);
  });

  it('config.compressor enabled → old tool pairs are collapsed', async () => {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'tu1', name: 'search', input: {} }],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tu1', content: 'result' }],
      },
      { role: 'assistant', content: 'next' },
      { role: 'user', content: 'follow-up' },
    ];
    const client = new BeskarClient({ compressor: { collapseAfterTurns: 1 } });
    await client.messages.create({ ...BASE_PARAMS, messages });

    const calledMessages = mockCreate.mock.calls[0][0].messages;
    // pair at (0,1) collapsed into 1, so 4 - 2 + 1 = 3 messages
    expect(calledMessages.length).toBe(3);
    expect(calledMessages[0].content).toContain('search');
  });
});
