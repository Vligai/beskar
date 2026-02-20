import { describe, it, expect } from 'vitest';
import type { BeskarConfig, TokenUsage, PrunerStrategy } from './types.js';

describe('shared types', () => {
  it('BeskarConfig accepts all modules disabled', () => {
    const config: BeskarConfig = {};
    expect(config.cache).toBeUndefined();
    expect(config.pruner).toBeUndefined();
    expect(config.compressor).toBeUndefined();
    expect(config.metrics).toBeUndefined();
  });

  it('BeskarConfig accepts false to explicitly disable a module', () => {
    const config: BeskarConfig = { cache: false, pruner: false };
    expect(config.cache).toBe(false);
    expect(config.pruner).toBe(false);
  });

  it('TokenUsage requires all four fields', () => {
    const usage: TokenUsage = {
      inputTokens: 1000,
      outputTokens: 200,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 800,
    };
    expect(usage.cacheReadInputTokens).toBe(800);
  });

  it('PrunerStrategy is one of three valid values', () => {
    const strategies: PrunerStrategy[] = ['sliding-window', 'summarize', 'importance'];
    expect(strategies).toHaveLength(3);
  });
});
