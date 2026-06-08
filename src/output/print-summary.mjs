export function printSummary(summary, plan) {
  console.log("");
  console.log("Summary:");
  console.log(`  Commits created: ${summary.commitsCreated}`);
  console.log(`  Dry-run items: ${summary.dryRunItems}`);
  console.log(`  Files ignored: ${plan.ignored.length}`);
  console.log(`  Files skipped: ${summary.skipped.length}`);
  console.log(`  Errors: ${summary.errors.length}`);

  if (summary.errors.length > 0) {
    console.log("Errors:");
    for (const error of summary.errors) {
      console.log(`  - ${error}`);
    }
  }
  if (summary.stopped) {
    console.log("Stopped by user.");
  }
  if (summary.errors.length > 0) {
    printRecoveryInstructions();
  }
}

export function printRecoveryInstructions() {
  console.log("");
  console.log("Recovery:");
  console.log("  git status");
  console.log("  git reset --quiet --");
}
