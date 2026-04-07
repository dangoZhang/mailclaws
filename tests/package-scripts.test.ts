import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("package scripts", () => {
  it("keeps the preinstall node guard shell-safe", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as {
      scripts?: Record<string, string>;
    };

    const preinstall = packageJson.scripts?.preinstall ?? "";
    expect(preinstall).toContain("Current runtime: ' + process.version");
    expect(preinstall).not.toContain("${process.version}");
  });

  it("ships OpenClaw-style installer scripts", () => {
    const root = process.cwd();
    const shellInstaller = fs.readFileSync(path.join(root, "install.sh"), "utf8");
    const powershellInstaller = fs.readFileSync(path.join(root, "install.ps1"), "utf8");

    expect(shellInstaller).toContain("mailclaws gateway");
    expect(shellInstaller).toContain("mailclaws dashboard");
    expect(shellInstaller).toContain("MailClaws requires Node.js 22+");
    expect(powershellInstaller).toContain("mailclaws gateway");
    expect(powershellInstaller).toContain("mailclaws dashboard");
    expect(powershellInstaller).toContain("MailClaws requires Node.js 22+");
  });
});
