import type { AppConfig } from "../config.js";
import type { MailTurnExecutionPolicy, WorkerRole } from "../core/types.js";

const defaultPolicies: Record<
  WorkerRole,
  Omit<
    MailTurnExecutionPolicy,
    "tenantId" | "roomKey" | "runtimeAgentId" | "scratchAgentId" | "userId" | "trustLevel" | "source"
  >
> = {
  "mail-orchestrator": {
    role: "mail-orchestrator",
    toolPolicy: "mail-orchestrator",
    sandboxPolicy: "mail-room-orchestrator",
    networkAccess: "allowlisted",
    filesystemAccess: "workspace-read",
    outboundMode: "approval_required",
    allowedMemoryScopes: ["room", "agent", "user"]
  },
  "mail-attachment-reader": {
    role: "mail-attachment-reader",
    toolPolicy: "mail-attachment-reader",
    sandboxPolicy: "mail-room-worker",
    networkAccess: "none",
    filesystemAccess: "workspace-read",
    outboundMode: "blocked",
    allowedMemoryScopes: ["room", "agent", "scratch"]
  },
  "mail-researcher": {
    role: "mail-researcher",
    toolPolicy: "mail-researcher",
    sandboxPolicy: "mail-room-worker",
    networkAccess: "allowlisted",
    filesystemAccess: "workspace-read",
    outboundMode: "blocked",
    allowedMemoryScopes: ["room", "agent", "scratch"]
  },
  "mail-drafter": {
    role: "mail-drafter",
    toolPolicy: "mail-drafter",
    sandboxPolicy: "mail-room-worker",
    networkAccess: "none",
    filesystemAccess: "workspace-read",
    outboundMode: "blocked",
    allowedMemoryScopes: ["room", "agent", "scratch"]
  },
  "mail-reviewer": {
    role: "mail-reviewer",
    toolPolicy: "mail-reviewer",
    sandboxPolicy: "mail-room-worker",
    networkAccess: "none",
    filesystemAccess: "workspace-read",
    outboundMode: "blocked",
    allowedMemoryScopes: ["room", "agent", "scratch"]
  },
  "mail-guard": {
    role: "mail-guard",
    toolPolicy: "mail-guard",
    sandboxPolicy: "mail-room-worker",
    networkAccess: "none",
    filesystemAccess: "workspace-read",
    outboundMode: "blocked",
    allowedMemoryScopes: ["room", "agent", "scratch"]
  }
};

export function resolveMailTurnExecutionPolicy(
  config: AppConfig,
  input: {
    role: WorkerRole;
    tenantId: string;
    roomKey: string;
    runtimeAgentId: string;
    scratchAgentId?: string;
    userId?: string;
    trustLevel?: string;
  }
): MailTurnExecutionPolicy {
  const basePolicy = defaultPolicies[input.role];
  const override = config.openClaw.roleExecutionPolicies[input.role];
  const source =
    override &&
    (override.toolPolicy ||
      override.sandboxPolicy ||
      override.networkAccess ||
      override.filesystemAccess ||
      override.outboundMode)
      ? "config"
      : "default";

  return {
    ...basePolicy,
    tenantId: input.tenantId,
    roomKey: input.roomKey,
    runtimeAgentId: input.runtimeAgentId,
    ...(input.scratchAgentId ? { scratchAgentId: input.scratchAgentId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    trustLevel: input.trustLevel,
    toolPolicy: override?.toolPolicy ?? basePolicy.toolPolicy,
    sandboxPolicy: override?.sandboxPolicy ?? basePolicy.sandboxPolicy,
    networkAccess: override?.networkAccess ?? basePolicy.networkAccess,
    filesystemAccess: override?.filesystemAccess ?? basePolicy.filesystemAccess,
    outboundMode: override?.outboundMode ?? basePolicy.outboundMode,
    allowedMemoryScopes: [...basePolicy.allowedMemoryScopes],
    source
  };
}
