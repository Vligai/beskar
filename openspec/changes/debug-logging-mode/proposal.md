## Why

Beskar applies four transformation stages (pruner, cache, compressor, metrics) to every API call, but provides zero visibility into what each stage does. When a user's costs don't drop as expected, or a tool result gets truncated incorrectly, they have no way to inspect what Beskar did without reading source code and adding `console.log` statements. A debug/verbose mode would log each pipeline stage's input/output delta, making it trivial to diagnose misconfigured pipelines and validate that optimizations are firing.

## What Changes

- Add a `debug` option to `BeskarConfig` (both Python and TypeScript)
- Each pipeline stage in `client.ts` / `client.py` emits structured debug output when enabled
- Debug output includes: stage name, messages before/after count, estimated token delta, cache breakpoints placed, tool results compressed, chains collapsed
- Output goes to a configurable logger (defaults to `console.debug` in TS, `logging.getLogger('beskar')` in Python)

## Capabilities

### New Capabilities

- `pipeline-debug-logging`: When `debug: true` (or `debug: { verbose: true }`) is set in config, each pipeline stage logs a structured summary of its transformations
- `custom-logger`: Accept a user-provided logging function/handler for integration with existing logging infrastructure

### Modified Capabilities

- `beskar-client`: Pipeline orchestrator gains debug hooks at each stage boundary

## Impact

- **Creates**: No new modules — logging is added inline to `client.ts` / `client.py`
- **Modifies**: `src/client.ts`, `src/beskar/client.py`, `src/types.ts`, `src/beskar/types.py` (config addition)
- **Depends on**: All existing pipeline modules (read-only — logs their effects, doesn't change them)
- **Consumed by**: End users debugging their Beskar configuration
