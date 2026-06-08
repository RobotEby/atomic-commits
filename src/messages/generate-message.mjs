import path from "node:path";
import {
  humanizePath,
  inferCategory,
  isBuildPath,
  isCiPath,
  isConfigPath,
  isDocsPath,
  isSecurityPath,
  isStylePath,
  isTestPath,
} from "./humanize-path.mjs";
import { limitMessage } from "./validate-message.mjs";

const EXACT_MESSAGES = new Map([
  ["scripts/atomic-commits.mjs", "refactor: simplify atomic commit CLI entrypoint"],
  ["src/cli/args.mjs", "refactor: extract CLI argument parsing"],
  ["src/cli/main.mjs", "refactor: extract CLI main workflow"],
  ["src/cli/usage.mjs", "refactor: extract CLI usage output"],
  ["src/config/defaults.mjs", "refactor: extract default configuration"],
  ["src/config/load-config.mjs", "refactor: extract configuration loading"],
  ["src/git/git.mjs", "refactor: extract Git command runner"],
  ["src/git/staging.mjs", "refactor: extract Git staging helpers"],
  ["src/git/state.mjs", "refactor: extract Git state checks"],
  ["src/git/status.mjs", "refactor: extract Git status parsing"],
  [
    "src/messages/generate-message.mjs",
    "refactor: extract commit message generation",
  ],
  [
    "src/messages/humanize-path.mjs",
    "refactor: extract path humanization rules",
  ],
  [
    "src/messages/validate-message.mjs",
    "refactor: extract commit message validation",
  ],
  ["src/output/print-header.mjs", "refactor: extract CLI header output"],
  ["src/output/print-plan.mjs", "refactor: extract commit plan output"],
  ["src/output/print-summary.mjs", "refactor: extract summary output"],
  ["src/planner/build-plan.mjs", "refactor: extract commit planning logic"],
  ["src/planner/grouping.mjs", "refactor: extract commit grouping logic"],
  ["src/safety/binary.mjs", "refactor: extract binary file safety checks"],
  ["src/safety/classify-path.mjs", "refactor: extract path safety classification"],
  ["src/safety/ignore-rules.mjs", "refactor: extract ignored path rules"],
  ["src/safety/secrets.mjs", "refactor: extract secret scanning rules"],
  ["src/shared/errors.mjs", "refactor: extract shared CLI errors"],
  ["src/shared/limits.mjs", "refactor: extract shared safety limits"],
  ["src/shared/path.mjs", "refactor: extract path normalization helpers"],
  ["docs/architecture.md", "docs: add architecture guide"],
  ["test/atomic-commits.test.mjs", "test: add atomic commit CLI tests"],
]);

const STRUCTURAL_EXTRACTION_SUBJECTS = new Map([
  ["args", "CLI argument parsing"],
  ["main", "main workflow"],
  ["usage", "CLI usage output"],
  ["defaults", "default configuration"],
  ["load-config", "configuration loading"],
  ["git", "Git command runner"],
  ["staging", "Git staging helpers"],
  ["state", "Git state checks"],
  ["status", "Git status parsing"],
  ["generate-message", "commit message generation"],
  ["humanize-path", "path humanization rules"],
  ["validate-message", "commit message validation"],
  ["print-header", "CLI header output"],
  ["print-plan", "commit plan output"],
  ["print-summary", "summary output"],
  ["build-plan", "commit planning logic"],
  ["grouping", "commit grouping logic"],
  ["binary", "binary file safety checks"],
  ["classify-path", "path safety classification"],
  ["ignore-rules", "ignored path rules"],
  ["secrets", "secret scanning rules"],
  ["errors", "shared CLI errors"],
  ["limits", "shared safety limits"],
  ["path", "path normalization helpers"],
]);

export function generateCommitMessage(item, diff, options, context = {}) {
  const explicit = getExplicitCommitMessage(item, context);
  if (explicit) {
    return limitMessage(applyScope(explicit, options));
  }

  const type = inferCommitType(item, diff, context);
  const subject = inferCommitSubject(item, type, diff, options, context);
  const prefix =
    options.allowScopes && options.scope ? `${type}(${options.scope})` : type;
  return limitMessage(`${prefix}: ${subject}`);
}

export function inferCommitType(item, diff, context = {}) {
  const paths = item.paths.join("\n").toLowerCase();
  const primaryPath = item.primaryPath;
  if (hasRevertSignals(diff)) return "revert";
  if (isStructuralExtractionItem(item, context)) return "refactor";
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

export function inferCommitSubject(item, type, diff, options, context = {}) {
  const structuralSubject = getStructuralExtractionSubject(item, context);
  if (type === "refactor" && structuralSubject) {
    return `extract ${structuralSubject}`;
  }

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

export function getExplicitCommitMessage(item, context = {}) {
  if (item.paths.length !== 1) {
    return null;
  }
  const filePath = item.primaryPath || item.paths[0];
  return EXACT_MESSAGES.get(filePath) ?? getStructuralExtractionMessage(filePath, context);
}

function getStructuralExtractionMessage(filePath, context) {
  if (!context.structuralRefactor || !/^src\/.+\.mjs$/.test(filePath)) {
    return null;
  }
  const subject = getExtractionSubject(filePath);
  return subject ? `refactor: extract ${subject}` : null;
}

function isStructuralExtractionItem(item, context) {
  return Boolean(getStructuralExtractionSubject(item, context));
}

function getStructuralExtractionSubject(item, context) {
  if (!context.structuralRefactor || item.paths.length !== 1) {
    return null;
  }
  return getExtractionSubject(item.primaryPath || item.paths[0]);
}

function getExtractionSubject(filePath) {
  const stem = path.posix.basename(filePath, path.posix.extname(filePath));
  return STRUCTURAL_EXTRACTION_SUBJECTS.get(stem) ?? null;
}

function applyScope(message, options) {
  if (!options.allowScopes || !options.scope) {
    return message;
  }
  return message.replace(/^([a-z]+): /, `$1(${options.scope}): `);
}

export function actionForType(type, item) {
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

export function hasRevertSignals(diff) {
  return /^[+\-\s]*(?:This reverts commit\b|Revert\s+"|revert:)/im.test(diff);
}

export function hasFixSignals(diff) {
  return /\b(fix|bug|error|exception|crash|fail|failure|invalid|handle|handling)\b/i.test(
    diff,
  );
}

export function hasPerformanceSignals(diff) {
  return /\b(perf|performance|optimi[sz]e|cache|faster|slow|latency)\b/i.test(
    diff,
  );
}

export function hasRefactorSignals(diff) {
  return /\b(refactor|reorganize|rename|extract|split|cleanup)\b/i.test(diff);
}
