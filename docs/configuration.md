# Configuration

Safe Atomic Commits works without configuration. A repository may optionally add:

```txt
.atomiccommitsrc.json
```

## Example

```json
{
  "language": "en",
  "maxFileSizeKb": 2048,
  "allowScopes": false,
  "includeBinary": false,
  "protectedBranches": [
    "main",
    "master",
    "production",
    "prod",
    "release",
    "stable"
  ],
  "ignore": ["storage/**", "uploads/**", "public/uploads/**"],
  "commitStyle": "conventional"
}
```

## Supported Fields

- `language`: `en` or `pt-BR`
- `maxFileSizeKb`: positive integer, defaults to `2048`
- `allowScopes`: allow Conventional Commit scopes
- `scope`: fixed scope used when scopes are enabled
- `includeEnv`: consider real env files, still with secret scanning
- `includeDeleted`: process deleted files
- `includeBinary`: process binary files except known risky extensions
- `includeLargeFiles`: process files above `maxFileSizeKb`
- `allowProtectedBranch`: allow protected branch processing
- `group`: enable conservative grouping
- `protectedBranches`: branch names blocked by default
- `ignore`: simple path patterns such as `storage/**`
- `commitStyle`: currently `conventional`

CLI flags override config values.

## Commit Message Policy

Default messages use:

```txt
<type>: <description>
```

Allowed types:

```txt
feat
fix
docs
style
refactor
perf
test
build
ci
chore
revert
```

Messages must be descriptive, scope-free unless `--scope` is used, and 100 characters or fewer.
