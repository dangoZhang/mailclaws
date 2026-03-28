import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
const args = process.argv.slice(2);
const skipCheck = args.includes("--skip-check");
const skipPackage = args.includes("--skip-package");
const forceTag = args.includes("--force-tag");
const tagArgIndex = args.findIndex((arg) => arg === "--tag");
const tag = tagArgIndex >= 0 && args[tagArgIndex + 1] ? args[tagArgIndex + 1] : `v${packageJson.version}`;

assertCleanWorktree();

if (!skipCheck) {
  run("pnpm", ["check"]);
}

if (!skipPackage) {
  run("pnpm", ["package:release"]);
}

if (forceTag) {
  run("git", ["tag", "-f", tag]);
} else {
  run("git", ["tag", tag]);
}

run("git", ["push", "origin", "main"]);
run("git", forceTag ? ["push", "origin", `refs/tags/${tag}`, "--force"] : ["push", "origin", `refs/tags/${tag}`]);

process.stdout.write(
  [
    `release shipped: ${tag}`,
    "assets:",
    `  output/release/mailclaw-v${packageJson.version}/`,
    `  output/release/mailclaw-v${packageJson.version}.tar.gz`,
    `  output/release/npm/mailclaw-${packageJson.version}.tgz`,
    "GitHub Actions release workflow will publish the generated assets on tag push."
  ].join("\n") + "\n"
);

function assertCleanWorktree() {
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: rootDir,
    encoding: "utf8"
  });
  if (status.status !== 0) {
    throw new Error(status.stderr || "failed to read git status");
  }
  if (status.stdout.trim().length > 0) {
    throw new Error("worktree is not clean; commit or stash changes before running release:ship");
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed with exit code ${result.status ?? 1}`);
  }
}
