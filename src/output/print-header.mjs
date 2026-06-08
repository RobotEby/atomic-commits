export function printHeader(repoRoot, branch, headExists, mode) {
  console.log("Safe Atomic Commits");
  console.log(`Repository: ${repoRoot}`);
  console.log(`Branch: ${branch}`);
  console.log(`HEAD exists: ${headExists ? "yes" : "no"}`);
  console.log(`Mode: ${mode}`);
}
