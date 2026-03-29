import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("uses safe defaults for phase 0 feature flags", () => {
    const config = loadConfig({});

    expect(config.http.host).toBe("127.0.0.1");
    expect(config.http.port).toBe(3000);
    expect(config.runtime.mode).toBe("embedded");
    expect(config.features.mailIngest).toBe(false);
    expect(config.features.openClawBridge).toBe(false);
    expect(config.features.identityTrustGate).toBe(false);
    expect(config.identity.minTrustLevel).toBe("T0");
  });

  it("parses boolean-like feature flags from environment strings", () => {
    const config = loadConfig({
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false",
      MAILCLAW_FEATURE_IDENTITY_TRUST_GATE: "true",
      MAILCLAW_IDENTITY_MIN_TRUST_LEVEL: "T2",
      MAILCLAW_RUNTIME_MODE: "command",
      MAILCLAW_RUNTIME_COMMAND: "mail-runtime",
      MAILCLAW_MAIL_IO_MODE: "command",
      MAILCLAW_MAIL_IO_COMMAND: "mail-io-sidecar",
      MAILCLAW_PUBLIC_BASE_URL: "https://mail.example.com/base/"
    });

    expect(config.features.mailIngest).toBe(true);
    expect(config.features.openClawBridge).toBe(false);
    expect(config.features.identityTrustGate).toBe(true);
    expect(config.identity.minTrustLevel).toBe("T2");
    expect(config.runtime.mode).toBe("command");
    expect(config.runtime.command).toBe("mail-runtime");
    expect(config.mailIo.mode).toBe("command");
    expect(config.mailIo.command).toBe("mail-io-sidecar");
    expect(config.http.publicBaseUrl).toBe("https://mail.example.com/base/");
  });

  it("inherits compatible OpenClaw environment variables when MailClaw-specific ones are unset", () => {
    const config = loadConfig({
      OPENCLAW_PUBLIC_BASE_URL: "https://gateway.example.com",
      OPENCLAW_BASE_URL: "https://gateway.example.com/api",
      OPENCLAW_GATEWAY_TOKEN: "gateway-token",
      OPENCLAW_AGENT_ID: "mail",
      OPENCLAW_SESSION_PREFIX: "hook:gateway-mail"
    });

    expect(config.http.publicBaseUrl).toBe("https://gateway.example.com");
    expect(config.openClaw.baseUrl).toBe("https://gateway.example.com/api");
    expect(config.openClaw.gatewayToken).toBe("gateway-token");
    expect(config.openClaw.agentId).toBe("mail");
    expect(config.openClaw.sessionPrefix).toBe("hook:gateway-mail");
  });

  it("parses per-role OpenClaw agent overrides", () => {
    const config = loadConfig({
      MAILCLAW_OPENCLAW_ROLE_AGENT_IDS_JSON: JSON.stringify({
        "mail-orchestrator": "assistant",
        "mail-attachment-reader": "research"
      })
    });

    expect(config.openClaw.roleAgentIds).toEqual({
      "mail-orchestrator": "assistant",
      "mail-attachment-reader": "research"
    });
  });

  it("parses per-role OpenClaw execution policy overrides", () => {
    const config = loadConfig({
      MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON: JSON.stringify({
        "mail-orchestrator": {
          toolPolicy: "frontdesk",
          sandboxPolicy: "mail-safe",
          networkAccess: "allowlisted",
          filesystemAccess: "workspace-read",
          outboundMode: "approval_required"
        },
        "mail-reviewer": {
          toolPolicy: "review-only",
          networkAccess: "none",
          outboundMode: "blocked"
        }
      })
    });

    expect(config.openClaw.roleExecutionPolicies).toEqual({
      "mail-orchestrator": {
        toolPolicy: "frontdesk",
        sandboxPolicy: "mail-safe",
        networkAccess: "allowlisted",
        filesystemAccess: "workspace-read",
        outboundMode: "approval_required"
      },
      "mail-reviewer": {
        toolPolicy: "review-only",
        networkAccess: "none",
        outboundMode: "blocked"
      }
    });
  });

  it("parses a runtime policy manifest", () => {
    const config = loadConfig({
      MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON: JSON.stringify({
        toolPolicies: ["mail-orchestrator", "mail-reviewer"],
        sandboxPolicies: ["mail-room-orchestrator", "mail-room-worker"],
        networkAccess: "allowlisted",
        filesystemAccess: "workspace-read",
        outboundMode: "approval_required"
      })
    });

    expect(config.runtime.policyManifest).toEqual({
      toolPolicies: ["mail-orchestrator", "mail-reviewer"],
      sandboxPolicies: ["mail-room-orchestrator", "mail-room-worker"],
      networkAccess: "allowlisted",
      filesystemAccess: "workspace-read",
      outboundMode: "approval_required"
    });
  });

  it("rejects invalid per-role OpenClaw agent override entries", () => {
    expect(() =>
      loadConfig({
        MAILCLAW_OPENCLAW_ROLE_AGENT_IDS_JSON: JSON.stringify({
          unsupported: "assistant"
        })
      })
    ).toThrow("MAILCLAW_OPENCLAW_ROLE_AGENT_IDS_JSON contains unsupported role: unsupported");
  });

  it("rejects invalid per-role OpenClaw execution policy override entries", () => {
    expect(() =>
      loadConfig({
        MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON: JSON.stringify({
          "mail-reviewer": {
            networkAccess: "internet"
          }
        })
      })
    ).toThrow(
      "MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON role mail-reviewer networkAccess must be one of: none, allowlisted"
    );
  });

  it("rejects invalid runtime policy manifest entries", () => {
    expect(() =>
      loadConfig({
        MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON: JSON.stringify({
          toolPolicies: ["mail-reviewer"],
          sandboxPolicies: ["mail-room-worker"],
          networkAccess: "internet",
          filesystemAccess: "workspace-read",
          outboundMode: "blocked"
        })
      })
    ).toThrow(
      "MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON networkAccess must be one of: none, allowlisted"
    );
  });
});
