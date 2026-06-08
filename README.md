# Safe Atomic Commits

Safe Atomic Commits is a zero-dependency Node.js CLI for creating safe, reviewable, atomic Git commits from the current working tree.

It is designed to be copied into any Git repository and run without stack-specific setup.

## What It Does

- Detects the current Git repository and branch.
- Reads changed, added, deleted, renamed, and untracked files.
- Expands untracked directories into individual files.
- Filters generated, sensitive, binary, large, dump, and backup files.
- Scans text files for common secret patterns.
- Generates scope-free Conventional Commit messages by default.
- Supports dry-run, check-only, interactive, and auto-accept modes.
- Stages exactly the current file or safe group before committing.
- Clears the Git index after each item.

## What It Never Does

The CLI never discards working tree changes and never runs destructive cleanup commands such as:

```bash
git reset --hard
git clean
git checkout -- .
git restore .
```

It may clear the Git index/staging area as part of the safe commit flow.

## Quick Start

Preview the plan:

```bash
node scripts/atomic-commits.mjs --dry-run
```

Validate repository safety:

```bash
node scripts/atomic-commits.mjs --check
```

Run interactively:

```bash
node scripts/atomic-commits.mjs
```

Auto-accept generated commit messages:

```bash
node scripts/atomic-commits.mjs --yes
```

## NPM Scripts

```bash
npm run commit:atomic
npm run commit:atomic:auto
npm run commit:atomic:dry
npm test
```

## Documentation

- [Usage](docs/usage.md)
- [Safety](docs/safety.md)
- [Configuration](docs/configuration.md)
- [Examples](docs/examples.md)

## Recovery

If a run fails, inspect the repository and clear only staging:

```bash
git status
git reset --quiet --
```

Do not use destructive recovery commands unless you intentionally want to discard your own changes.
