# Safety

Safety is the primary design constraint. Automation is allowed only when it preserves the user's working tree and avoids unsafe commits.

## Forbidden Commands

The CLI never runs:

```bash
git reset --hard
git clean
git checkout -- .
git restore .
```

## Staging Flow

For each item, the CLI:

1. Clears staging without touching working tree content.
2. Stages only the current file, rename pair, or approved group.
3. Validates the staged paths.
4. Validates that staged files are still safe.
5. Creates the commit.
6. Clears staging again.

If validation fails, the item is not committed and staging is cleared best-effort.

## Ignored by Default

The CLI blocks or ignores these categories by default:

- `.env` and real `.env.*` files
- generated directories such as `node_modules`, `dist`, `build`, `coverage`, `.next`, `.nuxt`, `.turbo`, `.cache`
- runtime/storage paths such as `storage`, `uploads`, `public/uploads`, `tmp`, `logs`
- database files, dumps, and backups
- compressed archives and executable/binary artifacts
- binary files
- files larger than 2048 KB

Allowed env examples:

```txt
.env.example
.env.local.example
.env.development.example
.env.production.example
.env.staging.example
```

## Secret Detection

Text files are scanned for common sensitive values, including:

- private key blocks
- AWS access keys
- GitHub tokens
- Slack tokens
- JWT-like tokens
- uppercase credential assignments such as `TOKEN=`, `API_KEY=`, `DATABASE_URL=`, and `JWT_SECRET=`

Obvious placeholders such as `example`, `placeholder`, `changeme`, `your-token`, `localhost`, `dummy`, and `mock` are not treated as secrets.

## Protected Branches

Protected branches are blocked by default:

```txt
main
master
production
prod
release
stable
```

Use `--allow-protected-branch` only after reviewing the dry-run output.

## Recovery

If a run fails, inspect state and clear staging only:

```bash
git status
git reset --quiet --
```

These commands do not discard working tree changes.
