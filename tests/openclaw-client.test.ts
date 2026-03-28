import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import type { MailTurnAttachmentDescriptor } from "../src/core/types.js";
import {
  resolveOrchestratorTurnMemoryNamespaces,
  resolveWorkerTurnMemoryNamespaces
} from "../src/memory/namespaces.js";
import { createOpenClawClient } from "../src/openclaw/client.js";
import type { OpenClawBridgeSessionManager } from "../src/openclaw/session-manager.js";
import { listBridgeRuntimeSessions } from "../src/runtime/runtime-observability.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("openclaw client", () => {
  it("builds the transport request and returns parsed text with sanitized audit data", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>)["x-openclaw-agent-id"]).toBe("mail");
      expect((init?.headers as Record<string, string>)["x-openclaw-session-key"]).toBe(
        "hook:mail:acct:thread:abc"
      );
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer super-secret");
      expect(String(init?.body)).toContain('"hello"');

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async text() {
          return [
            'data: {"type":"response.output_text.delta","delta":"Hello"}',
            "",
            'data: {"type":"response.output_text.delta","delta":" world"}',
            ""
          ].join("\n");
        }
      } as Response;
    });
    const config = loadConfig({
      MAILCLAW_OPENCLAW_BASE_URL: "http://127.0.0.1:11437",
      MAILCLAW_OPENCLAW_GATEWAY_TOKEN: "super-secret"
    });
    const client = createOpenClawClient(config, fetchMock as typeof fetch);

    const result = await client.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:abc",
      inputText: "hello"
    });

    expect(result.responseText).toBe("Hello world");
    expect(result.request.headers.Authorization).toBeUndefined();
    expect(result.request.headers["x-openclaw-session-key"]).toBe("hook:mail:acct:thread:abc");
    expect(result.request.body.model).toBe("openclaw:mail");
  });

  it("uses an explicit turn agent override when provided", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["x-openclaw-agent-id"]).toBe("mail-reviewer");

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async text() {
          return 'data: {"type":"response.output_text.delta","delta":"Reviewed"}\n';
        }
      } as Response;
    });
    const config = loadConfig({
      MAILCLAW_OPENCLAW_BASE_URL: "http://127.0.0.1:11437",
      MAILCLAW_OPENCLAW_GATEWAY_TOKEN: "super-secret"
    });
    const client = createOpenClawClient(config, fetchMock as typeof fetch);

    const result = await client.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:abc",
      inputText: "hello",
      agentId: "mail-reviewer"
    });

    expect(result.responseText).toBe("Reviewed");
    expect(result.request.headers["x-openclaw-agent-id"]).toBe("mail-reviewer");
    expect(result.request.body.model).toBe("openclaw:mail-reviewer");
  });

  it("persists bridge session summaries through the default file-backed session manager", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-openclaw-client-session-"));
    tempDirs.push(tempDir);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["x-mailclaw-bridge-session-id"]).toBeDefined();
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async text() {
          return 'data: {"type":"response.output_text.delta","delta":"Bridge reply"}\n';
        }
      } as Response;
    });
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_OPENCLAW_BASE_URL: "http://127.0.0.1:11437",
      MAILCLAW_OPENCLAW_GATEWAY_TOKEN: "super-secret"
    });
    const client = createOpenClawClient(config, fetchMock as typeof fetch);

    const result = await client.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:bridge-session",
      inputText: "hello bridge",
      agentId: "mail-reviewer"
    });

    expect(result.responseText).toBe("Bridge reply");
    expect(result.request.body.metadata).toMatchObject({
      mailclaw_bridge_session_id: expect.any(String),
      mailclaw_bridge_agent_id: "mail-reviewer"
    });
    expect(listBridgeRuntimeSessions(config)).toEqual([
      expect.objectContaining({
        sessionKey: "hook:mail:acct:thread:bridge-session",
        agentId: "mail-reviewer",
        turnCount: 1,
        transcriptEntryCount: 2,
        lastEntryRole: "assistant",
        lastEntryPreview: "Bridge reply"
      })
    ]);
  });

  it("accepts a custom bridge session manager seam", async () => {
    const sessions = new Map<string, { sessionId: string; agentId: string; history: Array<{ role: "user" | "assistant"; text: string }> }>();
    const sessionManager: OpenClawBridgeSessionManager = {
      describeSession(input) {
        const existing = sessions.get(input.sessionKey);
        const current = existing ?? {
          sessionId: "custom-bridge-session",
          agentId: input.agentId,
          history: []
        };
        sessions.set(input.sessionKey, current);
        return {
          state: {
            sessionId: current.sessionId,
            sessionKey: input.sessionKey,
            agentId: input.agentId,
            createdAt: input.now,
            updatedAt: input.now,
            turnCount: current.history.length / 2
          },
          statePath: "/tmp/custom-bridge/state.json",
          transcriptPath: "/tmp/custom-bridge/transcript.jsonl",
          history: [...current.history],
          transportHeaders: {
            "x-custom-bridge-session": current.sessionId
          },
          metadata: {
            custom_bridge_session_id: current.sessionId
          }
        };
      },
      appendTranscriptEntries(input) {
        const current = sessions.get(input.sessionKey);
        if (!current) {
          throw new Error(`missing custom bridge session ${input.sessionKey}`);
        }
        current.agentId = input.agentId;
        current.history.push(...input.entries);
        sessions.set(input.sessionKey, current);
        return this.describeSession({
          sessionKey: input.sessionKey,
          agentId: input.agentId,
          now: input.now ?? new Date().toISOString()
        });
      },
      listSessions() {
        return [];
      }
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["x-custom-bridge-session"]).toBe("custom-bridge-session");
      const payload = JSON.parse(String(init?.body)) as { metadata?: Record<string, string> };
      expect(payload.metadata?.custom_bridge_session_id).toBe("custom-bridge-session");
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async text() {
          return 'data: {"type":"response.output_text.delta","delta":"Custom bridge"}\n';
        }
      } as Response;
    });
    const config = loadConfig({
      MAILCLAW_OPENCLAW_BASE_URL: "http://127.0.0.1:11437",
      MAILCLAW_OPENCLAW_GATEWAY_TOKEN: "super-secret"
    });
    const client = createOpenClawClient(config, {
      fetchImpl: fetchMock as typeof fetch,
      sessionManager
    });

    await client.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:custom-bridge",
      inputText: "hello custom bridge",
      agentId: "mail"
    });

    expect(sessions.get("hook:mail:acct:thread:custom-bridge")?.history).toEqual([
      {
        role: "user",
        text: "hello custom bridge"
      },
      {
        role: "assistant",
        text: "Custom bridge"
      }
    ]);
  });

  it("rejects disallowed memory scopes before sending the transport request", async () => {
    const fetchMock = vi.fn();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-openclaw-client-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_OPENCLAW_BASE_URL: "http://127.0.0.1:11437",
      MAILCLAW_OPENCLAW_GATEWAY_TOKEN: "super-secret"
    });
    const client = createOpenClawClient(config, fetchMock as typeof fetch);
    const memoryNamespaces = resolveWorkerTurnMemoryNamespaces(config, {
      tenantId: "acct",
      roomKey: "mail:acct:thread:abc",
      agentId: "mail-reviewer"
    });

    await expect(
      client.executeMailTurn({
        sessionKey: "hook:mail:acct:thread:abc",
        inputText: "hello",
        memoryNamespaces,
        executionPolicy: {
          role: "mail-reviewer",
          tenantId: "acct",
          roomKey: "mail:acct:thread:abc",
          runtimeAgentId: "mail-reviewer",
          scratchAgentId: "mail-reviewer",
          toolPolicy: "review-only",
          sandboxPolicy: "mail-room-worker",
          networkAccess: "none",
          filesystemAccess: "workspace-read",
          outboundMode: "blocked",
          allowedMemoryScopes: ["room", "agent"],
          source: "default"
        }
      })
    ).rejects.toThrow("execution policy mail-reviewer does not allow scratch memory scope");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards bounded namespace and execution policy metadata through the bridge request", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-openclaw-client-meta-"));
    tempDirs.push(tempDir);
    const attachmentDir = path.join(tempDir, "attachments");
    fs.mkdirSync(attachmentDir, { recursive: true });
    const attachmentPath = path.join(attachmentDir, "notes.pdf");
    fs.writeFileSync(attachmentPath, "fake pdf body", "utf8");
    const attachments: MailTurnAttachmentDescriptor[] = [
      {
        attachmentId: "attachment-1",
        filename: "notes.pdf",
        mimeType: "application/pdf",
        artifactPath: path.join(attachmentDir, "metadata.json"),
        rawDataPath: attachmentPath,
        preferredInputPath: attachmentPath,
        preferredInputFilename: "notes.pdf",
        preferredInputMimeType: "application/pdf",
        preferredInputKind: "raw",
        chunks: []
      }
    ];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const metadata = payload.metadata as Record<string, string> | undefined;
      const messages = payload.input as Array<{ content?: Array<Record<string, unknown>> }>;
      expect(metadata?.mailclaw_memory_namespaces).toContain(
        '"namespaceKey":"room:acct:mail:acct:thread:abc"'
      );
      expect(metadata?.mailclaw_execution_policy).toContain(
        '"runtimeAgentId":"mail-reviewer"'
      );
      expect(metadata?.mailclaw_turn_attachments).toContain('"attachmentId":"attachment-1"');
      expect(messages[0]?.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "input_file",
            filename: "notes.pdf",
            file_data: expect.stringContaining("data:application/pdf;base64,")
          })
        ])
      );

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async text() {
          return 'data: {"type":"response.output_text.delta","delta":"Reviewed"}\n';
        }
      } as Response;
    });
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_OPENCLAW_BASE_URL: "http://127.0.0.1:11437",
      MAILCLAW_OPENCLAW_GATEWAY_TOKEN: "super-secret",
      MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON: JSON.stringify({
        toolPolicies: ["review-only"],
        sandboxPolicies: ["mail-room-worker"],
        networkAccess: "none",
        filesystemAccess: "workspace-read",
        outboundMode: "blocked"
      })
    });
    const client = createOpenClawClient(config, fetchMock as typeof fetch);
    const memoryNamespaces = resolveOrchestratorTurnMemoryNamespaces(config, {
      tenantId: "acct",
      roomKey: "mail:acct:thread:abc",
      agentId: "mail-reviewer"
    });

    const result = await client.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:abc",
      inputText: "hello",
      agentId: "mail-reviewer",
      attachments,
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
    });

    expect(result.request.body.metadata).toMatchObject({
      mailclaw_memory_namespaces: expect.stringContaining('"agent:acct:mail-reviewer"'),
      mailclaw_execution_policy: expect.stringContaining('"outboundMode":"blocked"'),
      mailclaw_turn_attachments: expect.stringContaining('"preferredInputPath"')
    });
    const requestMessages = result.request.body.input as Array<{ content?: Array<Record<string, unknown>> }>;
    expect(requestMessages[0]?.content).toContainEqual(
      expect.objectContaining({
        type: "input_file",
        filename: "notes.pdf",
        file_data: "[redacted-inline-file]"
      })
    );
  });

  it("rejects execution-policy-bound bridge turns when no local policy manifest is declared", async () => {
    const fetchMock = vi.fn();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-openclaw-client-manifest-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_OPENCLAW_BASE_URL: "http://127.0.0.1:11437",
      MAILCLAW_OPENCLAW_GATEWAY_TOKEN: "super-secret"
    });
    const client = createOpenClawClient(config, fetchMock as typeof fetch);
    const memoryNamespaces = resolveOrchestratorTurnMemoryNamespaces(config, {
      tenantId: "acct",
      roomKey: "mail:acct:thread:abc",
      agentId: "mail-reviewer"
    });

    await expect(
      client.executeMailTurn({
        sessionKey: "hook:mail:acct:thread:abc",
        inputText: "hello",
        agentId: "mail-reviewer",
        memoryNamespaces,
        executionPolicy: {
          role: "mail-reviewer",
          tenantId: "acct",
          roomKey: "mail:acct:thread:abc",
          runtimeAgentId: "mail-reviewer",
          toolPolicy: "mail-reviewer",
          sandboxPolicy: "mail-room-worker",
          networkAccess: "none",
          filesystemAccess: "workspace-read",
          outboundMode: "blocked",
          allowedMemoryScopes: ["room", "agent"],
          source: "default"
        }
      })
    ).rejects.toThrow(
      "bridge runtime 127.0.0.1:11437 must declare a policy manifest before accepting executionPolicy-bound turns"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects bridge attachment descriptors that point outside the MailClaw state directory", async () => {
    const fetchMock = vi.fn();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-openclaw-client-boundary-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_OPENCLAW_BASE_URL: "http://127.0.0.1:11437",
      MAILCLAW_OPENCLAW_GATEWAY_TOKEN: "super-secret",
      MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON: JSON.stringify({
        toolPolicies: ["review-only"],
        sandboxPolicies: ["mail-room-worker"],
        networkAccess: "none",
        filesystemAccess: "workspace-read",
        outboundMode: "blocked"
      })
    });
    const client = createOpenClawClient(config, fetchMock as typeof fetch);
    const memoryNamespaces = resolveOrchestratorTurnMemoryNamespaces(config, {
      tenantId: "acct",
      roomKey: "mail:acct:thread:abc",
      agentId: "mail-reviewer"
    });

    await expect(
      client.executeMailTurn({
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
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
