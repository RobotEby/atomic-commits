import { CliError, EXIT } from "../shared/errors.mjs";

export function parseArgs(argv) {
  const flags = {};
  const provided = new Set();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      flags.help = true;
      provided.add("help");
      continue;
    }
    if (arg === "--dry-run") {
      flags.dryRun = true;
      provided.add("dryRun");
      continue;
    }
    if (arg === "--check") {
      flags.check = true;
      provided.add("check");
      continue;
    }
    if (arg === "--yes" || arg === "-y") {
      flags.yes = true;
      provided.add("yes");
      continue;
    }
    if (arg === "--include-env") {
      flags.includeEnv = true;
      provided.add("includeEnv");
      continue;
    }
    if (arg === "--include-deleted") {
      flags.includeDeleted = true;
      provided.add("includeDeleted");
      continue;
    }
    if (arg === "--include-binary") {
      flags.includeBinary = true;
      provided.add("includeBinary");
      continue;
    }
    if (arg === "--include-large-files") {
      flags.includeLargeFiles = true;
      provided.add("includeLargeFiles");
      continue;
    }
    if (arg === "--allow-protected-branch") {
      flags.allowProtectedBranch = true;
      provided.add("allowProtectedBranch");
      continue;
    }
    if (arg === "--group") {
      flags.group = true;
      provided.add("group");
      continue;
    }
    if (arg === "--scope") {
      flags.allowScopes = true;
      provided.add("allowScopes");
      if (argv[index + 1] && !argv[index + 1].startsWith("-")) {
        flags.scope = argv[index + 1];
        provided.add("scope");
        index += 1;
      }
      continue;
    }
    if (arg.startsWith("--scope=")) {
      flags.allowScopes = true;
      flags.scope = arg.slice("--scope=".length);
      provided.add("allowScopes");
      provided.add("scope");
      continue;
    }
    if (arg === "--language") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new CliError(
          "--language requires a value (currently only en is supported).",
          EXIT.invalidArgs,
        );
      }
      flags.language = value;
      provided.add("language");
      index += 1;
      continue;
    }
    if (arg.startsWith("--language=")) {
      flags.language = arg.slice("--language=".length);
      provided.add("language");
      continue;
    }
    if (arg === "--max-file-size-kb") {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new CliError(
          "--max-file-size-kb requires a positive integer.",
          EXIT.invalidArgs,
        );
      }
      flags.maxFileSizeKb = value;
      provided.add("maxFileSizeKb");
      index += 1;
      continue;
    }
    if (arg.startsWith("--max-file-size-kb=")) {
      const value = Number(arg.slice("--max-file-size-kb=".length));
      if (!Number.isInteger(value) || value <= 0) {
        throw new CliError(
          "--max-file-size-kb requires a positive integer.",
          EXIT.invalidArgs,
        );
      }
      flags.maxFileSizeKb = value;
      provided.add("maxFileSizeKb");
      continue;
    }

    throw new CliError(`Unknown argument: ${arg}`, EXIT.invalidArgs);
  }

  if (flags.dryRun && flags.check) {
    throw new CliError(
      "Use either --dry-run or --check, not both.",
      EXIT.invalidArgs,
    );
  }
  if (flags.yes && flags.check) {
    throw new CliError(
      "Use either --yes or --check, not both.",
      EXIT.invalidArgs,
    );
  }

  return { flags, provided };
}
