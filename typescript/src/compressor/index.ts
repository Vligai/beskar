import type Anthropic from '@anthropic-ai/sdk';
import type { BeskarMessage, CompressorConfig } from '../types.js';

type AnyContentBlock = { type: string; id?: string; tool_use_id?: string; name?: string; text?: string };

export function compressToolResult(
  block: Anthropic.ToolResultBlockParam,
  config: CompressorConfig,
): Anthropic.ToolResultBlockParam {
  if (config.maxToolResultTokens === undefined) return block;

  const content = block.content;

  // Collect all text from the content
  let text: string;
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content) && content.length > 0) {
    text = (content as AnyContentBlock[])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
  } else {
    return block;
  }

  const estimatedTokens = Math.floor(text.length / 4);
  if (estimatedTokens <= config.maxToolResultTokens) return block;

  const truncated = text.slice(0, config.maxToolResultTokens * 4) + '\n[truncated]';

  if (typeof content === 'string') {
    return { ...block, content: truncated };
  }

  // Array content: replace text blocks with a single truncated text block; preserve non-text blocks
  const newContent: Anthropic.ToolResultBlockParam['content'] = [];
  let textReplaced = false;
  for (const b of content as AnyContentBlock[]) {
    if (b.type === 'text' && !textReplaced) {
      (newContent as AnyContentBlock[]).push({ ...b, text: truncated });
      textReplaced = true;
    } else if (b.type !== 'text') {
      (newContent as AnyContentBlock[]).push(b);
    }
    // Subsequent text blocks are dropped (merged into the first truncated one)
  }
  return { ...block, content: newContent };
}

export function collapseToolChains(
  messages: BeskarMessage[],
  config: CompressorConfig,
): BeskarMessage[] {
  if (config.collapseAfterTurns === undefined) return messages;

  const threshold = config.collapseAfterTurns;
  const n = messages.length;
  const result: BeskarMessage[] = [];
  const skip = new Set<number>();

  for (let i = 0; i < n; i++) {
    if (skip.has(i)) continue;

    const msg = messages[i];

    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const blocks = msg.content as AnyContentBlock[];
      const toolUseBlocks = blocks.filter((b) => b.type === 'tool_use');

      if (toolUseBlocks.length === 1) {
        const toolId = toolUseBlocks[0].id;
        const toolName = toolUseBlocks[0].name ?? 'unknown';
        const nextIdx = i + 1;

        if (nextIdx < n && messages[nextIdx].role === 'user') {
          const nextContent = messages[nextIdx].content;
          if (Array.isArray(nextContent)) {
            const hasMatchingResult = (nextContent as AnyContentBlock[]).some(
              (b) => b.type === 'tool_result' && b.tool_use_id === toolId,
            );

            if (hasMatchingResult) {
              const distanceFromEnd = n - 1 - nextIdx;
              if (distanceFromEnd > threshold) {
                const turnsAgo = n - i;
                result.push({
                  role: 'assistant',
                  content: `[Tool: ${toolName} — result collapsed after ${turnsAgo} turns]`,
                });
                skip.add(nextIdx);
                continue;
              }
            }
          }
        }
      }
    }

    result.push(msg);
  }

  return result;
}
