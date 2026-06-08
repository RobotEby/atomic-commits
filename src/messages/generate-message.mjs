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

export function generateCommitMessage(item, diff, options) {
  const type = inferCommitType(item, diff);
  const subject = inferCommitSubject(item, type, diff, options);
  const prefix =
    options.allowScopes && options.scope ? `${type}(${options.scope})` : type;
  return limitMessage(`${prefix}: ${subject}`);
}

export function inferCommitType(item, diff) {
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

export function inferCommitSubject(item, type, diff, options) {
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
  return /\brevert(ed|s)?\b/i.test(diff);
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
