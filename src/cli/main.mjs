import process from "node:process";
import readline from "node:readline/promises";
import { parseArgs } from "./args.mjs";
import { printUsage } from "./usage.mjs";
import { loadConfig, mergeOptions } from "../config/load-config.mjs";
import { getRepoRoot } from "../git/git.mjs";
import {
  assertNoConflictState,
  assertProtectedBranchAllowed,
  getBranchName,
  hasHead,
} from "../git/state.mjs";
import {
  collectPorcelainStatus,
  expandStatusEntries,
} from "../git/status.mjs";
import {
  assertOnlyCurrentItemStaged,
  clearStaging,
  commitItem,
  stageItem,
} from "../git/staging.mjs";
import { validateCommitMessage } from "../messages/validate-message.mjs";
import { printHeader } from "../output/print-header.mjs";
import {
  printCheckResult,
  printDryRunPlan,
  printIgnoredFiles,
} from "../output/print-plan.mjs";
import {
  printRecoveryInstructions,
  printSummary,
} from "../output/print-summary.mjs";
import { buildProcessingPlan } from "../planner/build-plan.mjs";
import { CliError, EXIT } from "../shared/errors.mjs";

export async function main(argv = process.argv.slice(2), runtime = {}) {
  let repoRoot = process.cwd();
  let headExistsValue = false;
  const originalCwd = process.cwd();
  try {
    if (runtime.cwd) {
      process.chdir(runtime.cwd);
    }
    const parsedArgs = parseArgs(argv);
    if (parsedArgs.flags.help) {
      printUsage();
      return EXIT.success;
    }

    repoRoot = getRepoRoot();
    const config = loadConfig(repoRoot);
    const options = mergeOptions(config, parsedArgs);
    options.stdin = runtime.stdin ?? process.stdin;
    options.stdout = runtime.stdout ?? process.stdout;
    headExistsValue = hasHead(repoRoot);
    const branch = getBranchName(repoRoot);
    const rawEntries = collectPorcelainStatus(repoRoot);
    const entries = expandStatusEntries(repoRoot, rawEntries);
    assertNoConflictState(repoRoot, entries);

    const summary = {
      commitsCreated: 0,
      dryRunItems: 0,
      skipped: [],
      committed: [],
      errors: [],
      warnings: [],
      stopped: false,
    };

    await assertProtectedBranchAllowed(branch, options, summary);
    const plan = buildProcessingPlan(
      repoRoot,
      entries,
      options,
      headExistsValue,
      branch,
    );
    summary.warnings.push(...plan.warnings);

    printHeader(repoRoot, branch, headExistsValue, determineMode(options));
    printIgnoredFiles(plan.ignored);
    await processEntries(repoRoot, plan, options, summary);
    printSummary(summary, plan);

    if (options.check && hasSafetyFailures(plan, summary, options)) {
      return EXIT.safety;
    }
    if (plan.items.length === 0 && !options.check) {
      return EXIT.noFiles;
    }
    if (summary.errors.length > 0) {
      return EXIT.safety;
    }
    return EXIT.success;
  } catch (error) {
    if (error instanceof CliError) {
      console.error(error.message);
      if (error.exitCode !== EXIT.invalidArgs) {
        try {
          clearStaging(repoRoot, headExistsValue || hasHead(repoRoot));
        } catch {
          // Best-effort recovery only. Never touch the working tree.
        }
        printRecoveryInstructions();
      }
      return error.exitCode;
    }
    console.error(error.stack || error.message);
    printRecoveryInstructions();
    return EXIT.fatal;
  } finally {
    if (runtime.cwd) {
      process.chdir(originalCwd);
    }
  }
}

async function processEntries(repoRoot, plan, options, summary) {
  if (options.dryRun) {
    summary.dryRunItems = plan.items.length;
    printDryRunPlan(plan);
    return;
  }

  if (options.check) {
    printCheckResult(plan, summary);
    return;
  }

  if (plan.items.length === 0) {
    throw new CliError("No processable files.", EXIT.noFiles);
  }

  const rl = options.yes
    ? null
    : readline.createInterface({
        input: options.stdin,
        output: options.stdout,
      });
  try {
    for (const item of plan.items) {
      if (!item.messageValid) {
        summary.errors.push(
          `${item.id}: invalid generated message (${item.messageErrors.join("; ")})`,
        );
        continue;
      }

      let message = item.message;
      let action = options.yes ? "c" : await askAction(rl, item, message);

      if (action === "q") {
        summary.stopped = true;
        break;
      }
      if (action === "s") {
        summary.skipped.push({ item, reason: "user skipped" });
        continue;
      }
      if (action === "e") {
        message = await askValidMessage(rl, options);
        action = "c";
      }
      if (action !== "c") {
        summary.skipped.push({ item, reason: `unknown action ${action}` });
        continue;
      }

      try {
        clearStaging(repoRoot, hasHead(repoRoot));
        stageItem(repoRoot, item, options);
        assertOnlyCurrentItemStaged(repoRoot, item, options);
        commitItem(repoRoot, message);
        summary.commitsCreated += 1;
        summary.committed.push({ item, message });
      } catch (error) {
        summary.errors.push(`${item.id}: ${error.message}`);
        if (error instanceof CliError && error.exitCode === EXIT.safety) {
          continue;
        }
        break;
      } finally {
        try {
          clearStaging(repoRoot, hasHead(repoRoot));
        } catch (error) {
          summary.errors.push(`failed to clear staging: ${error.message}`);
        }
      }
    }
  } finally {
    rl?.close();
  }
}

async function askAction(rl, item, message) {
  console.log("");
  console.log(`Item: ${item.paths.join(" -> ")}`);
  console.log(`Suggested: ${message}`);
  while (true) {
    const answer = (
      await rl.question("Action [c=commit, e=edit, s=skip, q=quit]: ")
    )
      .trim()
      .toLowerCase();
    if (["c", "e", "s", "q"].includes(answer)) {
      return answer;
    }
    console.log("Action [c=commit, e=edit, s=skip, q=quit, Enter=skip]:");
  }
}

async function askValidMessage(rl, options) {
  while (true) {
    const message = (await rl.question("Commit message: ")).trim();
    const validation = validateCommitMessage(message, options);
    if (validation.valid) {
      return message;
    }
    console.log(`Invalid message: ${validation.errors.join("; ")}`);
  }
}

function determineMode(options) {
  if (options.dryRun) return "dry-run";
  if (options.check) return "check";
  if (options.yes) return "auto";
  return "interactive";
}

function hasSafetyFailures(plan, summary, options) {
  if (
    summary.warnings.some((warning) => warning.startsWith("protected branch"))
  ) {
    return true;
  }
  return (
    plan.ignored.some((item) => item.severity === "fatal") ||
    (options.check && plan.warnings.length > 0)
  );
}
