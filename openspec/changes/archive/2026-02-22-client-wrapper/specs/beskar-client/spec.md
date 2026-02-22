## ADDED Requirements

### Requirement: `BeskarClient` is a drop-in replacement for `anthropic.messages.create()`
`BeskarClient` SHALL expose a `messages.create(params)` method with the same TypeScript signature as `Anthropic.messages.create()` (non-streaming overload). The returned value SHALL be the unmodified `Anthropic.Message` response from the API. Callers SHALL be able to swap `new Anthropic(...)` for `new BeskarClient(...)` with no other code changes.

#### Scenario: Response shape is identical to Anthropic SDK
- **WHEN** `client.messages.create(params)` resolves
- **THEN** the returned object has the same shape as `Anthropic.Message` with no added or removed fields

#### Scenario: API key falls back to environment variable
- **WHEN** `BeskarClient` is constructed without `config.apiKey`
- **THEN** the internal Anthropic instance reads `ANTHROPIC_API_KEY` from the environment

### Requirement: Optimization modules are applied in pipeline order
When `messages.create()` is called, enabled modules SHALL be applied in this order: (1) pruner, (2) cache structurer, (3) tool chain collapser, (4) Anthropic API call, (5) metrics capture. Disabled modules (config field is `false` or omitted) SHALL be skipped entirely.

#### Scenario: All modules enabled → pipeline applied in order
- **WHEN** all four module configs are enabled
- **THEN** the params passed to the mocked Anthropic SDK reflect pruning, cache breakpoints, and chain collapsing applied sequentially

#### Scenario: Single module enabled → only that module applied
- **WHEN** only `cache` is enabled in config
- **THEN** only `structureCache` is called — `pruneMessages` and `collapseToolChains` are not called

#### Scenario: Module set to `false` → not applied
- **WHEN** `config.pruner: false`
- **THEN** `pruneMessages` is never called and the messages array is passed to the next step unchanged

### Requirement: `client.metrics.summary()` returns session-level aggregated metrics
The `metrics.summary()` method SHALL return a `MetricsSummary` reflecting all `messages.create()` calls made through this client instance since construction. If `config.metrics` is not set or is `false`, `summary()` SHALL still be callable and SHALL return zeroed totals.

#### Scenario: Metrics accumulate across calls
- **WHEN** `messages.create()` is called three times
- **THEN** `client.metrics.summary().totalCalls` is `3`

#### Scenario: Metrics disabled → summary returns zeroes
- **WHEN** `config.metrics` is `false` or omitted
- **THEN** `client.metrics.summary()` returns a `MetricsSummary` with all numeric fields at `0`

### Requirement: `BeskarClient` is exported from `src/index.ts`
`src/index.ts` SHALL include a named export of `BeskarClient`. This export SHALL be available from both the ESM (`dist/esm/index.js`) and CJS (`dist/cjs/index.js`) build outputs.

#### Scenario: Named export resolves in ESM context
- **WHEN** a consumer runs `import { BeskarClient } from 'beskar'`
- **THEN** `BeskarClient` is the class defined in `src/client.ts`

#### Scenario: Named export resolves in CJS context
- **WHEN** a consumer runs `const { BeskarClient } = require('beskar')`
- **THEN** `BeskarClient` is the class defined in `src/client.ts`
