"""Tests for beskar.cache — prompt caching auto-structurer."""
from __future__ import annotations

from typing import Any, List

from beskar.cache import CacheRequest, estimate_tokens, structure_cache
from beskar.types import CacheConfig

# 4096 chars = 1024 tokens (exactly at default threshold)
AT_THRESHOLD = "a" * 4096
# 4097 chars > 1024 tokens (above threshold)
ABOVE_THRESHOLD = "a" * 4097
# 100 chars = 25 tokens (well below threshold)
BELOW_THRESHOLD = "a" * 100


# --- estimate_tokens ---


def test_estimate_tokens_1024() -> None:
    assert estimate_tokens("a" * 4096) == 1024


def test_estimate_tokens_empty() -> None:
    assert estimate_tokens("") == 0


def test_estimate_tokens_floors_fractional() -> None:
    # 3 chars / 4 = 0.75 → floor 0
    assert estimate_tokens("abc") == 0


# --- system prompt ---


def test_system_string_above_threshold_converts_to_array() -> None:
    req: CacheRequest = {"messages": [], "system": ABOVE_THRESHOLD}
    result = structure_cache(req)

    system: Any = result.request.get("system")
    assert isinstance(system, list)
    assert system[-1]["cache_control"] == {"type": "ephemeral"}
    assert len(result.breakpoints) == 1


def test_system_string_below_threshold_unchanged() -> None:
    req: CacheRequest = {"messages": [], "system": BELOW_THRESHOLD}
    result = structure_cache(req)

    assert result.request.get("system") == BELOW_THRESHOLD
    assert len(result.breakpoints) == 0


def test_system_array_above_threshold_marks_last_block() -> None:
    req: CacheRequest = {
        "messages": [],
        "system": [
            {"type": "text", "text": BELOW_THRESHOLD},
            {"type": "text", "text": ABOVE_THRESHOLD},
        ],
    }
    result = structure_cache(req)

    system: Any = result.request.get("system")
    assert isinstance(system, list)
    assert system[0].get("cache_control") is None
    assert system[1]["cache_control"] == {"type": "ephemeral"}
    assert len(result.breakpoints) == 1


def test_system_array_below_threshold_unchanged() -> None:
    req: CacheRequest = {
        "messages": [],
        "system": [{"type": "text", "text": BELOW_THRESHOLD}],
    }
    result = structure_cache(req)

    system: Any = result.request.get("system")
    assert isinstance(system, list)
    assert system[0].get("cache_control") is None
    assert len(result.breakpoints) == 0


# --- tools ---


def test_tools_above_threshold_marks_last() -> None:
    big_tool = {
        "name": "big_tool",
        "description": ABOVE_THRESHOLD,
        "input_schema": {"type": "object", "properties": {}},
    }
    req: CacheRequest = {"messages": [], "tools": [big_tool]}
    result = structure_cache(req)

    tools: Any = result.request.get("tools")
    assert isinstance(tools, list)
    assert tools[-1].get("cache_control") == {"type": "ephemeral"}
    assert len(result.breakpoints) == 1


def test_tools_below_threshold_unchanged() -> None:
    small_tool = {
        "name": "small",
        "description": BELOW_THRESHOLD,
        "input_schema": {"type": "object", "properties": {}},
    }
    req: CacheRequest = {"messages": [], "tools": [small_tool]}
    result = structure_cache(req)

    tools: Any = result.request.get("tools")
    assert isinstance(tools, list)
    assert tools[0].get("cache_control") is None
    assert len(result.breakpoints) == 0


# --- message breakpoints ---


def test_old_user_message_string_above_threshold() -> None:
    req: CacheRequest = {
        "messages": [
            {"role": "user", "content": ABOVE_THRESHOLD},
            {"role": "user", "content": "recent"},
        ]
    }
    result = structure_cache(req)

    assert len(result.breakpoints) == 1
    old_content: Any = result.request["messages"][0]["content"]
    assert isinstance(old_content, list)
    assert old_content[0]["cache_control"] == {"type": "ephemeral"}


def test_most_recent_user_message_never_cached() -> None:
    req: CacheRequest = {
        "messages": [{"role": "user", "content": ABOVE_THRESHOLD}]
    }
    result = structure_cache(req)

    assert len(result.breakpoints) == 0
    assert result.request["messages"][0]["content"] == ABOVE_THRESHOLD


def test_old_user_message_array_content_marks_last_text_block() -> None:
    req: CacheRequest = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": BELOW_THRESHOLD},
                    {"type": "text", "text": ABOVE_THRESHOLD},
                ],
            },
            {"role": "user", "content": "recent"},
        ]
    }
    result = structure_cache(req)

    assert len(result.breakpoints) == 1
    content: Any = result.request["messages"][0]["content"]
    assert isinstance(content, list)
    assert content[0].get("cache_control") is None
    assert content[1]["cache_control"] == {"type": "ephemeral"}


def test_array_content_no_text_blocks_skipped() -> None:
    req: CacheRequest = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "id1", "content": ABOVE_THRESHOLD}
                ],
            },
            {"role": "user", "content": "recent"},
        ]
    }
    result = structure_cache(req)

    assert len(result.breakpoints) == 0


def test_array_content_text_blocks_below_threshold_skipped() -> None:
    req: CacheRequest = {
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": BELOW_THRESHOLD}]},
            {"role": "user", "content": "recent"},
        ]
    }
    result = structure_cache(req)

    assert len(result.breakpoints) == 0


# --- 4-breakpoint limit ---


def test_four_breakpoint_limit() -> None:
    # system (1) + tools (1) + 4 old user messages = 6 eligible, but cap is 4
    old_msg: Any = {"role": "user", "content": ABOVE_THRESHOLD}
    big_tool = {
        "name": "big",
        "description": ABOVE_THRESHOLD,
        "input_schema": {"type": "object", "properties": {}},
    }
    req: CacheRequest = {
        "messages": [old_msg, old_msg, old_msg, old_msg, {"role": "user", "content": "recent"}],
        "system": ABOVE_THRESHOLD,
        "tools": [big_tool],
    }
    result = structure_cache(req)

    assert len(result.breakpoints) <= 4
    assert len(result.breakpoints) == 4


# --- immutability ---


def test_does_not_mutate_input() -> None:
    req: CacheRequest = {
        "messages": [{"role": "user", "content": ABOVE_THRESHOLD}],
        "system": ABOVE_THRESHOLD,
    }
    original_messages = req["messages"]
    original_system = req.get("system")

    structure_cache(req)

    assert req.get("system") == original_system
    assert req["messages"] is original_messages


# --- edge cases ---


def test_empty_request() -> None:
    req: CacheRequest = {"messages": []}
    result = structure_cache(req)

    assert len(result.breakpoints) == 0
    assert result.request["messages"] == []


def test_all_below_threshold() -> None:
    req: CacheRequest = {
        "messages": [{"role": "user", "content": BELOW_THRESHOLD}],
        "system": BELOW_THRESHOLD,
    }
    result = structure_cache(req)

    assert len(result.breakpoints) == 0


def test_custom_threshold_skips_at_default_threshold() -> None:
    # AT_THRESHOLD = 1024 tokens — below custom threshold of 2048, no breakpoint
    req: CacheRequest = {"messages": [], "system": AT_THRESHOLD}
    result = structure_cache(req, CacheConfig(min_token_threshold=2048))

    assert len(result.breakpoints) == 0


def test_exactly_at_threshold_gets_breakpoint() -> None:
    # AT_THRESHOLD = exactly 1024 tokens, default threshold is 1024 (inclusive)
    req: CacheRequest = {"messages": [], "system": AT_THRESHOLD}
    result = structure_cache(req)

    assert len(result.breakpoints) == 1
