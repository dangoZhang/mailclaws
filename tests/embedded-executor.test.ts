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
import {
  resolveOrchestratorTurnMemoryNamespaces
} from "../src/memory/namespaces.js";
import {
  createEmbeddedMailRuntimeExecutor,
  type EmbeddedRuntimeAdapter,
  type EmbeddedRuntimeTurnRequest
} from "../src/runtime/embedded-executor.js";
import type {
  EmbeddedRuntimeSessionManager,
  EmbeddedRuntimeSessionRecord
} from "../src/runtime/embedded-session-manager.js";
import { listEmbeddedRuntimeSessions } from "../src/runtime/runtime-observability.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("embedded runtime executor", () => {
  it("persists session state and replays history into later turns", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-embedded-runtime-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_RUNTIME_MODE: "embedded"
    });
    const attachmentDir = path.join(tempDir, "attachments");
    fs.mkdirSync(attachmentDir, { recursive: true });
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
      trustLevel: "T2",
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
        artifactPath: path.join(attachmentDir, "metadata.json"),
        rawDataPath: path.join(attachmentDir, "original.bin"),
        preferredInputPath: path.join(attachmentDir, "original.bin"),
        preferredInputFilename: "notes.pdf",
        preferredInputMimeType: "application/pdf",
        preferredInputKind: "raw",
        chunks: []
      }
    ];
    const adapter: EmbeddedRuntimeAdapter = {
      adapterId: "test-adapter",
      policyManifest,
      executeMailTurn: vi.fn(async (payload: EmbeddedRuntimeTurnRequest) => {
        if (payload.history.length === 0) {
          expect(payload.inputText).toBe("hello");
          expect(payload.agentId).toBe("mail-reviewer");
          expect(payload.attachments).toEqual(attachments);
          expect(payload.memoryNamespaces).toEqual(memoryNamespaces);
          expect(payload.executionPolicy).toEqual(executionPolicy);
          return {
            responseText: "first reply"
          };
        }

        expect(payload.history).toEqual([
          {
            role: "user",
            text: "hello"
          },
          {
            role: "assistant",
            text: "first reply"
          }
        ]);
        expect(payload.agentId).toBe("mail-reviewer");
        expect(payload.attachments).toEqual(attachments);
        expect(payload.memoryNamespaces).toEqual(memoryNamespaces);
        expect(payload.executionPolicy).toEqual(executionPolicy);
        expect(fs.existsSync(payload.session.transcriptPath)).toBe(true);
        expect(fs.existsSync(payload.session.statePath)).toBe(true);

        return {
          responseText: "second reply"
        };
      })
    };

    const executor = createEmbeddedMailRuntimeExecutor(config, adapter);

    const first = await executor.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:abc",
      inputText: "hello",
      agentId: "mail-reviewer",
      attachments,
      memoryNamespaces,
      executionPolicy
    });
    expect(first.responseText).toBe("first reply");
    expect(first.request.url).toBe("embedded://test-adapter");
    expect(first.request.body.memoryNamespaces).toMatchObject({
      room: {
        namespaceKey: "room:acct:mail:acct:thread:abc"
      }
    });
    expect(first.request.body.agentId).toBe("mail-reviewer");
    expect(first.request.body.attachments).toEqual(attachments);
    expect(first.request.body.executionPolicy).toMatchObject({
      role: "mail-reviewer",
      outboundMode: "blocked"
    });

    const second = await executor.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:abc",
      inputText: "follow-up",
      agentId: "mail-reviewer",
      attachments,
      memoryNamespaces,
      executionPolicy
    });
    expect(second.responseText).toBe("second reply");
    expect(adapter.executeMailTurn).toHaveBeenCalledTimes(2);

    const runtimeDir = path.join(tempDir, "embedded-runtime", "sessions");
    const transcriptFiles = fs
      .readdirSync(runtimeDir, { recursive: true })
      .filter((entry) => typeof entry === "string" && entry.endsWith("transcript.jsonl"));
    expect(transcriptFiles).toHaveLength(1);

    const transcriptPath = path.join(runtimeDir, transcriptFiles[0] as string);
    const transcript = fs
      .readFileSync(transcriptPath, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { role: string; text: string });

    expect(transcript).toEqual([
      { role: "user", text: "hello" },
      { role: "assistant", text: "first reply" },
      { role: "user", text: "follow-up" },
      { role: "assistant", text: "second reply" }
    ]);
    expect(executor.inspectRuntime?.()).toMatchObject({
      runtimeKind: "embedded",
      runtimeLabel: "test-adapter",
      manifestSource: "executor",
      backendEnforcement: "process_adapter"
    });
    expect(listEmbeddedRuntimeSessions(config)).toEqual([
      expect.objectContaining({
        sessionKey: "hook:mail:acct:thread:abc",
        turnCount: 2,
        transcriptEntryCount: 4,
        lastEntryRole: "assistant",
        lastEntryPreview: "second reply"
      })
    ]);
  });

  it("supports an in-process adapter without requiring a runtime command", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-embedded-adapter-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_RUNTIME_MODE: "embedded"
    });
    const memoryNamespaces: MailTurnMemoryNamespaces = resolveOrchestratorTurnMemoryNamespaces(config, {
      tenantId: "acct",
      roomKey: "mail:acct:thread:adapter",
      agentId: "mail"
    });
    const executionPolicy: MailTurnExecutionPolicy = {
      role: "mail-orchestrator" as const,
      tenantId: "acct",
      roomKey: "mail:acct:thread:adapter",
      runtimeAgentId: "mail",
      toolPolicy: "mail-orchestrator",
      sandboxPolicy: "mail-room-orchestrator",
      networkAccess: "allowlisted" as const,
      filesystemAccess: "workspace-read" as const,
      outboundMode: "approval_required" as const,
      allowedMemoryScopes: ["room", "agent"],
      trustLevel: "T3",
      source: "default" as const
    };

    const adapter = {
      adapterId: "in-process",
      policyManifest: {
        toolPolicies: ["mail-orchestrator"],
        sandboxPolicies: ["mail-room-orchestrator"],
        networkAccess: "allowlisted" as const,
        filesystemAccess: "workspace-read" as const,
        outboundMode: "approval_required" as const
      },
      async executeMailTurn(input: EmbeddedRuntimeTurnRequest) {
        expect(input.memoryNamespaces).toEqual(memoryNamespaces);
        expect(input.executionPolicy).toEqual(executionPolicy);
        return {
          responseText: `${input.inputText}:${input.history.length}`
        };
      }
    };

    const executor = createEmbeddedMailRuntimeExecutor(config, {
      adapter
    });

    const result = await executor.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:adapter",
      inputText: "hello",
      memoryNamespaces,
      executionPolicy
    });

    expect(result.responseText).toBe("hello:0");
    expect(result.request.url).toBe("embedded://in-process");
    expect(result.request.body.memoryNamespaces).toMatchObject({
      agent: {
        namespaceKey: "agent:acct:mail"
      }
    });
    expect(result.request.body.executionPolicy).toMatchObject({
      role: "mail-orchestrator",
      outboundMode: "approval_required"
    });
  });

  it("accepts a custom embedded session manager seam", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-embedded-custom-session-manager-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_RUNTIME_MODE: "embedded"
    });
    const sessions = new Map<string, EmbeddedRuntimeSessionRecord>();
    const sessionManager: EmbeddedRuntimeSessionManager = {
      describeSession(sessionKey, now) {
        const existing = sessions.get(sessionKey);
        if (existing) {
          return existing;
        }

        const created: EmbeddedRuntimeSessionRecord = {
          state: {
            sessionId: "custom-session",
            sessionKey,
            createdAt: now,
            updatedAt: now,
            turnCount: 0
          },
          statePath: "/virtual/state.json",
          transcriptPath: "/virtual/transcript.jsonl",
          history: []
        };
        sessions.set(sessionKey, created);
        return created;
      },
      appendTranscriptEntries(sessionKey, entries) {
        const current = this.describeSession(sessionKey, new Date().toISOString());
        const updated: EmbeddedRuntimeSessionRecord = {
          ...current,
          state: {
            ...current.state,
            updatedAt: new Date().toISOString(),
            turnCount: current.history.length / 2 + 1
          },
          history: [...current.history, ...entries]
        };
        sessions.set(sessionKey, updated);
        return updated;
      },
      listSessions() {
        return [];
      }
    };

    const executor = createEmbeddedMailRuntimeExecutor(config, {
      adapter: {
        adapterId: "custom-session-adapter",
        policyManifest: {
          toolPolicies: ["mail-orchestrator"],
          sandboxPolicies: ["mail-room-orchestrator"],
          networkAccess: "allowlisted",
          filesystemAccess: "workspace-read",
          outboundMode: "approval_required"
        },
        async executeMailTurn(input) {
          expect(input.history).toEqual([]);
          expect(input.session).toEqual({
            sessionId: "custom-session",
            statePath: "/virtual/state.json",
            transcriptPath: "/virtual/transcript.jsonl"
          });
          return {
            responseText: "custom"
          };
        }
      },
      sessionManager
    });

    const result = await executor.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:custom-session",
      inputText: "hello"
    });

    expect(result.responseText).toBe("custom");
    expect(sessions.get("hook:mail:acct:thread:custom-session")?.history).toEqual([
      { role: "user", text: "hello" },
      { role: "assistant", text: "custom" }
    ]);
  });

  it("records completedAt after the embedded adapter finishes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-embedded-timing-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_RUNTIME_MODE: "embedded"
    });
    const memoryNamespaces: MailTurnMemoryNamespaces = resolveOrchestratorTurnMemoryNamespaces(config, {
      tenantId: "acct",
      roomKey: "mail:acct:thread:timing",
      agentId: "mail"
    });
    const executionPolicy: MailTurnExecutionPolicy = {
      role: "mail-orchestrator" as const,
      tenantId: "acct",
      roomKey: "mail:acct:thread:timing",
      runtimeAgentId: "mail",
      toolPolicy: "mail-orchestrator",
      sandboxPolicy: "mail-room-orchestrator",
      networkAccess: "allowlisted" as const,
      filesystemAccess: "workspace-read" as const,
      outboundMode: "approval_required" as const,
      allowedMemoryScopes: ["room", "agent"],
      trustLevel: "T3",
      source: "default" as const
    };

    const executor = createEmbeddedMailRuntimeExecutor(config, {
      adapter: {
        adapterId: "timing-adapter",
        policyManifest: {
          toolPolicies: ["mail-orchestrator"],
          sandboxPolicies: ["mail-room-orchestrator"],
          networkAccess: "allowlisted" as const,
          filesystemAccess: "workspace-read" as const,
          outboundMode: "approval_required" as const
        },
        async executeMailTurn() {
          await new Promise((resolve) => setTimeout(resolve, 25));
          return {
            responseText: "done"
          };
        }
      }
    });

    const result = await executor.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:timing",
      inputText: "hello",
      memoryNamespaces,
      executionPolicy
    });

    expect(Date.parse(result.completedAt)).toBeGreaterThan(Date.parse(result.startedAt));
  });

  it("rejects embedded execution when no in-process adapter is supplied", () => {
    const config = loadConfig({
      MAILCLAW_RUNTIME_MODE: "embedded"
    });

    expect(() => createEmbeddedMailRuntimeExecutor(config, {})).toThrow(
      "embedded runtime mode requires an in-process adapter; command fallback has been removed"
    );
  });

  it("rejects attachment descriptors that point outside the MailClaws state directory", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-embedded-boundary-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_RUNTIME_MODE: "embedded"
    });
    const memoryNamespaces = resolveOrchestratorTurnMemoryNamespaces(config, {
      tenantId: "acct",
      roomKey: "mail:acct:thread:boundary",
      agentId: "mail-reviewer"
    });
    const adapter: EmbeddedRuntimeAdapter = {
      adapterId: "test-adapter",
      policyManifest: {
        toolPolicies: ["review-only"],
        sandboxPolicies: ["mail-room-worker"],
        networkAccess: "none",
        filesystemAccess: "workspace-read",
        outboundMode: "blocked"
      },
      async executeMailTurn() {
        return {
          responseText: "unexpected"
        };
      }
    };
    const executor = createEmbeddedMailRuntimeExecutor(config, adapter);

    await expect(
      executor.executeMailTurn({
        sessionKey: "hook:mail:acct:thread:boundary",
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
          roomKey: "mail:acct:thread:boundary",
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
      "attachment attachment-1 preferredInputPath must stay within the MailClaws state directory"
    );
  });
});
