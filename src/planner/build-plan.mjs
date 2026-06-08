import path from "node:path";
import { LOCKFILES } from "../config/defaults.mjs";
import { git } from "../git/git.mjs";
import { generateCommitMessage } from "../messages/generate-message.mjs";
import {
  ensureUniqueMessage,
  validateCommitMessage,
} from "../messages/validate-message.mjs";
import { classifyEntry } from "../safety/classify-path.mjs";
import { MAX_DIFF_BYTES } from "../shared/limits.mjs";
import { groupCandidates } from "./grouping.mjs";

export function buildProcessingPlan(repoRoot, entries, options, headExists) {
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

export function getItemDiff(repoRoot, item, headExists) {
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

export function truncate(value, maxBytes) {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value;
  }
  return value.slice(0, maxBytes);
}

export function isSuspiciousLockfileOnlyPlan(items) {
  return (
    items.length > 0 &&
    items.every((item) =>
      item.paths.every((filePath) =>
        LOCKFILES.has(path.posix.basename(filePath)),
      ),
    )
  );
}
