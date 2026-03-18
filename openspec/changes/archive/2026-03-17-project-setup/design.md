## Context

Greenfield TypeScript library. No existing code. The design choices made here establish the conventions every subsequent module change must follow — module shape, type naming, build output format, test patterns.

The primary consumer is developers running agentic Claude pipelines who want to swap in `BeskarClient` for `Anthropic` with zero API surface changes beyond construction.

## Goals / Non-Goals

**Goals:**
- A package that `npm install`s, builds to `dist/`, and exports clean TypeScript types
- Shared type contracts in `src/types.ts` that all modules import — no circular deps
- Vitest configured so module changes can add `*.test.ts` files without extra setup
- ESM output with a CJS fallback for broad Node.js compatibility

**Non-Goals:**
- Browser/edge runtime support (V1 is Node.js only — `@anthropic-ai/sdk` requires it)
- Monorepo or workspace structure (single package, single `src/`)
- CLI binary or separate sub-packages per module

## Decisions

### Package manager: npm (not Bun/pnpm/yarn)
`@anthropic-ai/sdk` publishes standard npm packages. npm is the lowest-friction choice for library consumers generating a lockfile they can commit. Can be revisited in V2 if build speed becomes an issue.

### Module format: ESM primary, CJS via `exports` map
`package.json` `exports` field with two conditions:
```json
"exports": {
  ".": {
    "import": "./dist/esm/index.js",
    "require": "./dist/cjs/index.js"
  }
}
```
TypeScript compiles twice: `tsc -p tsconfig.esm.json` → `dist/esm/`, `tsc -p tsconfig.cjs.json` → `dist/cjs/`. Declaration files go alongside ESM output. This is the pattern used by `@anthropic-ai/sdk` itself — matching it reduces interop surprises.

**Alternative considered:** Bundle with tsup. Rejected for V1 — adds a bundler dependency and obscures what's actually being shipped. Plain tsc is easier to audit and debug for a library this size.

### Type strategy: single `src/types.ts`, no barrel re-exports of types from modules
All cross-module types live in `src/types.ts`. Module files import from `../types`, never from sibling modules. This makes the type graph a DAG with no cycles and keeps `src/index.ts` as the only barrel.

Core types to define:

```typescript
// The top-level config passed to BeskarClient constructor
interface BeskarConfig {
  apiKey?: string;           // falls back to ANTHROPIC_API_KEY env var
  cache?: CacheConfig | false;
  pruner?: PrunerConfig | false;
  compressor?: CompressorConfig | false;
  metrics?: MetricsConfig | false;
}

// Wraps Anthropic.MessageParam — same shape, just aliased for internal use
type BeskarMessage = Anthropic.MessageParam;

// Mirrors Anthropic's Usage object, extended with cache fields
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

// Represents a resolved cache breakpoint placement decision
interface CacheBreakpoint {
  position: number;   // index into content blocks array
  estimatedTokens: number;
}

type PrunerStrategy = 'sliding-window' | 'summarize' | 'importance';

interface CacheConfig {
  minTokenThreshold?: number;   // override auto-detection per model
}

interface PrunerConfig {
  strategy: PrunerStrategy;
  maxTurns?: number;            // for sliding-window
  summaryModel?: string;        // for summarize strategy
}

interface CompressorConfig {
  maxToolResultTokens?: number; // truncate tool results above this
  collapseAfterTurns?: number;  // collapse tool chains older than N turns
}

interface MetricsConfig {
  onUsage?: (usage: TokenUsage) => void;  // callback per call
}
```

### Test runner: Vitest
Jest requires transform config for ESM; Vitest handles it natively with zero config for TypeScript ESM projects. `vitest.config.ts` at root, test files colocated as `src/**/*.test.ts`.

**Alternative considered:** Node's built-in `--test`. Rejected — no mocking primitives, worse DX for async tests.

### No `src/index.ts` logic in V1 scaffold
The barrel file exports only types in the scaffold phase. `BeskarClient` is added by the `client-wrapper` change. This prevents the scaffold from having stubs that later changes need to overwrite.

## Risks / Trade-offs

- **Dual CJS/ESM build complexity** → Mitigation: use two minimal tsconfig files that only differ in `module`/`moduleResolution`/`outDir`. Keep build scripts in `package.json` scripts, not a separate build tool.
- **Type definitions drifting from Anthropic SDK types** → Mitigation: `BeskarMessage` is a direct alias of `Anthropic.MessageParam`, not a redefinition. If the SDK changes, TypeScript will surface the breakage at compile time.
- **Vitest version pinning** → Mitigation: pin to a specific minor (e.g., `^2.1.0`) in devDependencies. Vitest has had breaking changes between minors before.

## Open Questions

- Should `CompressionOptions` be part of `CompressorConfig` or a separate per-call override type? (Matters for client-wrapper design — defer to that change.)
- Node.js minimum version: 18 (LTS, native fetch) or 20 (current LTS)? `@anthropic-ai/sdk` requires 18+. Recommend targeting 18 for broadest compatibility.
