import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { CliError, EXIT } from "../shared/errors.mjs";
import { git } from "./git.mjs";

export function hasHead(repoRoot) {
  return git(repoRoot, ["rev-parse", "--verify", "HEAD"], {
    allowFailure: true,
  }).ok;
}

export function getBranchName(repoRoot) {
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

export function getGitState(repoRoot) {
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

export function assertNoConflictState(repoRoot, entries) {
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

export async function assertProtectedBranchAllowed(branch, options, summary) {
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
