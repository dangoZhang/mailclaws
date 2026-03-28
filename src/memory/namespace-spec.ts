export const memoryScopes = ["agent", "room", "user", "scratch"] as const;
export type MemoryScope = (typeof memoryScopes)[number];

export interface AgentMemoryNamespaceSpec {
  scope: "agent";
  tenantId: string;
  agentId: string;
}

export interface RoomMemoryNamespaceSpec {
  scope: "room";
  tenantId: string;
  roomKey: string;
}

export interface UserMemoryNamespaceSpec {
  scope: "user";
  tenantId: string;
  userId: string;
}

export interface ScratchMemoryNamespaceSpec {
  scope: "scratch";
  tenantId: string;
  agentId: string;
  roomKey: string;
}

export type MemoryNamespaceSpec =
  | AgentMemoryNamespaceSpec
  | RoomMemoryNamespaceSpec
  | UserMemoryNamespaceSpec
  | ScratchMemoryNamespaceSpec;

export type MemoryNamespaceRef = MemoryNamespaceSpec & {
  namespaceKey: string;
};

export type MemoryNamespaceActor =
  | { kind: "runtime" }
  | { kind: "operator" }
  | {
      kind: "agent";
      tenantId: string;
      agentId: string;
      roomKey?: string;
    };

export type MemoryManagementAction =
  | "init_agent_memory"
  | "list_memory_drafts"
  | "create_memory_draft"
  | "review_memory_draft"
  | "approve_memory_draft"
  | "reject_memory_draft";

export interface MemoryNamespaceCapabilities {
  storesMetadata: boolean;
  isEphemeral: boolean;
  canSourcePromotionDrafts: boolean;
  canReceiveApprovedPromotions: boolean;
  supportsSnapshotPaths: boolean;
}

const memoryNamespaceCapabilities: Record<MemoryScope, MemoryNamespaceCapabilities> = {
  agent: {
    storesMetadata: false,
    isEphemeral: false,
    canSourcePromotionDrafts: false,
    canReceiveApprovedPromotions: true,
    supportsSnapshotPaths: false
  },
  room: {
    storesMetadata: false,
    isEphemeral: false,
    canSourcePromotionDrafts: true,
    canReceiveApprovedPromotions: false,
    supportsSnapshotPaths: true
  },
  user: {
    storesMetadata: true,
    isEphemeral: false,
    canSourcePromotionDrafts: false,
    canReceiveApprovedPromotions: false,
    supportsSnapshotPaths: false
  },
  scratch: {
    storesMetadata: true,
    isEphemeral: true,
    canSourcePromotionDrafts: false,
    canReceiveApprovedPromotions: false,
    supportsSnapshotPaths: false
  }
};

export function parseMemoryScope(value: string | undefined): MemoryScope | null {
  if (!value) {
    return null;
  }

  return memoryScopes.includes(value as MemoryScope) ? (value as MemoryScope) : null;
}

export function getMemoryNamespaceCapabilities(scope: MemoryScope): MemoryNamespaceCapabilities {
  return {
    ...memoryNamespaceCapabilities[scope]
  };
}

export function getMemoryNamespaceKey(spec: MemoryNamespaceSpec) {
  switch (spec.scope) {
    case "agent":
      return `agent:${spec.tenantId}:${spec.agentId}`;
    case "room":
      return `room:${spec.tenantId}:${spec.roomKey}`;
    case "user":
      return `user:${spec.tenantId}:${spec.userId}`;
    case "scratch":
      return `scratch:${spec.tenantId}:${spec.agentId}:${spec.roomKey}`;
  }
}

export function createMemoryNamespaceRef(spec: MemoryNamespaceSpec): MemoryNamespaceRef {
  return {
    ...spec,
    namespaceKey: getMemoryNamespaceKey(spec)
  };
}

export function assertMemoryNamespaceReadAllowed(input: {
  actor?: MemoryNamespaceActor;
  spec: MemoryNamespaceSpec;
}) {
  const result = evaluateMemoryNamespaceReadAccess(input);
  if (!result.allowed) {
    throw new Error(result.reason);
  }
}

export function evaluateMemoryNamespaceReadAccess(input: {
  actor?: MemoryNamespaceActor;
  spec: MemoryNamespaceSpec;
}) {
  const actor = input.actor ?? { kind: "runtime" as const };
  const namespaceKey = getMemoryNamespaceKey(input.spec);

  if (actor.kind === "operator") {
    return {
      allowed: true,
      reason: `operator access granted for ${namespaceKey}`
    };
  }

  if (actor.kind === "runtime") {
    if (input.spec.scope === "agent" || input.spec.scope === "room") {
      return {
        allowed: true,
        reason: `runtime access granted for ${namespaceKey}`
      };
    }

    return {
      allowed: false,
      reason: `runtime access denied for ${namespaceKey}; explicit operator access is required for ${input.spec.scope} memory`
    };
  }

  if (actor.tenantId !== input.spec.tenantId) {
    return {
      allowed: false,
      reason: `agent access denied for ${namespaceKey}; tenant mismatch`
    };
  }

  switch (input.spec.scope) {
    case "agent":
      return actor.agentId === input.spec.agentId
        ? {
            allowed: true,
            reason: `agent access granted for ${namespaceKey}`
          }
        : {
            allowed: false,
            reason: `agent access denied for ${namespaceKey}; agent mismatch`
          };
    case "room":
      return actor.roomKey === input.spec.roomKey
        ? {
            allowed: true,
            reason: `agent access granted for ${namespaceKey}`
          }
        : {
            allowed: false,
            reason: `agent access denied for ${namespaceKey}; room mismatch`
          };
    case "scratch":
      return actor.agentId === input.spec.agentId && actor.roomKey === input.spec.roomKey
        ? {
            allowed: true,
            reason: `agent access granted for ${namespaceKey}`
          }
        : {
            allowed: false,
            reason: `agent access denied for ${namespaceKey}; scratch scope requires matching agent and room`
          };
    case "user":
      return {
        allowed: false,
        reason: `agent access denied for ${namespaceKey}; user memory requires operator access`
      };
  }
}

export function assertMemoryPromotionTransitionAllowed(input: {
  source: MemoryNamespaceRef;
  target: MemoryNamespaceRef;
}) {
  const result = evaluateMemoryPromotionTransition(input);
  if (!result.allowed) {
    throw new Error(result.reason);
  }
}

export function evaluateMemoryPromotionTransition(input: {
  source: MemoryNamespaceRef;
  target: MemoryNamespaceRef;
}) {
  if (input.source.tenantId !== input.target.tenantId) {
    return {
      allowed: false,
      reason: `memory promotion denied from ${input.source.namespaceKey} to ${input.target.namespaceKey}; tenant mismatch`
    };
  }

  if (input.source.scope !== "room" || input.target.scope !== "agent") {
    return {
      allowed: false,
      reason: `memory promotion denied from ${input.source.namespaceKey} to ${input.target.namespaceKey}; only room -> agent promotion is allowed`
    };
  }

  return {
    allowed: true,
    reason: `memory promotion allowed from ${input.source.namespaceKey} to ${input.target.namespaceKey}`
  };
}

export function assertMemoryManagementAllowed(input: {
  actor?: MemoryNamespaceActor;
  action: MemoryManagementAction;
  tenantId: string;
  agentId: string;
  roomKey?: string;
}) {
  const result = evaluateMemoryManagementAccess(input);
  if (!result.allowed) {
    throw new Error(result.reason);
  }
}

export function evaluateMemoryManagementAccess(input: {
  actor?: MemoryNamespaceActor;
  action: MemoryManagementAction;
  tenantId: string;
  agentId: string;
  roomKey?: string;
}) {
  const actor = input.actor ?? { kind: "runtime" as const };
  const actionLabel = describeMemoryManagementAction(input.action);
  const resourceLabel = `agent:${input.tenantId}:${input.agentId}`;

  if (actor.kind === "operator") {
    return {
      allowed: true,
      reason: `operator access granted to ${actionLabel} for ${resourceLabel}`
    };
  }

  if (actor.kind === "runtime") {
    return {
      allowed: false,
      reason: `${actionLabel} for ${resourceLabel} requires explicit operator or agent access`
    };
  }

  if (actor.tenantId !== input.tenantId) {
    return {
      allowed: false,
      reason: `${actionLabel} for ${resourceLabel} denied; tenant mismatch`
    };
  }

  if (actor.agentId !== input.agentId) {
    return {
      allowed: false,
      reason: `${actionLabel} for ${resourceLabel} denied; agent mismatch`
    };
  }

  switch (input.action) {
    case "init_agent_memory":
    case "list_memory_drafts":
      return {
        allowed: true,
        reason: `agent access granted to ${actionLabel} for ${resourceLabel}`
      };
    case "create_memory_draft":
      if (!input.roomKey) {
        return {
          allowed: false,
          reason: `${actionLabel} for ${resourceLabel} denied; roomKey is required`
        };
      }
      return actor.roomKey === input.roomKey
        ? {
            allowed: true,
            reason: `agent access granted to ${actionLabel} for ${resourceLabel}`
          }
        : {
            allowed: false,
            reason: `${actionLabel} for ${resourceLabel} denied; room mismatch`
          };
    case "review_memory_draft":
    case "approve_memory_draft":
    case "reject_memory_draft":
      return {
        allowed: false,
        reason: `${actionLabel} for ${resourceLabel} requires explicit operator access`
      };
  }
}

export function createMemoryNamespaceSpec(
  scope: "agent",
  input: {
    tenantId: string;
    agentId?: string;
  }
): AgentMemoryNamespaceSpec;
export function createMemoryNamespaceSpec(
  scope: "room",
  input: {
    tenantId: string;
    roomKey?: string;
  }
): RoomMemoryNamespaceSpec;
export function createMemoryNamespaceSpec(
  scope: "user",
  input: {
    tenantId: string;
    userId?: string;
  }
): UserMemoryNamespaceSpec;
export function createMemoryNamespaceSpec(
  scope: "scratch",
  input: {
    tenantId: string;
    agentId?: string;
    roomKey?: string;
  }
): ScratchMemoryNamespaceSpec;
export function createMemoryNamespaceSpec(
  scope: MemoryScope,
  input: {
    tenantId: string;
    agentId?: string;
    roomKey?: string;
    userId?: string;
  }
): MemoryNamespaceSpec;
export function createMemoryNamespaceSpec(
  scope: MemoryScope,
  input: {
    tenantId: string;
    agentId?: string;
    roomKey?: string;
    userId?: string;
  }
): MemoryNamespaceSpec {
  switch (scope) {
    case "agent":
      if (!input.agentId) {
        throw new Error("agent memory reads require agentId");
      }
      return {
        scope,
        tenantId: input.tenantId,
        agentId: input.agentId
      };
    case "room":
      if (!input.roomKey) {
        throw new Error("room memory reads require roomKey");
      }
      return {
        scope,
        tenantId: input.tenantId,
        roomKey: input.roomKey
      };
    case "user":
      if (!input.userId) {
        throw new Error("user memory reads require userId");
      }
      return {
        scope,
        tenantId: input.tenantId,
        userId: input.userId
      };
    case "scratch":
      if (!input.agentId || !input.roomKey) {
        throw new Error("scratch memory reads require agentId and roomKey");
      }
      return {
        scope,
        tenantId: input.tenantId,
        agentId: input.agentId,
        roomKey: input.roomKey
      };
  }
}

function describeMemoryManagementAction(action: MemoryManagementAction) {
  switch (action) {
    case "init_agent_memory":
      return "initializing agent memory";
    case "list_memory_drafts":
      return "listing memory drafts";
    case "create_memory_draft":
      return "creating a memory draft";
    case "review_memory_draft":
      return "reviewing a memory draft";
    case "approve_memory_draft":
      return "approving a memory draft";
    case "reject_memory_draft":
      return "rejecting a memory draft";
  }
}
