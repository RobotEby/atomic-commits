import { spawnSync } from "node:child_process";
import { CliError, EXIT } from "../shared/errors.mjs";

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: options.encoding ?? "utf8",
    maxBuffer: options.maxBuffer ?? 10 * 1024 * 1024,
    stdio: options.stdio ?? ["pipe", "pipe", "pipe"],
  });

  const status = result.status ?? (result.error ? 1 : 0);

  if (result.error && status !== 0) {
    if (options.allowFailure) {
      return {
        ok: false,
        status,
        stdout: result.stdout ?? "",
        stderr: result.stderr || result.error.message,
      };
    }
    throw new CliError(result.error.message, EXIT.fatal);
  }

  const output = {
    ok: status === 0,
    status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };

  if (!output.ok && !options.allowFailure) {
    const detail = String(
      output.stderr || output.stdout || `${command} exited with ${status}`,
    ).trim();
    throw new CliError(detail, EXIT.fatal);
  }

  return output;
}

export function git(repoRoot, args, options = {}) {
  return run("git", args, { ...options, cwd: repoRoot });
}

export function getRepoRoot() {
  const result = run("git", ["rev-parse", "--show-toplevel"], {
    allowFailure: true,
  });
  if (!result.ok) {
    throw new CliError("Not a Git repository.", EXIT.fatal);
  }
  return result.stdout.trim();
}
