import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("npm bin launchers", () => {
  it("resolve the real package directory when invoked through node_modules/.bin symlinks", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-bin-launcher-"));
    tempDirs.push(tempDir);

    const packageDir = path.join(tempDir, "node_modules", "mailclaws");
    const binDir = path.join(packageDir, "bin");
    const cliDir = path.join(packageDir, "dist", "cli");
    const npmBinDir = path.join(tempDir, "node_modules", ".bin");
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(cliDir, { recursive: true });
    fs.mkdirSync(npmBinDir, { recursive: true });

    const launcherSource = fs.readFileSync(path.join(process.cwd(), "bin", "mailctl"), "utf8");
    const launcherPath = path.join(binDir, "mailctl");
    fs.writeFileSync(launcherPath, launcherSource, { mode: 0o755 });
    fs.writeFileSync(
      path.join(cliDir, "mailctl.js"),
      [
        "#!/usr/bin/env node",
        "process.stdout.write(JSON.stringify({",
        "  entry: process.argv[1],",
        "  args: process.argv.slice(2)",
        "}));"
      ].join("\n"),
      { mode: 0o755 }
    );

    fs.symlinkSync(path.relative(npmBinDir, launcherPath), path.join(npmBinDir, "mailctl"));

    const output = childProcess.execFileSync(path.join(npmBinDir, "mailctl"), ["observe", "runtime"], {
      cwd: tempDir,
      env: {
        ...process.env,
        PATH: ["/usr/local/bin", path.dirname(process.execPath), "/usr/bin", "/bin"].join(":")
      },
      encoding: "utf8"
    });

    expect(JSON.parse(output)).toEqual({
      entry: fs.realpathSync(path.join(cliDir, "mailctl.js")),
      args: ["observe", "runtime"]
    });
  });
});
