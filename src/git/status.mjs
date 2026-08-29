import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import { normalizePath } from "../shared/path.mjs";
import { isGeneratedPath } from "../safety/ignore-rules.mjs";
import { git } from "./git.mjs";

export function collectPorcelainStatus(repoRoot) {
  const raw = git(repoRoot, [
    "status",
    "--porcelain=v1",
    "-z",
    "-uall",
    "--renames",
  ]).stdout;
  return parsePorcelainStatus(raw);
}

export function parsePorcelainStatus(rawStatus) {
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

export function getStatusKind(entry) {
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

export function expandStatusEntries(repoRoot, entries) {
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

export function expandUntrackedDirectory(repoRoot, directoryPath) {
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

export function deduplicateEntries(entries) {
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

function isDirectory(absolutePath) {
  try {
    return lstatSync(absolutePath).isDirectory();
  } catch {
    return false;
  }
}

export function parseNameStatus(raw) {
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
