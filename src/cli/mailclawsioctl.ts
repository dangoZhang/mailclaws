#!/usr/bin/env node

import { stdin, stdout, stderr } from "node:process";

import {
  isMailIoCommandOperation,
  runMailIoCommand,
  type MailIoCommandRequest
} from "../providers/mail-io-command.js";
import { isCliEntrypoint } from "./node-runtime-guard.js";

async function main() {
  const request = resolveMailIoCliRequest({
    argvOperation: process.argv[2],
    stdinIsTty: stdin.isTTY,
    rawInput: await readRawInput()
  });
  const response = await runMailIoCommand(request);
  stdout.write(JSON.stringify(response));
}

export function resolveMailIoCliRequest(input: {
  argvOperation?: string;
  stdinIsTty: boolean;
  rawInput: string;
}): MailIoCommandRequest {
  if (input.argvOperation) {
    if (!isMailIoCommandOperation(input.argvOperation)) {
      throw new Error(`unsupported mail io operation: ${input.argvOperation}`);
    }

    if (!input.stdinIsTty && input.rawInput.trim().length > 0) {
      return {
        operation: input.argvOperation,
        input: JSON.parse(input.rawInput) as unknown
      };
    }

    return {
      operation: input.argvOperation,
      input: {}
    };
  }

  if (!input.rawInput.trim()) {
    stderr.write("mailclawsioctl requires a JSON request on stdin\n");
    throw new Error("mailclawsioctl requires a JSON request on stdin");
  }

  return JSON.parse(input.rawInput) as MailIoCommandRequest;
}

async function readRawInput() {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

if (isCliEntrypoint(import.meta.url)) {
  void main().catch((error) => {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
