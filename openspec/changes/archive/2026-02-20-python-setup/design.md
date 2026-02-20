## Context

Mirrors the role of `project-setup` for TypeScript: establish the foundations so every module change can add Python implementation tasks without worrying about packaging, type contracts, or CI plumbing.

The Python `anthropic` SDK exposes `anthropic.Anthropic().messages.create(**params)` and returns `anthropic.types.Message`. Content blocks use `cache_control={"type": "ephemeral"}` dicts — identical semantics to the TypeScript SDK. The `usage` response field has `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` (cache fields may be `None` when caching is not active).

## Goals / Non-Goals

**Goals:**
- A package under `python/` that `pip install -e python/` installs cleanly
- Shared type contracts in `python/src/beskar/types.py` that all Python modules import — no circular deps
- `pytest` configured so module changes can add `tests/test_*.py` files without extra setup
- `mypy --strict` passes from the start (empty stubs are already annotated)
- CI runs Python checks in parallel with the existing Node.js job

**Non-Goals:**
- Any module implementation logic — stubs only
- Async support (`AsyncAnthropic`) — V1 is sync only
- Streaming support — same exclusion as TypeScript
- Python < 3.9

## Decisions

### Package layout: `src/` layout with `pyproject.toml`

```
python/
  pyproject.toml
  src/
    beskar/
      __init__.py     # type-only barrel until modules are implemented
      types.py        # all shared types
      cache.py        # stub (pass)
      pruner.py       # stub (pass)
      compressor.py   # stub (pass)
      metrics.py      # stub (pass)
      client.py       # stub (pass)
  tests/
    test_smoke.py     # trivial import assertion
```

The `src/` layout (PEP 517) prevents accidental imports of uninstalled source — the modern Python packaging standard. Mirrors the TypeScript `src/` convention.

**Alternative considered:** Flat layout. Rejected — `src/` is more reliable in CI and avoids `sys.path` confusion.

### Types: `dataclasses` for config, SDK types for messages

`BeskarConfig` and per-module config types are `dataclass` objects — convenient for construction, supports defaults, no extra dependency. Message types reuse `anthropic.types.MessageParam` directly (aliased, not redefined) so SDK type changes surface as compile errors automatically.

**Alternative considered:** Pydantic. Rejected — adds a heavy runtime dependency for no benefit beyond what `mypy` already provides.

### `from __future__ import annotations` for Python 3.9 compatibility

`X | Y` union syntax and `list[X]` generics in annotations require Python 3.10+ at runtime without this import. Adding it to every module file makes the syntax valid on 3.9 at zero cost.

### Testing: `pytest` + `unittest.mock`

`anthropic.Anthropic` is mocked with `unittest.mock.patch` in tests — no real API calls. Coverage enforced via `pytest-cov` with `--cov-fail-under=90`. No `pytest-mock` (stdlib mocking is sufficient and avoids an extra dev dep).

### CI: matrix over Python 3.9, 3.11, 3.12

```yaml
python-version: ["3.9", "3.11", "3.12"]
```

Runs in parallel with the existing Node.js matrix. Steps: install → `mypy python/src/` → `pytest python/tests/ --cov=beskar --cov-fail-under=90`.

**Alternative considered:** tox. Rejected — GitHub Actions matrix gives the same multi-version coverage with less config.

## Risks / Trade-offs

- **Two codebases to maintain** → Mitigation: specs are the source of truth. Both implementations follow the same behavioral requirements. When Claude's API changes, both need updating — but the specs document exactly what must change.
- **`mypy --strict` on stubs** → Mitigation: stubs contain only `pass` with correct type signatures; strict mode passes immediately.

## Open Questions

- PyPI package name: `beskar`? If taken, `beskar-python` or `beskar-sdk`. Verify before first publish — not a blocker for development.
