## 1. Project Scaffold

- [x] 1.1 Create `python/` directory at repo root
- [x] 1.2 Create `python/pyproject.toml`: `name = "beskar"`, `requires-python = ">=3.9"`, runtime dep `anthropic`, dev deps `pytest`, `pytest-cov`, `mypy`; include `[project.optional-dependencies] dev = [...]` so `pip install -e "python/[dev]"` works
- [x] 1.3 Create `python/src/beskar/__init__.py` as a type-only barrel (no imports yet — modules added by each module change)
- [x] 1.4 Create stub files (body is just `pass` with correct import header): `python/src/beskar/cache.py`, `pruner.py`, `compressor.py`, `metrics.py`, `client.py`
- [x] 1.5 Create `python/tests/__init__.py` (empty) and `python/tests/test_smoke.py` with a trivial assertion (`assert True`)
- [x] 1.6 Add to repo root `.gitignore`: `python/**/__pycache__/`, `python/**/*.egg-info/`, `python/.venv/`, `python/dist/`, `python/.coverage`, `python/htmlcov/`

## 2. Shared Types (`python/src/beskar/types.py`)

- [x] 2.1 Add `from __future__ import annotations` at top of every `python/src/beskar/*.py` file
- [x] 2.2 Import `anthropic.types.MessageParam` and alias: `BeskarMessage = MessageParam`
- [x] 2.3 Define `CacheConfig` dataclass: `min_token_threshold: int = 1024`
- [x] 2.4 Define `PrunerStrategy` as `Literal["sliding-window", "summarize", "importance"]`
- [x] 2.5 Define `PrunerConfig` dataclass: `strategy: PrunerStrategy`, `max_turns: int | None = None`, `summary_model: str | None = None`
- [x] 2.6 Define `CompressorConfig` dataclass: `max_tool_result_tokens: int | None = None`, `collapse_after_turns: int | None = None`
- [x] 2.7 Define `TokenUsage` dataclass: `input_tokens: int`, `output_tokens: int`, `cache_creation_input_tokens: int`, `cache_read_input_tokens: int`
- [x] 2.8 Define `MetricsConfig` dataclass: `on_usage: Callable[[TokenUsage], None] | None = None`
- [x] 2.9 Define `BeskarConfig` dataclass: `api_key: str | None = None`, `cache: CacheConfig | None = None`, `pruner: PrunerConfig | None = None`, `compressor: CompressorConfig | None = None`, `metrics: MetricsConfig | None = None`
- [x] 2.10 Define `MetricsSummary` dataclass: `total_calls: int`, `total_input_tokens: int`, `total_output_tokens: int`, `total_cache_creation_tokens: int`, `total_cache_read_tokens: int`, `cache_hit_rate: float`, `estimated_cost_usd: float`, `estimated_savings_usd: float`
- [x] 2.11 Test (in `test_smoke.py`): all config types instantiate with default values without error

## 3. CI Update (`.github/workflows/ci.yml`)

- [x] 3.1 Add a `python` job with `strategy.matrix.python-version: ["3.9", "3.11", "3.12"]`
- [x] 3.2 Steps: checkout → `actions/setup-python` → `pip install -e "python/[dev]"` → `mypy python/src/` → `pytest python/tests/ --cov=beskar --cov-fail-under=90`
- [x] 3.3 Python job has no dependency on the `node` job — runs in parallel

## 4. Verification

- [x] 4.1 `mypy python/src/` — zero errors (stubs are all `pass` with proper signatures)
- [x] 4.2 `pytest python/tests/` — smoke test passes
- [x] 4.3 `pip install -e python/` in a fresh venv → `import beskar` succeeds
- [ ] 4.4 CI green on Python 3.9, 3.11, and 3.12
