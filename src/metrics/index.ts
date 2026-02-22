import type Anthropic from '@anthropic-ai/sdk';
import type { MetricsConfig, MetricsSummary, TokenUsage } from '../types.js';

export const PRICING = {
  inputPerMToken: 3.0,
  outputPerMToken: 15.0,
  cacheCreationPerMToken: 3.75,
  cacheReadPerMToken: 0.3,
};

export function mapUsage(raw: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: raw.input_tokens,
    outputTokens: raw.output_tokens,
    cacheCreationInputTokens: raw.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: raw.cache_read_input_tokens ?? 0,
  };
}

export function estimateCostUsd(usage: TokenUsage): number {
  return (
    (usage.inputTokens / 1_000_000) * PRICING.inputPerMToken +
    (usage.outputTokens / 1_000_000) * PRICING.outputPerMToken +
    (usage.cacheCreationInputTokens / 1_000_000) * PRICING.cacheCreationPerMToken +
    (usage.cacheReadInputTokens / 1_000_000) * PRICING.cacheReadPerMToken
  );
}

export function estimateSavingsUsd(usage: TokenUsage): number {
  const inputPricePerToken = PRICING.inputPerMToken / 1_000_000;
  const cacheReadPricePerToken = PRICING.cacheReadPerMToken / 1_000_000;
  return usage.cacheReadInputTokens * (inputPricePerToken - cacheReadPricePerToken);
}

export interface MetricsTracker {
  track(raw: Anthropic.Usage): TokenUsage;
  summary(): MetricsSummary;
}

export function createMetricsTracker(config?: MetricsConfig): MetricsTracker {
  let totalCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;

  return {
    track(raw: Anthropic.Usage): TokenUsage {
      const usage = mapUsage(raw);
      totalCalls++;
      totalInputTokens += usage.inputTokens;
      totalOutputTokens += usage.outputTokens;
      totalCacheCreationTokens += usage.cacheCreationInputTokens;
      totalCacheReadTokens += usage.cacheReadInputTokens;
      config?.onUsage?.(usage);
      return usage;
    },

    summary(): MetricsSummary {
      const denominator = totalInputTokens + totalCacheReadTokens;
      const cacheHitRate = denominator > 0 ? totalCacheReadTokens / denominator : 0;
      const accumulated: TokenUsage = {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cacheCreationInputTokens: totalCacheCreationTokens,
        cacheReadInputTokens: totalCacheReadTokens,
      };
      return {
        totalCalls,
        totalInputTokens,
        totalOutputTokens,
        totalCacheCreationTokens,
        totalCacheReadTokens,
        cacheHitRate,
        estimatedCostUsd: estimateCostUsd(accumulated),
        estimatedSavingsUsd: estimateSavingsUsd(accumulated),
      };
    },
  };
}
