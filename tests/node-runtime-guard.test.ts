import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { isCliEntrypoint } from "../src/cli/node-runtime-guard.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("isCliEntrypoint", () => {
  it("matches npm bin symlinks against the real compiled entrypoint", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-cli-entry-"));
    tempDirs.push(tempDir);

    const distDir = path.join(tempDir, "node_modules", "mailclaws", "dist", "cli");
    const binDir = path.join(tempDir, "node_modules", ".bin");
    fs.mkdirSync(distDir, { recursive: true });
    fs.mkdirSync(binDir, { recursive: true });

    const realEntry = path.join(distDir, "mailctl.js");
    const binEntry = path.join(binDir, "mailctl");
    fs.writeFileSync(realEntry, "#!/usr/bin/env node\n");
    fs.symlinkSync(realEntry, binEntry);

    expect(isCliEntrypoint(pathToFileURL(realEntry).href, binEntry)).toBe(true);
  });
});
