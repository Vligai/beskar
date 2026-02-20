## Why

Beskar has no runnable project yet — no package manifest, TypeScript configuration, directory structure, or shared type contracts. The other five module changes (`cache-module`, `pruner-module`, `compressor-module`, `metrics-module`, `client-wrapper`) all depend on this foundation existing first.

## What Changes

- Initialize TypeScript/Node.js package (`package.json`, `tsconfig.json`, `.gitignore`)
- Establish the `src/` directory layout matching the documented architecture
- Define shared types used across all modules: `BeskarConfig`, `BeskarMessage`, `TokenUsage`, `CacheBreakpoint`, `PrunerStrategy`
- Add `@anthropic-ai/sdk` as the sole external dependency
- Configure build tooling (compilation to `dist/`, source maps, declaration files)
- Set up a minimal test runner (Vitest) so each module change can ship with tests

## Capabilities

### New Capabilities

- `project-scaffold`: Package manifest, TypeScript config, build pipeline, and directory layout
- `shared-types`: The type contracts (`BeskarConfig`, `BeskarMessage`, `TokenUsage`, `CacheBreakpoint`, `PrunerStrategy`, `CompressionOptions`) that every module imports from `src/types.ts`

### Modified Capabilities

None — this is a greenfield project.

## Impact

- **Creates**: `package.json`, `tsconfig.json`, `.gitignore`, `src/types.ts`, `src/index.ts` (barrel export), directory stubs for `src/cache/`, `src/pruner/`, `src/compressor/`, `src/metrics/`
- **Dependencies added**: `@anthropic-ai/sdk` (runtime), `typescript`, `vitest` (dev)
- **All other changes are blocked until this is complete** — they depend on the shared types defined here
