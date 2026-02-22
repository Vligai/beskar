"""Compressor module — tool result and chain compression."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Set

from .types import BeskarMessage, CompressorConfig


def compress_tool_result(block: Dict[str, Any], config: CompressorConfig) -> Dict[str, Any]:
    """Truncate oversized tool result content.

    Preserves `tool_use_id` and `type`. Never mutates the input block.
    """
    if config.max_tool_result_tokens is None:
        return block

    content: Any = block.get("content", "")

    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        text = "".join(
            b.get("text", "")
            for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        )
    else:
        return block

    estimated_tokens = len(text) // 4
    if estimated_tokens <= config.max_tool_result_tokens:
        return block

    truncated = text[: config.max_tool_result_tokens * 4] + "\n[truncated]"

    if isinstance(content, str):
        return {**block, "content": truncated}

    # Array content: replace first text block with truncated, preserve non-text, drop extra text
    new_content: List[Any] = []
    text_replaced = False
    for b in content:
        if isinstance(b, dict) and b.get("type") == "text" and not text_replaced:
            new_content.append({**b, "text": truncated})
            text_replaced = True
        elif not (isinstance(b, dict) and b.get("type") == "text"):
            new_content.append(b)
        # Subsequent text blocks are dropped (merged into the truncated one)

    return {**block, "content": new_content}


def collapse_tool_chains(
    messages: List[BeskarMessage], config: CompressorConfig
) -> List[BeskarMessage]:
    """Replace old single-tool pairs with a synthetic summary assistant message.

    Never mutates the input list or message objects.
    """
    if config.collapse_after_turns is None:
        return messages

    threshold = config.collapse_after_turns
    n = len(messages)
    result: List[Any] = []
    skip: Set[int] = set()

    for i in range(n):
        if i in skip:
            continue

        msg: Any = messages[i]

        if msg.get("role") == "assistant":
            content: Any = msg.get("content", "")
            if isinstance(content, list):
                tool_use_blocks = [
                    b
                    for b in content
                    if isinstance(b, dict) and b.get("type") == "tool_use"
                ]

                if len(tool_use_blocks) == 1:
                    tool_id = tool_use_blocks[0].get("id")
                    tool_name = tool_use_blocks[0].get("name", "unknown")
                    next_idx = i + 1

                    if next_idx < n:
                        next_msg: Any = messages[next_idx]
                        if next_msg.get("role") == "user":
                            next_content: Any = next_msg.get("content", "")
                            if isinstance(next_content, list):
                                has_matching = any(
                                    isinstance(b, dict)
                                    and b.get("type") == "tool_result"
                                    and b.get("tool_use_id") == tool_id
                                    for b in next_content
                                )
                                if has_matching:
                                    distance = n - 1 - next_idx
                                    if distance > threshold:
                                        turns_ago = n - i
                                        result.append(
                                            {
                                                "role": "assistant",
                                                "content": f"[Tool: {tool_name} \u2014 result collapsed after {turns_ago} turns]",
                                            }
                                        )
                                        skip.add(next_idx)
                                        continue

        result.append(msg)

    return result
