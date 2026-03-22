import Anthropic from '@anthropic-ai/sdk';
import type { BeskarConfig, MetricsSummary } from './types.js';
import { pruneMessages } from './pruner/index.js';
import { structureCache } from './cache/index.js';
import { compressToolResult, collapseToolChains } from './compressor/index.js';
import { createMetricsTracker } from './metrics/index.js';
import type { MetricsTracker } from './metrics/index.js';

export class BeskarClient {
  private readonly anthropic: Anthropic;
  private readonly config: BeskarConfig;
  private readonly tracker: MetricsTracker;

  readonly messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };

  readonly metrics: {
    summary(): MetricsSummary;
  };

  constructor(config: BeskarConfig = {}) {
    this.config = config;
    this.anthropic = new Anthropic({ apiKey: config.apiKey });
    this.tracker = createMetricsTracker(config.metrics || undefined);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    this.messages = {
      async create(
        params: Anthropic.MessageCreateParamsNonStreaming,
      ): Promise<Anthropic.Message> {
        let { messages, system, tools } = params;

        // Step 1 — Pruner
        if (self.config.pruner) {
          messages = pruneMessages(messages, self.config.pruner);
        }

        // Step 2 — Cache
        if (self.config.cache) {
          const cacheResult = structureCache(
            { messages, system, tools: tools as Anthropic.Tool[] | undefined },
            self.config.cache,
          );
          messages = cacheResult.request.messages;
          system = cacheResult.request.system;
          tools = cacheResult.request.tools;
        }

        // Step 3 — Compressor (truncate + chain collapse)
        if (self.config.compressor) {
          const compressorConfig = self.config.compressor;
          messages = messages.map((msg) => {
            if (msg.role === 'user' && Array.isArray(msg.content)) {
              const newContent = (msg.content as Anthropic.ToolResultBlockParam[]).map(
                (block) =>
                  (block as { type: string }).type === 'tool_result'
                    ? compressToolResult(block, compressorConfig)
                    : block,
              );
              return { ...msg, content: newContent } as typeof msg;
            }
            return msg;
          });
          messages = collapseToolChains(messages, compressorConfig);
        }

        // Step 4 — API call
        const response = await self.anthropic.messages.create({
          ...params,
          messages,
          system,
          tools,
        });

        // Step 5 — Metrics
        if (self.config.metrics) {
          self.tracker.track(response.usage, params.model);
        }

        return response;
      },
    };

    this.metrics = {
      summary(): MetricsSummary {
        return self.tracker.summary();
      },
    };
  }
}
