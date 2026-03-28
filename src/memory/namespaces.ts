import fs from "node:fs";
import path from "node:path";

import type { AppConfig } from "../config.js";
import type { MailTurnMemoryNamespaces } from "../core/types.js";
import { ensureAgentWorkspace, getAgentStateDir, getTenantStateDir } from "./agent-memory.js";
import {
  assertMemoryNamespaceReadAllowed,
  createMemoryNamespaceSpec,
  createMemoryNamespaceRef,
  getMemoryNamespaceCapabilities,
  type MemoryNamespaceActor,
  type MemoryNamespaceRef,
  type MemoryNamespaceSpec
} from "./namespace-spec.js";
import { ensureRoomMemoryWorkspace, getRoomStateDir } from "./room-memory.js";

export interface UserMemoryWorkspace {
  userDir: string;
  memoryPath: string;
  metadataPath: string;
}

export interface AgentScratchWorkspace {
  scratchDir: string;
  scratchPath: string;
  metadataPath: string;
}

export type MemoryNamespaceDescriptor = MemoryNamespaceRef & {
  rootDir: string;
  primaryPath: string;
  metadataPath?: string;
  capabilities: ReturnType<typeof getMemoryNamespaceCapabilities>;
};

export function ensureUserMemoryWorkspace(config: AppConfig, tenantId: string, userId: string): UserMemoryWorkspace {
  const userDir = path.join(getTenantStateDir(config, tenantId), "users", toSafeNamespaceSegment(userId));
  const memoryPath = path.join(userDir, "USER_MEMORY.md");
  const metadataPath = path.join(userDir, "metadata.json");

  fs.mkdirSync(userDir, { recursive: true });
  ensureMarkdownFile(memoryPath, `# User Memory\n\nUser: ${userId}\n`);
  ensureJsonFile(metadataPath, {
    tenantId,
    userId
  });

  return {
    userDir,
    memoryPath,
    metadataPath
  };
}

export function ensureAgentScratchWorkspace(
  config: AppConfig,
  input: {
    tenantId: string;
    agentId: string;
    roomKey: string;
    createdAt?: string;
    ttlMs?: number;
  }
): AgentScratchWorkspace {
  const scratchDir = path.join(
    getAgentStateDir(config, input.tenantId, input.agentId),
    "scratch",
    toSafeNamespaceSegment(input.roomKey)
  );
  const scratchPath = path.join(scratchDir, "SCRATCH.md");
  const metadataPath = path.join(scratchDir, "metadata.json");
  const createdAt = input.createdAt ?? new Date().toISOString();
  const ttlMs = input.ttlMs ?? 24 * 60 * 60 * 1000;

  fs.mkdirSync(scratchDir, { recursive: true });
  ensureMarkdownFile(scratchPath, `# Agent Scratch\n\nRoom: ${input.roomKey}\n`);
  ensureJsonFile(metadataPath, {
    tenantId: input.tenantId,
    agentId: input.agentId,
    roomKey: input.roomKey,
    createdAt,
    expiresAt: new Date(Date.parse(createdAt) + ttlMs).toISOString()
  });

  return {
    scratchDir,
    scratchPath,
    metadataPath
  };
}

export function resolveMemoryNamespace(
  config: AppConfig,
  input: MemoryNamespaceSpec
): MemoryNamespaceDescriptor {
  const namespaceRef = createMemoryNamespaceRef(input);
  const capabilities = getMemoryNamespaceCapabilities(input.scope);

  switch (input.scope) {
    case "agent": {
      const workspace = ensureAgentWorkspace(config, input.tenantId, input.agentId);
      return {
        ...namespaceRef,
        capabilities,
        rootDir: workspace.agentDir,
        primaryPath: workspace.memoryPath
      };
    }
    case "room": {
      const workspace = ensureRoomMemoryWorkspace(config, input.tenantId, input.roomKey);
      return {
        ...namespaceRef,
        capabilities,
        rootDir: getRoomStateDir(config, input.tenantId, input.roomKey),
        primaryPath: workspace.roomMemoryPath
      };
    }
    case "user": {
      const workspace = ensureUserMemoryWorkspace(config, input.tenantId, input.userId);
      return {
        ...namespaceRef,
        capabilities,
        rootDir: workspace.userDir,
        primaryPath: workspace.memoryPath,
        metadataPath: workspace.metadataPath
      };
    }
    case "scratch": {
      const workspace = ensureAgentScratchWorkspace(config, input);
      return {
        ...namespaceRef,
        capabilities,
        rootDir: workspace.scratchDir,
        primaryPath: workspace.scratchPath,
        metadataPath: workspace.metadataPath
      };
    }
  }
}

export function readMemoryNamespace(
  config: AppConfig,
  input: MemoryNamespaceSpec,
  options?: {
    actor?: MemoryNamespaceActor;
  }
) {
  assertMemoryNamespaceReadAllowed({
    actor: options?.actor,
    spec: input
  });
  const descriptor = resolveMemoryNamespace(config, input);

  return {
    ...descriptor,
    content: fs.readFileSync(descriptor.primaryPath, "utf8"),
    metadata:
      descriptor.metadataPath && fs.existsSync(descriptor.metadataPath)
        ? (JSON.parse(fs.readFileSync(descriptor.metadataPath, "utf8")) as Record<string, unknown>)
        : undefined
  };
}

export function resolveOrchestratorTurnMemoryNamespaces(
  config: AppConfig,
  input: {
    tenantId: string;
    roomKey: string;
    agentId: string;
    userId?: string;
  }
): MailTurnMemoryNamespaces {
  return {
    room: resolveMemoryNamespace(
      config,
      createMemoryNamespaceSpec("room", {
        tenantId: input.tenantId,
        roomKey: input.roomKey
      })
    ),
    agent: resolveMemoryNamespace(
      config,
      createMemoryNamespaceSpec("agent", {
        tenantId: input.tenantId,
        agentId: input.agentId
      })
    ),
    ...(input.userId
      ? {
          user: resolveMemoryNamespace(
            config,
            createMemoryNamespaceSpec("user", {
              tenantId: input.tenantId,
              userId: input.userId
            })
          )
        }
      : {})
  };
}

export function resolveWorkerTurnMemoryNamespaces(
  config: AppConfig,
  input: {
    tenantId: string;
    roomKey: string;
    agentId: string;
    scratchAgentId?: string;
  }
): MailTurnMemoryNamespaces {
  return {
    ...resolveOrchestratorTurnMemoryNamespaces(config, {
      tenantId: input.tenantId,
      roomKey: input.roomKey,
      agentId: input.agentId
    }),
    scratch: resolveMemoryNamespace(
      config,
      createMemoryNamespaceSpec("scratch", {
        tenantId: input.tenantId,
        agentId: input.scratchAgentId ?? input.agentId,
        roomKey: input.roomKey
      })
    )
  };
}

function ensureMarkdownFile(filePath: string, contents: string) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, contents, "utf8");
  }
}

function ensureJsonFile(filePath: string, payload: unknown) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}

function toSafeNamespaceSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
}
