import { existsSync } from "node:fs";
import path from "node:path";
import { classifyPath } from "../safety/classify-path.mjs";
import { isEnvFile } from "../safety/ignore-rules.mjs";
import { scanFileForSecrets } from "../safety/secrets.mjs";
import { CliError, EXIT } from "../shared/errors.mjs";
import { normalizePath } from "../shared/path.mjs";
import { git } from "./git.mjs";
import { parseNameStatus } from "./status.mjs";

export function clearStaging(repoRoot, headExists) {
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

export function stageItem(repoRoot, item, options) {
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

export function getStagedChanges(repoRoot) {
  const raw = git(repoRoot, [
    "diff",
    "--cached",
    "--name-status",
    "-z",
    "-M",
  ]).stdout;
  return parseNameStatus(raw);
}

export function assertOnlyCurrentItemStaged(repoRoot, item, options) {
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

export function commitItem(repoRoot, message) {
  git(repoRoot, ["commit", "-m", message]);
}
