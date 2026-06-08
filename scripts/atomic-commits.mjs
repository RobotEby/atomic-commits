#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const MAX_DIFF_BYTES = 256 * 1024;
const TEXT_SCAN_BYTES = 256 * 1024;
const DEFAULT_MAX_FILE_SIZE_KB = 2048;
const EXIT = {
  success: 0,
  fatal: 1,
  safety: 2,
  invalidArgs: 3,
  noFiles: 4,
};

const ALLOWED_TYPES = new Set([
  "feat",
  "fix",
  "docs",
  "style",
  "refactor",
  "perf",
  "test",
  "build",
  "ci",
  "chore",
  "revert",
]);

const DEFAULT_CONFIG = {
  language: "en",
  maxFileSizeKb: DEFAULT_MAX_FILE_SIZE_KB,
  allowScopes: false,
  scope: null,
  includeEnv: false,
  includeDeleted: false,
  includeBinary: false,
  includeLargeFiles: false,
  allowProtectedBranch: false,
  group: false,
  protectedBranches: [
    "main",
    "master",
    "production",
    "prod",
    "release",
    "stable",
  ],
  ignore: ["storage/**", "uploads/**", "public/uploads/**"],
  commitStyle: "conventional",
};

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "logs",
  "tmp",
  "temp",
  ".cache",
  ".turbo",
  ".next",
  ".nuxt",
  ".vite",
  "playwright-report",
  "test-results",
  "storage",
  "uploads",
  "public/uploads",
  ".local-storage",
]);

const ALLOWED_ENV_EXAMPLES = new Set([
  ".env.example",
  ".env.local.example",
  ".env.development.example",
  ".env.production.example",
  ".env.staging.example",
]);

const BLOCKED_FILE_EXTENSIONS = new Set([
  ".log",
  ".sqlite",
  ".sqlite3",
  ".db",
  ".dump",
  ".backup",
  ".bak",
  ".pem",
  ".key",
  ".p12",
  ".crt",
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".wasm",
  ".class",
]);

const LOCKFILES = new Set([
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
  "poetry.lock",
  "Pipfile.lock",
  "uv.lock",
  "Cargo.lock",
  "go.sum",
  "composer.lock",
  "Gemfile.lock",
]);

const SECRET_PATTERNS = [
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: "GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9_]{20,}\b/,
  },
  {
    name: "GitHub fine-grained token",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  },
  { name: "Slack token", pattern: /\bxox[bp]-[A-Za-z0-9-]{20,}\b/ },
  {
    name: "JWT-like token",
    pattern:
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: "credential assignment",
    pattern:
      /\b(?:PASSWORD|PASSWD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|DATABASE_URL|DB_URL|JWT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN)\b\s*[:=]\s*['"]?([^'"\s#]+)['"]?/,
    valueGroup: 1,
  },
];

const PLACEHOLDER_VALUES = [
  "example",
  "placeholder",
  "changeme",
  "change-me",
  "your_key",
  "your-key",
  "your_token",
  "your-token",
  "localhost",
  "127.0.0.1",
  "process.env",
  "test-",
  "dev-",
  "dummy",
  "mock",
  "<",
  "${",
];

class CliError extends Error {
  constructor(message, exitCode = EXIT.fatal) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function parseArgs(argv) {
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
          "--language requires en or pt-BR.",
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

function printUsage() {
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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
    stdio: options.stdio ?? ["pipe", "pipe", "pipe"],
  });

  const status = result.status ?? (result.error ? 1 : 0);

  if (result.error && status !== 0) {
    if (options.allowFailure) {
      return {
        ok: false,
        status,
        stdout: result.stdout ?? "",
        stderr: result.stderr || result.error.message,
      };
    }
    throw new CliError(result.error.message, EXIT.fatal);
  }

  const output = {
    ok: status === 0,
    status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };

  if (!output.ok && !options.allowFailure) {
    const detail = String(
      output.stderr || output.stdout || `${command} exited with ${status}`,
    ).trim();
    throw new CliError(detail, EXIT.fatal);
  }

  return output;
}

function git(repoRoot, args, options = {}) {
  return run("git", args, { ...options, cwd: repoRoot });
}

function getRepoRoot() {
  const result = run("git", ["rev-parse", "--show-toplevel"], {
    allowFailure: true,
  });
  if (!result.ok) {
    throw new CliError("Not a Git repository.", EXIT.fatal);
  }
  return result.stdout.trim();
}

function loadConfig(repoRoot) {
  const configPath = path.join(repoRoot, ".atomiccommitsrc.json");
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("config root must be an object");
    }
    return parsed;
  } catch (error) {
    throw new CliError(
      `Invalid .atomiccommitsrc.json: ${error.message}`,
      EXIT.invalidArgs,
    );
  }
}

function mergeOptions(config, parsedArgs) {
  const configOptions = normalizeConfig(config);
  const options = {
    ...DEFAULT_CONFIG,
    ...configOptions,
    ...parsedArgs.flags,
  };

  if (!["en", "pt-BR"].includes(options.language)) {
    throw new CliError("--language must be en or pt-BR.", EXIT.invalidArgs);
  }
  if (!Number.isInteger(options.maxFileSizeKb) || options.maxFileSizeKb <= 0) {
    throw new CliError(
      "maxFileSizeKb must be a positive integer.",
      EXIT.invalidArgs,
    );
  }
  if (options.scope) {
    options.scope = sanitizeScope(String(options.scope));
    options.allowScopes = true;
  }
  options.protectedBranches = Array.isArray(options.protectedBranches)
    ? options.protectedBranches.map(String)
    : DEFAULT_CONFIG.protectedBranches;
  options.ignore = Array.isArray(options.ignore)
    ? options.ignore.map(String)
    : DEFAULT_CONFIG.ignore;
  options.isInteractive = !options.dryRun && !options.check && !options.yes;
  return options;
}

function normalizeConfig(config) {
  const normalized = {};
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (Object.hasOwn(config, key)) {
      normalized[key] = config[key];
    }
  }
  return normalized;
}

function sanitizeScope(scope) {
  const cleaned = scope
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!cleaned) {
    throw new CliError(
      "Scope must contain letters or numbers.",
      EXIT.invalidArgs,
    );
  }
  return cleaned;
}

function hasHead(repoRoot) {
  return git(repoRoot, ["rev-parse", "--verify", "HEAD"], {
    allowFailure: true,
  }).ok;
}

function getBranchName(repoRoot) {
  const result = git(repoRoot, ["branch", "--show-current"], {
    allowFailure: true,
  });
  if (result.ok && result.stdout.trim()) {
    return result.stdout.trim();
  }

  const detached = git(repoRoot, ["rev-parse", "--short", "HEAD"], {
    allowFailure: true,
  });
  return detached.ok ? `(detached ${detached.stdout.trim()})` : "(unborn)";
}

function getGitState(repoRoot) {
  const gitDir = git(repoRoot, ["rev-parse", "--git-dir"]).stdout.trim();
  const absoluteGitDir = path.isAbsolute(gitDir)
    ? gitDir
    : path.join(repoRoot, gitDir);
  const markers = [
    "MERGE_HEAD",
    "REBASE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
  ];
  const activeMarkers = markers.filter((marker) =>
    existsSync(path.join(absoluteGitDir, marker)),
  );
  const rebaseMerge = existsSync(path.join(absoluteGitDir, "rebase-merge"));
  const rebaseApply = existsSync(path.join(absoluteGitDir, "rebase-apply"));
  if (rebaseMerge || rebaseApply) {
    activeMarkers.push(rebaseMerge ? "rebase-merge" : "rebase-apply");
  }
  return { gitDir: absoluteGitDir, activeMarkers };
}

function assertNoConflictState(repoRoot, entries) {
  const state = getGitState(repoRoot);
  if (
    state.activeMarkers.length > 0 ||
    entries.some((entry) => entry.kind === "unmerged")
  ) {
    throw new CliError(
      "Aborted: resolve Git conflicts before creating atomic commits.",
      EXIT.safety,
    );
  }
}

async function assertProtectedBranchAllowed(branch, options, summary) {
  const isProtected = options.protectedBranches.includes(branch);
  if (
    !isProtected ||
    options.allowProtectedBranch ||
    branch.startsWith("(detached")
  ) {
    return { isProtected, allowed: true };
  }

  const issue = `protected branch: ${branch}`;
  summary.warnings.push(issue);

  if (options.dryRun) {
    return { isProtected, allowed: false };
  }

  if (options.check || options.yes) {
    throw new CliError(
      `Refusing to continue on protected branch "${branch}". Use --allow-protected-branch to override.`,
      EXIT.safety,
    );
  }

  const rl = readline.createInterface({
    input: options.stdin,
    output: options.stdout,
  });
  try {
    const answer = await rl.question(
      `You are on ${branch}. Type "${branch}" to continue: `,
    );
    if (answer.trim() !== branch) {
      throw new CliError(
        `Refusing to continue on protected branch "${branch}".`,
        EXIT.safety,
      );
    }
    return { isProtected, allowed: true };
  } finally {
    rl.close();
  }
}

function collectPorcelainStatus(repoRoot) {
  const raw = git(repoRoot, [
    "status",
    "--porcelain=v1",
    "-z",
    "-uall",
    "--renames",
  ]).stdout;
  return parsePorcelainStatus(raw);
}

function parsePorcelainStatus(rawStatus) {
  const tokens = rawStatus.split("\0").filter(Boolean);
  const entries = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length < 4) {
      continue;
    }

    const x = token[0];
    const y = token[1];
    const status = `${x}${y}`;
    const rawPath = token.slice(3);

    if (x === "R" || x === "C") {
      const oldPath = tokens[index + 1];
      index += 1;
      entries.push({
        status,
        x,
        y,
        path: normalizePath(rawPath),
        oldPath: normalizePath(oldPath),
        paths: [normalizePath(oldPath), normalizePath(rawPath)],
        kind: x === "R" ? "renamed" : "copied",
      });
      continue;
    }

    const kind = getStatusKind({ x, y });
    entries.push({
      status,
      x,
      y,
      path: normalizePath(rawPath),
      oldPath: null,
      paths: [normalizePath(rawPath)],
      kind,
    });
  }

  return entries;
}

function getStatusKind(entry) {
  const status = `${entry.x}${entry.y}`;
  if (status === "??") {
    return "untracked";
  }
  if (
    entry.x === "U" ||
    entry.y === "U" ||
    ["AA", "DD", "AU", "UD", "UA", "DU"].includes(status)
  ) {
    return "unmerged";
  }
  if (entry.x === "D" || entry.y === "D") {
    return "deleted";
  }
  if (entry.x === "A" || entry.y === "A") {
    return "added";
  }
  if (entry.x === "M" || entry.y === "M") {
    return "modified";
  }
  if (entry.x === "T" || entry.y === "T") {
    return "modified";
  }
  return "modified";
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function expandStatusEntries(repoRoot, entries) {
  const expanded = [];

  for (const entry of entries) {
    if (
      entry.kind === "untracked" &&
      isDirectory(path.join(repoRoot, entry.path))
    ) {
      for (const filePath of expandUntrackedDirectory(repoRoot, entry.path)) {
        expanded.push({
          ...entry,
          path: filePath,
          paths: [filePath],
        });
      }
      continue;
    }
    expanded.push(entry);
  }

  return deduplicateEntries(expanded);
}

function expandUntrackedDirectory(repoRoot, directoryPath) {
  const base = path.join(repoRoot, directoryPath);
  const files = [];
  walkFiles(base, files, repoRoot);
  return files.sort();
}

function walkFiles(currentPath, files, repoRoot) {
  for (const name of readdirSync(currentPath)) {
    const absolute = path.join(currentPath, name);
    const relative = normalizePath(path.relative(repoRoot, absolute));
    if (isGeneratedPath(relative, { ignore: [] })) {
      continue;
    }
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) {
      walkFiles(absolute, files, repoRoot);
    } else if (stat.isFile()) {
      files.push(relative);
    }
  }
}

function deduplicateEntries(entries) {
  const seen = new Set();
  const result = [];
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.paths.join("\0")}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(entry);
    }
  }
  return result;
}

function buildProcessingPlan(repoRoot, entries, options, headExists) {
  const ignored = [];
  const candidates = [];

  for (const entry of entries) {
    const classification = classifyEntry(repoRoot, entry, options);
    if (!classification.processable) {
      ignored.push({
        entry,
        reason: classification.reason,
        severity: classification.severity,
      });
      continue;
    }
    candidates.push({ entry, classification });
  }

  const grouped = options.group
    ? groupCandidates(candidates)
    : candidates.map((candidate) => ({
        id: candidate.entry.paths.join(" -> "),
        entries: [candidate.entry],
        paths: candidate.entry.paths,
        primaryPath: candidate.entry.path,
        kind: candidate.entry.kind,
        classification: candidate.classification,
      }));

  const usedMessages = new Set();
  const items = grouped.map((group) => {
    const diff = getItemDiff(repoRoot, group, headExists);
    const message = ensureUniqueMessage(
      generateCommitMessage(group, diff, options),
      usedMessages,
      options,
    );
    const validation = validateCommitMessage(message, options);
    return {
      ...group,
      diff,
      message,
      messageValid: validation.valid,
      messageErrors: validation.errors,
    };
  });

  const warnings = [];
  if (isSuspiciousLockfileOnlyPlan(items)) {
    warnings.push("Suspicious lockfile-only changes detected.");
  }

  return { items, ignored, warnings };
}

function classifyEntry(repoRoot, entry, options) {
  if (entry.kind === "unmerged") {
    return blocked("unmerged conflict", "fatal");
  }
  if (entry.kind === "deleted" && !options.includeDeleted) {
    return blocked("deleted file requires --include-deleted", "warn");
  }

  for (const filePath of entry.paths) {
    const result = classifyPath(repoRoot, filePath, entry, options);
    if (!result.processable) {
      return result;
    }
  }

  const scanTarget = entry.path;
  if (entry.kind !== "deleted" && existsSync(path.join(repoRoot, scanTarget))) {
    const secret = scanFileForSecrets(path.join(repoRoot, scanTarget));
    if (secret.detected) {
      return blocked(`possible secret: ${secret.reason}`, "fatal");
    }
  }

  return { processable: true, reason: "processable", severity: "ok" };
}

function classifyPath(repoRoot, filePath, entry, options) {
  if (!filePath) {
    return blocked("invalid path", "fatal");
  }
  if (filePath.startsWith("../") || path.isAbsolute(filePath)) {
    return blocked("path outside repository", "fatal");
  }
  if (isGeneratedPath(filePath, options)) {
    return blocked("generated or ignored path", "warn");
  }
  if (
    isEnvFile(filePath) &&
    !isAllowedEnvExample(filePath) &&
    !options.includeEnv
  ) {
    return blocked("environment file", "fatal");
  }
  if (isDatabaseDumpOrBackup(filePath)) {
    return blocked("database dump or backup", "fatal");
  }
  if (isBlockedByExtension(filePath) && !isAllowedEnvExample(filePath)) {
    return blocked("blocked file extension", "fatal");
  }

  const absolute = path.join(repoRoot, filePath);
  if (entry.kind === "deleted" || !existsSync(absolute)) {
    return { processable: true, reason: "processable", severity: "ok" };
  }

  const stat = statSync(absolute);
  if (!stat.isFile()) {
    return blocked("not a regular file", "warn");
  }
  if (isLargeFile(stat.size, options) && !options.includeLargeFiles) {
    return blocked(`large file over ${options.maxFileSizeKb} KB`, "warn");
  }
  if (isBinaryFile(absolute) && !options.includeBinary) {
    return blocked("binary file", "warn");
  }

  return { processable: true, reason: "processable", severity: "ok" };
}

function blocked(reason, severity) {
  return { processable: false, reason, severity };
}

function isDirectory(absolutePath) {
  try {
    return lstatSync(absolutePath).isDirectory();
  } catch {
    return false;
  }
}

function isGeneratedPath(filePath, options) {
  const normalized = normalizePath(filePath);
  const segments = normalized.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    const partial = segments.slice(0, index + 1).join("/");
    if (
      IGNORED_DIRECTORIES.has(segments[index]) ||
      IGNORED_DIRECTORIES.has(partial)
    ) {
      return true;
    }
  }
  return options.ignore.some((pattern) => matchSimpleGlob(normalized, pattern));
}

function matchSimpleGlob(filePath, pattern) {
  const normalizedPattern = normalizePath(pattern);
  if (normalizedPattern.endsWith("/**")) {
    const base = normalizedPattern.slice(0, -3);
    return filePath === base || filePath.startsWith(`${base}/`);
  }
  if (normalizedPattern.includes("*")) {
    const escaped = normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, ".*")
      .replace(/\*/g, "[^/]*");
    return new RegExp(`^${escaped}$`).test(filePath);
  }
  return (
    filePath === normalizedPattern ||
    filePath.startsWith(`${normalizedPattern}/`)
  );
}

function isEnvFile(filePath) {
  const base = path.posix.basename(filePath);
  return base === ".env" || base.startsWith(".env.");
}

function isAllowedEnvExample(filePath) {
  return ALLOWED_ENV_EXAMPLES.has(path.posix.basename(filePath));
}

function isBlockedByExtension(filePath) {
  const lower = filePath.toLowerCase();
  if (
    [...BLOCKED_FILE_EXTENSIONS].some((extension) => lower.endsWith(extension))
  ) {
    return true;
  }
  if (/\.sql(?:ite|ite3)?$/i.test(lower)) {
    return true;
  }
  return false;
}

function isDatabaseDumpOrBackup(filePath) {
  const lower = filePath.toLowerCase();
  return (
    /(^|[/.])dump(s)?([/.]|$)/.test(lower) ||
    /(^|[/.])backup(s)?([/.]|$)/.test(lower) ||
    /\.(dump|backup|bak|sql)$/i.test(lower)
  );
}

function isLargeFile(size, options) {
  return size > options.maxFileSizeKb * 1024;
}

function isBinaryFile(absolutePath) {
  const extension = path.extname(absolutePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(extension)) {
    return true;
  }

  const buffer = readFileChunk(absolutePath, 8192);
  if (buffer.includes(0)) {
    return true;
  }

  let suspicious = 0;
  for (const byte of buffer) {
    if (byte < 7 || (byte > 14 && byte < 32)) {
      suspicious += 1;
    }
  }
  return buffer.length > 0 && suspicious / buffer.length > 0.3;
}

function readFileChunk(absolutePath, limit) {
  const buffer = readFileSync(absolutePath);
  return buffer.length > limit ? buffer.subarray(0, limit) : buffer;
}

function scanFileForSecrets(absolutePath) {
  const buffer = readFileChunk(absolutePath, TEXT_SCAN_BYTES);
  if (buffer.includes(0)) {
    return { detected: false };
  }

  const text = buffer.toString("utf8");
  if (
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(text) &&
    /-----END [A-Z ]*PRIVATE KEY-----/i.test(text)
  ) {
    return { detected: true, reason: "private key block" };
  }

  for (const secret of SECRET_PATTERNS) {
    const match = secret.pattern.exec(text);
    if (!match) {
      continue;
    }
    const value = secret.valueGroup ? match[secret.valueGroup] : match[0];
    if (isPlaceholderSecretValue(value)) {
      continue;
    }
    return { detected: true, reason: secret.name };
  }

  return { detected: false };
}

function isPlaceholderSecretValue(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return true;
  }
  if (normalized.length < 8 || /^[\[{(/]/.test(normalized)) {
    return true;
  }
  return PLACEHOLDER_VALUES.some((placeholder) =>
    normalized.includes(placeholder),
  );
}

function groupCandidates(candidates) {
  const remaining = [...candidates];
  const groups = [];

  while (remaining.length > 0) {
    const current = remaining.shift();
    const relatedIndex = remaining.findIndex((candidate) =>
      areRelatedForGrouping(current.entry.path, candidate.entry.path),
    );
    if (relatedIndex === -1) {
      groups.push({
        id: current.entry.paths.join(" -> "),
        entries: [current.entry],
        paths: current.entry.paths,
        primaryPath: current.entry.path,
        kind: current.entry.kind,
        classification: current.classification,
      });
      continue;
    }

    const related = remaining.splice(relatedIndex, 1)[0];
    const entries = [current.entry, related.entry];
    const primaryPath = chooseGroupPrimaryPath(
      current.entry.path,
      related.entry.path,
    );
    const paths = orderGroupPaths(
      primaryPath,
      entries.flatMap((entry) => entry.paths),
    );
    groups.push({
      id: paths.join(", "),
      entries,
      paths,
      primaryPath,
      kind: "group",
      classification: current.classification,
    });
  }

  return groups;
}

function areRelatedForGrouping(first, second) {
  const a = normalizePath(first);
  const b = normalizePath(second);
  const baseA = path.posix.basename(a);
  const baseB = path.posix.basename(b);
  const dirA = path.posix.dirname(a);
  const dirB = path.posix.dirname(b);

  if (baseA === "package.json" && isPackageLockfile(baseB)) {
    return dirA === dirB;
  }
  if (baseB === "package.json" && isPackageLockfile(baseA)) {
    return dirA === dirB;
  }
  if (isDockerFile(baseA) && isDockerFile(baseB)) {
    return dirA === dirB;
  }
  if (
    dirA === dirB &&
    sameStem(a, b) &&
    isStylePath(a) !== isStylePath(b) &&
    (isStylePath(a) || isStylePath(b))
  ) {
    return true;
  }
  if (isSchemaOrMigration(a) && isSchemaOrMigration(b)) {
    return true;
  }
  if (
    (isConfigPath(a) && isDocsPath(b)) ||
    (isConfigPath(b) && isDocsPath(a))
  ) {
    return true;
  }
  return false;
}

function chooseGroupPrimaryPath(first, second) {
  if (path.posix.basename(first) === "package.json") {
    return first;
  }
  if (path.posix.basename(second) === "package.json") {
    return second;
  }
  return first.length <= second.length ? first : second;
}

function orderGroupPaths(primaryPath, paths) {
  const unique = [...new Set(paths)];
  return [
    primaryPath,
    ...unique.filter((filePath) => filePath !== primaryPath),
  ];
}

function isPackageLockfile(fileName) {
  return [
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
  ].includes(fileName);
}

function isDockerFile(fileName) {
  return (
    fileName === "Dockerfile" ||
    fileName === "docker-compose.yml" ||
    fileName === "docker-compose.yaml" ||
    fileName.startsWith("Dockerfile.")
  );
}

function sameStem(first, second) {
  return (
    stripExtension(path.posix.basename(first)) ===
    stripExtension(path.posix.basename(second))
  );
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

function isSchemaOrMigration(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower.includes("schema") ||
    lower.includes("migration") ||
    lower.includes("migrations/")
  );
}

function getItemDiff(repoRoot, item, headExists) {
  const args = headExists
    ? ["diff", "--", ...item.paths]
    : ["diff", "--cached", "--", ...item.paths];
  const result = git(repoRoot, args, {
    allowFailure: true,
    maxBuffer: MAX_DIFF_BYTES * 2,
  });
  if (result.ok && result.stdout.trim()) {
    return truncate(result.stdout, MAX_DIFF_BYTES);
  }

  if (!headExists) {
    const fallback = git(repoRoot, ["diff", "--", ...item.paths], {
      allowFailure: true,
      maxBuffer: MAX_DIFF_BYTES * 2,
    });
    return fallback.ok ? truncate(fallback.stdout, MAX_DIFF_BYTES) : "";
  }

  const fallback = git(repoRoot, ["diff", "--cached", "--", ...item.paths], {
    allowFailure: true,
    maxBuffer: MAX_DIFF_BYTES * 2,
  });
  return fallback.ok ? truncate(fallback.stdout, MAX_DIFF_BYTES) : "";
}

function truncate(value, maxBytes) {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value;
  }
  return value.slice(0, maxBytes);
}

function generateCommitMessage(item, diff, options) {
  const type = inferCommitType(item, diff);
  const subject = inferCommitSubject(item, type, diff, options);
  const prefix =
    options.allowScopes && options.scope ? `${type}(${options.scope})` : type;
  return limitMessage(`${prefix}: ${subject}`);
}

function inferCommitType(item, diff) {
  const paths = item.paths.join("\n").toLowerCase();
  const primaryPath = item.primaryPath;
  if (hasRevertSignals(diff)) return "revert";
  if (item.paths.some(isDocsPath)) return "docs";
  if (item.paths.some(isTestPath)) return "test";
  if (item.paths.some(isCiPath)) return "ci";
  if (item.paths.some(isBuildPath)) return "build";
  if (item.paths.some(isConfigPath)) return "chore";
  if (item.paths.some(isStylePath)) return "style";
  if (hasFixSignals(diff) || paths.includes("bug") || paths.includes("error"))
    return "fix";
  if (hasPerformanceSignals(diff)) return "perf";
  if (hasRefactorSignals(diff)) return "refactor";
  if (
    item.kind === "added" ||
    item.entries?.some(
      (entry) => entry.kind === "added" || entry.kind === "untracked",
    )
  )
    return "feat";
  if (isSecurityPath(primaryPath)) return "fix";
  return "refactor";
}

function inferCommitSubject(item, type, diff, options) {
  const pathLabel = humanizePath(item.primaryPath);
  const category = inferCategory(item.primaryPath);
  const action = actionForType(type, item);

  if (type === "docs") return `${action} ${pathLabel} documentation`;
  if (type === "test") return `${action} ${pathLabel} tests`;
  if (type === "ci") return `${action} CI workflow`;
  if (type === "build") return `${action} build configuration`;
  if (type === "chore") return `${action} ${pathLabel} configuration`;
  if (type === "style") return `${action} ${pathLabel} styling`;
  if (type === "fix")
    return hasFixSignals(diff)
      ? `resolve ${category} error handling`
      : `${action} ${pathLabel}`;
  if (type === "perf") return `optimize ${category} handling`;
  if (type === "refactor") return `${action} ${pathLabel}`;
  if (type === "revert") return `revert ${pathLabel} changes`;
  return `${action} ${pathLabel}`;
}

function actionForType(type, item) {
  const hasAdded =
    item.kind === "added" ||
    item.kind === "untracked" ||
    item.entries?.some((entry) => ["added", "untracked"].includes(entry.kind));
  const hasDeleted =
    item.kind === "deleted" ||
    item.entries?.some((entry) => entry.kind === "deleted");
  if (hasDeleted) return "remove";
  if (hasAdded && type === "test") return "add";
  if (hasAdded && type === "docs") return "add";
  if (hasAdded && type === "feat") return "add";
  if (type === "style") return "polish";
  if (type === "refactor") return "reorganize";
  return "update";
}

function humanizePath(filePath) {
  const category = inferCategory(filePath);
  const base = path.posix.basename(filePath).replace(/\.[^.]+$/, "");
  const name = base
    .replace(/^index$/i, path.posix.basename(path.posix.dirname(filePath)))
    .replace(/[-_.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();

  if (!name || ["readme", "package", "config"].includes(name)) {
    return category;
  }
  if (category && !name.includes(category)) {
    return `${name} ${category}`;
  }
  return name;
}

function inferCategory(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.includes("/auth") || lower.includes("auth"))
    return "authentication";
  if (lower.includes("/api") || lower.includes("api")) return "API";
  if (
    lower.includes("database") ||
    lower.includes("/db") ||
    lower.includes("migration") ||
    lower.includes("schema")
  )
    return "database";
  if (lower.includes("component")) return "component";
  if (lower.includes("/page") || lower.includes("/pages/")) return "page";
  if (lower.includes("/route") || lower.includes("/routes/")) return "route";
  if (lower.includes("/service") || lower.includes("/services/"))
    return "service";
  if (lower.includes("/hook") || lower.includes("/hooks/")) return "hook";
  if (lower.includes("/util") || lower.includes("/utils/")) return "utility";
  if (lower.includes("security")) return "security";
  if (isDocsPath(filePath)) return "project";
  if (isTestPath(filePath)) return "project";
  if (isCiPath(filePath)) return "project";
  if (isBuildPath(filePath)) return "project";
  if (isConfigPath(filePath)) return "project";
  return (
    humanizeSegment(path.posix.basename(path.posix.dirname(filePath))) ||
    "project"
  );
}

function humanizeSegment(segment) {
  if (!segment || segment === "." || segment === "/") {
    return "";
  }
  return segment.replace(/[-_.]+/g, " ").toLowerCase();
}

function isDocsPath(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower === "readme.md" ||
    lower.startsWith("docs/") ||
    /\.(md|mdx|rst|adoc|txt)$/i.test(lower)
  );
}

function isTestPath(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower.includes("/test/") ||
    lower.includes("/tests/") ||
    lower.includes("__tests__") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/i.test(lower)
  );
}

function isCiPath(filePath) {
  const lower = filePath.toLowerCase();
  return (
    lower.startsWith(".github/workflows/") ||
    lower.includes("/workflows/") ||
    lower.includes("gitlab-ci") ||
    lower.includes("circleci") ||
    lower.includes("jenkins")
  );
}

function isBuildPath(filePath) {
  const lower = filePath.toLowerCase();
  const base = path.posix.basename(filePath);
  return (
    isDockerFile(base) ||
    lower.includes("docker") ||
    lower.includes("makefile") ||
    lower.endsWith("package.json") ||
    LOCKFILES.has(base)
  );
}

function isConfigPath(filePath) {
  const lower = filePath.toLowerCase();
  const base = path.posix.basename(lower);
  return (
    base.startsWith(".") ||
    /\.(json|yaml|yml|toml|ini|conf|config|rc)$/i.test(lower) ||
    lower.includes("config")
  );
}

function isStylePath(filePath) {
  return /\.(css|scss|sass|less|styl)$/i.test(filePath);
}

function isSecurityPath(filePath) {
  return filePath.toLowerCase().includes("security");
}

function hasRevertSignals(diff) {
  return /\brevert(ed|s)?\b/i.test(diff);
}

function hasFixSignals(diff) {
  return /\b(fix|bug|error|exception|crash|fail|failure|invalid|handle|handling)\b/i.test(
    diff,
  );
}

function hasPerformanceSignals(diff) {
  return /\b(perf|performance|optimi[sz]e|cache|faster|slow|latency)\b/i.test(
    diff,
  );
}

function hasRefactorSignals(diff) {
  return /\b(refactor|reorganize|rename|extract|split|cleanup)\b/i.test(diff);
}

function limitMessage(message) {
  if (message.length <= 100) {
    return message;
  }
  return message
    .slice(0, 100)
    .replace(/\s+\S*$/, "")
    .replace(/[.,;:!?-]+$/, "");
}

function ensureUniqueMessage(message, usedMessages, options) {
  let candidate = message;
  let counter = 2;
  while (usedMessages.has(candidate)) {
    const suffix = ` ${counter}`;
    candidate = limitMessage(`${message}${suffix}`);
    counter += 1;
  }
  const validation = validateCommitMessage(candidate, options);
  if (!validation.valid) {
    candidate = fallbackMessage(usedMessages, options);
  }
  usedMessages.add(candidate);
  return candidate;
}

function fallbackMessage(usedMessages, options) {
  let candidate =
    options.allowScopes && options.scope
      ? `chore(${options.scope}): update project files`
      : "chore: update project files";
  let counter = 2;
  while (usedMessages.has(candidate)) {
    candidate =
      options.allowScopes && options.scope
        ? `chore(${options.scope}): update project files ${counter}`
        : `chore: update project files ${counter}`;
    counter += 1;
  }
  return candidate;
}

function validateCommitMessage(message, options) {
  const errors = [];
  if (message.length > 100) {
    errors.push("message must be 100 characters or fewer");
  }

  const pattern = options.allowScopes
    ? /^([a-z]+)(?:\(([a-z0-9-]+)\))?: (.+)$/
    : /^([a-z]+): (.+)$/;
  const match = pattern.exec(message);
  if (!match) {
    errors.push(
      options.allowScopes
        ? "message must match <type>[(scope)]: <description>"
        : "message must match <type>: <description>",
    );
    return { valid: false, errors };
  }

  const type = match[1];
  const subject = match[options.allowScopes ? 3 : 2];
  if (!ALLOWED_TYPES.has(type)) {
    errors.push(`unsupported type: ${type}`);
  }
  if (!subject || subject.trim().length < 8) {
    errors.push("description must be descriptive");
  }
  if (isGenericSubject(subject)) {
    errors.push("description is too generic");
  }
  if (/[\r\n]/.test(message)) {
    errors.push("message must be a single line");
  }
  if (!options.allowScopes && /^[a-z]+\([^)]+\): /.test(message)) {
    errors.push("scope is not allowed unless --scope is used");
  }
  return { valid: errors.length === 0, errors };
}

function isGenericSubject(subject) {
  const normalized = subject.trim().toLowerCase();
  return [
    "update file",
    "fix issue",
    "changes",
    "change",
    "wip",
    "misc",
    "updates",
    "update files",
  ].includes(normalized);
}

function isSuspiciousLockfileOnlyPlan(items) {
  return (
    items.length > 0 &&
    items.every((item) =>
      item.paths.every((filePath) =>
        LOCKFILES.has(path.posix.basename(filePath)),
      ),
    )
  );
}

function clearStaging(repoRoot, headExists) {
  const args = headExists
    ? ["reset", "--quiet", "--"]
    : ["rm", "-r", "--cached", "--quiet", "--ignore-unmatch", "--", "."];
  const result = git(repoRoot, args, { allowFailure: true });
  if (!result.ok && headExists) {
    const fallback = git(
      repoRoot,
      ["rm", "-r", "--cached", "--quiet", "--ignore-unmatch", "--", "."],
      { allowFailure: true },
    );
    if (!fallback.ok) {
      throw new CliError(
        `Failed to clear staging: ${fallback.stderr || result.stderr}`,
        EXIT.fatal,
      );
    }
  }
}

function stageItem(repoRoot, item, options) {
  for (const entry of item.entries) {
    if (entry.kind === "deleted") {
      git(repoRoot, ["add", "-u", "--", entry.path]);
      continue;
    }

    const addArgs = ["add"];
    if (
      options.includeEnv &&
      entry.paths.some((filePath) => isEnvFile(filePath))
    ) {
      addArgs.push("-f");
    }
    addArgs.push("--", ...entry.paths);
    git(repoRoot, addArgs);
  }
}

function getStagedChanges(repoRoot) {
  const raw = git(repoRoot, [
    "diff",
    "--cached",
    "--name-status",
    "-z",
    "-M",
  ]).stdout;
  return parseNameStatus(raw);
}

function parseNameStatus(raw) {
  const tokens = raw.split("\0").filter(Boolean);
  const changes = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const status = tokens[index];
    if (/^[RC]\d+/.test(status)) {
      const oldPath = normalizePath(tokens[index + 1]);
      const newPath = normalizePath(tokens[index + 2]);
      changes.push({ status, paths: [oldPath, newPath] });
      index += 2;
      continue;
    }
    const filePath = normalizePath(tokens[index + 1]);
    changes.push({ status, paths: [filePath] });
    index += 1;
  }
  return changes;
}

function assertOnlyCurrentItemStaged(repoRoot, item, options) {
  const staged = getStagedChanges(repoRoot);
  if (staged.length === 0) {
    throw new CliError("No staged changes for current item.", EXIT.safety);
  }

  const expected = new Set(item.paths.map(normalizePath));
  const actual = new Set(
    staged.flatMap((change) => change.paths.map(normalizePath)),
  );
  const unexpected = [...actual].filter((filePath) => !expected.has(filePath));
  const missing = [...expected].filter(
    (filePath) =>
      !actual.has(filePath) && existsSync(path.join(repoRoot, filePath)),
  );

  if (unexpected.length > 0 || missing.length > 0) {
    throw new CliError(
      `Unexpected staged files. Expected ${[...expected].join(", ") || "(none)"}, got ${[...actual].join(", ") || "(none)"}.`,
      EXIT.safety,
    );
  }

  for (const filePath of actual) {
    const entry = {
      path: filePath,
      paths: [filePath],
      kind: existsSync(path.join(repoRoot, filePath)) ? "modified" : "deleted",
    };
    const classification = classifyPath(repoRoot, filePath, entry, options);
    if (!classification.processable) {
      throw new CliError(
        `Staged file is not safe: ${filePath} (${classification.reason}).`,
        EXIT.safety,
      );
    }
    if (existsSync(path.join(repoRoot, filePath))) {
      const secret = scanFileForSecrets(path.join(repoRoot, filePath));
      if (secret.detected) {
        throw new CliError(
          `Staged file contains a possible secret: ${filePath} (${secret.reason}).`,
          EXIT.safety,
        );
      }
    }
  }
}

function commitItem(repoRoot, message) {
  git(repoRoot, ["commit", "-m", message]);
}

async function processEntries(repoRoot, plan, options, headExists, summary) {
  if (options.dryRun) {
    summary.dryRunItems = plan.items.length;
    printDryRunPlan(plan);
    return;
  }

  if (options.check) {
    printCheckResult(plan, summary);
    return;
  }

  if (plan.items.length === 0) {
    throw new CliError("No processable files.", EXIT.noFiles);
  }

  const rl = options.yes
    ? null
    : readline.createInterface({
        input: options.stdin,
        output: options.stdout,
      });
  try {
    for (const item of plan.items) {
      if (!item.messageValid) {
        summary.errors.push(
          `${item.id}: invalid generated message (${item.messageErrors.join("; ")})`,
        );
        continue;
      }

      let message = item.message;
      let action = options.yes ? "c" : await askAction(rl, item, message);

      if (action === "q") {
        summary.stopped = true;
        break;
      }
      if (action === "s") {
        summary.skipped.push({ item, reason: "user skipped" });
        continue;
      }
      if (action === "e") {
        message = await askValidMessage(rl, options);
        action = "c";
      }
      if (action !== "c") {
        summary.skipped.push({ item, reason: `unknown action ${action}` });
        continue;
      }

      try {
        clearStaging(repoRoot, hasHead(repoRoot));
        stageItem(repoRoot, item, options);
        assertOnlyCurrentItemStaged(repoRoot, item, options);
        commitItem(repoRoot, message);
        summary.commitsCreated += 1;
        summary.committed.push({ item, message });
      } catch (error) {
        summary.errors.push(`${item.id}: ${error.message}`);
        if (error instanceof CliError && error.exitCode === EXIT.safety) {
          continue;
        }
        break;
      } finally {
        try {
          clearStaging(repoRoot, hasHead(repoRoot));
        } catch (error) {
          summary.errors.push(`failed to clear staging: ${error.message}`);
        }
      }
    }
  } finally {
    rl?.close();
  }
}

async function askAction(rl, item, message) {
  console.log("");
  console.log(`Item: ${item.paths.join(" -> ")}`);
  console.log(`Suggested: ${message}`);
  while (true) {
    const answer = (
      await rl.question("Action [c=commit, e=edit, s=skip, q=quit]: ")
    )
      .trim()
      .toLowerCase();
    if (["c", "e", "s", "q"].includes(answer)) {
      return answer;
    }
    console.log("Action [c=commit, e=edit, s=skip, q=quit, Enter=skip]:");
  }
}

async function askValidMessage(rl, options) {
  while (true) {
    const message = (await rl.question("Commit message: ")).trim();
    const validation = validateCommitMessage(message, options);
    if (validation.valid) {
      return message;
    }
    console.log(`Invalid message: ${validation.errors.join("; ")}`);
  }
}

function printHeader(repoRoot, branch, headExists, mode) {
  console.log("Safe Atomic Commits");
  console.log(`Repository: ${repoRoot}`);
  console.log(`Branch: ${branch}`);
  console.log(`HEAD exists: ${headExists ? "yes" : "no"}`);
  console.log(`Mode: ${mode}`);
}

function printIgnoredFiles(ignored) {
  if (ignored.length === 0) {
    console.log("Ignored: none");
    return;
  }
  console.log("Ignored:");
  for (const ignoredItem of ignored) {
    console.log(
      `  - ${ignoredItem.entry.paths.join(" -> ")} - ${ignoredItem.reason}`,
    );
  }
}

function printDryRunPlan(plan) {
  console.log("");
  console.log("Planned commits:");
  if (plan.items.length === 0) {
    console.log("  none");
  }
  for (const item of plan.items) {
    console.log(`  - ${item.message}`);
    console.log(`    files: ${item.paths.join(", ")}`);
  }
  if (plan.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of plan.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

function printCheckResult(plan, summary) {
  console.log("");
  console.log("Check result:");
  const fatalIgnored = plan.ignored.filter((item) => item.severity === "fatal");
  if (
    fatalIgnored.length === 0 &&
    summary.warnings.length === 0 &&
    plan.warnings.length === 0
  ) {
    console.log("  No safety failures detected.");
  } else {
    for (const item of fatalIgnored) {
      console.log(`  - ${item.entry.paths.join(" -> ")}: ${item.reason}`);
    }
    for (const warning of [...summary.warnings, ...plan.warnings]) {
      console.log(`  - ${warning}`);
    }
  }
}

function printSummary(summary, plan) {
  console.log("");
  console.log("Summary:");
  console.log(`  Commits created: ${summary.commitsCreated}`);
  console.log(`  Dry-run items: ${summary.dryRunItems}`);
  console.log(`  Files ignored: ${plan.ignored.length}`);
  console.log(`  Files skipped: ${summary.skipped.length}`);
  console.log(`  Errors: ${summary.errors.length}`);

  if (summary.errors.length > 0) {
    console.log("Errors:");
    for (const error of summary.errors) {
      console.log(`  - ${error}`);
    }
  }
  if (summary.stopped) {
    console.log("Stopped by user.");
  }
  if (summary.errors.length > 0) {
    printRecoveryInstructions();
  }
}

function printRecoveryInstructions() {
  console.log("");
  console.log("Recovery:");
  console.log("  git status");
  console.log("  git reset --quiet --");
}

function determineMode(options) {
  if (options.dryRun) return "dry-run";
  if (options.check) return "check";
  if (options.yes) return "auto";
  return "interactive";
}

function hasSafetyFailures(plan, summary, options) {
  if (
    summary.warnings.some((warning) => warning.startsWith("protected branch"))
  ) {
    return true;
  }
  return (
    plan.ignored.some((item) => item.severity === "fatal") ||
    (options.check && plan.warnings.length > 0)
  );
}

export async function main(argv = process.argv.slice(2), runtime = {}) {
  let repoRoot = process.cwd();
  let headExistsValue = false;
  const originalCwd = process.cwd();
  try {
    if (runtime.cwd) {
      process.chdir(runtime.cwd);
    }
    const parsedArgs = parseArgs(argv);
    if (parsedArgs.flags.help) {
      printUsage();
      return EXIT.success;
    }

    repoRoot = getRepoRoot();
    const config = loadConfig(repoRoot);
    const options = mergeOptions(config, parsedArgs);
    options.stdin = runtime.stdin ?? process.stdin;
    options.stdout = runtime.stdout ?? process.stdout;
    headExistsValue = hasHead(repoRoot);
    const branch = getBranchName(repoRoot);
    const rawEntries = collectPorcelainStatus(repoRoot);
    const entries = expandStatusEntries(repoRoot, rawEntries);
    assertNoConflictState(repoRoot, entries);

    const summary = {
      commitsCreated: 0,
      dryRunItems: 0,
      skipped: [],
      committed: [],
      errors: [],
      warnings: [],
      stopped: false,
    };

    await assertProtectedBranchAllowed(branch, options, summary);
    const plan = buildProcessingPlan(
      repoRoot,
      entries,
      options,
      headExistsValue,
    );
    summary.warnings.push(...plan.warnings);

    printHeader(repoRoot, branch, headExistsValue, determineMode(options));
    printIgnoredFiles(plan.ignored);
    await processEntries(repoRoot, plan, options, headExistsValue, summary);
    printSummary(summary, plan);

    if (options.check && hasSafetyFailures(plan, summary, options)) {
      return EXIT.safety;
    }
    if (plan.items.length === 0 && !options.check) {
      return EXIT.noFiles;
    }
    if (summary.errors.length > 0) {
      return EXIT.safety;
    }
    return EXIT.success;
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
      if (error.exitCode !== EXIT.invalidArgs) {
        try {
          clearStaging(repoRoot, headExistsValue || hasHead(repoRoot));
        } catch {
          // Best-effort recovery only. Never touch the working tree.
        }
        printRecoveryInstructions();
      }
      return error.exitCode;
    }
    console.error(error.stack || error.message);
    printRecoveryInstructions();
    return EXIT.fatal;
  } finally {
    if (runtime.cwd) {
      process.chdir(originalCwd);
    }
  }
}

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = EXIT.fatal;
    });
}
