import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import type {
  MailTurnAttachmentDescriptor,
  MailRuntimePolicyManifest,
  MailTurnExecutionPolicy,
  MailTurnMemoryNamespaces
} from "../src/core/types.js";
import { resolveOrchestratorTurnMemoryNamespaces } from "../src/memory/namespaces.js";
import {
  buildRuntimeProcessEnvironment,
  createLocalCommandExecutor,
  runLocalCommand
} from "../src/runtime/local-command-executor.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("local command executor", () => {
  it("passes stdin JSON to a local runner and sanitizes audit metadata", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-local-command-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_RUNTIME_MODE: "command",
      MAILCLAW_RUNTIME_COMMAND: "mail-runtime"
    });
    const artifactDir = path.join(tempDir, "attachments");
    fs.mkdirSync(artifactDir, { recursive: true });
    const memoryNamespaces: MailTurnMemoryNamespaces = resolveOrchestratorTurnMemoryNamespaces(config, {
      tenantId: "acct",
      roomKey: "mail:acct:thread:abc",
      agentId: "mail-reviewer"
    });
    const executionPolicy: MailTurnExecutionPolicy = {
      role: "mail-reviewer" as const,
      tenantId: "acct",
      roomKey: "mail:acct:thread:abc",
      runtimeAgentId: "mail-reviewer",
      toolPolicy: "review-only",
      sandboxPolicy: "mail-room-worker",
      networkAccess: "none" as const,
      filesystemAccess: "workspace-read" as const,
      outboundMode: "blocked" as const,
      allowedMemoryScopes: ["room", "agent", "scratch"],
      trustLevel: "T1",
      source: "config" as const
    };
    const policyManifest: MailRuntimePolicyManifest = {
      toolPolicies: ["review-only"],
      sandboxPolicies: ["mail-room-worker"],
      networkAccess: "none",
      filesystemAccess: "workspace-read",
      outboundMode: "blocked"
    };
    const attachments: MailTurnAttachmentDescriptor[] = [
      {
        attachmentId: "attachment-1",
        filename: "notes.pdf",
        mimeType: "application/pdf",
        artifactPath: path.join(artifactDir, "metadata.json"),
        rawDataPath: path.join(artifactDir, "original.bin"),
        preferredInputPath: path.join(artifactDir, "original.bin"),
        preferredInputFilename: "notes.pdf",
        preferredInputMimeType: "application/pdf",
        preferredInputKind: "raw",
        chunks: []
      }
    ];
    const runner = vi.fn(async (_command: string, input: string) => {
      const payload = JSON.parse(input) as {
        sessionKey: string;
        inputText: string;
        agentId?: string;
        attachments?: MailTurnAttachmentDescriptor[];
        memoryNamespaces?: typeof memoryNamespaces;
        executionPolicy?: MailTurnExecutionPolicy;
      };

      expect(payload).toMatchObject({
        sessionKey: "hook:mail:acct:thread:abc",
        inputText: "hello",
        agentId: "mail-reviewer",
        attachments,
        memoryNamespaces,
        executionPolicy
      });

      return {
        stdout: JSON.stringify({
          responseText: "local hello"
        }),
        stderr: "",
        exitCode: 0
      };
    });
    const executor = createLocalCommandExecutor(config, {
      runner,
      policyManifest
    });

    const result = await executor.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:abc",
      inputText: "hello",
      agentId: "mail-reviewer",
      attachments,
      memoryNamespaces,
      executionPolicy
    });

    expect(result.responseText).toBe("local hello");
    expect(result.request.url).toBe("command://mail-runtime");
    expect(result.request.headers.Authorization).toBeUndefined();
    expect(result.request.body.sessionKey).toBe("hook:mail:acct:thread:abc");
    expect(result.request.body.memoryNamespaces).toMatchObject({
      room: {
        namespaceKey: "room:acct:mail:acct:thread:abc"
      },
      agent: {
        namespaceKey: "agent:acct:mail-reviewer"
      }
    });
    expect(result.request.body.agentId).toBe("mail-reviewer");
    expect(result.request.body.attachments).toEqual(attachments);
    expect(result.request.body.executionPolicy).toMatchObject({
      toolPolicy: "review-only",
      outboundMode: "blocked"
    });
  });

  it("rejects execution-policy turns when the command backend does not declare a policy manifest", async () => {
    const config = loadConfig({
      MAILCLAW_RUNTIME_MODE: "command",
      MAILCLAW_RUNTIME_COMMAND: "mail-runtime"
    });
    const executor = createLocalCommandExecutor(config, async () => ({
      stdout: JSON.stringify({ responseText: "unexpected" }),
      stderr: "",
      exitCode: 0
    }));

    await expect(
      executor.executeMailTurn({
        sessionKey: "hook:mail:acct:thread:abc",
        inputText: "hello",
        executionPolicy: {
          role: "mail-reviewer",
          tenantId: "acct",
          roomKey: "mail:acct:thread:abc",
          runtimeAgentId: "mail-reviewer",
          toolPolicy: "review-only",
          sandboxPolicy: "mail-room-worker",
          networkAccess: "none",
          filesystemAccess: "workspace-read",
          outboundMode: "blocked",
          allowedMemoryScopes: ["room", "agent"],
          source: "default"
        }
      })
    ).rejects.toThrow(
      "command runtime mail-runtime must declare a policy manifest before accepting executionPolicy-bound turns"
    );
  });

  it("does not inherit arbitrary host environment variables into command runtimes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-local-command-env-"));
    tempDirs.push(tempDir);
    const scriptPath = path.join(tempDir, "print-env.js");
    fs.writeFileSync(
      scriptPath,
      [
        'process.stdout.write(JSON.stringify({',
        '  responseText: JSON.stringify({',
        '    cwd: process.cwd(),',
        '    runtimeTransport: process.env.MAILCLAW_RUNTIME_TRANSPORT ?? null,',
        '    runtimeCwd: process.env.MAILCLAW_RUNTIME_CWD ?? null,',
        '    leakedSecret: process.env.MAILCLAW_TEST_LEAK ?? null',
        "  })",
        "}));"
      ].join("\n"),
      "utf8"
    );
    const previousLeak = process.env.MAILCLAW_TEST_LEAK;
    process.env.MAILCLAW_TEST_LEAK = "should-not-leak";

    try {
      const result = await runLocalCommand(`${process.execPath} ${scriptPath}`, "{}", {
        cwd: tempDir
      });
      expect(result.exitCode).toBe(0);
      const payload = JSON.parse(result.stdout) as { responseText: string };
      const expectedCwd = fs.realpathSync(tempDir);
      const expectedRuntimeCwd = path.resolve(tempDir);
      expect(JSON.parse(payload.responseText)).toEqual({
        cwd: expectedCwd,
        runtimeTransport: "local-command",
        runtimeCwd: expectedRuntimeCwd,
        leakedSecret: null
      });
    } finally {
      if (previousLeak === undefined) {
        delete process.env.MAILCLAW_TEST_LEAK;
      } else {
        process.env.MAILCLAW_TEST_LEAK = previousLeak;
      }
    }
  });

  it("builds a minimal process environment for local command runtimes", () => {
    const env = buildRuntimeProcessEnvironment("/tmp/mailclaw-runtime");

    expect(env.MAILCLAW_RUNTIME_TRANSPORT).toBe("local-command");
    expect(env.MAILCLAW_RUNTIME_CWD).toBe("/tmp/mailclaw-runtime");
    expect(env.MAILCLAW_TEST_LEAK).toBeUndefined();
  });

  it("rejects command runtime attachment descriptors that point outside the MailClaw state directory", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-local-command-boundary-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_RUNTIME_MODE: "command",
      MAILCLAW_RUNTIME_COMMAND: "mail-runtime"
    });
    const executor = createLocalCommandExecutor(config, {
      runner: async () => ({
        stdout: JSON.stringify({ responseText: "unexpected" }),
        stderr: "",
        exitCode: 0
      }),
      policyManifest: {
        toolPolicies: ["review-only"],
        sandboxPolicies: ["mail-room-worker"],
        networkAccess: "none",
        filesystemAccess: "workspace-read",
        outboundMode: "blocked"
      }
    });
    const memoryNamespaces = resolveOrchestratorTurnMemoryNamespaces(config, {
      tenantId: "acct",
      roomKey: "mail:acct:thread:abc",
      agentId: "mail-reviewer"
    });

    await expect(
      executor.executeMailTurn({
        sessionKey: "hook:mail:acct:thread:abc",
        inputText: "hello",
        agentId: "mail-reviewer",
        attachments: [
          {
            attachmentId: "attachment-1",
            filename: "notes.pdf",
            mimeType: "application/pdf",
            preferredInputPath: "/etc/passwd",
            chunks: []
          }
        ],
        memoryNamespaces,
        executionPolicy: {
          role: "mail-reviewer",
          tenantId: "acct",
          roomKey: "mail:acct:thread:abc",
          runtimeAgentId: "mail-reviewer",
          toolPolicy: "review-only",
          sandboxPolicy: "mail-room-worker",
          networkAccess: "none",
          filesystemAccess: "workspace-read",
          outboundMode: "blocked",
          allowedMemoryScopes: ["room", "agent"],
          source: "default"
        }
      })
    ).rejects.toThrow(
      "attachment attachment-1 preferredInputPath must stay within the MailClaw state directory"
    );
  });
});
