import path from "node:path";

import type { DatabaseSync } from "node:sqlite";

import type {
  GatewayOutcomeDispatchStatus,
  GatewayOutcomeProjectionMode,
  GatewayProjectionTrace,
  MailboxDelivery,
  ThreadLedgerEvent,
  VirtualMessage
} from "./types.js";
import { readSharedFactsState } from "./shared-facts.js";
import { readRoomNotesFromStateDir } from "../memory/room-memory.js";
import { listMailAttachmentsForRoom } from "../storage/repositories/mail-attachments.js";
import { listMailOutboxAttemptsForRoom } from "../storage/repositories/mail-outbox-attempts.js";
import {
  listApprovalRequestsForRoom,
  listControlPlaneOutboxForRoom,
  listOutboxIntentsForRoom,
  mapOutboxIntentToMailOutboxRecord
} from "../storage/repositories/outbox-intents.js";
import {
  listMemoryNamespacesForRoom,
  listMemoryPromotionsForRoom
} from "../storage/repositories/memory-registry.js";
import { listMailRunsForRoom } from "../storage/repositories/mail-runs.js";
import { listProviderEventsForRoom } from "../storage/repositories/provider-events.js";
import { listRoomPreSnapshots } from "../storage/repositories/room-pre-snapshots.js";
import { listRoomParticipants } from "../storage/repositories/room-participants.js";
import { listTaskNodesForRoom } from "../storage/repositories/task-nodes.js";
import { listThreadLedgerEvents } from "../storage/repositories/thread-ledger.js";
import { getThreadRoom } from "../storage/repositories/thread-rooms.js";
import { listVirtualMailboxesForRoom } from "../storage/repositories/virtual-mailboxes.js";
import { listVirtualMessagesForRoom } from "../storage/repositories/virtual-messages.js";
import { listVirtualThreadsForRoom } from "../storage/repositories/virtual-threads.js";
import { listWorkerSessionsForRoom } from "../storage/repositories/worker-sessions.js";
import { listMailboxDeliveriesForRoom } from "../storage/repositories/mailbox-deliveries.js";
import { listSubAgentRunsForRoom } from "../storage/repositories/subagent-runs.js";
import { listSubAgentTargetsForAccount } from "../storage/repositories/subagent-targets.js";
import { listGatewaySessionBindingsForRoom } from "../storage/repositories/gateway-session-bindings.js";
import { getRoomProject, } from "../orchestration/project-runtime.js";
import { listRoomProjectLinks } from "../storage/repositories/project-aggregates.js";
import { listScheduledMailJobsForRoom } from "../storage/repositories/scheduled-mail-jobs.js";

export function replayRoom(db: DatabaseSync, roomKey: string) {
  const room = getThreadRoom(db, roomKey);
  const roomNotes = room ? readRoomNotesForReplay(room) : null;
  const ledger = listThreadLedgerEvents(db, roomKey);
  const virtualMessages = listVirtualMessagesForRoom(db, roomKey);
  const mailboxDeliveries = listMailboxDeliveriesForRoom(db, roomKey);

  return {
    room,
    project: getRoomProject(db, roomKey),
    roomProjectLinks: listRoomProjectLinks(db, roomKey),
    scheduledMailJobs: listScheduledMailJobsForRoom(db, roomKey),
    sharedFacts: readSharedFactsState({
      roomKey,
      sharedFactsRef: room?.sharedFactsRef
    }),
    roomNotes,
    preSnapshots: listRoomPreSnapshots(db, roomKey),
    ledger,
    providerEvents: listProviderEventsForRoom(db, roomKey),
    runs: listMailRunsForRoom(db, roomKey),
    outbox: listControlPlaneOutboxForRoom(db, roomKey).map(mapOutboxIntentToMailOutboxRecord),
    outboxIntents: listOutboxIntentsForRoom(db, roomKey),
    approvalRequests: listApprovalRequestsForRoom(db, roomKey),
    memoryNamespaces: listMemoryNamespacesForRoom(db, roomKey),
    memoryPromotions: listMemoryPromotionsForRoom(db, roomKey),
    outboxAttempts: listMailOutboxAttemptsForRoom(db, roomKey),
    attachments: listMailAttachmentsForRoom(db, roomKey),
    participants: listRoomParticipants(db, roomKey),
    workerSessions: listWorkerSessionsForRoom(db, roomKey),
    taskNodes: listTaskNodesForRoom(db, roomKey),
    virtualMailboxes: listVirtualMailboxesForRoom(db, roomKey),
    virtualThreads: listVirtualThreadsForRoom(db, roomKey),
    virtualMessages,
    mailboxDeliveries,
    gatewaySessionBindings: listGatewaySessionBindingsForRoom(db, roomKey),
    subagentTargets: room ? listSubAgentTargetsForAccount(db, room.accountId) : [],
    subagentRuns: listSubAgentRunsForRoom(db, roomKey),
    gatewayProjectionTrace: buildGatewayProjectionTrace(roomKey, virtualMessages, mailboxDeliveries, ledger)
  };
}

export function buildGatewayProjectionTrace(
  roomKey: string,
  virtualMessages: VirtualMessage[],
  mailboxDeliveries: MailboxDelivery[],
  ledger: ThreadLedgerEvent[]
): GatewayProjectionTrace {
  const messages = virtualMessages.filter((message) => message.originKind === "gateway_chat");
  const messageIds = new Set(messages.map((message) => message.messageId));
  const deliveries = mailboxDeliveries.filter((delivery) => messageIds.has(delivery.messageId));
  const outcomeProjections = mergeGatewayOutcomeProjections(ledger.flatMap(extractGatewayOutcomeProjection));
  const outcomeMessageIds = new Set(outcomeProjections.map((projection) => projection.messageId));
  const outcomeMessages = virtualMessages.filter((message) => outcomeMessageIds.has(message.messageId));
  const deliveryEntries = messages.map((message) => ({
    message,
    deliveries: deliveries.filter((delivery) => delivery.messageId === message.messageId)
  }));

  return {
    roomKey,
    messageIds: messages.map((message) => message.messageId),
    messages,
    deliveries,
    deliveryEntries,
    outcomeProjections,
    outcomeMessageIds: outcomeMessages.map((message) => message.messageId),
    outcomeMessages,
    outcomeModes: uniqueDefined(outcomeProjections.map((projection) => projection.mode)) as GatewayOutcomeProjectionMode[],
    ledger: ledger.filter((event) =>
      event.type === "gateway.session.bound" ||
      event.type === "gateway.turn.projected" ||
      event.type === "gateway.outcome.projected" ||
      extractProjectionTraceMessageIds(event).some(
        (messageId) => messageIds.has(messageId) || outcomeMessageIds.has(messageId)
      )
    ),
    controlPlanes: uniqueDefined(messages.map((message) => message.projectionMetadata.origin.controlPlane)),
    sessionKeys: uniqueDefined(messages.map((message) => message.projectionMetadata.origin.sessionKey)),
    runIds: uniqueDefined(messages.map((message) => message.projectionMetadata.origin.runId))
  };
}

function readRoomNotesForReplay(room: NonNullable<ReturnType<typeof getThreadRoom>>) {
  const stateDir = inferStateDirFromArtifactPath(room.sharedFactsRef ?? room.summaryRef);
  if (!stateDir) {
    return null;
  }

  return readRoomNotesFromStateDir(stateDir, room.accountId, room.roomKey);
}

function mergeGatewayOutcomeProjections(
  projections: Array<{
    messageId: string;
    sessionKey: string;
    mode: GatewayOutcomeProjectionMode;
    projectedAt: string;
    dispatchStatus: GatewayOutcomeDispatchStatus;
    dispatchTarget?: string;
    dispatchError?: string;
    dispatchAttemptedAt?: string;
  }>
) {
  const merged = new Map<string, (typeof projections)[number]>();
  for (const projection of projections) {
    const current = merged.get(projection.messageId);
    if (!current) {
      merged.set(projection.messageId, projection);
      continue;
    }
    merged.set(projection.messageId, {
      ...current,
      sessionKey: projection.sessionKey || current.sessionKey,
      mode: projection.mode || current.mode,
      projectedAt: current.projectedAt,
      dispatchStatus: projection.dispatchStatus,
      dispatchTarget: projection.dispatchTarget ?? current.dispatchTarget,
      dispatchError: projection.dispatchError ?? current.dispatchError,
      dispatchAttemptedAt: projection.dispatchAttemptedAt ?? current.dispatchAttemptedAt
    });
  }
  return [...merged.values()];
}

function inferStateDirFromArtifactPath(artifactPath?: string) {
  if (!artifactPath) {
    return null;
  }

  const normalizedPath = path.normalize(artifactPath);
  const marker = `${path.sep}threads${path.sep}`;
  const markerIndex = normalizedPath.lastIndexOf(marker);

  return markerIndex >= 0 ? normalizedPath.slice(0, markerIndex) : null;
}

function uniqueDefined(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));
}

function extractProjectionTraceMessageIds(event: ThreadLedgerEvent) {
  const payload = typeof event.payload === "object" && event.payload !== null
    ? (event.payload as Record<string, unknown>)
    : null;
  if (!payload) {
    return [];
  }

  const directIds = [
    payload.messageId,
    payload.parentMessageId,
    payload.resultMessageId
  ].filter((value): value is string => typeof value === "string" && value.length > 0);

  const nestedMessage = typeof payload.message === "object" && payload.message !== null
    ? (payload.message as Record<string, unknown>)
    : null;
  const nestedDelivery = typeof payload.delivery === "object" && payload.delivery !== null
    ? (payload.delivery as Record<string, unknown>)
    : null;

  return uniqueDefined([
    ...directIds,
    typeof nestedMessage?.messageId === "string" ? nestedMessage.messageId : undefined,
    typeof nestedDelivery?.messageId === "string" ? nestedDelivery.messageId : undefined
  ]);
}

function extractGatewayOutcomeProjection(event: ThreadLedgerEvent) {
  if (
    event.type !== "gateway.outcome.projected" &&
    event.type !== "gateway.outcome.dispatch_succeeded" &&
    event.type !== "gateway.outcome.dispatch_failed"
  ) {
    return [];
  }

  const payload =
    typeof event.payload === "object" && event.payload !== null
      ? (event.payload as Record<string, unknown>)
      : null;
  if (!payload) {
    return [];
  }

  const messageId = typeof payload.messageId === "string" ? payload.messageId : null;
  if (!messageId) {
    return [];
  }

  if (event.type === "gateway.outcome.projected") {
    const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : null;
    const mode = typeof payload.mode === "string" ? payload.mode : null;
    if (!sessionKey || !mode) {
      return [];
    }

    return [
      {
        messageId,
        sessionKey,
        mode: mode as GatewayOutcomeProjectionMode,
        projectedAt: event.createdAt,
        dispatchStatus: readDispatchStatus(payload.dispatchStatus) ?? ("pending" as GatewayOutcomeDispatchStatus),
        dispatchTarget: typeof payload.dispatchTarget === "string" ? payload.dispatchTarget : undefined,
        dispatchError: typeof payload.dispatchError === "string" ? payload.dispatchError : undefined,
        dispatchAttemptedAt:
          typeof payload.dispatchAttemptedAt === "string" ? payload.dispatchAttemptedAt : undefined
      }
    ];
  }

  return [
    {
      messageId,
      sessionKey: typeof payload.sessionKey === "string" ? payload.sessionKey : "",
      mode: (typeof payload.mode === "string" ? payload.mode : "no_external_projection") as GatewayOutcomeProjectionMode,
      projectedAt: typeof payload.projectedAt === "string" ? payload.projectedAt : event.createdAt,
      dispatchStatus:
        event.type === "gateway.outcome.dispatch_succeeded"
          ? ("dispatched" as GatewayOutcomeDispatchStatus)
          : ("failed" as GatewayOutcomeDispatchStatus),
      dispatchTarget: typeof payload.dispatchTarget === "string" ? payload.dispatchTarget : undefined,
      dispatchError: typeof payload.dispatchError === "string" ? payload.dispatchError : undefined,
      dispatchAttemptedAt: event.createdAt
    }
  ];
}

function readDispatchStatus(value: unknown): GatewayOutcomeDispatchStatus | null {
  return value === "pending" || value === "dispatched" || value === "failed"
    ? (value as GatewayOutcomeDispatchStatus)
    : null;
}
