# Architecture

Safe Atomic Commits is organized as a small Node.js ESM CLI with one executable entrypoint and modular internals.

## Entrypoint

```txt
scripts/atomic-commits.mjs
```

This file only detects direct execution, calls `main()`, and sets `process.exitCode`.

## Source Layout

```txt
src/
  cli/
  config/
  git/
  safety/
  planner/
  messages/
  output/
  shared/
```

## Responsibilities

- `src/cli/` parses arguments, prints usage, owns the main flow, and handles interactive prompts.
- `src/config/` stores defaults and loads optional `.atomiccommitsrc.json` config.
- `src/git/` wraps Git commands, reads repository state/status, and validates staging.
- `src/safety/` classifies paths, ignores risky files, detects binary files, and scans secrets.
- `src/planner/` builds the commit plan, reads diffs, and applies conservative grouping.
- `src/messages/` generates and validates Conventional Commit messages.
- `src/output/` prints headers, dry-run/check output, summaries, and recovery instructions.
- `src/shared/` contains cross-cutting constants, path normalization, and CLI errors.

## Safety Boundaries

The Git staging and safety modules are intentionally separate:

- `src/safety/` decides whether a path is processable.
- `src/git/staging.mjs` stages one item, verifies the staged paths, and re-runs safety checks.
- `src/cli/main.mjs` coordinates recovery and summary output.

This keeps policy decisions visible and prevents commit execution from bypassing safety validation.

## Behavior Compatibility

The modular architecture preserves the existing CLI contract:

```bash
node scripts/atomic-commits.mjs --help
node scripts/atomic-commits.mjs --dry-run
node scripts/atomic-commits.mjs --check
node scripts/atomic-commits.mjs
node scripts/atomic-commits.mjs --yes
```

No module introduces network calls, LLM usage, push behavior, or destructive Git cleanup.
