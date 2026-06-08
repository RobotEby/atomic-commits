# Usage

Run commands from inside the Git repository you want to process.

## Help

```bash
node scripts/atomic-commits.mjs --help
```

Prints supported modes, safety opt-ins, and commit options.

## Dry Run

```bash
node scripts/atomic-commits.mjs --dry-run
```

Dry-run prints the repository root, branch, `HEAD` status, ignored files, warnings, and planned commits. It does not stage files, create commits, alter the working tree, or alter Git history.

## Check

```bash
node scripts/atomic-commits.mjs --check
```

Check mode validates repository safety and exits non-zero when safety issues are found, including conflicts, protected branches, `.env` files, possible secrets, binary files, large files, dumps, backups, and generated paths.

## Interactive Mode

```bash
node scripts/atomic-commits.mjs
```

For each processable item, the CLI prints the suggested Conventional Commit message and asks:

```txt
Action [c=commit, e=edit, s=skip, q=quit]:
```

- `c` commits the current item with the suggested message.
- `e` prompts for a custom message and validates it before committing.
- `s` skips the current item.
- `q` stops safely and prints a summary.

## Auto Mode

```bash
node scripts/atomic-commits.mjs --yes
```

Auto mode commits every safe processable item using generated messages. It still blocks secrets, env files, generated files, unsupported files, unexpected staged files, conflicts, and protected branches unless explicitly allowed.

## Safety Opt-Ins

```bash
node scripts/atomic-commits.mjs --include-deleted
node scripts/atomic-commits.mjs --include-env
node scripts/atomic-commits.mjs --include-binary
node scripts/atomic-commits.mjs --include-large-files
node scripts/atomic-commits.mjs --allow-protected-branch
```

Use opt-ins only when you have reviewed the dry-run output. `--include-env` never bypasses secret scanning.

## Commit Options

```bash
node scripts/atomic-commits.mjs --group
node scripts/atomic-commits.mjs --scope api
node scripts/atomic-commits.mjs --language en
node scripts/atomic-commits.mjs --language pt-BR
```

Default behavior is one file per commit, with renames as the explicit multi-path exception. `--group` only groups obvious related pairs.
