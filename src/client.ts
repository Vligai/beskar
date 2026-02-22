import Anthropic from '@anthropic-ai/sdk';
import type { BeskarConfig, MetricsSummary } from './types.js';
import { pruneMessages } from './pruner/index.js';
import { structureCache } from './cache/index.js';
import { collapseToolChains } from './compressor/index.js';
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
          const cacheResult = structureCache({ messages, system, tools }, self.config.cache);
          messages = cacheResult.request.messages;
          system = cacheResult.request.system;
          tools = cacheResult.request.tools;
        }

        // Step 3 — Compressor (chain collapse)
        if (self.config.compressor) {
          messages = collapseToolChains(messages, self.config.compressor);
        }

        // Step 4 — API call
        const response = await self.anthropic.messages.create({
          ...params,
          messages,
          system,
          tools,
        });

        // Step 5 — Metrics
        self.tracker.track(response.usage);

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
