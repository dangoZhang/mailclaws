#!/usr/bin/env node

import process from "node:process";

import { ensureSupportedNodeVersion, suppressKnownNodeWarnings } from "./node-runtime-guard.js";

ensureSupportedNodeVersion();
suppressKnownNodeWarnings();
void import("./mailclaw-main.js").then(({ runMailclaw }) => {
  void runMailclaw(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
});
