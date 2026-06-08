import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PassThrough, Writable } from "node:stream";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { main } from "../src/cli/main.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function makeRepo(options = {}) {
  const repo = mkdtempSync(join(tmpdir(), "safe-atomic-commits-"));
  git(repo, ["init"]);
  git(repo, ["checkout", "-b", options.branch ?? "work"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Safe Atomic Test"]);
  if (options.initialCommit !== false) {
    write(repo, "README.md", "# Test repo\n");
    git(repo, ["add", "README.md"]);
    git(repo, ["commit", "-m", "docs: initial commit"]);
  }
  return repo;
}

function write(repo, filePath, content) {
  const absolute = join(repo, filePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
}

function git(repo, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    input: options.input,
    stdio: ["pipe", "pipe", "pipe"],
  });
  if ((result.status ?? 1) !== 0 && !options.allowFailure) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

async function runCli(repo, args, input = "") {
  let stdout = "";
  let stderr = "";
  const originalLog = console.log;
  const originalError = console.error;
  const stdin = new PassThrough();
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      stdout += chunk.toString();
      callback();
    },
  });

  console.log = (...parts) => {
    stdout += `${parts.join(" ")}\n`;
  };
  console.error = (...parts) => {
    stderr += `${parts.join(" ")}\n`;
  };

  try {
    writeInteractiveInput(stdin, input);
    const status = await main(args, {
      cwd: repo,
      stdin,
      stdout: writable,
    });
    return { status, stdout, stderr };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function writeInteractiveInput(stdin, input) {
  if (!input) {
    setImmediate(() => stdin.end());
    return;
  }

  const chunks = input.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  chunks.forEach((chunk, index) => {
    setTimeout(() => {
      if (index === chunks.length - 1) {
        stdin.end(chunk);
      } else {
        stdin.write(chunk);
      }
    }, index * 5);
  });
}

function output(result) {
  return `${result.stdout}\n${result.stderr}`;
}

function commitCount(repo) {
  return Number(git(repo, ["rev-list", "--count", "HEAD"]).stdout.trim());
}

function stagedFiles(repo) {
  return git(repo, ["diff", "--cached", "--name-only"]).stdout.trim();
}

function cleanup(repo) {
  if (existsSync(repo)) {
    rmSync(repo, { recursive: true, force: true });
  }
}

test("prints help", async () => {
  const result = await runCli(ROOT, ["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Safe Atomic Commits/);
  assert.match(result.stdout, /--dry-run/);
});

test("dry-run prints a plan without staging files", async () => {
  const repo = makeRepo();
  try {
    write(repo, "src/new file.js", "export const value = 1;\n");
    const before = stagedFiles(repo);
    const result = await runCli(repo, ["--dry-run"]);
    assert.equal(result.status, 0, output(result));
    assert.match(result.stdout, /Mode: dry-run/);
    assert.match(result.stdout, /src\/new file\.js/);
    assert.equal(stagedFiles(repo), before);
    assert.equal(commitCount(repo), 1);
  } finally {
    cleanup(repo);
  }
});

test("auto mode works in a repository without HEAD", async () => {
  const repo = makeRepo({ initialCommit: false });
  try {
    write(repo, "alpha.js", "export const alpha = true;\n");
    write(repo, "nested/beta.js", "export const beta = true;\n");
    const result = await runCli(repo, ["--yes"]);
    assert.equal(result.status, 0, output(result));
    assert.equal(commitCount(repo), 2);
    assert.equal(stagedFiles(repo), "");
    const names = git(repo, ["log", "--format=%s"]).stdout;
    assert.match(names, /^feat: add/m);
  } finally {
    cleanup(repo);
  }
});

test("deleted files require --include-deleted", async () => {
  const repo = makeRepo();
  try {
    write(repo, "old.txt", "old\n");
    git(repo, ["add", "old.txt"]);
    git(repo, ["commit", "-m", "feat: add old file"]);
    unlinkSync(join(repo, "old.txt"));

    const blocked = await runCli(repo, ["--dry-run"]);
    assert.equal(blocked.status, 4, output(blocked));
    assert.match(blocked.stdout, /deleted file requires --include-deleted/);

    const committed = await runCli(repo, ["--yes", "--include-deleted"]);
    assert.equal(committed.status, 0, output(committed));
    assert.equal(stagedFiles(repo), "");
    assert.match(
      git(repo, ["log", "-1", "--format=%s"]).stdout,
      /^docs: remove old project documentation/,
    );
  } finally {
    cleanup(repo);
  }
});

test("renamed files are committed as one atomic item", async () => {
  const repo = makeRepo();
  try {
    write(repo, "old-name.txt", "same content\n");
    git(repo, ["add", "old-name.txt"]);
    git(repo, ["commit", "-m", "feat: add old name file"]);
    git(repo, ["mv", "old-name.txt", "new-name.txt"]);

    const result = await runCli(repo, ["--yes"]);
    assert.equal(result.status, 0, output(result));
    const changed = git(repo, ["show", "--name-status", "--format=", "-M", "HEAD"]).stdout;
    assert.match(changed, /^R\d+\s+old-name\.txt\s+new-name\.txt/m);
  } finally {
    cleanup(repo);
  }
});

test("untracked directories are expanded into individual files", async () => {
  const repo = makeRepo();
  try {
    write(repo, "features/login/page.js", "export default function Login() {}\n");
    write(repo, "features/login/style.css", ".login { color: red; }\n");
    const result = await runCli(repo, ["--dry-run"]);
    assert.equal(result.status, 0, output(result));
    assert.match(result.stdout, /features\/login\/page\.js/);
    assert.match(result.stdout, /features\/login\/style\.css/);
    assert.doesNotMatch(result.stdout, /files: features\/login$/m);
  } finally {
    cleanup(repo);
  }
});

test(".env is ignored and env examples are allowed", async () => {
  const repo = makeRepo();
  try {
    write(repo, ".env", "TOKEN=dummy-token\n");
    write(repo, ".env.example", "TOKEN=your-token\n");
    const result = await runCli(repo, ["--dry-run"]);
    assert.equal(result.status, 0, output(result));
    assert.match(result.stdout, /\.env - environment file/);
    assert.match(result.stdout, /files: \.env\.example/);
  } finally {
    cleanup(repo);
  }
});

test("--include-env still blocks secret-bearing env files", async () => {
  const repo = makeRepo();
  try {
    const secretValue = ["TOKEN=super", "secret", "value\n"].join("-");
    write(repo, ".env", secretValue);
    const result = await runCli(repo, ["--check", "--include-env"]);
    assert.equal(result.status, 2, output(result));
    assert.match(output(result), /possible secret/);
  } finally {
    cleanup(repo);
  }
});

test("secret values fail check mode", async () => {
  const repo = makeRepo();
  try {
    const secretValue = ["TOKEN=super", "secret", "value\n"].join("-");
    write(repo, "token.txt", secretValue);
    const result = await runCli(repo, ["--check"]);
    assert.equal(result.status, 2, output(result));
    assert.match(output(result), /possible secret/);
  } finally {
    cleanup(repo);
  }
});

test("config customizes max file size and CLI flags override it", async () => {
  const repo = makeRepo();
  try {
    write(repo, ".atomiccommitsrc.json", "{\n  \"maxFileSizeKb\": 1\n}\n");
    writeFileSync(join(repo, "large-enough.txt"), Buffer.alloc(2 * 1024, "a"));

    const configured = await runCli(repo, ["--dry-run"]);
    assert.equal(configured.status, 0, output(configured));
    assert.match(configured.stdout, /large-enough\.txt - large file over 1 KB/);

    const overridden = await runCli(repo, [
      "--dry-run",
      "--max-file-size-kb",
      "10",
    ]);
    assert.equal(overridden.status, 0, output(overridden));
    assert.match(overridden.stdout, /files: large-enough\.txt/);
  } finally {
    cleanup(repo);
  }
});

test("binary and large files are ignored by default", async () => {
  const repo = makeRepo();
  try {
    writeFileSync(join(repo, "image.bin"), Buffer.from([0, 1, 2, 3, 4, 5]));
    writeFileSync(join(repo, "large.txt"), Buffer.alloc(2050 * 1024, "a"));
    const result = await runCli(repo, ["--dry-run"]);
    assert.equal(result.status, 4, output(result));
    assert.match(result.stdout, /image\.bin - binary file/);
    assert.match(result.stdout, /large\.txt - large file over 2048 KB/);
  } finally {
    cleanup(repo);
  }
});

test("protected branches block auto mode", async () => {
  const repo = makeRepo({ branch: "main" });
  try {
    write(repo, "src/app.js", "export const app = true;\n");
    const result = await runCli(repo, ["--yes"]);
    assert.equal(result.status, 2, output(result));
    assert.match(output(result), /protected branch "main"/);
  } finally {
    cleanup(repo);
  }
});

test("conflict state blocks processing", async () => {
  const repo = makeRepo();
  try {
    write(repo, "conflict.txt", "base\n");
    git(repo, ["add", "conflict.txt"]);
    git(repo, ["commit", "-m", "feat: add conflict file"]);

    git(repo, ["checkout", "-b", "other"]);
    write(repo, "conflict.txt", "other\n");
    git(repo, ["add", "conflict.txt"]);
    git(repo, ["commit", "-m", "feat: update conflict file"]);

    git(repo, ["checkout", "work"]);
    write(repo, "conflict.txt", "work\n");
    git(repo, ["add", "conflict.txt"]);
    git(repo, ["commit", "-m", "feat: update work file"]);
    git(repo, ["merge", "other"], { allowFailure: true });

    const result = await runCli(repo, ["--check"]);
    assert.equal(result.status, 2, output(result));
    assert.match(output(result), /resolve Git conflicts/);
  } finally {
    cleanup(repo);
  }
});

test("existing staged files are not mixed into another commit", async () => {
  const repo = makeRepo();
  try {
    write(repo, "staged.txt", "staged\n");
    git(repo, ["add", "staged.txt"]);
    write(repo, "later.txt", "later\n");
    const result = await runCli(repo, ["--yes"]);
    assert.equal(result.status, 0, output(result));
    assert.equal(stagedFiles(repo), "");
    const latestFiles = git(repo, ["show", "--name-only", "--format=", "HEAD"])
      .stdout.trim()
      .split("\n");
    assert.equal(latestFiles.length, 1);
  } finally {
    cleanup(repo);
  }
});

test("interactive edit rejects invalid messages before committing", async () => {
  const repo = makeRepo();
  try {
    write(repo, "src/service.js", "export function service() { return true; }\n");
    const result = await runCli(
      repo,
      [],
      "e\nwip\nfix: resolve service error handling\n",
    );
    assert.equal(result.status, 0, output(result));
    assert.match(result.stdout, /Invalid message/);
    assert.match(
      git(repo, ["log", "-1", "--format=%s"]).stdout,
      /^fix: resolve service error handling/,
    );
  } finally {
    cleanup(repo);
  }
});

test("interactive skip leaves files uncommitted", async () => {
  const repo = makeRepo();
  try {
    write(repo, "src/skip.js", "export const skip = true;\n");
    const result = await runCli(repo, [], "s\n");
    assert.equal(result.status, 0, output(result));
    assert.match(result.stdout, /Files skipped: 1/);
    assert.match(git(repo, ["status", "--short", "-uall"]).stdout, /\?\? src\/skip\.js/);
  } finally {
    cleanup(repo);
  }
});

test("group mode groups package manifest with lockfile", async () => {
  const repo = makeRepo();
  try {
    write(repo, "package.json", "{\n  \"name\": \"demo\",\n  \"version\": \"1.0.0\"\n}\n");
    write(repo, "package-lock.json", "{\n  \"name\": \"demo\",\n  \"lockfileVersion\": 3\n}\n");
    const result = await runCli(repo, ["--dry-run", "--group"]);
    assert.equal(result.status, 0, output(result));
    assert.match(result.stdout, /files: package\.json, package-lock\.json/);
  } finally {
    cleanup(repo);
  }
});
