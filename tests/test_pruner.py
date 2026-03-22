"""Tests for beskar.pruner — context window management."""
from __future__ import annotations

from typing import Any, List

from beskar.pruner import find_tool_pairs, prune_messages
from beskar.types import BeskarMessage, PrunerConfig

# --- Test helpers ---


def make_user(text: str) -> BeskarMessage:
    return {"role": "user", "content": text}


def make_assistant(text: str) -> BeskarMessage:
    return {"role": "assistant", "content": text}


def make_tool_use(tool_id: str) -> BeskarMessage:
    return {
        "role": "assistant",
        "content": [{"type": "tool_use", "id": tool_id, "name": "fn", "input": {}}],
    }


def make_tool_result(tool_use_id: str) -> BeskarMessage:
    return {
        "role": "user",
        "content": [{"type": "tool_result", "tool_use_id": tool_use_id, "content": "ok"}],
    }


# --- find_tool_pairs ---


def test_find_tool_pairs_one_pair() -> None:
    msgs = [make_user("q"), make_tool_use("id1"), make_tool_result("id1")]
    pairs = find_tool_pairs(msgs)
    assert len(pairs) == 1
    assert pairs["id1"] == (1, 2)


def test_find_tool_pairs_no_tool_calls() -> None:
    msgs = [make_user("u"), make_assistant("a"), make_user("u2")]
    assert find_tool_pairs(msgs) == {}


def test_find_tool_pairs_multiple_tool_use_in_one_turn() -> None:
    msgs: List[BeskarMessage] = [
        {
            "role": "assistant",
            "content": [
                {"type": "tool_use", "id": "a", "name": "f1", "input": {}},
                {"type": "tool_use", "id": "b", "name": "f2", "input": {}},
            ],
        },
        make_tool_result("a"),
        make_tool_result("b"),
    ]
    pairs = find_tool_pairs(msgs)
    assert pairs["a"] == (0, 1)
    assert pairs["b"] == (0, 2)


def test_find_tool_pairs_skips_string_content() -> None:
    msgs = [make_user("hello"), make_assistant("hi")]
    assert find_tool_pairs(msgs) == {}


# --- sliding-window ---


def sliding(msgs: List[BeskarMessage], max_turns: int) -> List[BeskarMessage]:
    return prune_messages(msgs, PrunerConfig(strategy="sliding-window", max_turns=max_turns))


def test_sliding_window_trims_to_max_turns() -> None:
    msgs = [make_user(f"m{i}") for i in range(10)]
    result = sliding(msgs, 4)
    assert len(result) == 4
    assert result[0] == make_user("m6")
    assert result[3] == make_user("m9")


def test_sliding_window_shifts_cut_to_preserve_tool_pair() -> None:
    msgs = [
        make_user("u1"),          # 0
        make_assistant("a1"),     # 1
        make_tool_use("tool1"),   # 2
        make_tool_result("tool1"), # 3
        make_user("recent"),      # 4
    ]
    # maxTurns=2 → cut=3; use_idx(2) < 3 <= result_idx(3) → shift to 2
    result = sliding(msgs, 2)
    assert len(result) == 3  # shifted, 3 not 2
    assert result[0] == msgs[2]
    assert result[1] == msgs[3]
    assert result[2] == msgs[4]


def test_sliding_window_returns_full_array_when_max_turns_ge_length() -> None:
    msgs = [make_user("a"), make_user("b"), make_user("c")]
    result = sliding(msgs, 10)
    assert len(result) == 3
    assert result is not msgs


def test_sliding_window_max_turns_zero_returns_last_one() -> None:
    msgs = [make_user("old"), make_user("new")]
    result = sliding(msgs, 0)
    assert len(result) == 1
    assert result[0] == make_user("new")


# --- summarize ---


def summarize(msgs: List[BeskarMessage], max_turns: int) -> List[BeskarMessage]:
    return prune_messages(msgs, PrunerConfig(strategy="summarize", max_turns=max_turns))


def test_summarize_8_messages_with_max_turns_4() -> None:
    msgs = [make_user(f"m{i}") for i in range(8)]
    result = summarize(msgs, 4)
    assert len(result) == 5
    assert result[0]["role"] == "user"
    assert result[0]["content"] == "[Previous context: 4 turns summarized]"
    assert result[1] == msgs[4]
    assert result[4] == msgs[7]


def test_summarize_returns_full_array_when_max_turns_ge_length() -> None:
    msgs = [make_user("a"), make_user("b")]
    result = summarize(msgs, 5)
    assert len(result) == 2
    assert result is not msgs


# --- importance ---


def importance(msgs: List[BeskarMessage], max_turns: int) -> List[BeskarMessage]:
    return prune_messages(msgs, PrunerConfig(strategy="importance", max_turns=max_turns))


def test_importance_drops_oldest_shortest_first() -> None:
    msgs = [
        make_user("x"),  # 0 — oldest, shortest → lowest score
        make_user("y"),  # 1
        make_user("z"),  # 2 — newest
    ]
    result = importance(msgs, 2)
    assert len(result) == 2
    assert result[0] == make_user("y")
    assert result[1] == make_user("z")


def test_importance_drops_tool_pair_atomically() -> None:
    msgs = [
        make_tool_use("tool1"),    # 0 — has tool bonus but oldest
        make_tool_result("tool1"), # 1 — paired; pair minScore is low
        make_user("u1"),           # 2
        make_user("u2"),           # 3 — newest
    ]
    # pair minScore = min(score(0), score(1)) = min(0.3, 0.125) = 0.125
    # Drop pair → remaining=2, both tool messages removed atomically
    result = importance(msgs, 2)
    assert len(result) == 2
    for msg in result:
        content: Any = msg["content"]
        if isinstance(content, list):
            for block in content:
                assert block.get("type") not in ("tool_use", "tool_result")


# --- edge cases ---


def test_empty_list_returns_empty() -> None:
    assert prune_messages([], PrunerConfig(strategy="sliding-window", max_turns=4)) == []


def test_single_message_returned_unchanged() -> None:
    msgs = [make_user("only")]
    result = prune_messages(msgs, PrunerConfig(strategy="sliding-window", max_turns=4))
    assert len(result) == 1


def test_all_three_strategies_return_new_list_reference() -> None:
    msgs = [make_user("a"), make_user("b"), make_user("c")]
    sw = prune_messages(msgs, PrunerConfig(strategy="sliding-window", max_turns=2))
    sm = prune_messages(msgs, PrunerConfig(strategy="summarize", max_turns=2))
    imp = prune_messages(msgs, PrunerConfig(strategy="importance", max_turns=2))
    assert sw is not msgs
    assert sm is not msgs
    assert imp is not msgs


def test_sliding_window_with_only_tool_pairs_preserves_boundary() -> None:
    msgs = [
        make_tool_use("t1"),
        make_tool_result("t1"),
        make_tool_use("t2"),
        make_tool_result("t2"),
    ]
    # max_turns=2 → cut=2; pair t2: use_idx(2) < 2? No → no shift
    result = sliding(msgs, 2)
    assert len(result) == 2
    assert result[0] == msgs[2]
    assert result[1] == msgs[3]


def test_importance_never_drops_below_1() -> None:
    msgs = [make_user("a"), make_user("b")]
    result = importance(msgs, 0)
    assert len(result) >= 1


def test_sliding_window_skips_incomplete_pair() -> None:
    # tool_result without a tool_use — orphan pair, should not affect cut
    msgs: List[BeskarMessage] = [
        make_user("u1"),
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "orphan", "content": "ok"}]},
        make_user("recent"),
    ]
    result = sliding(msgs, 2)
    assert len(result) == 2


def test_importance_handles_orphaned_tool_use() -> None:
    # tool_use without matching tool_result
    msgs = [make_tool_use("orphan"), make_user("u1"), make_user("recent")]
    result = importance(msgs, 2)
    assert len(result) >= 1


def test_importance_handles_orphaned_tool_result() -> None:
    # tool_result without matching tool_use
    msgs: List[BeskarMessage] = [
        {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "orphan", "content": "ok"}]},
        make_user("u1"),
        make_user("recent"),
    ]
    result = importance(msgs, 2)
    assert len(result) >= 1


def test_importance_returns_full_array_when_max_turns_ge_length() -> None:
    msgs = [make_user("a"), make_user("b"), make_user("c")]
    result = importance(msgs, 10)
    assert len(result) == 3
    assert result is not msgs


def test_prune_messages_uses_length_as_default_when_max_turns_omitted() -> None:
    msgs = [make_user("a"), make_user("b"), make_user("c")]
    result = prune_messages(msgs, PrunerConfig(strategy="sliding-window"))
    assert len(result) == 3
