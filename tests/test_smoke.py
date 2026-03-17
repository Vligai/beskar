"""Smoke tests — verify package imports and type instantiation."""
from beskar.types import (
    BeskarConfig,
    BeskarMessage,
    CacheConfig,
    CompressorConfig,
    MetricsConfig,
    MetricsSummary,
    PrunerConfig,
    TokenUsage,
)


def test_cache_config_defaults() -> None:
    config = CacheConfig()
    assert config.min_token_threshold == 1024


def test_pruner_config_defaults() -> None:
    config = PrunerConfig()
    assert config.strategy == "sliding-window"
    assert config.max_turns is None
    assert config.summary_model is None


def test_compressor_config_defaults() -> None:
    config = CompressorConfig()
    assert config.max_tool_result_tokens is None
    assert config.collapse_after_turns is None


def test_token_usage_fields() -> None:
    usage = TokenUsage(
        input_tokens=100,
        output_tokens=50,
        cache_creation_input_tokens=0,
        cache_read_input_tokens=0,
    )
    assert usage.input_tokens == 100
    assert usage.output_tokens == 50


def test_metrics_config_defaults() -> None:
    config = MetricsConfig()
    assert config.on_usage is None


def test_beskar_config_defaults() -> None:
    config = BeskarConfig()
    assert config.api_key is None
    assert config.cache is None
    assert config.pruner is None
    assert config.compressor is None
    assert config.metrics is None


def test_metrics_summary_defaults() -> None:
    summary = MetricsSummary()
    assert summary.total_calls == 0
    assert summary.cache_hit_rate == 0.0
    assert summary.estimated_cost_usd == 0.0


def test_beskar_message_is_message_param() -> None:
    from anthropic.types import MessageParam

    assert BeskarMessage is MessageParam


def test_all_modules_importable() -> None:
    import beskar.cache  # noqa: F401
    import beskar.client  # noqa: F401
    import beskar.compressor  # noqa: F401
    import beskar.metrics  # noqa: F401
    import beskar.pruner  # noqa: F401
