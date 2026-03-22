## 1. Package Manifest

- [x] 1.1 Create `package.json` with `name: "beskar"`, `version: "0.1.0"`, `type: "module"`, `engines.node: ">=18"`
- [x] 1.2 Add `exports` map with `import` → `./dist/esm/index.js` and `require` → `./dist/cjs/index.js`
- [x] 1.3 Add `types: "./dist/esm/index.d.ts"` and `files: ["dist"]` to package.json
- [x] 1.4 Add runtime dependency: `@anthropic-ai/sdk`
- [x] 1.5 Add dev dependencies: `typescript`, `vitest`, `@vitest/coverage-v8`
- [x] 1.6 Add scripts: `build`, `test`, `typecheck` (`tsc --noEmit`)

## 2. TypeScript Configuration

- [x] 2.1 Create `tsconfig.json` (base): `target: ES2022`, `moduleResolution: "bundler"`, `strict: true`, `declaration: true`, `declarationMap: true`, `sourceMap: true`, `outDir: "./dist/esm"`, `rootDir: "./src"`
- [x] 2.2 Create `tsconfig.cjs.json` extending base: override `module: "CommonJS"`, `moduleResolution: "node"`, `outDir: "./dist/cjs"`, `declaration: false`
- [x] 2.3 Update `build` script to run `tsc -p tsconfig.json && tsc -p tsconfig.cjs.json`
- [x] 2.4 Add `dist/` to `.gitignore`

## 3. Vitest Configuration

- [x] 3.1 Create `vitest.config.ts` with `include: ["src/**/*.test.ts"]` and `environment: "node"`
- [x] 3.2 Wire `test` script in `package.json` to `vitest run`
- [x] 3.3 Verify a placeholder `src/types.test.ts` is discovered and passes with a trivial assertion

## 4. Source Directory Layout

- [x] 4.1 Create `src/cache/.gitkeep`, `src/pruner/.gitkeep`, `src/compressor/.gitkeep`, `src/metrics/.gitkeep`
- [x] 4.2 Create `src/index.ts` as a type-only barrel (no runtime exports yet)

## 5. Shared Types (`src/types.ts`)

- [x] 5.1 Import `Anthropic` from `@anthropic-ai/sdk` and export `BeskarMessage = Anthropic.MessageParam`
- [x] 5.2 Export `BeskarConfig` interface with `apiKey?`, `cache?`, `pruner?`, `compressor?`, `metrics?` fields (each `| false`)
- [x] 5.3 Export `TokenUsage` interface with four required number fields: `inputTokens`, `outputTokens`, `cacheCreationInputTokens`, `cacheReadInputTokens`
- [x] 5.4 Export `CacheBreakpoint` interface with `position: number` and `estimatedTokens: number`
- [x] 5.5 Export `PrunerStrategy` string union: `'sliding-window' | 'summarize' | 'importance'`
- [x] 5.6 Export `CacheConfig` (`minTokenThreshold?`), `PrunerConfig` (`strategy`, `maxTurns?`, `summaryModel?`), `CompressorConfig` (`maxToolResultTokens?`, `collapseAfterTurns?`), `MetricsConfig` (`onUsage?`)
- [x] 5.7 Re-export all types from `src/index.ts`

## 6. Verification

- [x] 6.1 Run `npm run build` — confirm `dist/esm/` and `dist/cjs/` both populate with `.js`, `.js.map`, and (ESM only) `.d.ts` files
- [x] 6.2 Run `npm run typecheck` — confirm zero errors
- [x] 6.3 Run `npm test` — confirm Vitest discovers and runs the placeholder test
- [x] 6.4 Confirm `src/index.ts` import in a consumer project resolves types correctly (manual check or `tsc --traceResolution`)
