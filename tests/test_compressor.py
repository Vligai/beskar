"""Tests for beskar.compressor."""
from __future__ import annotations

import pytest

from beskar.compressor import collapse_tool_chains, compress_tool_result
from beskar.types import CompressorConfig


# --- compress_tool_result ---


def _make_block(content: object, tool_use_id: str = "tu1") -> dict:
    return {"type": "tool_result", "tool_use_id": tool_use_id, "content": content}


def test_compress_below_limit_unchanged() -> None:
    block = _make_block("a" * 400)  # 100 tokens — below 150-token limit
    result = compress_tool_result(block, CompressorConfig(max_tool_result_tokens=150))
    assert result["content"] == block["content"]


def test_compress_above_limit_truncated() -> None:
    block = _make_block("x" * 200)  # 50 tokens — above 10-token limit
    result = compress_tool_result(block, CompressorConfig(max_tool_result_tokens=10))
    assert isinstance(result["content"], str)
    assert result["content"].endswith("\n[truncated]")
    assert len(result["content"]) == 10 * 4 + len("\n[truncated]")


def test_compress_preserves_tool_use_id() -> None:
    block = _make_block("y" * 200, tool_use_id="preserve-me")
    result = compress_tool_result(block, CompressorConfig(max_tool_result_tokens=5))
    assert result["tool_use_id"] == "preserve-me"


def test_compress_does_not_mutate_input() -> None:
    block = _make_block("z" * 200)
    original_content = block["content"]
    compress_tool_result(block, CompressorConfig(max_tool_result_tokens=5))
    assert block["content"] == original_content


def test_compress_no_max_unchanged() -> None:
    block = _make_block("big content " * 100)
    result = compress_tool_result(block, CompressorConfig())
    assert result is block


def test_compress_array_content_preserves_non_text() -> None:
    content = [
        {"type": "text", "text": "a" * 200},
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "abc"}},
    ]
    block = _make_block(content)
    result = compress_tool_result(block, CompressorConfig(max_tool_result_tokens=10))
    result_content = result["content"]
    assert isinstance(result_content, list)
    text_blocks = [b for b in result_content if b.get("type") == "text"]
    image_blocks = [b for b in result_content if b.get("type") == "image"]
    assert len(text_blocks) == 1
    assert text_blocks[0]["text"].endswith("\n[truncated]")
    assert len(image_blocks) == 1


def test_compress_array_below_limit_unchanged() -> None:
    content = [{"type": "text", "text": "short"}]
    block = _make_block(content)
    result = compress_tool_result(block, CompressorConfig(max_tool_result_tokens=150))
    assert result is block


# --- collapse_tool_chains ---


def _make_pair(tool_id: str, tool_name: str) -> list:
    return [
        {
            "role": "assistant",
            "content": [{"type": "tool_use", "id": tool_id, "name": tool_name, "input": {}}],
        },
        {
            "role": "user",
            "content": [{"type": "tool_result", "tool_use_id": tool_id, "content": "result"}],
        },
    ]


def test_collapse_no_config_unchanged() -> None:
    messages = _make_pair("t1", "search")
    result = collapse_tool_chains(messages, CompressorConfig())
    assert result == messages


def test_collapse_pair_within_threshold_kept() -> None:
    # pair at (2,3) in 4-msg array → distance from end = 0 → 0 > 1 is false
    messages = [
        {"role": "user", "content": "start"},
        {"role": "assistant", "content": "mid"},
        *_make_pair("t1", "search"),
    ]
    result = collapse_tool_chains(messages, CompressorConfig(collapse_after_turns=1))
    assert len(result) == 4


def test_collapse_pair_beyond_threshold_collapsed() -> None:
    # pair at (0,1) in 4-msg array → result at index 1 → distance = 2 > 1 → collapse
    messages = [
        *_make_pair("t1", "myTool"),
        {"role": "assistant", "content": "next"},
        {"role": "user", "content": "follow"},
    ]
    result = collapse_tool_chains(messages, CompressorConfig(collapse_after_turns=1))
    assert len(result) == 3
    assert "myTool" in result[0]["content"]
    assert result[0]["role"] == "assistant"


def test_collapse_multi_tool_turn_not_collapsed() -> None:
    messages = [
        {
            "role": "assistant",
            "content": [
                {"type": "tool_use", "id": "t1", "name": "tool1", "input": {}},
                {"type": "tool_use", "id": "t2", "name": "tool2", "input": {}},
            ],
        },
        {
            "role": "user",
            "content": [
                {"type": "tool_result", "tool_use_id": "t1", "content": "r1"},
                {"type": "tool_result", "tool_use_id": "t2", "content": "r2"},
            ],
        },
        {"role": "assistant", "content": "done"},
        {"role": "user", "content": "ok"},
    ]
    result = collapse_tool_chains(messages, CompressorConfig(collapse_after_turns=1))
    assert len(result) == 4


def test_collapse_does_not_mutate_input() -> None:
    messages = [*_make_pair("t1", "tool"), {"role": "user", "content": "final"}]
    original = list(messages)
    collapse_tool_chains(messages, CompressorConfig(collapse_after_turns=0))
    assert messages == original


def test_collapse_empty_messages() -> None:
    result = collapse_tool_chains([], CompressorConfig(collapse_after_turns=1))
    assert result == []


def test_collapse_no_tool_calls_unchanged() -> None:
    messages = [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "world"},
    ]
    result = collapse_tool_chains(messages, CompressorConfig(collapse_after_turns=0))
    assert result == messages


def test_collapse_message_contains_tool_name() -> None:
    messages = [
        *_make_pair("t1", "specialTool"),
        {"role": "user", "content": "later"},
        {"role": "assistant", "content": "done"},
    ]
    result = collapse_tool_chains(messages, CompressorConfig(collapse_after_turns=1))
    assert "specialTool" in result[0]["content"]
    assert result[0]["role"] == "assistant"
