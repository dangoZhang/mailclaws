import type { DatabaseSync } from "node:sqlite";

import type {
  GatewayOutcomeDispatchStatus,
  GatewayOutcomeProjectionMode,
  GatewaySessionBinding,
  ThreadLedgerEvent,
  VirtualMessage
} from "../core/types.js";
import {
  replyVirtualMessage,
  submitVirtualMessage,
  type ReplyVirtualMessageInput,
  type SubmitVirtualMessageInput,
  type VirtualMailMutationResult
} from "../core/virtual-mail.js";
import { appendThreadLedgerEvent } from "../storage/repositories/thread-ledger.js";
import { listThreadLedgerEvents } from "../storage/repositories/thread-ledger.js";
import { getThreadRoom, getThreadRoomByParentSessionKey } from "../storage/repositories/thread-rooms.js";
import {
  getGatewaySessionBinding,
  listGatewaySessionBindingsForRoom,
  saveGatewaySessionBinding
} from "../storage/repositories/gateway-session-bindings.js";
import { getSubAgentRunByChildSessionKey } from "../storage/repositories/subagent-runs.js";
import { getVirtualMessage } from "../storage/repositories/virtual-messages.js";
import { getVirtualThread } from "../storage/repositories/virtual-threads.js";
import { getWorkerSession } from "../storage/repositories/worker-sessions.js";
import { redactSensitiveText } from "../security/redaction.js";

export interface BindGatewaySessionToRoomInput {
  sessionKey: string;
  roomKey: string;
  bindingKind: GatewaySessionBinding["bindingKind"];
  sourceControlPlane: string;
  workThreadId?: string;
  parentMessageId?: string;
  frontAgentId?: string;
  now?: string;
}

export interface ResolveGatewayTurnRoomInput {
  sessionKey: string;
  roomKey?: string;
}

export interface GatewayTurnProjectionInput {
  sessionKey: string;
  sourceControlPlane: string;
  sourceMessageId?: string;
  sourceRunId?: string;
  roomKey?: string;
  parentMessageId?: string;
  fromPrincipalId: string;
  fromMailboxId: string;
  toMailboxIds: string[];
  ccMailboxIds?: string[];
  kind: VirtualMessage["kind"];
  visibility: VirtualMessage["visibility"];
  subject: string;
  bodyRef: string;
  artifactRefs?: string[];
  memoryRefs?: string[];
  inputsHash: string;
  createdAt?: string;
  threadKind?: "room" | "work";
  topic?: string;
  frontAgentId?: string;
}

export interface GatewayOutcomeProjectionInput {
  roomKey: string;
  messageId: string;
  projectedAt?: string;
}

export interface GatewayOutcomeDispatchInput {
  roomKey: string;
  messageId: string;
  sessionKey: string;
  mode: GatewayOutcomeProjectionMode;
  projectedAt: string;
  dispatchTarget?: string;
  dispatchError?: string;
  dispatchedAt?: string;
}

export function bindGatewaySessionToRoom(
  db: DatabaseSync,
  input: BindGatewaySessionToRoomInput
) {
  const room = getThreadRoom(db, input.roomKey);
  if (!room) {
    throw new Error(`thread room not found: ${input.roomKey}`);
  }
  if (input.workThreadId && !getVirtualThread(db, input.workThreadId)) {
    throw new Error(`virtual thread not found: ${input.workThreadId}`);
  }
  if (input.parentMessageId && !getVirtualMessage(db, input.parentMessageId)) {
    throw new Error(`virtual message not found: ${input.parentMessageId}`);
  }

  const now = input.now ?? new Date().toISOString();
  const current = getGatewaySessionBinding(db, input.sessionKey);
  const binding: GatewaySessionBinding = {
    sessionKey: input.sessionKey,
    roomKey: input.roomKey,
    bindingKind: input.bindingKind,
    workThreadId: input.workThreadId,
    parentMessageId: input.parentMessageId,
    sourceControlPlane: input.sourceControlPlane,
    frontAgentId: input.frontAgentId,
    createdAt: current?.createdAt ?? now,
    updatedAt: now
  };
  saveGatewaySessionBinding(db, binding);
  appendThreadLedgerEvent(db, {
    roomKey: room.roomKey,
    revision: room.revision,
    type: "gateway.session.bound",
    payload: {
      sessionKey: binding.sessionKey,
      bindingKind: binding.bindingKind,
      workThreadId: binding.workThreadId ?? null,
      parentMessageId: binding.parentMessageId ?? null,
      sourceControlPlane: binding.sourceControlPlane,
      frontAgentId: binding.frontAgentId ?? null
    }
  });

  return binding;
}

export function resolveGatewayTurnRoom(
  db: DatabaseSync,
  input: ResolveGatewayTurnRoomInput
) {
  if (input.roomKey) {
    const room = getThreadRoom(db, input.roomKey);
    if (!room) {
      throw new Error(`thread room not found: ${input.roomKey}`);
    }

    const binding =
      getGatewaySessionBinding(db, input.sessionKey) ??
      bindGatewaySessionToRoom(db, {
        sessionKey: input.sessionKey,
        roomKey: input.roomKey,
        bindingKind: "room",
        sourceControlPlane: "openclaw"
      });

    return {
      room,
      binding
    };
  }

  const explicitBinding = getGatewaySessionBinding(db, input.sessionKey);
  if (explicitBinding) {
    const room = getThreadRoom(db, explicitBinding.roomKey);
    if (!room) {
      throw new Error(`thread room not found: ${explicitBinding.roomKey}`);
    }

    return {
      room,
      binding: explicitBinding
    };
  }

  const parentRoom = getThreadRoomByParentSessionKey(db, input.sessionKey);
  if (parentRoom) {
    return {
      room: parentRoom,
      binding: bindGatewaySessionToRoom(db, {
        sessionKey: input.sessionKey,
        roomKey: parentRoom.roomKey,
        bindingKind: "room",
        sourceControlPlane: "openclaw",
        frontAgentId: parentRoom.frontAgentAddress
      })
    };
  }

  const workerSession = getWorkerSession(db, input.sessionKey);
  if (workerSession) {
    return {
      room: requireRoom(db, workerSession.roomKey),
      binding: bindGatewaySessionToRoom(db, {
        sessionKey: input.sessionKey,
        roomKey: workerSession.roomKey,
        bindingKind: "room",
        sourceControlPlane: "openclaw"
      })
    };
  }

  const subAgentRun = getSubAgentRunByChildSessionKey(db, input.sessionKey);
  if (subAgentRun) {
    return {
      room: requireRoom(db, subAgentRun.roomKey),
      binding: bindGatewaySessionToRoom(db, {
        sessionKey: input.sessionKey,
        roomKey: subAgentRun.roomKey,
        bindingKind: "subagent",
        sourceControlPlane: "openclaw",
        workThreadId: subAgentRun.workThreadId,
        parentMessageId: subAgentRun.parentMessageId
      })
    };
  }

  throw new Error(`gateway session is not bound to a room: ${input.sessionKey}`);
}

export function projectGatewayTurnToVirtualMail(
  db: DatabaseSync,
  input: GatewayTurnProjectionInput
): VirtualMailMutationResult {
  const { room, binding } = resolveGatewayTurnRoom(db, {
    sessionKey: input.sessionKey,
    roomKey: input.roomKey
  });
  const baseProjection = {
    originKind: "gateway_chat" as const,
    projectionMetadata: {
      origin: {
        kind: "gateway_chat" as const,
        controlPlane: input.sourceControlPlane,
        sessionKey: input.sessionKey,
        ...(input.sourceRunId ? { runId: input.sourceRunId } : {}),
        ...(input.frontAgentId ?? binding.frontAgentId
          ? { frontAgentId: input.frontAgentId ?? binding.frontAgentId }
          : {}),
        ...(input.sourceMessageId ? { sourceMessageId: input.sourceMessageId } : {})
      }
    }
  };
  const parentMessageId = input.parentMessageId ?? binding.parentMessageId;

  const result = parentMessageId
    ? replyVirtualMessage(db, parentMessageId, {
        fromPrincipalId: input.fromPrincipalId,
        fromMailboxId: input.fromMailboxId,
        toMailboxIds: input.toMailboxIds,
        ccMailboxIds: input.ccMailboxIds,
        kind: input.kind,
        visibility: input.visibility,
        ...baseProjection,
        subject: input.subject,
        bodyRef: input.bodyRef,
        artifactRefs: input.artifactRefs,
        memoryRefs: input.memoryRefs,
        roomRevision: room.revision,
        inputsHash: input.inputsHash,
        createdAt: input.createdAt
      } satisfies ReplyVirtualMessageInput)
    : submitVirtualMessage(db, {
        roomKey: room.roomKey,
        threadId: binding.workThreadId,
        threadKind: input.threadKind ?? (binding.workThreadId ? "work" : "room"),
        topic: input.topic ?? input.subject,
        fromPrincipalId: input.fromPrincipalId,
        fromMailboxId: input.fromMailboxId,
        toMailboxIds: input.toMailboxIds,
        ccMailboxIds: input.ccMailboxIds,
        kind: input.kind,
        visibility: input.visibility,
        ...baseProjection,
        subject: input.subject,
        bodyRef: input.bodyRef,
        artifactRefs: input.artifactRefs,
        memoryRefs: input.memoryRefs,
        roomRevision: room.revision,
        inputsHash: input.inputsHash,
        createdAt: input.createdAt
      } satisfies SubmitVirtualMessageInput);

  appendThreadLedgerEvent(db, {
    roomKey: room.roomKey,
    revision: room.revision,
    type: "gateway.turn.projected",
    payload: {
      sessionKey: input.sessionKey,
      messageId: result.message.messageId,
      parentMessageId: parentMessageId ?? null,
      sourceControlPlane: input.sourceControlPlane,
      sourceMessageId: input.sourceMessageId ?? null,
      sourceRunId: input.sourceRunId ?? null,
      bindingKind: binding.bindingKind
    }
  });

  return result;
}

export function projectRoomOutcomeToGateway(
  db: DatabaseSync,
  input: GatewayOutcomeProjectionInput
) {
  const room = requireRoom(db, input.roomKey);
  const message = getVirtualMessage(db, input.messageId);
  if (!message || message.roomKey !== room.roomKey) {
    throw new Error(`virtual message not found in room ${room.roomKey}: ${input.messageId}`);
  }

  const existing = findGatewayOutcomeProjection(db, room.roomKey, message.messageId);
  if (existing) {
    const binding = getGatewaySessionBinding(db, existing.sessionKey) ?? {
      sessionKey: existing.sessionKey,
      roomKey: room.roomKey,
      bindingKind: "room" as const,
      sourceControlPlane: message.projectionMetadata.origin.controlPlane ?? "openclaw",
      frontAgentId: room.frontAgentAddress,
      createdAt: existing.projectedAt,
      updatedAt: existing.projectedAt
    };
    return {
      roomKey: room.roomKey,
      sessionKey: binding.sessionKey,
      message,
      mode: existing.mode,
      projectedAt: existing.projectedAt
    };
  }

  const projectedAt = input.projectedAt ?? new Date().toISOString();
  const binding = getGatewaySessionBinding(db, room.parentSessionKey) ?? {
    sessionKey: room.parentSessionKey,
    roomKey: room.roomKey,
    bindingKind: "room" as const,
    sourceControlPlane: message.projectionMetadata.origin.controlPlane ?? "openclaw",
    frontAgentId: room.frontAgentAddress,
    createdAt: projectedAt,
    updatedAt: projectedAt
  };
  const mode = resolveGatewayOutcomeProjectionMode(message);
  appendThreadLedgerEvent(db, {
    roomKey: room.roomKey,
    revision: room.revision,
    type: "gateway.outcome.projected",
    payload: {
      sessionKey: binding.sessionKey,
      messageId: message.messageId,
      mode,
      dispatchStatus: "pending"
    }
  });

  return {
    roomKey: room.roomKey,
    sessionKey: binding.sessionKey,
    message,
    mode,
    projectedAt,
    dispatchStatus: "pending" as GatewayOutcomeDispatchStatus
  };
}

export function maybeAutoProjectRoomOutcomeToGateway(
  db: DatabaseSync,
  input: GatewayOutcomeProjectionInput
) {
  const message = getVirtualMessage(db, input.messageId);
  if (!message || message.roomKey !== input.roomKey) {
    return null;
  }

  const mode = resolveGatewayOutcomeProjectionMode(message);
  if (mode === "no_external_projection") {
    return null;
  }

  if (listGatewaySessionBindingsForRoom(db, input.roomKey).length === 0) {
    return null;
  }

  return projectRoomOutcomeToGateway(db, input);
}

export function resolveGatewayOutcomeProjectionMode(message: VirtualMessage): GatewayOutcomeProjectionMode {
  if (message.kind === "final_ready" || message.kind === "progress") {
    return "session_reply";
  }
  if (message.kind === "handoff" || message.kind === "approval" || message.kind === "system_notice") {
    return "workbench_notice";
  }

  return "no_external_projection";
}

function requireRoom(db: DatabaseSync, roomKey: string) {
  const room = getThreadRoom(db, roomKey);
  if (!room) {
    throw new Error(`thread room not found: ${roomKey}`);
  }

  return room;
}

function findGatewayOutcomeProjection(db: DatabaseSync, roomKey: string, messageId: string) {
  const event = listThreadLedgerEvents(db, roomKey).find((entry) => {
    if (entry.type !== "gateway.outcome.projected") {
      return false;
    }

    const payload = readGatewayOutcomePayload(entry);
    return payload?.messageId === messageId;
  });
  if (!event) {
    return null;
  }

  const payload = readGatewayOutcomePayload(event);
  if (!payload) {
    return null;
  }

  return {
    ...payload,
    projectedAt: event.createdAt
  };
}

export function markGatewayOutcomeDispatched(
  db: DatabaseSync,
  input: GatewayOutcomeDispatchInput
) {
  const room = requireRoom(db, input.roomKey);
  appendThreadLedgerEvent(db, {
    roomKey: room.roomKey,
    revision: room.revision,
    type: "gateway.outcome.dispatch_succeeded",
    payload: {
      messageId: input.messageId,
      sessionKey: input.sessionKey,
      mode: input.mode,
      projectedAt: input.projectedAt,
      dispatchTarget: input.dispatchTarget ?? null
    }
  });

  return {
    ...input,
    dispatchStatus: "dispatched" as const,
    dispatchAttemptedAt: input.dispatchedAt ?? new Date().toISOString()
  };
}

export function markGatewayOutcomeDispatchFailed(
  db: DatabaseSync,
  input: GatewayOutcomeDispatchInput
) {
  const room = requireRoom(db, input.roomKey);
  const dispatchError = redactSensitiveText(input.dispatchError ?? "gateway outcome dispatch failed");
  appendThreadLedgerEvent(db, {
    roomKey: room.roomKey,
    revision: room.revision,
    type: "gateway.outcome.dispatch_failed",
    payload: {
      messageId: input.messageId,
      sessionKey: input.sessionKey,
      mode: input.mode,
      projectedAt: input.projectedAt,
      dispatchError
    }
  });

  return {
    ...input,
    dispatchError,
    dispatchStatus: "failed" as const,
    dispatchAttemptedAt: input.dispatchedAt ?? new Date().toISOString()
  };
}

function readGatewayOutcomePayload(event: ThreadLedgerEvent) {
  const payload =
    typeof event.payload === "object" && event.payload !== null
      ? (event.payload as Record<string, unknown>)
      : null;
  if (!payload) {
    return null;
  }

  const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : null;
  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  const mode = typeof payload.mode === "string" ? payload.mode : null;
  if (!sessionKey || !messageId || !mode) {
    return null;
  }

  return {
    sessionKey,
    messageId,
    mode: mode as GatewayOutcomeProjectionMode,
    dispatchStatus:
      payload.dispatchStatus === "pending" || payload.dispatchStatus === "dispatched" || payload.dispatchStatus === "failed"
        ? (payload.dispatchStatus as GatewayOutcomeDispatchStatus)
        : ("pending" as GatewayOutcomeDispatchStatus),
    dispatchTarget: typeof payload.dispatchTarget === "string" ? payload.dispatchTarget : undefined,
    dispatchError: typeof payload.dispatchError === "string" ? payload.dispatchError : undefined,
    dispatchAttemptedAt:
      typeof payload.dispatchAttemptedAt === "string" ? payload.dispatchAttemptedAt : undefined
  };
}
