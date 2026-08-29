import path from "node:path";
import { normalizePath } from "../shared/path.mjs";
import {
  isConfigPath,
  isDockerFile,
  isDocsPath,
  isStylePath,
} from "../messages/humanize-path.mjs";

export function groupCandidates(candidates) {
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

export function areRelatedForGrouping(first, second) {
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

export function chooseGroupPrimaryPath(first, second) {
  if (path.posix.basename(first) === "package.json") {
    return first;
  }
  if (path.posix.basename(second) === "package.json") {
    return second;
  }
  return first.length <= second.length ? first : second;
}

export function orderGroupPaths(primaryPath, paths) {
  const unique = [...new Set(paths)];
  return [
    primaryPath,
    ...unique.filter((filePath) => filePath !== primaryPath),
  ];
}

export function isPackageLockfile(fileName) {
  return [
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
  ].includes(fileName);
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
