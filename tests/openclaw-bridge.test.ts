import { describe, expect, it } from "vitest";

import {
  buildOpenClawResponsesRequest,
  buildOpenClawResponsesUrl,
  extractOpenClawResponseText,
  parseOpenClawSseStream
} from "../src/openclaw/bridge.js";

describe("openclaw bridge", () => {
  it("builds the responses url and headers", () => {
    const request = buildOpenClawResponsesRequest({
      baseUrl: "http://127.0.0.1:11437",
      agentId: "mail",
      sessionKey: "hook:mail:acct:thread:abc",
      inputText: "hello"
    });

    expect(buildOpenClawResponsesUrl("http://127.0.0.1:11437")).toBe(
      "http://127.0.0.1:11437/v1/responses"
    );
    expect(request.method).toBe("POST");
    expect(request.headers["x-openclaw-agent-id"]).toBe("mail");
    expect(request.headers["x-openclaw-session-key"]).toBe("hook:mail:acct:thread:abc");
    expect(request.body).toContain('"hello"');
    expect(request.body).toContain('"model":"openclaw:mail"');
  });

  it("serializes bounded mailclaws context into metadata when provided", () => {
    const request = buildOpenClawResponsesRequest({
      baseUrl: "http://127.0.0.1:11437",
      agentId: "mail-reviewer",
      sessionKey: "hook:mail:acct:thread:abc",
      inputText: "hello",
      memoryNamespaces: {
        room: {
          scope: "room",
          tenantId: "acct",
          roomKey: "mail:acct:thread:abc",
          namespaceKey: "room:acct:mail:acct:thread:abc",
          rootDir: "/tmp/room",
          primaryPath: "/tmp/room/ROOM_MEMORY.md",
          capabilities: {
            storesMetadata: false,
            isEphemeral: false,
            canSourcePromotionDrafts: true,
            canReceiveApprovedPromotions: false,
            supportsSnapshotPaths: true
          }
        },
        agent: {
          scope: "agent",
          tenantId: "acct",
          agentId: "mail-reviewer",
          namespaceKey: "agent:acct:mail-reviewer",
          rootDir: "/tmp/agent",
          primaryPath: "/tmp/agent/MEMORY.md",
          capabilities: {
            storesMetadata: false,
            isEphemeral: false,
            canSourcePromotionDrafts: false,
            canReceiveApprovedPromotions: true,
            supportsSnapshotPaths: false
          }
        }
      },
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

    const payload = JSON.parse(request.body) as {
      metadata?: Record<string, string>;
    };

    expect(payload.metadata?.mailclaw_memory_namespaces).toContain('"namespaceKey":"room:acct:mail:acct:thread:abc"');
    expect(payload.metadata?.mailclaw_execution_policy).toContain('"runtimeAgentId":"mail-reviewer"');
  });

  it("merges bridge session headers and metadata into the request envelope", () => {
    const request = buildOpenClawResponsesRequest({
      baseUrl: "http://127.0.0.1:11437",
      agentId: "mail",
      sessionKey: "hook:mail:acct:thread:abc",
      inputText: "hello",
      sessionHeaders: {
        "x-mailclaws-bridge-session-id": "bridge-session-1"
      },
      sessionMetadata: {
        mailclaw_bridge_session_id: "bridge-session-1"
      }
    });

    const payload = JSON.parse(request.body) as {
      metadata?: Record<string, string>;
    };

    expect(request.headers["x-mailclaws-bridge-session-id"]).toBe("bridge-session-1");
    expect(request.headers["x-openclaw-session-key"]).toBe("hook:mail:acct:thread:abc");
    expect(payload.metadata?.mailclaw_bridge_session_id).toBe("bridge-session-1");
  });

  it("extracts streamed text from sse events and response payloads", () => {
    const chunks = parseOpenClawSseStream(
      [
        "event: message",
        'data: {"type":"response.output_text.delta","delta":"Hel"}',
        "",
        "event: message",
        'data: {"type":"response.output_text.delta","delta":"lo"}',
        "",
        "event: message",
        'data: {"type":"response.completed","response":{"output":[{"type":"output_text","text":" world"}]}}',
        ""
      ].join("\n")
    );

    expect(chunks).toEqual(["Hel", "lo", " world"]);
    expect(extractOpenClawResponseText(chunks)).toBe("Hello world");
  });
});
