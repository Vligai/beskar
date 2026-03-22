import type Anthropic from '@anthropic-ai/sdk';
import type { MetricsConfig, MetricsSummary, TokenUsage } from '../types.js';

interface ModelPricing {
  inputPerMToken: number;
  outputPerMToken: number;
  cacheCreationPerMToken: number;
  cacheReadPerMToken: number;
}

/**
 * Per-model pricing (USD per million tokens).
 * Falls back to Sonnet rates for unrecognised model strings.
 */
export const PRICING_BY_MODEL: Record<string, ModelPricing> = {
  'claude-sonnet-4-20250514': {
    inputPerMToken: 3.0,
    outputPerMToken: 15.0,
    cacheCreationPerMToken: 3.75,
    cacheReadPerMToken: 0.3,
  },
  'claude-haiku-4-5-20251001': {
    inputPerMToken: 0.8,
    outputPerMToken: 4.0,
    cacheCreationPerMToken: 1.0,
    cacheReadPerMToken: 0.08,
  },
  'claude-opus-4-20250514': {
    inputPerMToken: 15.0,
    outputPerMToken: 75.0,
    cacheCreationPerMToken: 18.75,
    cacheReadPerMToken: 1.5,
  },
};

const MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet-4-6': 'claude-sonnet-4-20250514',
  'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
  'claude-opus-4-6': 'claude-opus-4-20250514',
};

/** Default pricing (Sonnet) — kept for backward compatibility. */
export const PRICING: ModelPricing = PRICING_BY_MODEL['claude-sonnet-4-20250514'];

function resolvePricing(model?: string): ModelPricing {
  if (!model) return PRICING;
  const canonical = MODEL_ALIASES[model] ?? model;
  return PRICING_BY_MODEL[canonical] ?? PRICING;
}

export function mapUsage(raw: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: raw.input_tokens,
    outputTokens: raw.output_tokens,
    cacheCreationInputTokens: raw.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: raw.cache_read_input_tokens ?? 0,
  };
}

export function estimateCostUsd(usage: TokenUsage, model?: string): number {
  const p = resolvePricing(model);
  return (
    (usage.inputTokens / 1_000_000) * p.inputPerMToken +
    (usage.outputTokens / 1_000_000) * p.outputPerMToken +
    (usage.cacheCreationInputTokens / 1_000_000) * p.cacheCreationPerMToken +
    (usage.cacheReadInputTokens / 1_000_000) * p.cacheReadPerMToken
  );
}

export function estimateSavingsUsd(usage: TokenUsage, model?: string): number {
  const p = resolvePricing(model);
  const inputPricePerToken = p.inputPerMToken / 1_000_000;
  const cacheReadPricePerToken = p.cacheReadPerMToken / 1_000_000;
  return usage.cacheReadInputTokens * (inputPricePerToken - cacheReadPricePerToken);
}

export interface MetricsTracker {
  track(raw: Anthropic.Usage, model?: string): TokenUsage;
  summary(): MetricsSummary;
}

export function createMetricsTracker(config?: MetricsConfig): MetricsTracker {
  let totalCalls = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  let lastModel: string | undefined;

  return {
    track(raw: Anthropic.Usage, model?: string): TokenUsage {
      const usage = mapUsage(raw);
      if (model !== undefined) lastModel = model;
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
        estimatedCostUsd: estimateCostUsd(accumulated, lastModel),
        estimatedSavingsUsd: estimateSavingsUsd(accumulated, lastModel),
      };
    },
  };
}
