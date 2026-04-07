#!/usr/bin/env node

import process from "node:process";

import { ensureSupportedNodeVersion, isCliEntrypoint, suppressKnownNodeWarnings } from "./node-runtime-guard.js";

async function main() {
  ensureSupportedNodeVersion();
  suppressKnownNodeWarnings();
  const { runMailctl } = await import("./mailctl-main.js");
  process.exitCode = await runMailctl(process.argv.slice(2));
}

if (isCliEntrypoint(import.meta.url)) {
  void main();
}
