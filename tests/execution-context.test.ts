import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { resolveWorkerTurnMemoryNamespaces } from "../src/memory/namespaces.js";
import type { ExecuteMailTurnInput } from "../src/runtime/agent-executor.js";
import {
  assertCanonicalMemoryNamespaceDescriptors,
  assertExecutionPolicyAllowsTurn,
  assertRuntimePolicyManifestAllowsTurn
} from "../src/runtime/execution-context.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function buildTurnInput(overrides: Partial<ExecuteMailTurnInput> = {}): ExecuteMailTurnInput {
  return {
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
      },
      scratch: {
        scope: "scratch",
        tenantId: "acct",
        agentId: "mail-reviewer",
        roomKey: "mail:acct:thread:abc",
        namespaceKey: "scratch:acct:mail-reviewer:mail:acct:thread:abc",
        rootDir: "/tmp/scratch",
        primaryPath: "/tmp/scratch/SCRATCH.md",
        metadataPath: "/tmp/scratch/metadata.json",
        capabilities: {
          storesMetadata: true,
          isEphemeral: true,
          canSourcePromotionDrafts: false,
          canReceiveApprovedPromotions: false,
          supportsSnapshotPaths: false
        }
      }
    },
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
      allowedMemoryScopes: ["room", "agent", "scratch"],
      trustLevel: "T2",
      source: "default"
    },
    ...overrides
  };
}

describe("execution context enforcement", () => {
  it("allows turns whose memory scopes are permitted by the execution policy", () => {
    expect(() => assertExecutionPolicyAllowsTurn(buildTurnInput())).not.toThrow();
  });

  it("rejects turns whose memory scopes exceed the execution policy", () => {
    expect(() =>
      assertExecutionPolicyAllowsTurn(
        buildTurnInput({
          executionPolicy: {
            ...buildTurnInput().executionPolicy!,
            allowedMemoryScopes: ["room", "agent"]
          }
        })
      )
    ).toThrow("execution policy mail-reviewer does not allow scratch memory scope");
  });

  it("rejects malformed namespace descriptors before execution", () => {
    expect(() =>
      assertExecutionPolicyAllowsTurn(
        buildTurnInput({
          memoryNamespaces: {
            ...buildTurnInput().memoryNamespaces!,
            room: {
              ...buildTurnInput().memoryNamespaces!.room,
              namespaceKey: "room:acct:wrong"
            }
          }
        })
      )
    ).toThrow("room memory namespace key must match canonical scope identity");
  });

  it("requires user memory scope to be explicitly allowed when attached to a turn", () => {
    expect(() =>
      assertExecutionPolicyAllowsTurn(
        buildTurnInput({
          memoryNamespaces: {
            ...buildTurnInput().memoryNamespaces!,
            user: {
              scope: "user",
              tenantId: "acct",
              userId: "email:sender@example.com",
              namespaceKey: "user:acct:email:sender@example.com",
              rootDir: "/tmp/user",
              primaryPath: "/tmp/user/USER_MEMORY.md",
              metadataPath: "/tmp/user/metadata.json",
              capabilities: {
                storesMetadata: true,
                isEphemeral: false,
                canSourcePromotionDrafts: false,
                canReceiveApprovedPromotions: false,
                supportsSnapshotPaths: false
              }
            }
          }
        })
      )
    ).toThrow("execution policy mail-reviewer does not allow user memory scope");
  });

  it("requires user namespaces to match the execution policy user identity", () => {
    expect(() =>
      assertExecutionPolicyAllowsTurn(
        buildTurnInput({
          memoryNamespaces: {
            ...buildTurnInput().memoryNamespaces!,
            user: {
              scope: "user",
              tenantId: "acct",
              userId: "email:sender@example.com",
              namespaceKey: "user:acct:email:sender@example.com",
              rootDir: "/tmp/user",
              primaryPath: "/tmp/user/USER_MEMORY.md",
              metadataPath: "/tmp/user/metadata.json",
              capabilities: {
                storesMetadata: true,
                isEphemeral: false,
                canSourcePromotionDrafts: false,
                canReceiveApprovedPromotions: false,
                supportsSnapshotPaths: false
              }
            }
          },
          executionPolicy: {
            ...buildTurnInput().executionPolicy!,
            allowedMemoryScopes: ["room", "agent", "user", "scratch"],
            userId: "email:other@example.com"
          }
        })
      )
    ).toThrow("user memory namespace userId must match execution policy userId");
  });

  it("requires scratch namespaces to match the execution policy scratch agent identity", () => {
    expect(() =>
      assertExecutionPolicyAllowsTurn(
        buildTurnInput({
          executionPolicy: {
            ...buildTurnInput().executionPolicy!,
            scratchAgentId: "mail-other"
          }
        })
      )
    ).toThrow("scratch memory namespace agentId must match execution policy scratchAgentId");
  });

  it("requires runtime backends to declare a policy manifest for execution-policy turns", () => {
    expect(() =>
      assertRuntimePolicyManifestAllowsTurn({
        runtimeKind: "command",
        runtimeLabel: "mail-runtime",
        executionInput: buildTurnInput()
      })
    ).toThrow(
      "command runtime mail-runtime must declare a policy manifest before accepting executionPolicy-bound turns"
    );
  });

  it("rejects runtime manifests that are weaker than the requested execution policy", () => {
    expect(() =>
      assertRuntimePolicyManifestAllowsTurn({
        runtimeKind: "embedded",
        runtimeLabel: "in-process",
        executionInput: buildTurnInput(),
        policyManifest: {
          toolPolicies: ["review-only"],
          sandboxPolicies: ["mail-room-worker"],
          networkAccess: "none",
          filesystemAccess: "none",
          outboundMode: "blocked"
        }
      })
    ).toThrow("embedded runtime in-process does not allow filesystem access workspace-read");
  });

  it("rejects non-canonical namespace paths even when the scope identity looks valid", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-execution-context-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });
    const canonicalInput = buildTurnInput({
      memoryNamespaces: resolveWorkerTurnMemoryNamespaces(config, {
        tenantId: "acct",
        roomKey: "mail:acct:thread:abc",
        agentId: "mail-reviewer"
      })
    });

    expect(() =>
      assertCanonicalMemoryNamespaceDescriptors(config, {
        ...canonicalInput,
        memoryNamespaces: {
          ...canonicalInput.memoryNamespaces!,
          room: {
            ...canonicalInput.memoryNamespaces!.room,
            rootDir: "/tmp/evil-room",
            primaryPath: "/tmp/evil-room/ROOM_MEMORY.md"
          }
        }
      })
    ).toThrow("room memory namespace rootDir must match the canonical workspace");
  });
});
