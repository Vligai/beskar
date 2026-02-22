"""Metrics module — token usage tracking and cost estimation."""
from __future__ import annotations

from typing import Optional

import anthropic

from .types import MetricsConfig, MetricsSummary, TokenUsage

PRICING = {
    "input_per_m_tokens": 3.00,
    "output_per_m_tokens": 15.00,
    "cache_creation_per_m_tokens": 3.75,
    "cache_read_per_m_tokens": 0.30,
}


def map_usage(raw: anthropic.types.Usage) -> TokenUsage:
    return TokenUsage(
        input_tokens=raw.input_tokens,
        output_tokens=raw.output_tokens,
        cache_creation_input_tokens=raw.cache_creation_input_tokens or 0,
        cache_read_input_tokens=raw.cache_read_input_tokens or 0,
    )


def estimate_cost_usd(usage: TokenUsage) -> float:
    return (
        (usage.input_tokens / 1_000_000) * PRICING["input_per_m_tokens"]
        + (usage.output_tokens / 1_000_000) * PRICING["output_per_m_tokens"]
        + (usage.cache_creation_input_tokens / 1_000_000)
        * PRICING["cache_creation_per_m_tokens"]
        + (usage.cache_read_input_tokens / 1_000_000)
        * PRICING["cache_read_per_m_tokens"]
    )


def estimate_savings_usd(usage: TokenUsage) -> float:
    input_price_per_token = PRICING["input_per_m_tokens"] / 1_000_000
    cache_read_price_per_token = PRICING["cache_read_per_m_tokens"] / 1_000_000
    return usage.cache_read_input_tokens * (
        input_price_per_token - cache_read_price_per_token
    )


class MetricsTracker:
    def __init__(self, config: Optional[MetricsConfig] = None) -> None:
        self._config = config
        self._total_calls = 0
        self._total_input_tokens = 0
        self._total_output_tokens = 0
        self._total_cache_creation_tokens = 0
        self._total_cache_read_tokens = 0

    def track(self, raw: anthropic.types.Usage) -> TokenUsage:
        usage = map_usage(raw)
        self._total_calls += 1
        self._total_input_tokens += usage.input_tokens
        self._total_output_tokens += usage.output_tokens
        self._total_cache_creation_tokens += usage.cache_creation_input_tokens
        self._total_cache_read_tokens += usage.cache_read_input_tokens
        if self._config and self._config.on_usage:
            self._config.on_usage(usage)
        return usage

    def summary(self) -> MetricsSummary:
        denominator = self._total_input_tokens + self._total_cache_read_tokens
        cache_hit_rate = (
            self._total_cache_read_tokens / denominator if denominator > 0 else 0.0
        )
        accumulated = TokenUsage(
            input_tokens=self._total_input_tokens,
            output_tokens=self._total_output_tokens,
            cache_creation_input_tokens=self._total_cache_creation_tokens,
            cache_read_input_tokens=self._total_cache_read_tokens,
        )
        return MetricsSummary(
            total_calls=self._total_calls,
            total_input_tokens=self._total_input_tokens,
            total_output_tokens=self._total_output_tokens,
            total_cache_creation_tokens=self._total_cache_creation_tokens,
            total_cache_read_tokens=self._total_cache_read_tokens,
            cache_hit_rate=cache_hit_rate,
            estimated_cost_usd=estimate_cost_usd(accumulated),
            estimated_savings_usd=estimate_savings_usd(accumulated),
        )


def create_metrics_tracker(config: Optional[MetricsConfig] = None) -> MetricsTracker:
    return MetricsTracker(config)
