import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { AppConfig } from "../config.js";
import type { AgentDirectoryEntry } from "../agents/templates.js";
import { buildAgentVirtualMailboxIds } from "../agents/templates.js";
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
  skillId: "read-email" | "write-email";
  title: string;
  path: string;
}

export interface AgentSkillDescriptor {
  skillId: string;
  title: string;
  path: string;
  source: "default" | "managed";
  sourceRef?: string;
}

export interface AgentWorkspaceProfile {
  displayName?: string;
  purpose?: string;
  publicMailboxId?: string;
  sourceAlignment?: string;
  sourceRefs?: string[];
  roleContract?: string[];
  collaboratorAgentIds?: string[];
  collaboratorNotes?: Array<{
    agentId: string;
    reason: string;
  }>;
  templateId?: string;
  headcountNotes?: string[];
}

export function getTenantStateDir(config: AppConfig, tenantId: string) {
  return path.join(config.storage.stateDir, "tenants", toSafeStoragePathSegment(tenantId, "tenant"));
}

export function getTenantAgentDirectoryPath(config: AppConfig, tenantId: string) {
  return path.join(getTenantStateDir(config, tenantId), "AGENT_DIRECTORY.md");
}

export function getAgentStateDir(config: AppConfig, tenantId: string, agentId: string) {
  return path.join(getTenantStateDir(config, tenantId), "agents", toSafeStoragePathSegment(agentId, "agent"));
}

export function ensureAgentWorkspace(
  config: AppConfig,
  tenantId: string,
  agentId: string,
  options?: {
    profile?: AgentWorkspaceProfile;
    directoryEntries?: AgentDirectoryEntry[];
  }
) {
  const agentDir = getAgentStateDir(config, tenantId, agentId);
  const rolesDir = path.join(agentDir, "roles");
  const skillsDir = path.join(agentDir, "skills");
  const directories = [
    agentDir,
    path.join(agentDir, "memory"),
    rolesDir,
    skillsDir,
    path.join(agentDir, "auth"),
    path.join(agentDir, "promotions")
  ];

  for (const directory of directories) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const soulPath = path.join(agentDir, "SOUL.md");
  const agentsPath = path.join(agentDir, "AGENTS.md");
  const memoryPath = path.join(agentDir, "MEMORY.md");
  const defaultSkills = ensureDefaultMailSkills(rolesDir);
  const profile = buildAgentWorkspaceProfile(agentId, options?.profile);

  ensureGeneratedMarkdownFile(
    soulPath,
    renderAgentSoulMarkdown({
      agentId,
      profile,
      defaultSkills
    })
  );
  ensureGeneratedMarkdownFile(
    agentsPath,
    renderAgentOperatingNotesMarkdown({
      agentId,
      profile,
      directoryEntries: options?.directoryEntries ?? [],
      defaultSkills
    })
  );
  ensureMarkdownFile(path.join(agentDir, "MEMORY.md"), `# ${agentId} Memory\n`);
  if (options?.directoryEntries && options.directoryEntries.length > 0) {
    writeTenantAgentDirectory(config, tenantId, options.directoryEntries);
  }

  return {
    agentDir,
    soulPath,
    agentsPath,
    memoryPath,
    directoryPath: getTenantAgentDirectoryPath(config, tenantId),
    promotionsDir: path.join(agentDir, "promotions"),
    rolesDir,
    skillsDir,
    defaultSkills
  };
}

export function listAgentWorkspaceSkills(
  config: AppConfig,
  tenantId: string,
  agentId: string
) {
  const workspace = ensureAgentWorkspace(config, tenantId, agentId);
  const managedSkills = fs
    .readdirSync(workspace.skillsDir)
    .filter((entry) => entry.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => describeSkillMarkdown(path.join(workspace.skillsDir, entry), "managed"));

  return [
    ...workspace.defaultSkills.map((skill) => ({
      skillId: skill.skillId,
      title: skill.title,
      path: skill.path,
      source: "default" as const
    })),
    ...managedSkills
  ];
}

export function getAgentWorkspaceSkill(
  config: AppConfig,
  tenantId: string,
  agentId: string,
  skillId: string
) {
  const skills = listAgentWorkspaceSkills(config, tenantId, agentId);
  const normalizedSkillId = skillId.trim().toLowerCase();
  const skill = skills.find((entry) => entry.skillId === normalizedSkillId);
  if (!skill) {
    throw new Error(`skill not found: ${skillId}`);
  }

  return {
    skill,
    content: fs.readFileSync(skill.path, "utf8")
  };
}

export async function installAgentWorkspaceSkill(
  config: AppConfig,
  input: {
    tenantId: string;
    agentId: string;
    source: string;
    skillId?: string;
    title?: string;
    now?: string;
  }
) {
  const workspace = ensureAgentWorkspace(config, input.tenantId, input.agentId);
  const installedAt = input.now ?? new Date().toISOString();
  const source = input.source.trim();
  if (!source) {
    throw new Error("skill source is required");
  }

  const resolved = await loadSkillSource(source);
  const skillId = normalizeManagedSkillId(input.skillId ?? deriveSkillIdFromSource(source, resolved.content));
  if (!skillId) {
    throw new Error("unable to derive a skill id from the provided source");
  }

  const title = deriveSkillTitle(input.title, resolved.content, skillId);
  const destinationPath = path.join(workspace.skillsDir, toSafeStorageFileName(skillId, ".md", "skill"));
  const metadata = {
    skillId,
    title,
    sourceRef: source,
    installedAt
  };

  const contents = wrapManagedSkillMarkdown(metadata, resolved.content);
  fs.writeFileSync(destinationPath, contents, "utf8");

  return describeSkillMarkdown(destinationPath, "managed");
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
  const readSkillPath = path.join(rolesDir, "read-email.default.md");
  const writeSkillPath = path.join(rolesDir, "write-email.default.md");

  ensureMarkdownFile(
    readSkillPath,
    [
      "# Default Skill: Read Email",
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
      "# Default Skill: Write Email",
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
      skillId: "read-email",
      title: "Default Skill: Read Email",
      path: readSkillPath
    },
    {
      skillId: "write-email",
      title: "Default Skill: Write Email",
      path: writeSkillPath
    }
  ];
}

function describeSkillMarkdown(skillPath: string, source: "managed"): AgentSkillDescriptor {
  const content = fs.readFileSync(skillPath, "utf8");
  const metadata = parseManagedSkillMetadata(content);
  const skillId =
    normalizeManagedSkillId(typeof metadata?.skillId === "string" ? metadata.skillId : undefined) ??
    normalizeManagedSkillId(path.basename(skillPath, path.extname(skillPath))) ??
    "skill";
  const title = deriveSkillTitle(typeof metadata?.title === "string" ? metadata.title : undefined, content, skillId);

  return {
    skillId,
    title,
    path: skillPath,
    source,
    ...(typeof metadata?.sourceRef === "string" && metadata.sourceRef.trim().length > 0
      ? { sourceRef: metadata.sourceRef.trim() }
      : {})
  };
}

function parseManagedSkillMetadata(content: string) {
  const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const match = firstLine.match(/^<!--\s*mailclaws-skill:\s*(\{.*\})\s*-->$/);
  if (!match) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[1] ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function wrapManagedSkillMarkdown(
  metadata: {
    skillId: string;
    title: string;
    sourceRef: string;
    installedAt: string;
  },
  content: string
) {
  const normalizedContent = content.endsWith("\n") ? content : `${content}\n`;
  return `<!-- mailclaws-skill: ${JSON.stringify(metadata)} -->\n\n${normalizedContent}`;
}

async function loadSkillSource(source: string) {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`failed to download skill from ${source}: ${response.status} ${response.statusText}`);
    }

    return {
      source,
      content: await response.text()
    };
  }

  const resolvedPath = path.resolve(source);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`skill source not found: ${source}`);
  }
  if (fs.statSync(resolvedPath).isDirectory()) {
    throw new Error(`skill source must be a markdown file, received directory: ${source}`);
  }

  return {
    source: resolvedPath,
    content: fs.readFileSync(resolvedPath, "utf8")
  };
}

function deriveSkillIdFromSource(source: string, content: string) {
  const heading = readMarkdownTitle(content);
  if (heading) {
    return heading;
  }

  return path.basename(source, path.extname(source));
}

function deriveSkillTitle(candidate: string | unknown, content: string, fallbackSkillId: string) {
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate.trim();
  }

  return readMarkdownTitle(content) ?? fallbackSkillId;
}

function readMarkdownTitle(content: string) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("<!--")) {
      continue;
    }
    if (trimmed.startsWith("#")) {
      return trimmed.replace(/^#+\s*/, "").trim() || null;
    }
    break;
  }

  return null;
}

function normalizeManagedSkillId(value?: string) {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function buildAgentWorkspaceProfile(agentId: string, profile?: AgentWorkspaceProfile): Required<AgentWorkspaceProfile> {
  return {
    displayName: profile?.displayName?.trim() || agentId,
    purpose:
      profile?.purpose?.trim() ||
      "Hold a durable MailClaws role and long-term memory; keep rooms as working memory and collaborate through virtual mail.",
    publicMailboxId: profile?.publicMailboxId?.trim() || `public:${agentId}`,
    sourceAlignment: profile?.sourceAlignment?.trim() || "",
    sourceRefs: profile?.sourceRefs?.filter((entry) => entry.trim().length > 0) ?? [],
    roleContract: profile?.roleContract?.filter((entry) => entry.trim().length > 0) ?? [],
    collaboratorAgentIds: profile?.collaboratorAgentIds ?? [],
    collaboratorNotes: profile?.collaboratorNotes ?? [],
    templateId: profile?.templateId?.trim() || "custom",
    headcountNotes:
      profile?.headcountNotes?.length && profile.headcountNotes.some((note) => note.trim().length > 0)
        ? profile.headcountNotes
        : ["Treat the room as working memory: triage the latest state, delegate by mail, and only persist reusable Pre."]
  };
}

function renderAgentSoulMarkdown(input: {
  agentId: string;
  profile: Required<AgentWorkspaceProfile>;
  defaultSkills: DefaultMailSkillDescriptor[];
}) {
  const mailboxes = buildAgentVirtualMailboxIds(input.agentId, input.profile.publicMailboxId);

  return [
    `# ${input.profile.displayName} Soul`,
    "",
    `Agent ID: \`${input.agentId}\``,
    `Template: \`${input.profile.templateId}\``,
    "",
    "## Mission",
    input.profile.purpose,
    "",
    "## Durable Mailboxes",
    "These are stable routing identities. Active working context stays in rooms, and room-scoped working mailboxes are created from these roles when needed.",
    ...mailboxes.map((mailboxId) => `- \`${mailboxId}\``),
    "",
    "## Collaboration",
    ...(input.profile.collaboratorNotes.length > 0
      ? input.profile.collaboratorNotes.map(
          (note) => `- Ask \`${note.agentId}\` when ${note.reason.replace(/\.$/, "")}.`
        )
      : ["- Work from the room's latest Pre, then ask collaborators by internal mail when evidence or review is needed."]),
    "",
    ...(input.profile.sourceAlignment || input.profile.sourceRefs.length > 0
      ? [
          "## Upstream Alignment",
          ...(input.profile.sourceAlignment ? [input.profile.sourceAlignment, ""] : []),
          ...(input.profile.sourceRefs.length > 0
            ? [...input.profile.sourceRefs.map((ref) => `- ${ref}`), ""]
            : [])
        ]
      : []),
    ...(input.profile.roleContract.length > 0
      ? ["## Role Contract", ...input.profile.roleContract.map((entry) => `- ${entry}`), ""]
      : []),
    "## Default Skills",
    ...input.defaultSkills.map((skill) => `- \`${path.basename(skill.path)}\`: ${skill.title}`),
    "",
    "## HeadCount Guidance",
    ...input.profile.headcountNotes.map((note) => `- ${note}`),
    ""
  ].join("\n");
}

function renderAgentOperatingNotesMarkdown(input: {
  agentId: string;
  profile: Required<AgentWorkspaceProfile>;
  directoryEntries: AgentDirectoryEntry[];
  defaultSkills: DefaultMailSkillDescriptor[];
}) {
  const collaborators = input.directoryEntries.filter((entry) => entry.agentId !== input.agentId);

  return [
    `# ${input.profile.displayName} Operating Notes`,
    "",
    "## Collaboration Directory",
    ...(collaborators.length > 0
      ? collaborators.map(
          (entry) =>
            `- \`${entry.agentId}\` at \`${entry.publicMailboxId}\` for ${entry.purpose} (see \`../${entry.agentId}/SOUL.md\`).`
        )
      : ["- No other durable agents are registered yet."]),
    "",
    "## Working Contract",
    "- Keep working state in the room. Keep long-lived truth in approved memory only when it is reusable across rooms.",
    "- Use virtual mail for tasking, review, approvals, and handoff. Do not bypass outbox for real external send.",
    "- Read the latest inbound, latest room Pre, and specific refs before asking for more history.",
    "",
    "## Role Files",
    ...input.defaultSkills.map((skill) => `- \`${path.basename(skill.path)}\``),
    "",
    "## Shared Directory",
    `- Tenant directory: \`../../AGENT_DIRECTORY.md\``,
    ""
  ].join("\n");
}

function writeTenantAgentDirectory(config: AppConfig, tenantId: string, entries: AgentDirectoryEntry[]) {
  const directoryPath = getTenantAgentDirectoryPath(config, tenantId);
  const sorted = [...entries].sort((left, right) => left.agentId.localeCompare(right.agentId));
  const contents = [
    "# Agent Directory",
    "",
    "Durable MailClaws agents can inspect this roster to decide who should own a room, who should review it, and when a burst subagent is enough. The roster defines soul and routing, while the room holds active work.",
    "",
    ...sorted.flatMap((entry) => [
      `## ${entry.displayName}`,
      `- Agent ID: \`${entry.agentId}\``,
      `- Public mailbox: \`${entry.publicMailboxId}\``,
      `- Purpose: ${entry.purpose}`,
      `- Virtual mailboxes: ${entry.virtualMailboxes.map((mailboxId) => `\`${mailboxId}\``).join(", ")}`,
      `- Collaborators: ${
        entry.collaboratorAgentIds.length > 0
          ? entry.collaboratorAgentIds.map((agentId) => `\`${agentId}\``).join(", ")
          : "(none)"
      }`,
      `- Soul: \`agents/${entry.agentId}/SOUL.md\``,
      ""
    ])
  ].join("\n");

  fs.mkdirSync(path.dirname(directoryPath), { recursive: true });
  fs.writeFileSync(directoryPath, contents, "utf8");
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

function ensureGeneratedMarkdownFile(filePath: string, contents: string) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, contents, "utf8");
    return;
  }

  const existing = fs.readFileSync(filePath, "utf8");
  if (existing.trim().length === 0 || /^# [^\n]+ (Soul|Operating Notes)\s*$/.test(existing.trim())) {
    fs.writeFileSync(filePath, contents, "utf8");
  }
}
