## Why

The Python `anthropic` SDK is the dominant choice for agentic Claude pipelines. Before any Python module can be implemented, a package scaffold is needed — the same role `project-setup` played for TypeScript. This change establishes the `python/` directory, packaging config, shared types, test infrastructure, and CI integration that all subsequent module changes depend on for their Python implementation tasks.

## What Changes

- Create `python/` directory at repo root with a `src/` layout Python package
- Add `python/pyproject.toml` declaring `name = "beskar"`, `requires-python = ">=3.9"`, runtime dependency `anthropic`, dev dependencies `pytest`, `pytest-cov`, `mypy`
- Define all shared Python types in `python/src/beskar/types.py` — Python equivalents of `src/types.ts`, using `dataclasses` and `typing`
- Add `python/src/beskar/__init__.py` as a type-only barrel (module exports are added by each module change)
- Add empty module stubs: `python/src/beskar/cache.py`, `pruner.py`, `compressor.py`, `metrics.py`, `client.py`
- Add `python/tests/` with a smoke test verifying package import
- Update `.github/workflows/ci.yml` to run `mypy` and `pytest --cov` on Python 3.9, 3.11, and 3.12 in parallel with the existing Node.js job

## Capabilities

### New Capabilities

- `python-scaffold`: Package manifest, Python tooling config, and directory layout under `python/`
- `python-shared-types`: The type contracts (`BeskarConfig`, `TokenUsage`, `MetricsSummary`, `CacheConfig`, `PrunerConfig`, `CompressorConfig`, `MetricsConfig`) in `python/src/beskar/types.py` that every Python module imports

### Modified Capabilities

- CI pipeline: gains Python test and typecheck steps

## Impact

- **Creates**: `python/pyproject.toml`, `python/src/beskar/__init__.py`, `python/src/beskar/types.py`, stub files for each module, `python/tests/test_smoke.py`
- **Modifies**: `.github/workflows/ci.yml`
- **Depended on by**: Python implementation tasks in `cache-module`, `pruner-module`, `compressor-module`, `metrics-module`, `client-wrapper` changes
- **Independent of**: TypeScript changes — the two scaffolds coexist without coupling
