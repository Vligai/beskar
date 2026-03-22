import type Anthropic from '@anthropic-ai/sdk';

// Direct alias — intentionally not a redefinition so SDK type changes surface at compile time
export type BeskarMessage = Anthropic.MessageParam;

export type PrunerStrategy = 'sliding-window' | 'summarize' | 'importance';

/** Base error for all Beskar-specific errors. */
export class BeskarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BeskarError';
  }
}

/** Raised when the pruner produces an invalid result. */
export class PrunerError extends BeskarError {
  constructor(message: string) {
    super(message);
    this.name = 'PrunerError';
  }
}

/** Raised when the compressor encounters an unrecoverable state. */
export class CompressorError extends BeskarError {
  constructor(message: string) {
    super(message);
    this.name = 'CompressorError';
  }
}

/** Estimate token count using 4-chars-per-token heuristic. */
export function estimateTokens(text: string): number {
  return Math.floor(text.length / 4);
}

export interface CacheConfig {
  minTokenThreshold?: number;
}

export interface PrunerConfig {
  strategy: PrunerStrategy;
  maxTurns?: number;
  /**
   * Reserved for V2 — will specify the model used for LLM-based summarization.
   * Currently unused. The "summarize" strategy is a V1 stub that inserts a
   * placeholder string, not a real summary.
   */
  summaryModel?: string;
}

export interface CompressorConfig {
  maxToolResultTokens?: number;
  collapseAfterTurns?: number;
}

export interface MetricsConfig {
  onUsage?: (usage: TokenUsage) => void;
}

export interface BeskarConfig {
  apiKey?: string;
  cache?: CacheConfig | false;
  pruner?: PrunerConfig | false;
  compressor?: CompressorConfig | false;
  metrics?: MetricsConfig | false;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface CacheBreakpoint {
  position: number;
  estimatedTokens: number;
}

export interface MetricsSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  cacheHitRate: number;
  estimatedCostUsd: number;
  estimatedSavingsUsd: number;
}
