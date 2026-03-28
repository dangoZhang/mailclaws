import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import {
  approveAgentMemoryDraft,
  createAgentMemoryDraft,
  createAgentMemoryDraftFromLatestRoomSnapshot,
  ensureAgentWorkspace,
  getAgentStateDir,
  listAgentMemoryDrafts,
  reviewAgentMemoryDraft,
  rejectAgentMemoryDraft
} from "../src/memory/agent-memory.js";
import {
  captureRoomMemorySnapshot,
  ensureRoomMemoryWorkspace,
  getRoomStateDir
} from "../src/memory/room-memory.js";
import { toSafeStorageFileName, toSafeStoragePathSegment } from "../src/storage/path-safety.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("agent memory workspace", () => {
  it("creates a durable room memory workspace separate from agent memory", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-room-memory-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const workspace = ensureRoomMemoryWorkspace(config, "tenant-a", "mail:tenant-a:thread:room-1");
    const snapshot = captureRoomMemorySnapshot(config, {
      tenantId: "tenant-a",
      roomKey: "mail:tenant-a:thread:room-1",
      title: "Room digest",
      summary: "Customer asked for the latest policy recap.",
      facts: ["Policy requires review before approval."],
      openQuestions: ["Is the customer asking about pricing or support?"],
      createdAt: "2026-03-25T00:00:00.000Z",
      snapshotId: "snapshot-1"
    });

    expect(workspace.roomDir).toBe(getRoomStateDir(config, "tenant-a", "mail:tenant-a:thread:room-1"));
    expect(fs.existsSync(workspace.roomMemoryPath)).toBe(true);
    expect(fs.existsSync(workspace.sharedDigestPath)).toBe(true);
    expect(fs.existsSync(workspace.sharedFactsPath)).toBe(true);
    expect(fs.existsSync(workspace.snapshotsDir)).toBe(true);
    expect(fs.readFileSync(workspace.roomMemoryPath, "utf8")).toContain("Room digest");
    expect(fs.readFileSync(snapshot.snapshotPath, "utf8")).toContain("Policy requires review before approval.");
  });

  it("creates promotion drafts from room memory snapshots instead of direct room facts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-room-memory-draft-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const roomWorkspace = ensureRoomMemoryWorkspace(config, "tenant-a", "mail:tenant-a:thread:room-2");
    const snapshot = captureRoomMemorySnapshot(config, {
      tenantId: "tenant-a",
      roomKey: "mail:tenant-a:thread:room-2",
      title: "Reusable policy",
      summary: "Room memory summary about approval flow.",
      facts: ["Approval requires a human reviewer."],
      openQuestions: ["Should this be promoted to agent memory?"],
      createdAt: "2026-03-25T00:00:00.000Z",
      snapshotId: "snapshot-2"
    });

    const created = createAgentMemoryDraft(config, {
      tenantId: "tenant-a",
      agentId: "assistant",
      roomKey: "mail:tenant-a:thread:room-2",
      title: "Reusable policy",
      roomMemorySource: {
        roomKey: "mail:tenant-a:thread:room-2",
        roomMemoryPath: roomWorkspace.roomMemoryPath,
        snapshotPath: snapshot.snapshotPath
      },
      draftId: "draft-1",
      createdAt: "2026-03-25T00:01:00.000Z"
    });
    const reviewed = reviewAgentMemoryDraft(config, {
      tenantId: "tenant-a",
      agentId: "assistant",
      draftId: "draft-1",
      reviewedBy: "reviewer@example.com",
      reviewedAt: "2026-03-25T00:01:30.000Z"
    });
    const approved = approveAgentMemoryDraft(config, {
      tenantId: "tenant-a",
      agentId: "assistant",
      draftId: "draft-1",
      approvedAt: "2026-03-25T00:02:00.000Z"
    });

    expect(created.draft.sourceKind).toBe("room");
    expect(created.draft.roomMemoryPath).toBe(roomWorkspace.roomMemoryPath);
    expect(created.draft.roomSnapshotPath).toBe(snapshot.snapshotPath);
    expect(created.draft.sourceNamespace).toMatchObject({
      scope: "room",
      namespaceKey: "room:tenant-a:mail:tenant-a:thread:room-2"
    });
    expect(created.draft.targetNamespace).toMatchObject({
      scope: "agent",
      namespaceKey: "agent:tenant-a:assistant"
    });
    expect(created.draft.content).toContain("Approval requires a human reviewer.");
    expect(reviewed.draft.reviewedBy).toBe("reviewer@example.com");
    expect(approved.draft.status).toBe("approved");
    expect(fs.readFileSync(path.join(getAgentStateDir(config, "tenant-a", "assistant"), "MEMORY.md"), "utf8")).toContain(
      roomWorkspace.roomMemoryPath
    );
    expect(fs.readFileSync(path.join(getAgentStateDir(config, "tenant-a", "assistant"), "MEMORY.md"), "utf8")).toContain(
      "Source Namespace: room:tenant-a:mail:tenant-a:thread:room-2"
    );
  });

  it("requires room-backed drafts before entering the normal promotion workflow", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-agent-memory-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const workspace = ensureAgentWorkspace(config, "tenant-a", "assistant");
    const snapshot = captureRoomMemorySnapshot(config, {
      tenantId: "tenant-a",
      roomKey: "mail:tenant-a:thread:room-1",
      title: "Reusable policy",
      summary: "Room-backed summary.",
      facts: ["Never promise contractual pricing without approval."],
      openQuestions: [],
      createdAt: "2026-03-25T00:00:00.000Z",
      snapshotId: "snapshot-3"
    });
    expect(() =>
      createAgentMemoryDraft(config, {
        tenantId: "tenant-a",
        agentId: "assistant",
        roomKey: "mail:tenant-a:thread:room-1",
        title: "Ad hoc policy",
        content: "Ad hoc note that should stay outside MEMORY.md.",
        draftId: "draft-direct",
        createdAt: "2026-03-25T00:00:00.000Z"
      })
    ).toThrow("memory drafts must be backed by room memory snapshots");
    const created = createAgentMemoryDraft(config, {
      tenantId: "tenant-a",
      agentId: "assistant",
      roomKey: "mail:tenant-a:thread:room-1",
      title: "Ad hoc policy",
      content: "Ad hoc note that should stay outside MEMORY.md.",
      allowLegacyDirectSource: true,
      draftId: "draft-direct",
      createdAt: "2026-03-25T00:00:00.000Z"
    });
    const reviewedDirect = reviewAgentMemoryDraft(config, {
      tenantId: "tenant-a",
      agentId: "assistant",
      draftId: "draft-direct",
      reviewedBy: "reviewer@example.com",
      reviewedAt: "2026-03-25T00:00:30.000Z"
    });
    expect(() =>
      approveAgentMemoryDraft(config, {
        tenantId: "tenant-a",
        agentId: "assistant",
        draftId: "draft-direct",
        approvedAt: "2026-03-25T00:01:00.000Z"
      })
    ).toThrow("must come from room memory");
    const roomDraft = createAgentMemoryDraftFromLatestRoomSnapshot(config, {
      tenantId: "tenant-a",
      agentId: "assistant",
      roomKey: "mail:tenant-a:thread:room-1",
      title: "Reusable policy",
      draftId: "draft-room",
      createdAt: "2026-03-25T00:00:00.000Z"
    });
    expect(() =>
      approveAgentMemoryDraft(config, {
        tenantId: "tenant-a",
        agentId: "assistant",
        draftId: "draft-room",
        approvedAt: "2026-03-25T00:01:00.000Z"
      })
    ).toThrow("is not reviewed");
    const reviewed = reviewAgentMemoryDraft(config, {
      tenantId: "tenant-a",
      agentId: "assistant",
      draftId: "draft-room",
      reviewedBy: "reviewer@example.com",
      reviewedAt: "2026-03-25T00:00:30.000Z"
    });
    const approved = approveAgentMemoryDraft(config, {
      tenantId: "tenant-a",
      agentId: "assistant",
      draftId: "draft-room",
      approvedAt: "2026-03-25T00:01:00.000Z"
    });

    expect(workspace.agentDir).toBe(getAgentStateDir(config, "tenant-a", "assistant"));
    expect(fs.existsSync(workspace.soulPath)).toBe(true);
    expect(fs.existsSync(workspace.agentsPath)).toBe(true);
    expect(fs.existsSync(workspace.memoryPath)).toBe(true);
    expect(created.draftPath).toContain("/tenants/tenant-a/agents/assistant/promotions/");
    expect(created.draft.sourceNamespace).toMatchObject({
      scope: "scratch",
      namespaceKey: "scratch:tenant-a:assistant:mail:tenant-a:thread:room-1"
    });
    expect(created.draft.targetNamespace).toMatchObject({
      scope: "agent",
      namespaceKey: "agent:tenant-a:assistant"
    });
    expect(reviewedDirect.draft.reviewedBy).toBe("reviewer@example.com");
    expect(roomDraft.draft.roomSnapshotPath).toBe(snapshot.snapshotPath);
    expect(roomDraft.draft.sourceNamespace).toMatchObject({
      scope: "room",
      namespaceKey: "room:tenant-a:mail:tenant-a:thread:room-1"
    });
    expect(reviewed.draft.reviewedBy).toBe("reviewer@example.com");
    expect(approved.draft.status).toBe("approved");
    expect(fs.readFileSync(workspace.memoryPath, "utf8")).toContain("Reusable policy");
    expect(fs.readFileSync(workspace.memoryPath, "utf8")).toContain("mail:tenant-a:thread:room-1");
    expect(fs.readFileSync(workspace.memoryPath, "utf8")).toContain("Target Namespace: agent:tenant-a:assistant");
    expect(fs.readFileSync(workspace.memoryPath, "utf8")).not.toContain("Ad hoc policy");
  });

  it("creates default mail read/write skill files in every agent workspace", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-agent-memory-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const workspace = ensureAgentWorkspace(config, "tenant-b", "research");

    expect(workspace.defaultSkills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skillId: "mail-read",
          path: expect.stringContaining("/roles/mail-read.default.md")
        }),
        expect.objectContaining({
          skillId: "mail-write",
          path: expect.stringContaining("/roles/mail-write.default.md")
        })
      ])
    );
    expect(fs.readFileSync(path.join(workspace.rolesDir, "mail-read.default.md"), "utf8")).toContain(
      "Default Skill: Mail Read"
    );
    expect(fs.readFileSync(path.join(workspace.rolesDir, "mail-write.default.md"), "utf8")).toContain(
      "Default Skill: Mail Write"
    );
  });

  it("sanitizes tenant, agent, room, and draft path segments before writing to disk", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-agent-memory-safe-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const tenantId = "../tenant-a";
    const agentId = "../../assistant";
    const roomKey = "../mail:tenant-a:thread:room-unsafe";
    const draftId = "../draft-unsafe";
    const workspace = ensureAgentWorkspace(config, tenantId, agentId);
    const roomWorkspace = ensureRoomMemoryWorkspace(config, tenantId, roomKey);
    const snapshot = captureRoomMemorySnapshot(config, {
      tenantId,
      roomKey,
      title: "Sanitized snapshot",
      summary: "Summary",
      facts: ["Fact"],
      openQuestions: [],
      snapshotId: "../snapshot-unsafe"
    });
    const created = createAgentMemoryDraft(config, {
      tenantId,
      agentId,
      roomKey,
      title: "Sanitized draft",
      roomMemorySource: {
        roomKey,
        roomMemoryPath: roomWorkspace.roomMemoryPath,
        snapshotPath: snapshot.snapshotPath
      },
      draftId
    });

    expect(workspace.agentDir).toContain(
      `/tenants/${toSafeStoragePathSegment(tenantId, "tenant")}/agents/${toSafeStoragePathSegment(agentId, "agent")}`
    );
    expect(roomWorkspace.roomDir).toContain(`/rooms/${toSafeStoragePathSegment(roomKey, "room")}`);
    expect(snapshot.snapshotPath).toContain(toSafeStorageFileName("../snapshot-unsafe", ".json", "snapshot"));
    expect(created.draftPath).toContain(toSafeStorageFileName(draftId, ".json", "draft"));
    expect(path.relative(tempDir, created.draftPath)).not.toContain("..");
    expect(path.relative(tempDir, roomWorkspace.roomDir)).not.toContain("..");
  });

  it("lists and rejects pending drafts without touching MEMORY.md", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-agent-memory-reject-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    ensureAgentWorkspace(config, "tenant-b", "research");
    createAgentMemoryDraft(config, {
      tenantId: "tenant-b",
      agentId: "research",
      roomKey: "mail:tenant-b:thread:room-2",
      title: "Too specific",
      content: "Customer-specific pricing memo.",
      allowLegacyDirectSource: true,
      draftId: "draft-2",
      createdAt: "2026-03-25T00:00:00.000Z"
    });

    const listed = listAgentMemoryDrafts(config, "tenant-b", "research");
    const rejected = rejectAgentMemoryDraft(config, {
      tenantId: "tenant-b",
      agentId: "research",
      draftId: "draft-2",
      rejectedAt: "2026-03-25T00:02:00.000Z"
    });

    expect(listed).toHaveLength(1);
    expect(rejected.draft.status).toBe("rejected");
    expect(fs.readFileSync(path.join(getAgentStateDir(config, "tenant-b", "research"), "MEMORY.md"), "utf8")).not.toContain(
      "Too specific"
    );
  });
});
