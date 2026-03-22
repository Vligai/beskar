## ADDED Requirements

### Requirement: Package manifest declares correct metadata and dependencies
The `package.json` SHALL declare `name: "beskar"`, `type: "module"`, an `exports` map with both `import` and `require` conditions pointing to `dist/esm/` and `dist/cjs/` respectively, a `types` field pointing to `dist/esm/index.d.ts`, and `engines.node` of `>=18`. Runtime dependencies SHALL include only `@anthropic-ai/sdk`. Dev dependencies SHALL include `typescript` and `vitest`.

#### Scenario: Package resolves ESM import
- **WHEN** a consumer runs `import { BeskarClient } from 'beskar'` in an ESM context
- **THEN** Node.js resolves to `dist/esm/index.js`

#### Scenario: Package resolves CJS require
- **WHEN** a consumer runs `require('beskar')` in a CJS context
- **THEN** Node.js resolves to `dist/cjs/index.js`

#### Scenario: TypeScript consumers get type definitions
- **WHEN** a TypeScript project imports from `beskar`
- **THEN** the compiler finds declaration files at `dist/esm/index.d.ts`

### Requirement: TypeScript compilation produces valid dual output
The project SHALL include two tsconfig files: `tsconfig.json` (base, used by IDE and Vitest) targeting `ES2022` with `moduleResolution: "bundler"`, and `tsconfig.cjs.json` extending the base with `module: "CommonJS"` and `outDir: "dist/cjs"`. The `build` script in `package.json` SHALL run both compilations. Source maps SHALL be emitted. Declaration files SHALL be emitted alongside the ESM output only.

#### Scenario: Build script compiles both formats
- **WHEN** `npm run build` is executed
- **THEN** both `dist/esm/` and `dist/cjs/` directories are populated with compiled output

#### Scenario: Source maps are present
- **WHEN** `npm run build` completes
- **THEN** each `.js` file in `dist/` has a corresponding `.js.map` file

#### Scenario: TypeScript errors fail the build
- **WHEN** `npm run build` is run with a type error in source
- **THEN** the process exits with a non-zero code and no output is written to `dist/`

### Requirement: Test runner executes without configuration per module
Vitest SHALL be configured via `vitest.config.ts` at the project root with `include: ["src/**/*.test.ts"]` and `environment: "node"`. No additional setup SHALL be required to add a new `*.test.ts` file in any `src/` subdirectory.

#### Scenario: New test file is discovered automatically
- **WHEN** a file matching `src/**/*.test.ts` is created
- **THEN** `npm test` runs it without any config changes

#### Scenario: Tests run in Node environment
- **WHEN** a test imports Node.js built-ins (e.g., `process.env`)
- **THEN** the test executes without environment errors

### Requirement: Source directory layout matches documented architecture
The `src/` directory SHALL contain: `types.ts`, `index.ts`, and empty subdirectories `cache/`, `pruner/`, `compressor/`, `metrics/` with a `.gitkeep` placeholder each. No module implementation code SHALL exist in the scaffold — only stubs.

#### Scenario: Directory structure is present after setup
- **WHEN** the project is cloned and `npm install` is run
- **THEN** `src/cache/`, `src/pruner/`, `src/compressor/`, and `src/metrics/` all exist

#### Scenario: Index barrel exports only types initially
- **WHEN** `src/index.ts` is imported before any module is implemented
- **THEN** only type exports are available — no runtime classes or functions
