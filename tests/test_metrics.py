"""Tests for beskar.metrics."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from beskar.metrics import (
    PRICING,
    create_metrics_tracker,
    estimate_cost_usd,
    estimate_savings_usd,
    map_usage,
)
from beskar.types import MetricsConfig, TokenUsage


def _make_raw(
    input_tokens: int = 100,
    output_tokens: int = 50,
    cache_creation: int | None = 0,
    cache_read: int | None = 0,
) -> MagicMock:
    raw = MagicMock()
    raw.input_tokens = input_tokens
    raw.output_tokens = output_tokens
    raw.cache_creation_input_tokens = cache_creation
    raw.cache_read_input_tokens = cache_read
    return raw


# --- map_usage ---


def test_map_usage_all_fields() -> None:
    raw = _make_raw(input_tokens=100, output_tokens=50, cache_creation=20, cache_read=10)
    usage = map_usage(raw)
    assert usage.input_tokens == 100
    assert usage.output_tokens == 50
    assert usage.cache_creation_input_tokens == 20
    assert usage.cache_read_input_tokens == 10


def test_map_usage_none_cache_fields_default_to_zero() -> None:
    raw = _make_raw(input_tokens=200, output_tokens=80, cache_creation=None, cache_read=None)
    usage = map_usage(raw)
    assert usage.cache_creation_input_tokens == 0
    assert usage.cache_read_input_tokens == 0


# --- estimate_cost_usd ---


def test_estimate_cost_1m_input() -> None:
    usage = TokenUsage(
        input_tokens=1_000_000,
        output_tokens=0,
        cache_creation_input_tokens=0,
        cache_read_input_tokens=0,
    )
    assert abs(estimate_cost_usd(usage) - 3.00) < 1e-9


def test_estimate_cost_zero() -> None:
    usage = TokenUsage(
        input_tokens=0,
        output_tokens=0,
        cache_creation_input_tokens=0,
        cache_read_input_tokens=0,
    )
    assert estimate_cost_usd(usage) == 0.0


# --- estimate_savings_usd ---


def test_estimate_savings_1m_cache_read() -> None:
    usage = TokenUsage(
        input_tokens=0,
        output_tokens=0,
        cache_creation_input_tokens=0,
        cache_read_input_tokens=1_000_000,
    )
    expected = PRICING["input_per_m_tokens"] - PRICING["cache_read_per_m_tokens"]
    assert abs(estimate_savings_usd(usage) - expected) < 1e-9


def test_estimate_savings_zero_cache_read() -> None:
    usage = TokenUsage(
        input_tokens=100,
        output_tokens=50,
        cache_creation_input_tokens=0,
        cache_read_input_tokens=0,
    )
    assert estimate_savings_usd(usage) == 0.0


# --- create_metrics_tracker ---


def test_tracker_zero_summary_before_calls() -> None:
    tracker = create_metrics_tracker()
    s = tracker.summary()
    assert s.total_calls == 0
    assert s.total_input_tokens == 0
    assert s.cache_hit_rate == 0.0
    assert s.estimated_cost_usd == 0.0


def test_tracker_accumulates_across_two_calls() -> None:
    tracker = create_metrics_tracker()
    tracker.track(_make_raw(input_tokens=100, output_tokens=50))
    tracker.track(_make_raw(input_tokens=200, output_tokens=80))

    s = tracker.summary()
    assert s.total_calls == 2
    assert s.total_input_tokens == 300
    assert s.total_output_tokens == 130


def test_track_returns_per_call_usage() -> None:
    tracker = create_metrics_tracker()
    first = tracker.track(_make_raw(input_tokens=100, output_tokens=50))
    tracker.track(_make_raw(input_tokens=200, output_tokens=80))
    assert first.input_tokens == 100
    assert first.output_tokens == 50


def test_cache_hit_rate_computed_correctly() -> None:
    tracker = create_metrics_tracker()
    tracker.track(_make_raw(input_tokens=900_000, output_tokens=0, cache_read=100_000))
    s = tracker.summary()
    assert abs(s.cache_hit_rate - 0.1) < 1e-9


def test_cache_hit_rate_zero_when_no_reads() -> None:
    tracker = create_metrics_tracker()
    tracker.track(_make_raw(input_tokens=500, output_tokens=0))
    assert tracker.summary().cache_hit_rate == 0.0


def test_on_usage_callback_invoked() -> None:
    calls = []
    config = MetricsConfig(on_usage=lambda u: calls.append(u))
    tracker = create_metrics_tracker(config)
    tracker.track(_make_raw(input_tokens=10, output_tokens=5))
    tracker.track(_make_raw(input_tokens=20, output_tokens=8))

    assert len(calls) == 2
    assert calls[0].input_tokens == 10
    assert calls[1].input_tokens == 20


def test_no_config_track_completes_without_error() -> None:
    tracker = create_metrics_tracker(None)
    tracker.track(_make_raw())  # should not raise
