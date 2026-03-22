# Beskar — Full Project Review (Validated)

**Date:** 2026-03-21
**Scope:** Security, Usability, Architecture
**Version reviewed:** 0.1.0a2 (pre-release, dual Python + TypeScript)

---

## Executive Summary

Beskar is a dual-language (Python primary, TypeScript secondary) Claude-native token optimization library. The project was recently restructured: Python now lives at the repo root (`src/beskar/`, `tests/`), TypeScript is under `typescript/`. Both implementations share the same architecture and the same bugs.

87 Python tests pass at 98% coverage. The architecture is clean and modular. **Two critical bugs and one high-severity bug** carry over from the TypeScript implementation into the Python port unchanged. The README still contains incorrect TypeScript config examples.

**Verdict:** Fix Issues 1–3 in both languages before release. Python implementation is otherwise solid.

---

## 1. Architecture Review

### Project Structure (Post-Restructure)

```
src/beskar/              # Python source (PRIMARY)
  __init__.py            # BeskarClient, types re-exports
  cache.py               # structure_cache, estimate_tokens
  pruner.py              # prune_messages, find_tool_pairs, _score_message
  compressor.py          # compress_tool_result, collapse_tool_chains
  metrics.py             # MetricsTracker, PRICING, map_usage
  client.py              # BeskarClient pipeline orchestrator
  types.py               # Dataclasses: BeskarConfig, CacheConfig, etc.
tests/                   # Python tests (pytest)
  test_cache.py          # 20 tests
  test_client.py         # 8 tests
  test_compressor.py     # 15 tests
  test_metrics.py        # 13 tests
  test_pruner.py         # 22 tests
  test_smoke.py          # 9 tests (imports + defaults)
typescript/              # TypeScript mirror (SECONDARY)
  src/                   # Same module structure as before
  package.json, tsconfig.json, vitest.config.ts
pyproject.toml           # Python package config (root)
.github/workflows/ci.yml # Python 3.9/3.11/3.12 + Node 18/20/22
```

### Pipeline Design (Identical in Both Languages)

```
Input: messages.create(**params)
  → [1] Pruner        — Reduce message history (if enabled)
  → [2] Cache         — Place cache_control breakpoints (if enabled)
  → [3] Compressor    — Collapse tool chains (if enabled)
  → [4] API Call      — anthropic.messages.create()
  → [5] Metrics       — Track usage, compute costs (if enabled)
Output: anthropic.types.Message
```

**Strengths:**
- Four independent modules with clear contracts and single responsibilities
- Non-destructive transformations — never mutates input (verified in tests)
- Drop-in replacement for SDK — same `client.messages.create()` interface
- Composable — each module independently enabled via config dataclasses (`None` = disabled)
- Python uses `@dataclass` for config, clean and Pythonic
- Single runtime dependency (`anthropic`)

**Weaknesses:**
- Pipeline order is hardcoded in `client.py` — not configurable
- No middleware/plugin architecture for extending with custom steps
- Python `client.py` uses `Any` type annotations heavily in the `_MessagesNamespace.create()` method — loses type safety at the pipeline boundary

### Module Analysis (Python)

#### Cache (`src/beskar/cache.py` — 88 statements, 99% coverage)
- Faithful port of TypeScript `structureCache`
- Uses `TypedDict` for `CacheRequest` — good Python typing
- Token estimation: `len(text) // 4`
- **Bug (carried over):** System array threshold checks only last block's tokens, not total (Issue 3, line 65)

#### Pruner (`src/beskar/pruner.py` — 108 statements, 99% coverage)
- All three strategies implemented: `sliding-window`, `summarize`, `importance`
- Tool pair integrity preserved via `find_tool_pairs()`
- Importance scoring: `recency (0.5) + tool_bonus (0.3) + content_length (0.2)`
- **Stub (carried over):** `_summarize()` inserts placeholder string (line 92), `summary_model` field unused (Issue 4)

#### Compressor (`src/beskar/compressor.py` — 61 statements, 98% coverage)
- `compress_tool_result()` — fully implemented and tested
- `collapse_tool_chains()` — only collapses single-tool turns
- **Critical (carried over):** `compress_tool_result()` is never called in the pipeline (Issue 1, `client.py` line 55 only calls `collapse_tool_chains`)

#### Metrics (`src/beskar/metrics.py` — 38 statements, 100% coverage)
- Clean `MetricsTracker` class with `track()` and `summary()` methods
- `on_usage` callback support via `MetricsConfig`
- **Problem (carried over):** Hardcoded Sonnet 3.5 pricing (Issue 5, lines 10–15)

#### Client (`src/beskar/client.py` — 53 statements, 94% coverage)
- Nested `_MessagesNamespace` class mimics the TypeScript `this.messages = { create() }` pattern
- Uses `**params` kwargs — flexible but loses type hints for callers
- Coverage gaps at lines 47, 55, 63 — cache system/tools reassignment branches (valid — tests don't exercise all None-guard paths)

### Architecture Score: **7.5/10**
Same clean design as TypeScript. Same bugs carried over. Python typing is weaker at the `client.py` boundary (`Any` usage).

---

## 2. Security Review

### Threat Model

Unchanged from the TypeScript review. Beskar is a client-side middleware library that transforms API requests before forwarding them. No network endpoints, no persistent storage, no auth beyond passing an API key.

### Findings (Python-Specific)

| Check | Status | Notes |
|-------|--------|-------|
| Secrets in code | Pass | No hardcoded keys or tokens |
| API key handling | Pass | Passed to `anthropic.Anthropic(api_key=...)`, never logged |
| Input validation | Pass | Delegated to SDK; transforms only structural |
| Type safety | Partial | `mypy --strict` in pyproject.toml, but `client.py` uses `Any` heavily |
| Injection risks | Pass | No string interpolation in API calls |
| Sensitive data logging | Pass | No logging at all (no `logging` module imported) |
| Dependency surface | Pass | Single runtime dependency (`anthropic`) |
| `.gitignore` coverage | **Concern** | Python `__pycache__/` exclusion uses `python/**/__pycache__/` — misses `src/beskar/__pycache__/` and `tests/__pycache__/` at root level |
| Supply chain | Pass | No postinstall hooks, standard setuptools |

### New Security Finding: `.gitignore` Gap

The `.gitignore` has:
```
python/**/__pycache__/
python/**/*.egg-info/
```

But with the restructure, Python now lives at `src/beskar/` and `tests/`, not under `python/`. The patterns should also include:
```
__pycache__/
*.egg-info/
```

Currently `src/beskar/__pycache__/` and `tests/__pycache__/` are not excluded. The `__pycache__` directories exist on disk. This risks committing bytecode files.

### Security Score: **8.5/10**
Slightly lower than the TypeScript-only review due to the `.gitignore` gap and heavier `Any` usage in `client.py`.

---

## 3. Usability Review

### Getting Started Experience

**README.md TypeScript example still wrong** (Issue 2 — unchanged):
```typescript
cache: { enabled: true },          // ← field doesn't exist
compressor: { enabled: true, ... } // ← field doesn't exist
metrics: { enabled: true },        // ← field doesn't exist
```

**README.md Python example is correct:**
```python
client = BeskarClient(BeskarConfig(
    cache=CacheConfig(),
    pruner=PrunerConfig(strategy="sliding-window", max_turns=20),
    compressor=CompressorConfig(max_tool_result_tokens=500),
    metrics=MetricsConfig(),
))
```
The Python example accurately reflects the dataclass API. Users following the Python path will have a smooth experience.

### Configuration API (Python)

**Strengths:**
- `@dataclass` configs with defaults — self-documenting, IDE-friendly
- `BeskarConfig(cache=CacheConfig())` enables; `BeskarConfig(cache=None)` disables — Pythonic
- All config fields have sensible defaults
- `on_usage` callback in `MetricsConfig` — clean extension point

**Weaknesses:**
- `PrunerConfig.summary_model` exists but does nothing — misleading
- `CacheConfig.min_token_threshold` defaults to 1024 but Haiku requires 2048 — no model-aware defaulting
- No config validation (e.g., negative `max_turns` not caught)
- `client.py` `create()` accepts `**params: Any` — no type hints for callers, IDE autocomplete is lost

### Developer Experience

**Strengths:**
- Drop-in replacement: swap `anthropic_client.messages.create()` → `beskar_client.messages.create()`
- `.metrics.summary()` gives immediate visibility into optimization impact
- `test_smoke.py` verifies all imports and defaults — good onboarding sanity check
- 87 tests, 98% coverage — high confidence in correctness

**Weaknesses:**
- `compress_tool_result()` silently does nothing (Issue 1)
- `summarize` pruner inserts placeholder (Issue 4)
- No debug/verbose mode
- No docstrings on public functions beyond one-liners (e.g., `structure_cache` has a docstring but `prune_messages` has minimal)

### Usability Score: **6.5/10**
Python example is correct (improvement over TS-only). Still undermined by silent failures from Issues 1 and 4. TypeScript README still wrong.

---

## 4. Testing Review

### Coverage (Python — verified 2026-03-21)

```
Name                       Stmts   Miss  Cover   Missing
--------------------------------------------------------
src\beskar\__init__.py         3      0   100%
src\beskar\cache.py           88      1    99%   128
src\beskar\client.py          53      3    94%   47, 55, 63
src\beskar\compressor.py      61      1    98%   28
src\beskar\metrics.py         38      0   100%
src\beskar\pruner.py         108      1    99%   44
src\beskar\types.py           48      0   100%
--------------------------------------------------------
TOTAL                        399      6    98%

87 passed in 4.16s
```

| Metric | Value |
|--------|-------|
| Source statements | 399 |
| Missed statements | 6 |
| Overall coverage | 98% (exceeds 90% threshold) |
| Test count | 87 |
| Test files | 6 |
| Framework | pytest |
| CI matrix | Python 3.9, 3.11, 3.12 |

**Strengths:**
- 98% coverage — well above the 90% threshold
- Every module has a dedicated test file
- Edge cases covered: orphaned tool calls, empty arrays, tool pair preservation, immutability
- `test_smoke.py` validates imports, defaults, and type aliases — good regression net
- Integration tests in `test_client.py` properly mock `anthropic.Anthropic`
- No orphaned test blocks (the TS-only issue from `cache/index.test.ts` does not exist in Python)

**Weaknesses:**
- `compress_tool_result()` has full test coverage but is dead code in the pipeline — tests give false confidence
- No test verifies that `compress_tool_result()` is called when `compressor` is configured (because it isn't)
- Missing coverage at `client.py:47,55,63` — cache module's system/tools None-guard branches
- No end-to-end tests with real multi-turn agent loop sequences
- No performance tests for large context windows

### Testing Score: **8.5/10**
Excellent coverage and organization. Higher than the TS review because the orphaned test block issue doesn't exist in Python.

---

## 5. Critical Issues

### Issue 1: `compress_tool_result()` is Dead Code — **CRITICAL**

**Files:** `src/beskar/client.py:54–55`, `typescript/src/client.ts:52–54`
**Status:** Bug exists in **both** Python and TypeScript

Python `client.py` Step 3:
```python
# Step 3 — Compressor (chain collapse)
if config.compressor:
    messages = collapse_tool_chains(messages, config.compressor)
```

`compress_tool_result()` is imported nowhere in `client.py`. The `max_tool_result_tokens` config setting silently does nothing in both languages.

**Impact:** Tool result truncation feature is non-functional. Users who set `max_tool_result_tokens` see no effect.

**Fix (Python):**
```python
# Step 3 — Compressor
if config.compressor:
    # Compress individual tool results first
    compressed_messages = []
    for msg in messages:
        if msg.get("role") == "user" and isinstance(msg.get("content"), list):
            new_content = [
                compress_tool_result(block, config.compressor)
                if isinstance(block, dict) and block.get("type") == "tool_result"
                else block
                for block in msg["content"]
            ]
            compressed_messages.append({**msg, "content": new_content})
        else:
            compressed_messages.append(msg)
    messages = compressed_messages
    # Then collapse completed chains
    messages = collapse_tool_chains(messages, config.compressor)
```

---

### Issue 2: README TypeScript Examples Use Non-Existent Config Fields — **CRITICAL**

**File:** `README.md`, lines 90–93
**Status:** Still broken (unchanged from previous review)

```typescript
// WRONG (still in README):
cache: { enabled: true },
compressor: { enabled: true, maxToolResultTokens: 500 },
metrics: { enabled: true },
```

The Python example (lines 114–120) is **correct** — no issue there.

**Fix:** Replace TS example lines 90–93:
```typescript
cache: {},
pruner: { strategy: 'sliding-window', maxTurns: 20 },
compressor: { maxToolResultTokens: 500 },
metrics: {},
```

---

### Issue 3: System Array Cache Threshold Checks Only Last Block — **HIGH**

**Files:** `src/beskar/cache.py:65`, `typescript/src/cache/index.ts:45`
**Status:** Bug exists in **both** Python and TypeScript

Python `cache.py`:
```python
elif isinstance(system, list) and len(system) > 0:
    last_idx = len(system) - 1
    tokens = estimate_tokens(str(system[last_idx].get("text", "")))  # ← only last block
```

A system with `[{"text": "a"*3000}, {"text": "a"*100}]` totals ~775 tokens but only checks the last block (~25 tokens) — fails the 1024-token threshold even though caching the array would be beneficial.

**Fix (Python):**
```python
elif isinstance(system, list) and len(system) > 0:
    last_idx = len(system) - 1
    total_tokens = sum(estimate_tokens(str(block.get("text", ""))) for block in system)
    if total_tokens >= threshold:
```

---

## 6. High-Priority Issues

### Issue 4: `summarize` Strategy is an Undocumented Stub

**File:** `src/beskar/pruner.py:82–94`
**Status:** Same as TypeScript — stub, not a real summarizer

```python
def _summarize(messages, max_turns):
    ...
    summary: BeskarMessage = {
        "role": "user",
        "content": f"[Previous context: {n_summarized} turns summarized]",  # ← literal string
    }
```

`PrunerConfig.summary_model` is declared but never read.

**Recommendation:** Add docstring marking it as a placeholder. Document in README.

### Issue 5: Hardcoded Sonnet 3.5 Pricing

**File:** `src/beskar/metrics.py:10–15`
**Status:** Same as TypeScript

```python
PRICING = {
    "input_per_m_tokens": 3.00,      # Sonnet 3.5 only
    "output_per_m_tokens": 15.00,
    ...
}
```

Haiku ($0.80/$4) and Opus ($15/$75) users get wrong cost estimates.

### Issue 6: Token Estimator is English-Biased

**Files:** `src/beskar/cache.py:28`, `src/beskar/compressor.py:30`
**Status:** Same as TypeScript — `len(text) // 4`

Acceptable for V1. Allow custom estimator in V2.

---

## 7. New Issues (Found During Validation)

### Issue N1: `.gitignore` Doesn't Cover Root-Level Python Artifacts — **MEDIUM**

**File:** `.gitignore`
**Problem:** After restructuring, Python source lives at `src/beskar/` and `tests/`, but `.gitignore` patterns still target `python/`:
```
python/**/__pycache__/
python/**/*.egg-info/
```

`src/beskar/__pycache__/` and `tests/__pycache__/` directories exist on disk and are **not excluded**.

**Fix:** Add to `.gitignore`:
```
__pycache__/
*.egg-info/
```

### Issue N2: `client.py` Uses `Any` Extensively — **LOW**

**File:** `src/beskar/client.py`
**Problem:** The `create()` method accepts `**params: Any` and internal variables (`messages`, `system`, `tools`) are typed `Any`. Despite `mypy --strict` in `pyproject.toml`, type safety is lost at the pipeline entry point.

**Impact:** IDE autocomplete and mypy checking don't work for callers of `client.messages.create()`.

**Recommendation:** Type `create()` parameters to match `anthropic.types.MessageCreateParams` or use `TypedDict`.

### Issue N3: `python/` Directory is Vestigial — **LOW**

**File:** `python/` directory
**Problem:** The old `python/` directory still exists with `pyproject.toml`, empty `src/beskar/`, and empty `tests/`. Now that Python lives at the repo root, this directory is confusing and unused.

**Recommendation:** Remove `python/` directory or document its status.

---

## 8. Medium-Priority Issues

| # | Issue | File(s) | Severity | Status |
|---|-------|---------|----------|--------|
| 7 | Orphaned `it()` blocks outside `describe` | `typescript/src/cache/index.test.ts` | Low | TS only |
| 8 | `collapse_tool_chains` skips multi-tool turns | Both languages | Low | Unchanged |
| 9 | Duplicate `estimate_tokens` in cache + compressor | Both languages | Low | Unchanged |
| 10 | No debug/verbose mode | Both languages | Medium | Unchanged |
| 11 | No custom error types | Both languages | Low | Unchanged |
| N1 | `.gitignore` gaps for root-level Python | `.gitignore` | Medium | **New** |
| N2 | `client.py` heavy `Any` usage | `src/beskar/client.py` | Low | **New** |
| N3 | Vestigial `python/` directory | `python/` | Low | **New** |

---

## 9. Positive Findings

### What's Done Well

1. **Clean Python port** — The Python implementation faithfully mirrors the TypeScript architecture. Module boundaries, function signatures, and behavior are consistent across languages.

2. **Dataclass configs** — Python uses `@dataclass` instead of TypeScript interfaces. Self-documenting, IDE-friendly, and provide `__repr__` for free.

3. **98% test coverage** — 87 tests across 6 files. Higher coverage than the TS side, and no orphaned test blocks.

4. **CI parity** — Both languages tested in CI: Python 3.9/3.11/3.12, Node 18/20/22. CI runs from the correct working directories (`typescript/` for Node).

5. **Immutability discipline** — Carried over from TypeScript. Every transformation returns a new list/dict. Tests verify this explicitly (`test_compress_does_not_mutate_input`, `test_does_not_mutate_input`, `test_collapse_does_not_mutate_input`).

6. **Tool pair integrity** — `find_tool_pairs()` is clean Python using dict comprehension. All three pruning strategies preserve pairs.

7. **Smoke tests** — `test_smoke.py` validates every import, every default value, and the `BeskarMessage = MessageParam` alias. Good regression safety net.

8. **Correct Python README example** — Unlike the TypeScript example, the Python usage example accurately reflects the actual API.

---

## 10. Scores Summary

| Dimension | Score | Change from TS-only review | Notes |
|-----------|-------|---------------------------|-------|
| Architecture | 7.5/10 | — | Same design, same bugs, both languages |
| Security | 8.5/10 | -0.5 | `.gitignore` gap, `Any` in client.py |
| Usability | 6.5/10 | +0.5 | Python example correct, TS still wrong |
| Testing | 8.5/10 | +0.5 | 98% coverage, no orphaned blocks |
| **Overall** | **7.5/10** | — | **Same verdict: fix Issues 1–3 first** |

---

## 11. Recommendations by Priority

### Must Fix (Before Any Release)
1. Wire `compress_tool_result()` into pipeline — both Python and TypeScript (Issue 1)
2. Fix README TypeScript config examples (Issue 2)
3. Fix system array token threshold check — both languages (Issue 3)
4. Fix `.gitignore` to cover root-level Python `__pycache__/` (Issue N1)

### Should Fix (Before V1 Stable)
5. Document `summarize` as a stub with docstrings
6. Add per-model pricing map
7. Remove or document vestigial `python/` directory
8. Improve `client.py` type annotations

### Nice to Have (V1.x)
9. Fix orphaned TS test blocks
10. Document multi-tool turn limitation
11. Extract shared `estimate_tokens` utility
12. Add debug/verbose logging mode

### V2 Roadmap Items
13. Real LLM-based summarization (V2.1)
14. Model routing — Haiku vs Sonnet (V2.3)
15. Streaming support (V2.7)
16. Custom token estimation functions

---

## 12. Review Validation Notes

This review was validated by:
- Reading all Python source files (`src/beskar/*.py`) and comparing against review claims
- Reading all Python test files (`tests/test_*.py`)
- Running `pytest tests/ --cov=beskar --cov-report=term-missing` — 87 passed, 98% coverage
- Verifying TypeScript files still exist under `typescript/` with original bugs
- Checking CI config (`ci.yml`) reflects the restructured layout
- Confirming `.gitignore` patterns against actual file locations
- Verifying README examples against actual type definitions

Previous review (`review.md`) was TypeScript-only and is now outdated. This review supersedes it for the current dual-language project state.
