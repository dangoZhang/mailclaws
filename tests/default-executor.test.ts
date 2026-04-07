import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import { createDefaultMailAgentExecutor } from "../src/runtime/default-executor.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("default executor", () => {
  it("selects the local command executor when runtime mode is command", async () => {
    const runner = vi.fn(async (command: string, input: string) => {
      const payload = JSON.parse(input) as {
        sessionKey: string;
      };

      expect(command).toBe("mail-runtime");

      return {
        stdout: JSON.stringify({
          responseText: `local:${payload.sessionKey}`
        }),
        stderr: "",
        exitCode: 0
      };
    });
    const config = loadConfig({
      MAILCLAW_RUNTIME_MODE: "command",
      MAILCLAW_RUNTIME_COMMAND: "mail-runtime",
      MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON: JSON.stringify({
        toolPolicies: ["mail-orchestrator", "mail-reviewer"],
        sandboxPolicies: ["mail-room-orchestrator", "mail-room-worker"],
        networkAccess: "allowlisted",
        filesystemAccess: "workspace-read",
        outboundMode: "approval_required"
      })
    });
    const executor = createDefaultMailAgentExecutor(config, {
      commandRunner: runner
    });

    const result = await executor.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:abc",
      inputText: "hello"
    });

    expect(result.responseText).toBe("local:hook:mail:acct:thread:abc");
    expect(result.request.url).toBe("command://mail-runtime");
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it("selects the embedded executor when runtime mode is embedded", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-default-embedded-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_RUNTIME_MODE: "embedded"
    });
    const executor = createDefaultMailAgentExecutor(config, {
      embeddedAdapter: {
        adapterId: "default-adapter",
        policyManifest: {
          toolPolicies: ["mail-orchestrator"],
          sandboxPolicies: ["mail-room-orchestrator"],
          networkAccess: "allowlisted",
          filesystemAccess: "workspace-read",
          outboundMode: "approval_required"
        },
        async executeMailTurn(input) {
          expect(input.sessionKey).toBe("hook:mail:acct:thread:abc");
          return {
            responseText: `embedded:${input.history.length}`
          };
        }
      }
    });

    const result = await executor.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:abc",
      inputText: "hello"
    });

    expect(result.responseText).toBe("embedded:0");
    expect(result.request.url).toBe("embedded://default-adapter");
  });

  it("prefers the embedded adapter over shell command execution", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-default-embedded-adapter-"));
    tempDirs.push(tempDir);
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify({
        responseText: "unexpected"
      }),
      stderr: "",
      exitCode: 0
    }));
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_RUNTIME_MODE: "embedded"
    });
    const executor = createDefaultMailAgentExecutor(config, {
      commandRunner: runner,
      embeddedAdapter: {
        adapterId: "in-process",
        policyManifest: {
          toolPolicies: ["mail-orchestrator"],
          sandboxPolicies: ["mail-room-orchestrator"],
          networkAccess: "allowlisted",
          filesystemAccess: "workspace-read",
          outboundMode: "approval_required"
        },
        async executeMailTurn(input) {
          return {
            responseText: `adapter:${input.history.length}`
          };
        }
      }
    });

    const result = await executor.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:abc",
      inputText: "hello"
    });

    expect(result.responseText).toBe("adapter:0");
    expect(result.request.url).toBe("embedded://in-process");
    expect(runner).not.toHaveBeenCalled();
  });

  it("rejects embedded mode when no in-process adapter is provided", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-default-embedded-missing-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_RUNTIME_MODE: "embedded"
    });

    const executor = createDefaultMailAgentExecutor(config);

    return expect(
      executor.executeMailTurn({
        sessionKey: "hook:mail:acct:thread:abc",
        inputText: "Subject: Fresh install\n\nHello from a built-in executor."
      })
    ).resolves.toMatchObject({
      responseText: expect.stringContaining('Received your message about "Fresh install".'),
      request: {
        url: "embedded://mailclaws-embedded"
      }
    });
  });
});
