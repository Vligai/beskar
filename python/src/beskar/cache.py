"""Cache module — prompt caching auto-structurer."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, TypedDict, Union, cast

from .types import BeskarMessage, CacheBreakpoint, CacheConfig


class _CacheRequestRequired(TypedDict):
    messages: List[BeskarMessage]


class CacheRequest(_CacheRequestRequired, total=False):
    system: Union[str, List[Any]]
    tools: List[Any]


@dataclass
class CacheResult:
    request: CacheRequest
    breakpoints: List[CacheBreakpoint]


def estimate_tokens(text: str) -> int:
    """Estimate token count using 4-chars-per-token heuristic."""
    return len(text) // 4


def structure_cache(
    request: CacheRequest,
    config: Optional[CacheConfig] = None,
) -> CacheResult:
    """Place cache_control breakpoints on eligible content blocks.

    Mirrors the TypeScript structureCache logic:
    1. System prompt breakpoint
    2. Tools breakpoint
    3. Leading message breakpoints (skip most recent user message)
    Enforces a maximum of 4 breakpoints per request.
    Never mutates the input request.
    """
    threshold = config.min_token_threshold if config is not None else 1024
    breakpoints: List[CacheBreakpoint] = []
    placed = 0

    orig_system: Any = request.get("system")
    orig_tools: Any = request.get("tools")
    system: Any = orig_system
    tools: Any = orig_tools

    # 1. System prompt breakpoint
    if placed < 4 and system is not None:
        if isinstance(system, str):
            tokens = estimate_tokens(system)
            if tokens >= threshold:
                system = [
                    {"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}
                ]
                breakpoints.append(CacheBreakpoint(position=0, estimated_tokens=tokens))
                placed += 1
        elif isinstance(system, list) and len(system) > 0:
            last_idx = len(system) - 1
            tokens = estimate_tokens(str(system[last_idx].get("text", "")))
            if tokens >= threshold:
                system = [
                    {**block, "cache_control": {"type": "ephemeral"}} if i == last_idx else block
                    for i, block in enumerate(system)
                ]
                breakpoints.append(CacheBreakpoint(position=last_idx, estimated_tokens=tokens))
                placed += 1

    # 2. Tools breakpoint
    if placed < 4 and tools:
        combined_tokens = estimate_tokens(
            "".join(json.dumps(t, default=str) for t in tools)
        )
        if combined_tokens >= threshold:
            last_idx = len(tools) - 1
            tools = [
                {**tool, "cache_control": {"type": "ephemeral"}} if i == last_idx else tool
                for i, tool in enumerate(tools)
            ]
            breakpoints.append(
                CacheBreakpoint(
                    position=last_idx,
                    estimated_tokens=estimate_tokens(
                        json.dumps(tools[last_idx], default=str)
                    ),
                )
            )
            placed += 1

    # 3. Leading message breakpoints — skip the most recent user message
    messages: List[Any] = list(request["messages"])
    last_user_idx = -1
    for i, msg in enumerate(messages):
        if msg["role"] == "user":
            last_user_idx = i

    new_messages: List[Any] = []
    for i, msg in enumerate(messages):
        if placed >= 4 or msg["role"] != "user" or i == last_user_idx:
            new_messages.append(msg)
            continue

        content: Any = msg["content"]

        if isinstance(content, str):
            tokens = estimate_tokens(content)
            if tokens >= threshold:
                placed += 1
                breakpoints.append(CacheBreakpoint(position=i, estimated_tokens=tokens))
                new_messages.append(
                    {
                        **msg,
                        "content": [
                            {
                                "type": "text",
                                "text": content,
                                "cache_control": {"type": "ephemeral"},
                            }
                        ],
                    }
                )
            else:
                new_messages.append(msg)
            continue

        # Array content — find last text block
        content_list: List[Any] = list(content)
        last_text_idx = -1
        for j in range(len(content_list) - 1, -1, -1):
            blk: Any = content_list[j]
            if isinstance(blk, dict) and blk.get("type") == "text":
                last_text_idx = j
                break

        if last_text_idx == -1:
            new_messages.append(msg)
            continue

        tokens = estimate_tokens(str(content_list[last_text_idx].get("text", "")))
        if tokens >= threshold:
            placed += 1
            breakpoints.append(CacheBreakpoint(position=i, estimated_tokens=tokens))
            new_content = [
                {**blk, "cache_control": {"type": "ephemeral"}} if j == last_text_idx else blk
                for j, blk in enumerate(content_list)
            ]
            new_messages.append({**msg, "content": new_content})
        else:
            new_messages.append(msg)

    new_req: Dict[str, Any] = dict(request)
    new_req["messages"] = new_messages
    if system is not orig_system:
        new_req["system"] = system
    if tools is not orig_tools:
        new_req["tools"] = tools

    return CacheResult(request=cast(CacheRequest, new_req), breakpoints=breakpoints)
