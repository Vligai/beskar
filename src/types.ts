import type Anthropic from '@anthropic-ai/sdk';

// Direct alias — intentionally not a redefinition so SDK type changes surface at compile time
export type BeskarMessage = Anthropic.MessageParam;

export type PrunerStrategy = 'sliding-window' | 'summarize' | 'importance';

export interface CacheConfig {
  minTokenThreshold?: number;
}

export interface PrunerConfig {
  strategy: PrunerStrategy;
  maxTurns?: number;
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
