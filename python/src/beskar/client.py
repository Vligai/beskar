"""Client module — BeskarClient wrapping the Anthropic SDK."""
from __future__ import annotations

from typing import Any, Dict, Optional

import anthropic

from .cache import structure_cache
from .compressor import collapse_tool_chains
from .metrics import MetricsTracker, create_metrics_tracker
from .pruner import prune_messages
from .types import BeskarConfig, MetricsSummary


class BeskarClient:
    """Drop-in replacement for anthropic.messages.create() with optimization pipeline."""

    def __init__(self, config: Optional[BeskarConfig] = None) -> None:
        self._config = config or BeskarConfig()
        self._anthropic = anthropic.Anthropic(api_key=self._config.api_key)
        self._tracker = create_metrics_tracker(self._config.metrics)
        self.messages = self._MessagesNamespace(self)
        self.metrics = self._MetricsNamespace(self)

    class _MessagesNamespace:
        def __init__(self, client: "BeskarClient") -> None:
            self._client = client

        def create(self, **params: Any) -> anthropic.types.Message:
            client = self._client
            config = client._config

            messages: Any = params.get("messages", [])
            system: Any = params.get("system")
            tools: Any = params.get("tools")

            # Step 1 — Pruner
            if config.pruner:
                messages = prune_messages(messages, config.pruner)

            # Step 2 — Cache
            if config.cache:
                request: Dict[str, Any] = {"messages": messages}
                if system is not None:
                    request["system"] = system
                if tools is not None:
                    request["tools"] = tools
                cache_result = structure_cache(request, config.cache)  # type: ignore[arg-type]
                messages = cache_result.request["messages"]
                system = cache_result.request.get("system", system)
                tools = cache_result.request.get("tools", tools)

            # Step 3 — Compressor (chain collapse)
            if config.compressor:
                messages = collapse_tool_chains(messages, config.compressor)

            # Step 4 — API call
            modified_params = dict(params)
            modified_params["messages"] = messages
            if system is not None:
                modified_params["system"] = system
            if tools is not None:
                modified_params["tools"] = tools

            response: anthropic.types.Message = client._anthropic.messages.create(
                **modified_params
            )

            # Step 5 — Metrics
            if config.metrics:
                client._tracker.track(response.usage)

            return response

    class _MetricsNamespace:
        def __init__(self, client: "BeskarClient") -> None:
            self._client = client

        def summary(self) -> MetricsSummary:
            return self._client._tracker.summary()
