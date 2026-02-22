"""Tests for beskar.client.BeskarClient."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from beskar import BeskarClient
from beskar.types import BeskarConfig, CacheConfig, CompressorConfig, MetricsConfig, PrunerConfig


def _make_usage(**kwargs: object) -> MagicMock:
    usage = MagicMock()
    usage.input_tokens = kwargs.get("input_tokens", 100)
    usage.output_tokens = kwargs.get("output_tokens", 50)
    usage.cache_creation_input_tokens = kwargs.get("cache_creation_input_tokens", 0)
    usage.cache_read_input_tokens = kwargs.get("cache_read_input_tokens", 0)
    return usage


def _make_response(usage: MagicMock | None = None) -> MagicMock:
    resp = MagicMock()
    resp.usage = usage or _make_usage()
    return resp


BASE_PARAMS = {
    "model": "claude-sonnet-4-6",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "hello"}],
}

# Large system prompt: 4097 chars ≈ 1024 tokens (above 1024-token threshold)
LARGE_SYSTEM = "x" * 4097


@pytest.fixture
def mock_sdk():
    """Patch anthropic.Anthropic and return the mock messages.create."""
    with patch("anthropic.Anthropic") as MockAnthropic:
        mock_instance = MagicMock()
        MockAnthropic.return_value = mock_instance
        mock_create = MagicMock(return_value=_make_response())
        mock_instance.messages.create = mock_create
        yield mock_create


# --- Test: messages.create() returns mocked response ---


def test_returns_mocked_response(mock_sdk: MagicMock) -> None:
    response = _make_response(_make_usage(input_tokens=200))
    mock_sdk.return_value = response

    client = BeskarClient(BeskarConfig())
    result = client.messages.create(**BASE_PARAMS)
    assert result is response


# --- Test: with cache config → mock SDK receives cache_control on system ---


def test_cache_enabled_adds_cache_control(mock_sdk: MagicMock) -> None:
    client = BeskarClient(BeskarConfig(cache=CacheConfig()))
    client.messages.create(**BASE_PARAMS, system=LARGE_SYSTEM)

    called_kwargs = mock_sdk.call_args.kwargs
    system = called_kwargs["system"]
    # system should now be a list with cache_control on the last block
    assert isinstance(system, list)
    assert system[-1].get("cache_control") == {"type": "ephemeral"}


# --- Test: with pruner config → mock SDK receives pruned messages ---


def test_pruner_enabled_prunes_messages(mock_sdk: MagicMock) -> None:
    messages = [
        {"role": "user", "content": f"msg{i}"}
        for i in range(5)
    ]
    client = BeskarClient(
        BeskarConfig(pruner=PrunerConfig(strategy="sliding-window", max_turns=3))
    )
    client.messages.create(**{**BASE_PARAMS, "messages": messages})

    called_kwargs = mock_sdk.call_args.kwargs
    assert len(called_kwargs["messages"]) == 3


# --- Test: with metrics config → summary.total_calls == 1 after one call ---


def test_metrics_enabled_reflects_usage(mock_sdk: MagicMock) -> None:
    usage = _make_usage(input_tokens=300, output_tokens=75)
    mock_sdk.return_value = _make_response(usage)

    client = BeskarClient(BeskarConfig(metrics=MetricsConfig()))
    client.messages.create(**BASE_PARAMS)

    summary = client.metrics.summary()
    assert summary.total_calls == 1
    assert summary.total_input_tokens == 300
    assert summary.total_output_tokens == 75


# --- Test: on_usage callback invoked ---


def test_on_usage_callback_invoked(mock_sdk: MagicMock) -> None:
    on_usage_calls = []

    def on_usage(u: object) -> None:
        on_usage_calls.append(u)

    client = BeskarClient(BeskarConfig(metrics=MetricsConfig(on_usage=on_usage)))
    client.messages.create(**BASE_PARAMS)
    client.messages.create(**BASE_PARAMS)

    assert len(on_usage_calls) == 2


# --- Test: no module config → SDK called with original params ---


def test_no_module_config_passes_original_params(mock_sdk: MagicMock) -> None:
    client = BeskarClient(BeskarConfig())
    client.messages.create(**BASE_PARAMS)

    called_kwargs = mock_sdk.call_args.kwargs
    assert called_kwargs["messages"] == BASE_PARAMS["messages"]
    assert "system" not in called_kwargs or called_kwargs.get("system") is None


def test_no_module_config_metrics_returns_zeroes() -> None:
    with patch("anthropic.Anthropic") as MockAnthropic:
        mock_instance = MagicMock()
        MockAnthropic.return_value = mock_instance
        mock_instance.messages.create.return_value = _make_response()

        client = BeskarClient(BeskarConfig())
        summary = client.metrics.summary()
        assert summary.total_calls == 0
        assert summary.total_input_tokens == 0
        assert summary.estimated_cost_usd == 0.0


# --- Test: metrics disabled → summary returns zeroes even after a call ---


def test_metrics_disabled_summary_zeroes(mock_sdk: MagicMock) -> None:
    client = BeskarClient(BeskarConfig(metrics=None))
    client.messages.create(**BASE_PARAMS)
    summary = client.metrics.summary()
    assert summary.total_calls == 0
