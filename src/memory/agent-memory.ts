import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { AppConfig } from "../config.js";
import { toSafeStorageFileName, toSafeStoragePathSegment } from "../storage/path-safety.js";
import {
  assertMemoryPromotionTransitionAllowed,
  createMemoryNamespaceRef,
  type MemoryNamespaceRef
} from "./namespace-spec.js";
import {
  getLatestRoomMemorySnapshot,
  ensureRoomMemoryWorkspace,
  loadRoomMemorySnapshot,
  renderRoomMemoryDraftContent
} from "./room-memory.js";

export type AgentMemoryDraftStatus = "pending" | "approved" | "rejected";
export type AgentMemoryDraftSourceKind = "direct" | "room";

export interface AgentMemoryDraft {
  draftId: string;
  tenantId: string;
  agentId: string;
  roomKey: string;
  title: string;
  content: string;
  sourceKind: AgentMemoryDraftSourceKind;
  roomMemoryPath?: string;
  roomSnapshotPath?: string;
  sourceNamespace?: MemoryNamespaceRef;
  targetNamespace?: MemoryNamespaceRef;
  status: AgentMemoryDraftStatus;
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
}

export interface RoomMemoryDraftSource {
  roomKey: string;
  roomMemoryPath: string;
  snapshotPath: string;
}

export interface DefaultMailSkillDescriptor {
  skillId: "mail-read" | "mail-write";
  title: string;
  path: string;
}

export function getTenantStateDir(config: AppConfig, tenantId: string) {
  return path.join(config.storage.stateDir, "tenants", toSafeStoragePathSegment(tenantId, "tenant"));
}

export function getAgentStateDir(config: AppConfig, tenantId: string, agentId: string) {
  return path.join(getTenantStateDir(config, tenantId), "agents", toSafeStoragePathSegment(agentId, "agent"));
}

export function ensureAgentWorkspace(config: AppConfig, tenantId: string, agentId: string) {
  const agentDir = getAgentStateDir(config, tenantId, agentId);
  const rolesDir = path.join(agentDir, "roles");
  const directories = [
    agentDir,
    path.join(agentDir, "memory"),
    rolesDir,
    path.join(agentDir, "auth"),
    path.join(agentDir, "promotions")
  ];

  for (const directory of directories) {
    fs.mkdirSync(directory, { recursive: true });
  }

  ensureMarkdownFile(path.join(agentDir, "SOUL.md"), `# ${agentId} Soul\n`);
  ensureMarkdownFile(path.join(agentDir, "AGENTS.md"), `# ${agentId} Operating Notes\n`);
  ensureMarkdownFile(path.join(agentDir, "MEMORY.md"), `# ${agentId} Memory\n`);
  const defaultSkills = ensureDefaultMailSkills(rolesDir);

  return {
    agentDir,
    soulPath: path.join(agentDir, "SOUL.md"),
    agentsPath: path.join(agentDir, "AGENTS.md"),
    memoryPath: path.join(agentDir, "MEMORY.md"),
    promotionsDir: path.join(agentDir, "promotions"),
    rolesDir,
    defaultSkills
  };
}

export function createAgentMemoryDraft(
  config: AppConfig,
  input: {
    tenantId: string;
    agentId: string;
    roomKey: string;
    title: string;
    content?: string;
    roomMemorySource?: RoomMemoryDraftSource;
    allowLegacyDirectSource?: boolean;
    draftId?: string;
    createdAt?: string;
  }
) {
  const workspace = ensureAgentWorkspace(config, input.tenantId, input.agentId);
  const roomMemorySource = input.roomMemorySource
    ? {
        workspace: ensureRoomMemoryWorkspace(config, input.tenantId, input.roomMemorySource.roomKey),
        snapshot: loadRoomMemorySnapshot(input.roomMemorySource.snapshotPath)
      }
    : null;
  const content =
    roomMemorySource !== null
      ? renderRoomMemoryDraftContent({
          snapshot: roomMemorySource.snapshot,
          roomMemoryPath: input.roomMemorySource?.roomMemoryPath ?? roomMemorySource.workspace.roomMemoryPath,
          snapshotPath: input.roomMemorySource?.snapshotPath ?? ""
        })
      : input.content?.trim();

  if (roomMemorySource === null && !input.allowLegacyDirectSource) {
    throw new Error("memory drafts must be backed by room memory snapshots");
  }

  if (!content) {
    throw new Error(
      roomMemorySource === null
        ? "legacy direct memory draft content is required"
        : "room-backed memory draft content is required"
    );
  }

  const sourceNamespace = roomMemorySource
    ? createMemoryNamespaceRef({
        scope: "room",
        tenantId: input.tenantId,
        roomKey: input.roomKey
      })
    : createMemoryNamespaceRef({
        scope: "scratch",
        tenantId: input.tenantId,
        agentId: input.agentId,
        roomKey: input.roomKey
      });
  const targetNamespace = createMemoryNamespaceRef({
    scope: "agent",
    tenantId: input.tenantId,
    agentId: input.agentId
  });
  if (roomMemorySource !== null || !input.allowLegacyDirectSource) {
    assertMemoryPromotionTransitionAllowed({
      source: sourceNamespace,
      target: targetNamespace
    });
  }

  const draft: AgentMemoryDraft = {
    draftId: input.draftId ?? randomUUID(),
    tenantId: input.tenantId,
    agentId: input.agentId,
    roomKey: input.roomKey,
    title: input.title.trim(),
    content,
    sourceKind: roomMemorySource ? "room" : "direct",
    roomMemoryPath: roomMemorySource ? input.roomMemorySource?.roomMemoryPath ?? roomMemorySource.workspace.roomMemoryPath : undefined,
    roomSnapshotPath: roomMemorySource ? input.roomMemorySource?.snapshotPath : undefined,
    sourceNamespace,
    targetNamespace,
    status: "pending",
    createdAt: input.createdAt ?? new Date().toISOString()
  };

  const draftPath = path.join(workspace.promotionsDir, toSafeStorageFileName(draft.draftId, ".json", "draft"));
  fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2));

  return {
    draft,
    draftPath
  };
}

export function listAgentMemoryDrafts(config: AppConfig, tenantId: string, agentId: string) {
  const workspace = ensureAgentWorkspace(config, tenantId, agentId);
  const files = fs
    .readdirSync(workspace.promotionsDir)
    .filter((entry) => entry.endsWith(".json"))
    .sort();

  return files.map((file) =>
    JSON.parse(fs.readFileSync(path.join(workspace.promotionsDir, file), "utf8")) as AgentMemoryDraft
  );
}

export function findAgentMemoryDraft(config: AppConfig, tenantId: string, agentId: string, draftId: string) {
  const workspace = ensureAgentWorkspace(config, tenantId, agentId);
  const draftPath = path.join(workspace.promotionsDir, toSafeStorageFileName(draftId, ".json", "draft"));

  return {
    draft: loadDraft(draftPath),
    draftPath
  };
}

export function createAgentMemoryDraftFromLatestRoomSnapshot(
  config: AppConfig,
  input: {
    tenantId: string;
    agentId: string;
    roomKey: string;
    title: string;
    draftId?: string;
    createdAt?: string;
  }
) {
  const latestSnapshot = getLatestRoomMemorySnapshot(config, input.tenantId, input.roomKey);
  if (!latestSnapshot) {
    throw new Error(`room memory snapshot not found for ${input.roomKey}`);
  }

  return createAgentMemoryDraft(config, {
    tenantId: input.tenantId,
    agentId: input.agentId,
    roomKey: input.roomKey,
    title: input.title,
    draftId: input.draftId,
    createdAt: input.createdAt,
    roomMemorySource: {
      roomKey: input.roomKey,
      roomMemoryPath: latestSnapshot.workspace.roomMemoryPath,
      snapshotPath: latestSnapshot.snapshotPath
    }
  });
}

export function approveAgentMemoryDraft(
  config: AppConfig,
  input: {
    tenantId: string;
    agentId: string;
    draftId: string;
    approvedAt?: string;
  }
) {
  const workspace = ensureAgentWorkspace(config, input.tenantId, input.agentId);
  const draftPath = path.join(workspace.promotionsDir, toSafeStorageFileName(input.draftId, ".json", "draft"));
  const draft = loadDraft(draftPath);
  const namespaces = resolveAgentMemoryDraftNamespaces(draft);

  if (draft.status !== "pending") {
    throw new Error(`memory draft ${draft.draftId} is not pending`);
  }

  if (!draft.reviewedAt || !draft.reviewedBy) {
    throw new Error(`memory draft ${draft.draftId} is not reviewed`);
  }

  if (draft.sourceKind !== "room") {
    throw new Error(`memory draft ${draft.draftId} must come from room memory`);
  }
  assertMemoryPromotionTransitionAllowed({
    source: namespaces.sourceNamespace,
    target: namespaces.targetNamespace
  });

  const approvedAt = input.approvedAt ?? new Date().toISOString();
  const approvedDraft: AgentMemoryDraft = {
    ...draft,
    ...namespaces,
    status: "approved",
    approvedAt
  };
  fs.writeFileSync(draftPath, JSON.stringify(approvedDraft, null, 2));
  fs.appendFileSync(
    workspace.memoryPath,
    [
      "",
      `## ${draft.title}`,
      `- Source Kind: ${draft.sourceKind}`,
      draft.roomMemoryPath ? `- Source Room Memory: ${draft.roomMemoryPath}` : undefined,
      draft.roomSnapshotPath ? `- Source Room Snapshot: ${draft.roomSnapshotPath}` : undefined,
      `- Source Namespace: ${namespaces.sourceNamespace.namespaceKey}`,
      `- Target Namespace: ${namespaces.targetNamespace.namespaceKey}`,
      `- Reviewed By: ${draft.reviewedBy}`,
      `- Reviewed At: ${draft.reviewedAt}`,
      `- Approved At: ${approvedAt}`,
      `- Source Room: ${draft.roomKey}`,
      "",
      draft.content,
      ""
    ]
      .filter((line) => line !== undefined)
      .join("\n")
  );

  return {
    draft: approvedDraft,
    memoryPath: workspace.memoryPath
  };
}

export function rejectAgentMemoryDraft(
  config: AppConfig,
  input: {
    tenantId: string;
    agentId: string;
    draftId: string;
    rejectedAt?: string;
  }
) {
  const workspace = ensureAgentWorkspace(config, input.tenantId, input.agentId);
  const draftPath = path.join(workspace.promotionsDir, toSafeStorageFileName(input.draftId, ".json", "draft"));
  const draft = loadDraft(draftPath);
  const namespaces = resolveAgentMemoryDraftNamespaces(draft);

  if (draft.status !== "pending") {
    throw new Error(`memory draft ${draft.draftId} is not pending`);
  }

  const rejectedDraft: AgentMemoryDraft = {
    ...draft,
    ...namespaces,
    status: "rejected",
    rejectedAt: input.rejectedAt ?? new Date().toISOString()
  };
  fs.writeFileSync(draftPath, JSON.stringify(rejectedDraft, null, 2));

  return {
    draft: rejectedDraft
  };
}

export function reviewAgentMemoryDraft(
  config: AppConfig,
  input: {
    tenantId: string;
    agentId: string;
    draftId: string;
    reviewedBy: string;
    reviewedAt?: string;
  }
) {
  const workspace = ensureAgentWorkspace(config, input.tenantId, input.agentId);
  const draftPath = path.join(workspace.promotionsDir, toSafeStorageFileName(input.draftId, ".json", "draft"));
  const draft = loadDraft(draftPath);
  const namespaces = resolveAgentMemoryDraftNamespaces(draft);

  if (draft.status !== "pending") {
    throw new Error(`memory draft ${draft.draftId} is not pending`);
  }

  const reviewedDraft: AgentMemoryDraft = {
    ...draft,
    ...namespaces,
    reviewedBy: input.reviewedBy,
    reviewedAt: input.reviewedAt ?? new Date().toISOString()
  };
  fs.writeFileSync(draftPath, JSON.stringify(reviewedDraft, null, 2));

  return {
    draft: reviewedDraft
  };
}

function loadDraft(draftPath: string) {
  if (!fs.existsSync(draftPath)) {
    throw new Error(`memory draft not found: ${path.basename(draftPath, ".json")}`);
  }

  return JSON.parse(fs.readFileSync(draftPath, "utf8")) as AgentMemoryDraft;
}

function ensureDefaultMailSkills(rolesDir: string): DefaultMailSkillDescriptor[] {
  const readSkillPath = path.join(rolesDir, "mail-read.default.md");
  const writeSkillPath = path.join(rolesDir, "mail-write.default.md");

  ensureMarkdownFile(
    readSkillPath,
    [
      "# Default Skill: Mail Read",
      "",
      "- Read the latest inbound first, then pull older context only by reference.",
      "- Treat subject as display metadata, not continuity authority.",
      "- Prefer room facts, artifacts, and evidence refs over free-form transcript recall.",
      "- Surface ambiguities, missing facts, and trust/policy risks explicitly.",
      "- Never treat hidden recipients, secrets, or provider credentials as readable context."
    ].join("\n") + "\n"
  );
  ensureMarkdownFile(
    writeSkillPath,
    [
      "# Default Skill: Mail Write",
      "",
      "- Write replies that are RFC-safe, concise, and thread-correct.",
      "- Preserve ACK / progress / final semantics instead of collapsing them.",
      "- Only state facts that are supported by room facts, artifacts, or approved memory.",
      "- Do not leak internal review/governance content or hidden recipients.",
      "- External side effects still go through approval and outbox, never direct send."
    ].join("\n") + "\n"
  );

  return [
    {
      skillId: "mail-read",
      title: "Default Skill: Mail Read",
      path: readSkillPath
    },
    {
      skillId: "mail-write",
      title: "Default Skill: Mail Write",
      path: writeSkillPath
    }
  ];
}

export function resolveAgentMemoryDraftNamespaces(draft: Pick<
  AgentMemoryDraft,
  "tenantId" | "agentId" | "roomKey" | "sourceKind" | "sourceNamespace" | "targetNamespace"
>) {
  return {
    sourceNamespace:
      draft.sourceNamespace ??
      createMemoryNamespaceRef(
        draft.sourceKind === "room"
          ? {
              scope: "room",
              tenantId: draft.tenantId,
              roomKey: draft.roomKey
            }
          : {
              scope: "scratch",
              tenantId: draft.tenantId,
              agentId: draft.agentId,
              roomKey: draft.roomKey
            }
      ),
    targetNamespace:
      draft.targetNamespace ??
      createMemoryNamespaceRef({
        scope: "agent",
        tenantId: draft.tenantId,
        agentId: draft.agentId
      })
  };
}

function ensureMarkdownFile(filePath: string, contents: string) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, contents, "utf8");
  }
}
