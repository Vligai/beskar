"""Shared types for Beskar — Python equivalents of src/types.ts."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Literal, Optional

from anthropic.types import MessageParam

# Direct alias — SDK type changes surface as mypy errors automatically
BeskarMessage = MessageParam

PrunerStrategy = Literal["sliding-window", "summarize", "importance"]


@dataclass
class CacheBreakpoint:
    position: int
    estimated_tokens: int


@dataclass
class CacheConfig:
    min_token_threshold: int = 1024


@dataclass
class PrunerConfig:
    """Configuration for the context pruner.

    Attributes:
        strategy: Pruning strategy. ``"summarize"`` is a V1 stub that inserts a
            placeholder string — it does NOT call an LLM. Use ``"sliding-window"``
            or ``"importance"`` for production workloads.
        max_turns: Maximum number of turns to retain. ``None`` means no limit.
        summary_model: Reserved for V2 — will specify the model used for
            LLM-based summarization. Currently unused.
    """
    strategy: PrunerStrategy = "sliding-window"
    max_turns: Optional[int] = None
    summary_model: Optional[str] = None


@dataclass
class CompressorConfig:
    max_tool_result_tokens: Optional[int] = None
    collapse_after_turns: Optional[int] = None


@dataclass
class TokenUsage:
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int


@dataclass
class MetricsConfig:
    on_usage: Optional[Callable[[TokenUsage], None]] = field(
        default=None, repr=False
    )


@dataclass
class BeskarConfig:
    api_key: Optional[str] = None
    cache: Optional[CacheConfig] = None
    pruner: Optional[PrunerConfig] = None
    compressor: Optional[CompressorConfig] = None
    metrics: Optional[MetricsConfig] = None


@dataclass
class MetricsSummary:
    total_calls: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cache_creation_tokens: int = 0
    total_cache_read_tokens: int = 0
    cache_hit_rate: float = 0.0
    estimated_cost_usd: float = 0.0
    estimated_savings_usd: float = 0.0
