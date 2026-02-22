import { describe, it, expect, vi } from 'vitest';
import {
  mapUsage,
  estimateCostUsd,
  estimateSavingsUsd,
  createMetricsTracker,
  PRICING,
} from './index.js';
import type { TokenUsage } from '../types.js';

// --- mapUsage ---

describe('mapUsage', () => {
  it('maps all four fields when present', () => {
    const raw = {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 10,
    };
    const result = mapUsage(raw as Parameters<typeof mapUsage>[0]);
    expect(result).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationInputTokens: 20,
      cacheReadInputTokens: 10,
    });
  });

  it('defaults cache fields to 0 when absent (null)', () => {
    const raw = {
      input_tokens: 200,
      output_tokens: 80,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    };
    const result = mapUsage(raw as Parameters<typeof mapUsage>[0]);
    expect(result.cacheCreationInputTokens).toBe(0);
    expect(result.cacheReadInputTokens).toBe(0);
  });

  it('defaults cache fields to 0 when absent (undefined)', () => {
    const raw = { input_tokens: 300, output_tokens: 60 };
    const result = mapUsage(raw as Parameters<typeof mapUsage>[0]);
    expect(result.cacheCreationInputTokens).toBe(0);
    expect(result.cacheReadInputTokens).toBe(0);
  });
});

// --- estimateCostUsd ---

describe('estimateCostUsd', () => {
  it('returns 3.00 for 1M input tokens with all others at 0', () => {
    const usage: TokenUsage = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
    expect(estimateCostUsd(usage)).toBeCloseTo(3.0, 5);
  });

  it('returns 15.00 for 1M output tokens with all others at 0', () => {
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 1_000_000,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
    expect(estimateCostUsd(usage)).toBeCloseTo(15.0, 5);
  });

  it('returns 0 for all-zero usage', () => {
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
    expect(estimateCostUsd(usage)).toBe(0);
  });
});

// --- estimateSavingsUsd ---

describe('estimateSavingsUsd', () => {
  it('returns the difference between input price and cache-read price for 1M cache-read tokens', () => {
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 1_000_000,
    };
    const expected =
      (PRICING.inputPerMToken - PRICING.cacheReadPerMToken) / 1_000_000;
    expect(estimateSavingsUsd(usage)).toBeCloseTo(expected * 1_000_000, 5);
  });

  it('returns 0 when no cache reads', () => {
    const usage: TokenUsage = {
      inputTokens: 100,
      outputTokens: 50,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
    expect(estimateSavingsUsd(usage)).toBe(0);
  });
});

// --- createMetricsTracker ---

describe('createMetricsTracker', () => {
  it('returns zero summary before any track() calls', () => {
    const tracker = createMetricsTracker();
    const s = tracker.summary();
    expect(s.totalCalls).toBe(0);
    expect(s.totalInputTokens).toBe(0);
    expect(s.cacheHitRate).toBe(0);
    expect(s.estimatedCostUsd).toBe(0);
    expect(s.estimatedSavingsUsd).toBe(0);
  });

  it('accumulates totals across two track() calls', () => {
    const tracker = createMetricsTracker();
    tracker.track({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    } as Parameters<typeof tracker.track>[0]);
    tracker.track({
      input_tokens: 200,
      output_tokens: 80,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    } as Parameters<typeof tracker.track>[0]);

    const s = tracker.summary();
    expect(s.totalCalls).toBe(2);
    expect(s.totalInputTokens).toBe(300);
    expect(s.totalOutputTokens).toBe(130);
  });

  it('track() returns the per-call TokenUsage, not cumulative', () => {
    const tracker = createMetricsTracker();
    const first = tracker.track({
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    } as Parameters<typeof tracker.track>[0]);
    tracker.track({
      input_tokens: 200,
      output_tokens: 80,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    } as Parameters<typeof tracker.track>[0]);

    expect(first.inputTokens).toBe(100);
    expect(first.outputTokens).toBe(50);
  });

  it('computes cacheHitRate correctly', () => {
    const tracker = createMetricsTracker();
    tracker.track({
      input_tokens: 900_000,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 100_000,
    } as Parameters<typeof tracker.track>[0]);

    const s = tracker.summary();
    // hitRate = 100_000 / (900_000 + 100_000) = 0.1
    expect(s.cacheHitRate).toBeCloseTo(0.1, 5);
  });

  it('returns cacheHitRate 0 when no cache reads', () => {
    const tracker = createMetricsTracker();
    tracker.track({
      input_tokens: 500,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    } as Parameters<typeof tracker.track>[0]);
    expect(tracker.summary().cacheHitRate).toBe(0);
  });

  it('invokes onUsage callback after each track() call with per-call usage', () => {
    const onUsage = vi.fn();
    const tracker = createMetricsTracker({ onUsage });

    tracker.track({
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    } as Parameters<typeof tracker.track>[0]);
    tracker.track({
      input_tokens: 20,
      output_tokens: 8,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    } as Parameters<typeof tracker.track>[0]);

    expect(onUsage).toHaveBeenCalledTimes(2);
    expect(onUsage.mock.calls[0][0].inputTokens).toBe(10);
    expect(onUsage.mock.calls[1][0].inputTokens).toBe(20);
  });

  it('completes track() without error when no config provided', () => {
    const tracker = createMetricsTracker(undefined);
    expect(() =>
      tracker.track({
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      } as Parameters<typeof tracker.track>[0]),
    ).not.toThrow();
  });
});
