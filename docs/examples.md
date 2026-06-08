# Examples

## Preview a Repository

```bash
node scripts/atomic-commits.mjs --dry-run
```

Example output:

```txt
Planned commits:
  - docs: update project documentation
    files: README.md
  - feat: add authentication service
    files: src/auth/service.js
```

## Commit Interactively

```bash
node scripts/atomic-commits.mjs
```

Use `c` to accept a message, `e` to edit it, `s` to skip, or `q` to stop.

## Commit Automatically

```bash
node scripts/atomic-commits.mjs --yes
```

Use this only after reviewing `--dry-run`.

## Include Deleted Files

```bash
node scripts/atomic-commits.mjs --dry-run --include-deleted
node scripts/atomic-commits.mjs --yes --include-deleted
```

Deleted files are ignored by default and require explicit opt-in.

## Allow a Protected Branch

```bash
node scripts/atomic-commits.mjs --dry-run
node scripts/atomic-commits.mjs --yes --allow-protected-branch
```

Protected branches are blocked unless explicitly allowed.

## Group Obvious Related Files

```bash
node scripts/atomic-commits.mjs --dry-run --group
```

Grouping is conservative. Examples include:

- `package.json` with a lockfile
- Dockerfile with Docker Compose config
- a component file with its direct style file
- schema with migration files

Unrelated files remain separate commits.

## Use a Scope

```bash
node scripts/atomic-commits.mjs --scope api
```

This allows messages such as:

```txt
feat(api): add request validation
```

Scopes are disabled by default.
