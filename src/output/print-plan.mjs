export function printIgnoredFiles(ignored) {
  if (ignored.length === 0) {
    console.log("Ignored: none");
    return;
  }
  console.log("Ignored:");
  for (const ignoredItem of ignored) {
    console.log(
      `  - ${ignoredItem.entry.paths.join(" -> ")} - ${ignoredItem.reason}`,
    );
  }
}

export function printDryRunPlan(plan) {
  console.log("");
  console.log("Planned commits:");
  if (plan.items.length === 0) {
    console.log("  none");
  }
  for (const item of plan.items) {
    console.log(`  - ${item.message}`);
    console.log(`    files: ${item.paths.join(", ")}`);
  }
  if (plan.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of plan.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

export function printCheckResult(plan, summary) {
  console.log("");
  console.log("Check result:");
  const fatalIgnored = plan.ignored.filter((item) => item.severity === "fatal");
  if (
    fatalIgnored.length === 0 &&
    summary.warnings.length === 0 &&
    plan.warnings.length === 0
  ) {
    console.log("  No safety failures detected.");
  } else {
    for (const item of fatalIgnored) {
      console.log(`  - ${item.entry.paths.join(" -> ")}: ${item.reason}`);
    }
    for (const warning of [...summary.warnings, ...plan.warnings]) {
      console.log(`  - ${warning}`);
    }
  }
}
