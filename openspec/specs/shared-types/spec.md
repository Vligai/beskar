## ADDED Requirements

### Requirement: BeskarConfig is the single top-level configuration interface
`src/types.ts` SHALL export a `BeskarConfig` interface with the following optional fields: `apiKey?: string`, `cache?: CacheConfig | false`, `pruner?: PrunerConfig | false`, `compressor?: CompressorConfig | false`, `metrics?: MetricsConfig | false`. Setting a module field to `false` SHALL explicitly disable that module. Omitting a field SHALL also disable that module (no defaults-on behavior).

#### Scenario: All modules disabled by default
- **WHEN** a `BeskarConfig` is constructed with no fields set
- **THEN** no optimization module is active — the client behaves as a transparent passthrough

#### Scenario: Module disabled explicitly
- **WHEN** `cache: false` is set in config
- **THEN** the cache module is inactive regardless of any other configuration

### Requirement: TokenUsage captures all four token dimensions from the Anthropic API
`src/types.ts` SHALL export a `TokenUsage` interface with fields `inputTokens: number`, `outputTokens: number`, `cacheCreationInputTokens: number`, and `cacheReadInputTokens: number`. All fields SHALL be required (not optional). The `cacheCreationInputTokens` and `cacheReadInputTokens` fields SHALL default to `0` when mapping from Anthropic's `Usage` object if those fields are absent.

#### Scenario: Mapping from Anthropic Usage with no cache fields
- **WHEN** an Anthropic API response has no `cache_creation_input_tokens` property
- **THEN** `TokenUsage.cacheCreationInputTokens` is `0`

#### Scenario: Mapping from Anthropic Usage with cache hit
- **WHEN** an Anthropic API response includes `cache_read_input_tokens: 4200`
- **THEN** `TokenUsage.cacheReadInputTokens` is `4200`

### Requirement: Per-module config types are exported from types.ts
`src/types.ts` SHALL export `CacheConfig`, `PrunerConfig`, `CompressorConfig`, and `MetricsConfig` interfaces. `PrunerConfig` SHALL include `strategy: PrunerStrategy` as a required field. `PrunerStrategy` SHALL be a string union type: `'sliding-window' | 'summarize' | 'importance'`. `MetricsConfig` SHALL include an optional `onUsage?: (usage: TokenUsage) => void` callback. `CacheConfig` SHALL include `minTokenThreshold?: number`. `CompressorConfig` SHALL include `maxToolResultTokens?: number` and `collapseAfterTurns?: number`.

#### Scenario: PrunerStrategy rejects invalid values
- **WHEN** a value outside the union is assigned to `PrunerStrategy`
- **THEN** the TypeScript compiler reports a type error

#### Scenario: MetricsConfig callback receives usage per call
- **WHEN** `onUsage` is provided and an API call completes
- **THEN** the callback is invoked with the `TokenUsage` for that call

### Requirement: BeskarMessage is a direct alias of the Anthropic SDK message type
`src/types.ts` SHALL export `BeskarMessage` as a type alias of `Anthropic.MessageParam` imported from `@anthropic-ai/sdk`. No structural redefinition is permitted — it MUST be a true alias so that SDK type changes surface as compile errors in Beskar automatically.

#### Scenario: BeskarMessage is assignable to Anthropic.MessageParam
- **WHEN** a `BeskarMessage` is passed to a function expecting `Anthropic.MessageParam`
- **THEN** TypeScript accepts the assignment without casting

#### Scenario: Anthropic SDK type change breaks compilation
- **WHEN** `Anthropic.MessageParam` gains a required field in a new SDK version
- **THEN** any Beskar code constructing `BeskarMessage` objects fails to compile

### Requirement: No module may import types from a sibling module
All cross-module type dependencies SHALL be satisfied by importing from `../types` (or `./types` within the same directory). Modules SHALL NOT import from each other. The `src/index.ts` barrel SHALL be the only file that imports from multiple modules.

#### Scenario: Module imports only from types.ts and its own files
- **WHEN** any file in `src/cache/`, `src/pruner/`, `src/compressor/`, or `src/metrics/` is inspected
- **THEN** its imports reference only `../types`, `@anthropic-ai/sdk`, or files within its own subdirectory
