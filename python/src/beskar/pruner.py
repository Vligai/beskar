"""Pruner module — context window management for agentic loops."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from .types import BeskarMessage, PrunerConfig


def _get_content_text(message: BeskarMessage) -> str:
    content: Any = message["content"]
    if isinstance(content, str):
        return content
    return "".join(
        block.get("text", "")
        for block in content
        if isinstance(block, dict) and block.get("type") == "text"
    )


def _has_tool_use(message: BeskarMessage) -> bool:
    content: Any = message["content"]
    if isinstance(content, str):
        return False
    return any(
        isinstance(block, dict) and block.get("type") == "tool_use"
        for block in content
    )


def find_tool_pairs(messages: List[BeskarMessage]) -> Dict[str, Tuple[int, int]]:
    """Map tool_use_id → (use_index, result_index) for each tool call pair found.

    Either index is -1 when the corresponding message is absent.
    """
    pairs: Dict[str, List[int]] = {}  # tool_use_id → [use_index, result_index]

    for i, msg in enumerate(messages):
        content: Any = msg["content"]
        if isinstance(content, str):
            continue
        role = msg["role"]
        for block in content:
            if not isinstance(block, dict):
                continue
            if role == "assistant" and block.get("type") == "tool_use":
                tool_id: Any = block.get("id")
                if tool_id:
                    if tool_id not in pairs:
                        pairs[tool_id] = [-1, -1]
                    pairs[tool_id][0] = i
            elif role == "user" and block.get("type") == "tool_result":
                tool_id = block.get("tool_use_id")
                if tool_id:
                    if tool_id not in pairs:
                        pairs[tool_id] = [-1, -1]
                    pairs[tool_id][1] = i

    return {k: (v[0], v[1]) for k, v in pairs.items()}


def _sliding_window(
    messages: List[BeskarMessage], max_turns: int
) -> List[BeskarMessage]:
    if max_turns >= len(messages):
        return list(messages)

    cut = len(messages) - max_turns
    if cut >= len(messages):
        cut = len(messages) - 1

    pairs = find_tool_pairs(messages)
    for use_idx, result_idx in pairs.values():
        if use_idx < 0 or result_idx < 0:
            continue
        # If assistant turn is before cut and tool_result is at/after cut, shift to preserve
        if use_idx < cut <= result_idx:
            cut = use_idx

    return list(messages[cut:])


def _summarize(
    messages: List[BeskarMessage], max_turns: int
) -> List[BeskarMessage]:
    if max_turns >= len(messages):
        return list(messages)

    retained = list(messages[len(messages) - max_turns :])
    n_summarized = len(messages) - len(retained)
    summary: BeskarMessage = {
        "role": "user",
        "content": f"[Previous context: {n_summarized} turns summarized]",
    }
    return [summary] + retained


def _score_message(message: BeskarMessage, index: int, total: int) -> float:
    recency = (index / total) * 0.5 if total > 0 else 0.0
    tool_bonus = 0.3 if _has_tool_use(message) else 0.0
    text = _get_content_text(message)
    length_score = min(len(text) / 5000, 0.2)
    return recency + tool_bonus + length_score


def _importance_prune(
    messages: List[BeskarMessage], max_turns: int
) -> List[BeskarMessage]:
    if max_turns >= len(messages):
        return list(messages)

    pairs = find_tool_pairs(messages)
    total = len(messages)

    # Map each index to its pair id
    index_to_pair: Dict[int, str] = {}
    for pid, (use_idx, result_idx) in pairs.items():
        if use_idx >= 0:
            index_to_pair[use_idx] = pid
        if result_idx >= 0:
            index_to_pair[result_idx] = pid

    # Build logical units (standalone or paired)
    processed: set[int] = set()
    units: List[Dict[str, Any]] = []

    for i in range(len(messages)):
        if i in processed:
            continue
        pair_id = index_to_pair.get(i)
        if pair_id is not None:
            use_idx, result_idx = pairs[pair_id]
            pair_indices = [idx for idx in (use_idx, result_idx) if idx >= 0]
            min_score = min(
                _score_message(messages[idx], idx, total) for idx in pair_indices
            )
            units.append({"indices": pair_indices, "score": min_score})
            processed.update(pair_indices)
        else:
            score = _score_message(messages[i], i, total)
            units.append({"indices": [i], "score": score})
            processed.add(i)

    units.sort(key=lambda u: u["score"])

    dropped: set[int] = set()
    remaining = len(messages)

    for unit in units:
        if remaining <= max_turns:
            break
        if remaining - len(unit["indices"]) < 1:
            break
        dropped.update(unit["indices"])
        remaining -= len(unit["indices"])

    return [msg for i, msg in enumerate(messages) if i not in dropped]


def prune_messages(
    messages: List[BeskarMessage], config: PrunerConfig
) -> List[BeskarMessage]:
    """Prune the messages array to fit within the configured turn bound.

    Returns a new list — never mutates the input.
    Returns a copy if length is 0 or 1 (nothing to prune).
    """
    if len(messages) <= 1:
        return list(messages)

    max_turns = config.max_turns if config.max_turns is not None else len(messages)

    if config.strategy == "sliding-window":
        return _sliding_window(messages, max_turns)
    elif config.strategy == "summarize":
        return _summarize(messages, max_turns)
    else:  # importance
        return _importance_prune(messages, max_turns)
