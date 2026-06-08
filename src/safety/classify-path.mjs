import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { isBinaryFile } from "./binary.mjs";
import {
  isAllowedEnvExample,
  isBlockedByExtension,
  isDatabaseDumpOrBackup,
  isEnvFile,
  isGeneratedPath,
  isLargeFile,
} from "./ignore-rules.mjs";
import { scanFileForSecrets } from "./secrets.mjs";

export function classifyEntry(repoRoot, entry, options) {
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

export function classifyPath(repoRoot, filePath, entry, options) {
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

export function blocked(reason, severity) {
  return { processable: false, reason, severity };
}
