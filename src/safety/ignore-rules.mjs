import path from "node:path";
import { normalizePath } from "../shared/path.mjs";

export const IGNORED_DIRECTORIES = new Set([
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

export const ALLOWED_ENV_EXAMPLES = new Set([
  ".env.example",
  ".env.local.example",
  ".env.development.example",
  ".env.production.example",
  ".env.staging.example",
]);

export const BLOCKED_FILE_EXTENSIONS = new Set([
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

export function isGeneratedPath(filePath, options) {
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

export function matchSimpleGlob(filePath, pattern) {
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

export function isEnvFile(filePath) {
  const base = path.posix.basename(filePath);
  return base === ".env" || base.startsWith(".env.");
}

export function isAllowedEnvExample(filePath) {
  return ALLOWED_ENV_EXAMPLES.has(path.posix.basename(filePath));
}

export function isBlockedByExtension(filePath) {
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

export function isDatabaseDumpOrBackup(filePath) {
  const lower = filePath.toLowerCase();
  return (
    /(^|[/.])dump(s)?([/.]|$)/.test(lower) ||
    /(^|[/.])backup(s)?([/.]|$)/.test(lower) ||
    /\.(dump|backup|bak|sql)$/i.test(lower)
  );
}

export function isLargeFile(size, options) {
  return size > options.maxFileSizeKb * 1024;
}
