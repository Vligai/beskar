import type Anthropic from '@anthropic-ai/sdk';
import type { BeskarMessage, CacheBreakpoint, CacheConfig } from '../types.js';

export interface CacheStructureRequest {
  messages: BeskarMessage[];
  system?: string | Anthropic.Messages.TextBlockParam[];
  tools?: Anthropic.Tool[];
}

export interface CacheStructureResult {
  request: CacheStructureRequest;
  breakpoints: CacheBreakpoint[];
}

export function estimateTokens(text: string): number {
  return Math.floor(text.length / 4);
}

function serializeToolText(tool: Anthropic.Tool): string {
  return JSON.stringify(tool);
}

export function structureCache(
  request: CacheStructureRequest,
  config?: CacheConfig,
): CacheStructureResult {
  const threshold = config?.minTokenThreshold ?? 1024;
  const breakpoints: CacheBreakpoint[] = [];
  let placed = 0;

  let system: CacheStructureRequest['system'] = request.system;
  let tools: CacheStructureRequest['tools'] = request.tools;

  // 1. System prompt breakpoint
  if (placed < 4 && system !== undefined) {
    if (typeof system === 'string') {
      const tokens = estimateTokens(system);
      if (tokens >= threshold) {
        system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
        breakpoints.push({ position: 0, estimatedTokens: tokens });
        placed++;
      }
    } else if (system.length > 0) {
      const lastIdx = system.length - 1;
      const tokens = estimateTokens(system[lastIdx].text);
      if (tokens >= threshold) {
        system = system.map((block, i) =>
          i === lastIdx ? { ...block, cache_control: { type: 'ephemeral' as const } } : block,
        );
        breakpoints.push({ position: lastIdx, estimatedTokens: tokens });
        placed++;
      }
    }
  }

  // 2. Tools breakpoint
  if (placed < 4 && tools && tools.length > 0) {
    const combinedTokens = estimateTokens(tools.map(serializeToolText).join(''));
    if (combinedTokens >= threshold) {
      const lastIdx = tools.length - 1;
      tools = tools.map((tool, i) =>
        i === lastIdx ? { ...tool, cache_control: { type: 'ephemeral' as const } } : tool,
      );
      breakpoints.push({
        position: lastIdx,
        estimatedTokens: estimateTokens(serializeToolText(tools[lastIdx])),
      });
      placed++;
    }
  }

  // 3. Leading message breakpoints — skip the most recent user message
  const lastUserIdx = request.messages.reduce(
    (found, msg, i) => (msg.role === 'user' ? i : found),
    -1,
  );

  const newMessages: BeskarMessage[] = [];
  for (let i = 0; i < request.messages.length; i++) {
    const msg = request.messages[i];

    if (placed >= 4 || msg.role !== 'user' || i === lastUserIdx) {
      newMessages.push(msg);
      continue;
    }

    const content = msg.content;

    if (typeof content === 'string') {
      const tokens = estimateTokens(content);
      if (tokens >= threshold) {
        placed++;
        breakpoints.push({ position: i, estimatedTokens: tokens });
        newMessages.push({
          ...msg,
          content: [{ type: 'text', text: content, cache_control: { type: 'ephemeral' } }],
        } as BeskarMessage);
      } else {
        newMessages.push(msg);
      }
      continue;
    }

    // Array content — find last text block
    let lastTextIdx = -1;
    for (let j = content.length - 1; j >= 0; j--) {
      if ((content[j] as { type: string }).type === 'text') {
        lastTextIdx = j;
        break;
      }
    }

    if (lastTextIdx === -1) {
      newMessages.push(msg);
      continue;
    }

    const textBlock = content[lastTextIdx] as Anthropic.Messages.TextBlockParam;
    const tokens = estimateTokens(textBlock.text);

    if (tokens >= threshold) {
      placed++;
      breakpoints.push({ position: i, estimatedTokens: tokens });
      const newContent = content.map((block, j) =>
        j === lastTextIdx
          ? ({ ...block, cache_control: { type: 'ephemeral' } } as typeof block)
          : block,
      );
      newMessages.push({ ...msg, content: newContent } as BeskarMessage);
    } else {
      newMessages.push(msg);
    }
  }

  return {
    request: { ...request, system, tools, messages: newMessages },
    breakpoints,
  };
}
