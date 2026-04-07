import path from "node:path";

import type { AppConfig } from "../config.js";
import type {
  MailTurnAttachmentDescriptor,
  MailTurnMemoryNamespaceDescriptor
} from "../core/types.js";
import {
  getMemoryNamespaceCapabilities,
  getMemoryNamespaceKey,
  type MemoryNamespaceSpec
} from "../memory/namespace-spec.js";
import { resolveMemoryNamespace } from "../memory/namespaces.js";
import type { MailRuntimePolicyManifest } from "../core/types.js";
import type { ExecuteMailTurnInput } from "./agent-executor.js";

export function assertExecutionPolicyAllowsTurn(input: ExecuteMailTurnInput) {
  if (!input.executionPolicy || !input.memoryNamespaces) {
    return;
  }

  const allowedScopes = new Set(input.executionPolicy.allowedMemoryScopes);
  const requestedScopes: Array<(typeof input.executionPolicy.allowedMemoryScopes)[number]> = [
    "room",
    "agent",
    ...(input.memoryNamespaces.user ? (["user"] as const) : []),
    ...(input.memoryNamespaces.scratch ? (["scratch"] as const) : [])
  ];

  for (const scope of requestedScopes) {
    if (!allowedScopes.has(scope)) {
      throw new Error(
        `execution policy ${input.executionPolicy.role} does not allow ${scope} memory scope`
      );
    }
  }

  if (input.memoryNamespaces.room.scope !== "room") {
    throw new Error("room memory namespace descriptor must use room scope");
  }
  assertDescriptorMatchesScope(input.memoryNamespaces.room);
  if (input.memoryNamespaces.room.tenantId !== input.executionPolicy.tenantId) {
    throw new Error("room memory namespace tenant must match execution policy tenant");
  }
  if (input.memoryNamespaces.room.roomKey !== input.executionPolicy.roomKey) {
    throw new Error("room memory namespace roomKey must match execution policy roomKey");
  }
  if (input.memoryNamespaces.agent.scope !== "agent") {
    throw new Error("agent memory namespace descriptor must use agent scope");
  }
  assertDescriptorMatchesScope(input.memoryNamespaces.agent);
  if (input.memoryNamespaces.agent.tenantId !== input.memoryNamespaces.room.tenantId) {
    throw new Error("agent memory namespace tenant must match room tenant");
  }
  if (input.memoryNamespaces.agent.agentId !== input.executionPolicy.runtimeAgentId) {
    throw new Error("agent memory namespace agentId must match execution policy runtimeAgentId");
  }

  const user = input.memoryNamespaces.user;
  if (user) {
    if (user.scope !== "user") {
      throw new Error("user memory namespace descriptor must use user scope");
    }
    assertDescriptorMatchesScope(user);
    if (user.tenantId !== input.memoryNamespaces.room.tenantId) {
      throw new Error("user memory namespace tenant must match room tenant");
    }
    if (user.userId !== input.executionPolicy.userId) {
      throw new Error("user memory namespace userId must match execution policy userId");
    }
  }

  const scratch = input.memoryNamespaces.scratch;
  if (!scratch) {
    return;
  }
  if (scratch.scope !== "scratch") {
    throw new Error("scratch memory namespace descriptor must use scratch scope");
  }
  assertDescriptorMatchesScope(scratch);
  if (scratch.tenantId !== input.memoryNamespaces.room.tenantId) {
    throw new Error("scratch memory namespace tenant must match room tenant");
  }
  if (scratch.roomKey !== input.memoryNamespaces.room.roomKey) {
    throw new Error("scratch memory namespace roomKey must match room memory namespace roomKey");
  }
  if (!input.executionPolicy.scratchAgentId) {
    throw new Error("scratch memory namespace requires execution policy scratchAgentId");
  }
  if (scratch.agentId !== input.executionPolicy.scratchAgentId) {
    throw new Error("scratch memory namespace agentId must match execution policy scratchAgentId");
  }
}

export function assertRuntimePolicyManifestAllowsTurn(input: {
  runtimeKind: "bridge" | "command" | "embedded";
  runtimeLabel: string;
  executionInput: ExecuteMailTurnInput;
  policyManifest?: MailRuntimePolicyManifest | null;
}) {
  const executionPolicy = input.executionInput.executionPolicy;
  if (!executionPolicy) {
    return;
  }

  const manifest = input.policyManifest;
  if (!manifest) {
    throw new Error(
      `${input.runtimeKind} runtime ${input.runtimeLabel} must declare a policy manifest before accepting executionPolicy-bound turns`
    );
  }

  if (!manifest.toolPolicies.includes(executionPolicy.toolPolicy)) {
    throw new Error(
      `${input.runtimeKind} runtime ${input.runtimeLabel} does not allow tool policy ${executionPolicy.toolPolicy}`
    );
  }

  if (!manifest.sandboxPolicies.includes(executionPolicy.sandboxPolicy)) {
    throw new Error(
      `${input.runtimeKind} runtime ${input.runtimeLabel} does not allow sandbox policy ${executionPolicy.sandboxPolicy}`
    );
  }

  if (compareNetworkAccess(manifest.networkAccess, executionPolicy.networkAccess) < 0) {
    throw new Error(
      `${input.runtimeKind} runtime ${input.runtimeLabel} does not allow network access ${executionPolicy.networkAccess}`
    );
  }

  if (compareFilesystemAccess(manifest.filesystemAccess, executionPolicy.filesystemAccess) < 0) {
    throw new Error(
      `${input.runtimeKind} runtime ${input.runtimeLabel} does not allow filesystem access ${executionPolicy.filesystemAccess}`
    );
  }

  if (compareOutboundMode(manifest.outboundMode, executionPolicy.outboundMode) < 0) {
    throw new Error(
      `${input.runtimeKind} runtime ${input.runtimeLabel} does not allow outbound mode ${executionPolicy.outboundMode}`
    );
  }
}

export function assertCanonicalMemoryNamespaceDescriptors(
  config: AppConfig,
  input: ExecuteMailTurnInput
) {
  if (!input.memoryNamespaces) {
    return;
  }

  const descriptors = [
    input.memoryNamespaces.room,
    input.memoryNamespaces.agent,
    input.memoryNamespaces.user,
    input.memoryNamespaces.scratch
  ].filter(Boolean) as MailTurnMemoryNamespaceDescriptor[];

  for (const descriptor of descriptors) {
    const expected = resolveMemoryNamespace(config, buildScopeSpec(descriptor));
    assertCanonicalDescriptorPaths(descriptor, expected);
  }
}

export function prepareExecutionAttachments(
  config: AppConfig,
  input: ExecuteMailTurnInput
): MailTurnAttachmentDescriptor[] | undefined {
  const attachments = input.attachments;
  if (!attachments?.length) {
    return undefined;
  }

  const stateRoot = path.resolve(config.storage.stateDir);
  const filesystemAccess = input.executionPolicy?.filesystemAccess ?? "workspace-read";

  return attachments.map((attachment) => {
    assertAttachmentDescriptorPathsWithinRoot(stateRoot, attachment);

    if (filesystemAccess !== "none") {
      return attachment;
    }

    return {
      ...attachment,
      artifactPath: undefined,
      rawDataPath: undefined,
      extractedTextPath: undefined,
      summaryPath: undefined,
      summaryShortPath: undefined,
      summaryLongPath: undefined,
      preferredInputPath: undefined,
      chunks: []
    };
  });
}

function assertDescriptorMatchesScope(descriptor: MailTurnMemoryNamespaceDescriptor) {
  const spec = buildScopeSpec(descriptor);
  const expectedNamespaceKey = getMemoryNamespaceKey(spec);
  if (descriptor.namespaceKey !== expectedNamespaceKey) {
    throw new Error(
      `${descriptor.scope} memory namespace key must match canonical scope identity`
    );
  }

  const expectedCapabilities = getMemoryNamespaceCapabilities(descriptor.scope);
  if (JSON.stringify(descriptor.capabilities) !== JSON.stringify(expectedCapabilities)) {
    throw new Error(
      `${descriptor.scope} memory namespace capabilities must match scope defaults`
    );
  }

  const rootDir = path.resolve(descriptor.rootDir);
  const primaryPath = path.resolve(descriptor.primaryPath);
  if (primaryPath !== rootDir && !primaryPath.startsWith(`${rootDir}${path.sep}`)) {
    throw new Error(
      `${descriptor.scope} memory namespace primaryPath must stay within its rootDir`
    );
  }
}

function assertCanonicalDescriptorPaths(
  actual: MailTurnMemoryNamespaceDescriptor,
  expected: MailTurnMemoryNamespaceDescriptor
) {
  if (path.resolve(actual.rootDir) !== path.resolve(expected.rootDir)) {
    throw new Error(`${actual.scope} memory namespace rootDir must match the canonical workspace`);
  }

  if (path.resolve(actual.primaryPath) !== path.resolve(expected.primaryPath)) {
    throw new Error(`${actual.scope} memory namespace primaryPath must match the canonical workspace`);
  }

  const actualMetadataPath = actual.metadataPath ? path.resolve(actual.metadataPath) : null;
  const expectedMetadataPath = expected.metadataPath ? path.resolve(expected.metadataPath) : null;
  if (actualMetadataPath !== expectedMetadataPath) {
    throw new Error(`${actual.scope} memory namespace metadataPath must match the canonical workspace`);
  }
}

function assertAttachmentDescriptorPathsWithinRoot(
  stateRoot: string,
  attachment: MailTurnAttachmentDescriptor
) {
  const labeledPaths: Array<[string, string | undefined]> = [
    ["artifactPath", attachment.artifactPath],
    ["rawDataPath", attachment.rawDataPath],
    ["extractedTextPath", attachment.extractedTextPath],
    ["summaryPath", attachment.summaryPath],
    ["summaryShortPath", attachment.summaryShortPath],
    ["summaryLongPath", attachment.summaryLongPath],
    ["preferredInputPath", attachment.preferredInputPath]
  ];

  for (const [label, value] of labeledPaths) {
    assertPathWithinRoot(stateRoot, value, `attachment ${attachment.attachmentId} ${label}`);
  }

  for (const chunk of attachment.chunks) {
    assertPathWithinRoot(
      stateRoot,
      chunk.chunkPath,
      `attachment ${attachment.attachmentId} chunk ${chunk.chunkId} chunkPath`
    );
    assertPathWithinRoot(
      stateRoot,
      chunk.summaryPath,
      `attachment ${attachment.attachmentId} chunk ${chunk.chunkId} summaryPath`
    );
    assertPathWithinRoot(
      stateRoot,
      chunk.sourcePath,
      `attachment ${attachment.attachmentId} chunk ${chunk.chunkId} sourcePath`
    );
  }
}

function assertPathWithinRoot(stateRoot: string, targetPath: string | undefined, label: string) {
  if (!targetPath) {
    return;
  }

  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget !== stateRoot && !resolvedTarget.startsWith(`${stateRoot}${path.sep}`)) {
    throw new Error(`${label} must stay within the MailClaws state directory`);
  }
}

function buildScopeSpec(descriptor: Pick<
  MailTurnMemoryNamespaceDescriptor,
  "scope" | "tenantId" | "agentId" | "roomKey" | "userId"
>): MemoryNamespaceSpec {
  switch (descriptor.scope) {
    case "room":
      if (!descriptor.roomKey) {
        throw new Error("room memory namespace descriptor must include roomKey");
      }
      return {
        scope: "room",
        tenantId: descriptor.tenantId,
        roomKey: descriptor.roomKey
      };
    case "agent":
      if (!descriptor.agentId) {
        throw new Error("agent memory namespace descriptor must include agentId");
      }
      return {
        scope: "agent",
        tenantId: descriptor.tenantId,
        agentId: descriptor.agentId
      };
    case "scratch":
      if (!descriptor.agentId || !descriptor.roomKey) {
        throw new Error("scratch memory namespace descriptor must include agentId and roomKey");
      }
      return {
        scope: "scratch",
        tenantId: descriptor.tenantId,
        agentId: descriptor.agentId,
        roomKey: descriptor.roomKey
      };
    case "user":
      if (!descriptor.userId) {
        throw new Error("user memory namespace descriptor must include userId");
      }
      return {
        scope: "user",
        tenantId: descriptor.tenantId,
        userId: descriptor.userId
      };
  }
}

function compareNetworkAccess(left: "none" | "allowlisted", right: "none" | "allowlisted") {
  return rankValue(left, ["none", "allowlisted"]) - rankValue(right, ["none", "allowlisted"]);
}

function compareFilesystemAccess(left: "none" | "workspace-read", right: "none" | "workspace-read") {
  return rankValue(left, ["none", "workspace-read"]) - rankValue(right, ["none", "workspace-read"]);
}

function compareOutboundMode(left: "blocked" | "approval_required", right: "blocked" | "approval_required") {
  return rankValue(left, ["blocked", "approval_required"]) - rankValue(right, ["blocked", "approval_required"]);
}

function rankValue<T extends string>(value: T, order: readonly T[]) {
  return order.indexOf(value);
}
