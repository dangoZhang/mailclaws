import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import {
  evaluateMemoryManagementAccess,
  createMemoryNamespaceSpec,
  evaluateMemoryPromotionTransition,
  getMemoryNamespaceKey
} from "../src/memory/namespace-spec.js";
import {
  ensureAgentScratchWorkspace,
  ensureUserMemoryWorkspace,
  readMemoryNamespace,
  resolveOrchestratorTurnMemoryNamespaces,
  resolveWorkerTurnMemoryNamespaces,
  resolveMemoryNamespace
} from "../src/memory/namespaces.js";
import { captureRoomMemorySnapshot } from "../src/memory/room-memory.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createConfig() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-memory-ns-"));
  tempDirs.push(tempDir);

  return loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
  });
}

describe("memory namespaces", () => {
  it("creates separate user and scratch workspaces", () => {
    const config = createConfig();

    const userWorkspace = ensureUserMemoryWorkspace(config, "tenant-a", "user@example.com");
    const scratchWorkspace = ensureAgentScratchWorkspace(config, {
      tenantId: "tenant-a",
      agentId: "assistant",
      roomKey: "mail:tenant-a:thread:room-1",
      createdAt: "2026-03-25T00:00:00.000Z",
      ttlMs: 60_000
    });

    expect(userWorkspace.memoryPath).toContain("/tenants/tenant-a/users/");
    expect(userWorkspace.memoryPath).toContain("/USER_MEMORY.md");
    expect(scratchWorkspace.scratchPath).toContain("/tenants/tenant-a/agents/assistant/scratch/");
    expect(JSON.parse(fs.readFileSync(scratchWorkspace.metadataPath, "utf8"))).toMatchObject({
      roomKey: "mail:tenant-a:thread:room-1",
      expiresAt: "2026-03-25T00:01:00.000Z"
    });

    const initialMetadata = JSON.parse(fs.readFileSync(scratchWorkspace.metadataPath, "utf8")) as {
      createdAt: string;
      expiresAt: string;
    };
    const scratchNamespace = readMemoryNamespace(
      config,
      createMemoryNamespaceSpec("scratch", {
        tenantId: "tenant-a",
        agentId: "assistant",
        roomKey: "mail:tenant-a:thread:room-1"
      }),
      {
        actor: {
          kind: "operator"
        }
      }
    );

    expect(scratchNamespace.namespaceKey).toBe(
      "scratch:tenant-a:assistant:mail:tenant-a:thread:room-1"
    );
    expect(scratchNamespace.capabilities).toMatchObject({
      storesMetadata: true,
      isEphemeral: true,
      canSourcePromotionDrafts: false,
      canReceiveApprovedPromotions: false
    });
    expect(scratchNamespace.metadata).toMatchObject(initialMetadata);
    expect(JSON.parse(fs.readFileSync(scratchWorkspace.metadataPath, "utf8"))).toMatchObject(initialMetadata);
  });

  it("requires explicit scope when resolving memory namespaces", () => {
    const config = createConfig();
    captureRoomMemorySnapshot(config, {
      tenantId: "tenant-a",
      roomKey: "mail:tenant-a:thread:room-1",
      title: "Room",
      summary: "Scoped room summary.",
      facts: ["Scoped fact."],
      openQuestions: [],
      snapshotId: "snapshot-1",
      createdAt: "2026-03-25T00:00:00.000Z"
    });

    const roomSpec = createMemoryNamespaceSpec("room", {
      tenantId: "tenant-a",
      roomKey: "mail:tenant-a:thread:room-1"
    });
    const roomNamespace = readMemoryNamespace(config, roomSpec);
    const agentSpec = createMemoryNamespaceSpec("agent", {
      tenantId: "tenant-a",
      agentId: "assistant"
    });
    const agentNamespace = resolveMemoryNamespace(config, agentSpec);

    expect(roomNamespace.scope).toBe("room");
    expect(roomNamespace.namespaceKey).toBe(getMemoryNamespaceKey(roomSpec));
    expect(roomNamespace.capabilities).toMatchObject({
      canSourcePromotionDrafts: true,
      canReceiveApprovedPromotions: false,
      supportsSnapshotPaths: true
    });
    expect(roomNamespace.content).toContain("Scoped room summary.");
    expect(agentNamespace.namespaceKey).toBe(getMemoryNamespaceKey(agentSpec));
    expect(agentNamespace.capabilities).toMatchObject({
      canSourcePromotionDrafts: false,
      canReceiveApprovedPromotions: true,
      isEphemeral: false
    });
    expect(agentNamespace.primaryPath).toContain("/tenants/tenant-a/agents/assistant/MEMORY.md");
    expect(agentNamespace.primaryPath).not.toBe(roomNamespace.primaryPath);
  });

  it("requires explicit operator access for user and scratch memory reads", () => {
    const config = createConfig();
    ensureUserMemoryWorkspace(config, "tenant-a", "user@example.com");
    ensureAgentScratchWorkspace(config, {
      tenantId: "tenant-a",
      agentId: "assistant",
      roomKey: "mail:tenant-a:thread:room-1"
    });

    expect(() =>
      readMemoryNamespace(
        config,
        createMemoryNamespaceSpec("scratch", {
          tenantId: "tenant-a",
          agentId: "assistant",
          roomKey: "mail:tenant-a:thread:room-1"
        })
      )
    ).toThrow("explicit operator access is required for scratch memory");

    expect(() =>
      readMemoryNamespace(
        config,
        createMemoryNamespaceSpec("user", {
          tenantId: "tenant-a",
          userId: "user@example.com"
        })
      )
    ).toThrow("explicit operator access is required for user memory");
  });

  it("resolves bounded executor turn namespaces without user memory", () => {
    const config = createConfig();

    const orchestratorNamespaces = resolveOrchestratorTurnMemoryNamespaces(config, {
      tenantId: "tenant-a",
      roomKey: "mail:tenant-a:thread:room-1",
      agentId: "mail"
    });
    const workerNamespaces = resolveWorkerTurnMemoryNamespaces(config, {
      tenantId: "tenant-a",
      roomKey: "mail:tenant-a:thread:room-1",
      agentId: "mail-researcher"
    });

    expect(orchestratorNamespaces).toMatchObject({
      room: {
        namespaceKey: "room:tenant-a:mail:tenant-a:thread:room-1"
      },
      agent: {
        namespaceKey: "agent:tenant-a:mail"
      }
    });
    expect(orchestratorNamespaces.scratch).toBeUndefined();
    expect(workerNamespaces).toMatchObject({
      room: {
        namespaceKey: "room:tenant-a:mail:tenant-a:thread:room-1"
      },
      agent: {
        namespaceKey: "agent:tenant-a:mail-researcher"
      },
      scratch: {
        namespaceKey: "scratch:tenant-a:mail-researcher:mail:tenant-a:thread:room-1"
      }
    });
    expect(workerNamespaces.room.primaryPath).toContain("/tenants/tenant-a/rooms/");
    expect(workerNamespaces.agent.primaryPath).toContain("/tenants/tenant-a/agents/mail-researcher/MEMORY.md");
    expect(workerNamespaces.scratch?.primaryPath).toContain("/tenants/tenant-a/agents/mail-researcher/scratch/");
  });

  it("can attach a user namespace to orchestrator turns without exposing it to worker turns", () => {
    const config = createConfig();

    const orchestratorNamespaces = resolveOrchestratorTurnMemoryNamespaces(config, {
      tenantId: "tenant-a",
      roomKey: "mail:tenant-a:thread:room-2",
      agentId: "mail",
      userId: "email:user@example.com"
    });
    const workerNamespaces = resolveWorkerTurnMemoryNamespaces(config, {
      tenantId: "tenant-a",
      roomKey: "mail:tenant-a:thread:room-2",
      agentId: "mail-researcher"
    });

    expect(orchestratorNamespaces.user).toMatchObject({
      scope: "user",
      namespaceKey: "user:tenant-a:email:user@example.com"
    });
    expect(orchestratorNamespaces.user?.primaryPath).toContain("/tenants/tenant-a/users/");
    expect(workerNamespaces.user).toBeUndefined();
  });

  it("only allows room to agent promotion transitions", () => {
    const allowed = evaluateMemoryPromotionTransition({
      source: {
        scope: "room",
        tenantId: "tenant-a",
        roomKey: "mail:tenant-a:thread:room-1",
        namespaceKey: "room:tenant-a:mail:tenant-a:thread:room-1"
      },
      target: {
        scope: "agent",
        tenantId: "tenant-a",
        agentId: "assistant",
        namespaceKey: "agent:tenant-a:assistant"
      }
    });
    const denied = evaluateMemoryPromotionTransition({
      source: {
        scope: "scratch",
        tenantId: "tenant-a",
        agentId: "assistant",
        roomKey: "mail:tenant-a:thread:room-1",
        namespaceKey: "scratch:tenant-a:assistant:mail:tenant-a:thread:room-1"
      },
      target: {
        scope: "agent",
        tenantId: "tenant-a",
        agentId: "assistant",
        namespaceKey: "agent:tenant-a:assistant"
      }
    });

    expect(allowed).toMatchObject({
      allowed: true
    });
    expect(denied).toMatchObject({
      allowed: false
    });
    expect(denied.reason).toContain("only room -> agent promotion is allowed");
  });

  it("requires same-agent room context for draft creation and operator access for review/approval", () => {
    const createAllowed = evaluateMemoryManagementAccess({
      action: "create_memory_draft",
      tenantId: "tenant-a",
      agentId: "assistant",
      roomKey: "mail:tenant-a:thread:room-1",
      actor: {
        kind: "agent",
        tenantId: "tenant-a",
        agentId: "assistant",
        roomKey: "mail:tenant-a:thread:room-1"
      }
    });
    const createDenied = evaluateMemoryManagementAccess({
      action: "create_memory_draft",
      tenantId: "tenant-a",
      agentId: "assistant",
      roomKey: "mail:tenant-a:thread:room-1",
      actor: {
        kind: "agent",
        tenantId: "tenant-a",
        agentId: "assistant",
        roomKey: "mail:tenant-a:thread:room-2"
      }
    });
    const approveDenied = evaluateMemoryManagementAccess({
      action: "approve_memory_draft",
      tenantId: "tenant-a",
      agentId: "assistant",
      actor: {
        kind: "agent",
        tenantId: "tenant-a",
        agentId: "assistant",
        roomKey: "mail:tenant-a:thread:room-1"
      }
    });
    const approveAllowed = evaluateMemoryManagementAccess({
      action: "approve_memory_draft",
      tenantId: "tenant-a",
      agentId: "assistant",
      actor: {
        kind: "operator"
      }
    });

    expect(createAllowed).toMatchObject({
      allowed: true
    });
    expect(createDenied).toMatchObject({
      allowed: false
    });
    expect(createDenied.reason).toContain("room mismatch");
    expect(approveDenied).toMatchObject({
      allowed: false
    });
    expect(approveDenied.reason).toContain("requires explicit operator access");
    expect(approveAllowed).toMatchObject({
      allowed: true
    });
  });
});
