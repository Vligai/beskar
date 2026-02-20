## ADDED Requirements

### Requirement: Python package installs from `python/` with a single `pip install`
`python/pyproject.toml` SHALL declare `name = "beskar"`, `requires-python = ">=3.9"`, and `anthropic` as the sole runtime dependency. Installing with `pip install -e python/` SHALL make `import beskar` succeed in any Python 3.9+ environment.

#### Scenario: Package installs cleanly
- **WHEN** `pip install -e python/` is run in a fresh virtualenv
- **THEN** `import beskar` succeeds without errors

#### Scenario: No extra runtime dependencies
- **WHEN** the installed package's dependency tree is inspected
- **THEN** only `anthropic` and its own transitive deps are present — no Pydantic, no additional libraries

### Requirement: Shared types are defined in `python/src/beskar/types.py`
`types.py` SHALL export `BeskarMessage`, `BeskarConfig`, `CacheConfig`, `PrunerConfig`, `PrunerStrategy`, `CompressorConfig`, `MetricsConfig`, `TokenUsage`, and `MetricsSummary`. All config types SHALL be `dataclass` instances. `BeskarMessage` SHALL be a direct alias of `anthropic.types.MessageParam` — not a redefinition.

#### Scenario: All types instantiate with defaults
- **WHEN** `BeskarConfig()` is constructed with no arguments
- **THEN** all optional fields default to `None` — no module is active

#### Scenario: `BeskarMessage` is assignable to `anthropic.types.MessageParam`
- **WHEN** a `BeskarMessage` value is passed to a function typed as `anthropic.types.MessageParam`
- **THEN** `mypy` accepts the assignment without error

### Requirement: Module stub files exist and are importable
Each module stub (`cache.py`, `pruner.py`, `compressor.py`, `metrics.py`, `client.py`) SHALL exist in `python/src/beskar/` and be importable. Stubs are filled in by subsequent module changes.

#### Scenario: Stubs import without error
- **WHEN** `import beskar.cache; import beskar.pruner` etc. are executed
- **THEN** all imports succeed — no `ImportError`

### Requirement: `mypy --strict` passes on the scaffold
Running `mypy python/src/` in strict mode SHALL produce zero errors on the scaffolded package before any module is implemented.

#### Scenario: Strict type checking passes on stubs
- **WHEN** `mypy python/src/` is run against the scaffold
- **THEN** exit code is `0`

### Requirement: CI runs Python checks on 3.9, 3.11, and 3.12
`.github/workflows/ci.yml` SHALL include a `python` job with a version matrix covering Python 3.9, 3.11, and 3.12. This job SHALL run in parallel with the existing Node.js job, with no dependency between them.

#### Scenario: Python CI job is independent
- **WHEN** the Node.js CI job fails
- **THEN** the Python CI job still runs and reports its own result independently

#### Scenario: Python versions are all tested
- **WHEN** a commit is pushed to `main`
- **THEN** three Python job runs appear in CI — one per matrix version
