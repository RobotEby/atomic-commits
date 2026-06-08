export function printUsage() {
  console.log(`Safe Atomic Commits

Usage:
  node scripts/atomic-commits.mjs [options]

Core modes:
  --help                         Print this help message
  --dry-run                      Print the commit plan without staging or committing
  --check                        Validate repository safety without staging or committing
  --yes, -y                      Commit all safe items using generated messages

Safety opt-ins:
  --include-env                  Consider real .env files, but still block secrets
  --include-deleted              Include deleted files
  --include-binary               Include binary files except known risky extensions
  --include-large-files          Include files larger than the configured limit
  --allow-protected-branch       Allow commits on protected branches

Commit options:
  --group                        Group only obvious related file pairs
  --scope [name]                 Allow Conventional Commit scopes, optionally fixed
  --language en|pt-BR            Output language for summaries and suggested subjects
  --max-file-size-kb <number>    Override the large-file threshold

Interactive actions:
  c = commit, e = edit message, s = skip, q = quit
`);
}
