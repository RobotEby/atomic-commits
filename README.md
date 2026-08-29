# Safe Atomic Commits

![Node.js](https://img.shields.io/badge/node.js-18%2B-6DA55F?style=flat-square&logo=node.js&logoColor=white)
![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)

Safe Atomic Commits is a zero-**runtime**-dependency Node.js CLI for creating
safe, reviewable, atomic Git commits from the current working tree.

It is designed to be copied into any Git repository and run with plain Node —
no `npm install` is required to use the CLI itself. (Development tooling for
this repository, such as ESLint, is a separate `devDependency` used only if
you're contributing to this project.)

## What It Does

- Detects the current Git repository and branch.
- Reads changed, added, deleted, renamed, and untracked files.
- Expands untracked directories into individual files.
- Filters generated, sensitive, binary, large, dump, and backup files.
- Scans text files for common secret patterns (AWS keys, GitHub/Slack tokens,
  JWT-like tokens, private key blocks, and common credential assignments).
- Generates scope-free Conventional Commit messages by default, with
  file-specific and structural-refactor heuristics.
- Supports dry-run, check-only, interactive, and auto-accept modes.
- Stages exactly the current file or safe group before committing.
- Clears the Git index after each item.
- Optionally groups obviously related pairs (`--group`), e.g. a package
  manifest with its lockfile.

## What It Never Does

The CLI never discards working tree changes and never runs destructive cleanup commands such as:

```bash
git reset --hard
git clean
git checkout -- .
git restore .
```

It may clear the Git index/staging area as part of the safe commit flow. This
is verified in `test/atomic-commits.test.mjs` and by direct inspection of
`src/git/git.mjs` (the only module that shells out to Git).

## Quick Start

Preview the plan:

```bash
node scripts/atomic-commits.mjs --dry-run
```

Validate repository safety:

```bash
node scripts/atomic-commits.mjs --check
```

Run interactively (asks `[c]ommit / [e]dit / [s]kip / [q]uit` per item):

```bash
node scripts/atomic-commits.mjs
```

Auto-accept generated commit messages:

```bash
node scripts/atomic-commits.mjs --yes
```

Equivalent `npm` scripts are also available if you copy `package.json`'s
`scripts` block into the target repo: `npm run commit:atomic`,
`npm run commit:atomic:auto`, `npm run commit:atomic:dry`.

## NPM Scripts (for developing this tool)

These are for developing the tool itself, not for running it against another
repository (see Quick Start above for that).

```bash
npm install        # installs ESLint devDependencies only
npm run lint        # ESLint
npm test            # node --test
npm run test:coverage  # node --test with coverage report
```

## Current Status

- 22 automated tests, all passing (`npm test`).
- ~82% line coverage / ~72% branch coverage as of the last coverage run
  (`npm run test:coverage`); numbers will drift as the code changes and are
  not enforced as a hard gate.
- Zero runtime dependencies; two dev dependencies (`eslint`, `globals`) used
  only for linting this repository.
- `--language` currently only accepts `en`. Other locales are not implemented
  yet — the flag exists as a placeholder for future localization and any
  other value is rejected rather than silently ignored.

## Documentation

- [Usage](docs/usage.md)
- [Safety](docs/safety.md)
- [Configuration](docs/configuration.md)
- [Examples](docs/examples.md)
- [Architecture](docs/architecture.md)

## Recovery

If a run fails, inspect the repository and clear only staging:

```bash
git status
git reset --quiet --
```

Do not use destructive recovery commands unless you intentionally want to discard your own changes.

## License

MIT — see [LICENSE](LICENSE).
