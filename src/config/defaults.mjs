import { DEFAULT_MAX_FILE_SIZE_KB } from "../shared/limits.mjs";

export const ALLOWED_TYPES = new Set([
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

export const LOCKFILES = new Set([
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

export const DEFAULT_CONFIG = {
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
