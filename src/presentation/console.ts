import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import { replayRoom } from "../core/replay.js";
import { projectMailboxFeed } from "../core/virtual-mail.js";
import type {
  GatewayOutcomeProjectionMode,
  MailTaskKind,
  MailTaskStage,
  GatewayProjectionTrace,
  MailboxDeliveryStatus,
  RoomPreSnapshot,
  TaskStatus,
  ThreadRoom,
  VirtualMessageOriginKind
} from "../core/types.js";
import { evaluateSenderPolicy } from "../security/sender-policy.js";
import { getMailAccount, listMailAccounts } from "../storage/repositories/mail-accounts.js";
import { listMailMessagesForRoom } from "../storage/repositories/mail-messages.js";
import {
  type ApprovalRequestRecord,
  type OutboxIntentRecord
} from "../storage/repositories/outbox-intents.js";
import { listProviderCursors } from "../storage/repositories/provider-cursors.js";
import { listProviderEventsForAccount } from "../storage/repositories/provider-events.js";
import { listPublicAgentInboxesForAccount } from "../storage/repositories/public-agent-inboxes.js";
import { getThreadRoom, listThreadRooms } from "../storage/repositories/thread-rooms.js";
import { listVirtualMailboxesForAccount } from "../storage/repositories/virtual-mailboxes.js";
import {
  type AccountProviderStateSummary,
  summarizeAccountProviderState
} from "./provider-state.js";

export const consoleTerminology = {
  room: "room",
  virtualMail: "virtual mail",
  mailbox: "mailbox",
  projection: "projection",
  approval: "approval",
  delivery: "delivery",
  providerState: "provider state"
} as const;

export const consoleBoundaries = {
  readOnly: true,
  mailboxClient: true,
  workbenchMailboxTab: true,
  automaticGatewayRoundTrip: false
} as const;

export interface ConsoleRoomSummary {
  roomKey: string;
  accountId: string;
  stableThreadId: string;
  displayTitle: string;
  state: ThreadRoom["state"];
  attention: "stable" | "watch" | "critical";
  revision: number;
  frontAgentAddress: string | null;
  frontAgentId: string | null;
  publicAgentAddresses: string[];
  publicAgentIds: string[];
  collaboratorAgentAddresses: string[];
  collaboratorAgentIds: string[];
  summonedRoles: string[];
  mailboxIds: string[];
  mailboxCount: number;
  originKinds: VirtualMessageOriginKind[];
  latestSubject: string | null;
  latestActivityAt: string | null;
  latestInboundAt: string | null;
  latestOutboundAt: string | null;
  latestMessageAt: string | null;
  pendingApprovalCount: number;
  openDeliveryCount: number;
  gatewayProjected: boolean;
  gatewayOutcomeCount: number;
  pendingGatewayDispatchCount: number;
  failedGatewayDispatchCount: number;
  preSnapshotCount: number;
  attachmentCount: number;
  resourceCount: number;
  visibleAgentCount: number;
  latestPreKind: RoomPreSnapshot["kind"] | null;
  latestPreAudience: RoomPreSnapshot["audience"] | null;
  latestPreSummary: string | null;
  activeThreadCount: number;
  messageCount: number;
  deliveryCount: number;
  mailTaskKind: MailTaskKind | null;
  mailTaskStage: MailTaskStage | null;
  mailTaskStatus: TaskStatus | null;
  nextAction: string | null;
}

export interface ConsoleMailTaskSummary {
  nodeId: string;
  revision: number;
  kind: MailTaskKind;
  stage: MailTaskStage;
  status: TaskStatus;
  title: string | null;
  summary: string | null;
  nextAction: string | null;
  priority: number;
  deadlineMs: number | null;
}

export interface ConsoleRoomDetail {
  terminology: typeof consoleTerminology;
  boundaries: typeof consoleBoundaries;
  room: ConsoleRoomSummary;
  taskMail: ConsoleSourceMailSummary | null;
  publicMails: ConsoleSourceMailSummary[];
  latestRun: ConsoleRoomRunSummary | null;
  tasks: ConsoleMailTaskSummary[];
  preSnapshots: RoomPreSnapshot[];
  roomNotes: ReturnType<typeof replayRoom>["roomNotes"];
  attachments: ReturnType<typeof replayRoom>["attachments"];
  virtualMessages: ConsoleVirtualMessageSummary[];
  mailboxDeliveries: ConsoleMailboxDeliverySummary[];
  outboxIntents: ConsoleOutboxIntentSummary[];
  timeline: ConsoleTimelineEntry[];
  approvals: ConsoleApprovalSummary[];
  mailboxes: ConsoleMailboxSummary[];
  gatewayTrace: ConsoleGatewayTraceSummary;
  counts: {
    providerEvents: number;
    ledgerEvents: number;
    taskNodes: number;
    virtualMessages: number;
    mailboxDeliveries: number;
    approvals: number;
    outboxIntents: number;
    preSnapshots: number;
    timelineByCategory: {
      provider: number;
      ledger: number;
      virtualMail: number;
      approval: number;
      delivery: number;
    };
  };
}

export interface ConsoleSourceMailSummary {
  dedupeKey: string;
  providerMessageId: string | null;
  internetMessageId: string;
  subject: string;
  from: string | null;
  to: string[];
  cc: string[];
  receivedAt: string;
  createdAt: string;
  excerpt: string | null;
  textBody: string | null;
}

export interface ConsoleRoomRunSummary {
  runId: string;
  revision: number;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

export interface ConsoleTimelineEntry {
  entryId: string;
  roomKey: string;
  at: string;
  category: "provider" | "ledger" | "virtual_mail" | "approval" | "delivery";
  type: string;
  title: string;
  detail?: string;
  revision?: number;
  status?: string;
}

export interface ConsoleVirtualMessageSummary {
  messageId: string;
  threadId: string;
  parentMessageId: string | null;
  kind: string;
  visibility: string;
  originKind: VirtualMessageOriginKind;
  subject: string;
  fromMailboxId: string;
  toMailboxIds: string[];
  ccMailboxIds: string[];
  bodyText: string;
  attachments: Array<{
    attachmentId: string;
    filename: string;
    mimeType: string;
    downloadPath: string;
  }>;
  roomRevision: number;
  createdAt: string;
}

export interface ConsoleMailboxDeliverySummary {
  deliveryId: string;
  messageId: string;
  mailboxId: string;
  status: MailboxDeliveryStatus;
  leaseOwner: string | null;
  leaseUntil: string | null;
  consumedAt: string | null;
  updatedAt: string;
}

export interface ConsoleOutboxIntentSummary {
  intentId: string;
  legacyOutboxId: string;
  kind: OutboxIntentRecord["kind"];
  status: OutboxIntentRecord["status"];
  subject: string;
  to: string[];
  cc: string[];
  bcc: string[];
  providerMessageId: string | null;
  errorText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleGatewayTraceSummary {
  projectedMessageCount: number;
  projectedDeliveryCount: number;
  projectedOutcomeCount: number;
  pendingDispatchCount: number;
  failedDispatchCount: number;
  latestDispatchAttemptAt: string | null;
  outcomeProjections: Array<{
    messageId: string;
    sessionKey: string;
    mode: GatewayOutcomeProjectionMode;
    projectedAt: string;
    dispatchStatus: GatewayProjectionTrace["outcomeProjections"][number]["dispatchStatus"];
    dispatchTarget?: string;
    dispatchError?: string;
    dispatchAttemptedAt?: string;
  }>;
  outcomeModes: GatewayOutcomeProjectionMode[];
  controlPlanes: string[];
  sessionKeys: string[];
  runIds: string[];
}

export interface ConsoleApprovalSummary {
  requestId: string;
  roomKey: string;
  accountId: string;
  status: ApprovalRequestRecord["status"];
  outboxStatus: OutboxIntentRecord["status"] | null;
  subject: string;
  recipients: {
    to: string[];
    cc: string[];
    bcc: string[];
  };
  requestedAt: string;
  decidedAt: string | null;
  updatedAt: string;
  errorText: string | null;
}

export interface ConsoleMailboxSummary {
  mailboxId: string;
  accountId: string;
  kind: string;
  role: string | null;
  active: boolean;
  messageCount: number;
  roomCount: number;
  latestRoomKey: string | null;
  latestMessageAt: string | null;
  latestSubject: string | null;
  originKinds: VirtualMessageOriginKind[];
  deliveryStatusCounts: Partial<Record<MailboxDeliveryStatus, number>>;
}

export interface ConsoleAccountSummary {
  accountId: string;
  provider: string;
  emailAddress: string;
  displayName: string | null;
  status: string;
  providerState: AccountProviderStateSummary;
  health: "healthy" | "degraded" | "attention_required";
  roomCount: number;
  activeRoomCount: number;
  pendingApprovalCount: number;
  mailboxCount: number;
  inboxCount: number;
  latestActivityAt: string | null;
}

export interface ConsoleAccountDetail {
  terminology: typeof consoleTerminology;
  boundaries: typeof consoleBoundaries;
  account: ConsoleAccountSummary;
  mailboxes: ConsoleMailboxSummary[];
  rooms: ConsoleRoomSummary[];
  inboxes: Array<{
    inboxId: string;
    agentId: string;
    activeRoomLimit: number;
    ackSlaSeconds: number;
    burstCoalesceSeconds: number;
  }>;
}

export function listConsoleRooms(
  db: DatabaseSync,
  input: {
    accountId?: string;
    roomKey?: string;
    mailboxId?: string;
    statuses?: string[];
    originKinds?: VirtualMessageOriginKind[];
    limit?: number;
  } = {}
) {
  const summaries = listThreadRooms(db)
    .map((room) => replayRoom(db, room.roomKey))
    .filter((snapshot) => roomVisibleInWorkbench(db, snapshot))
    .map((snapshot) => buildConsoleRoomSummary(snapshot))
    .filter((summary) => matchesRoomFilters(summary, input))
    .sort((left, right) => compareDescending(left.latestActivityAt, right.latestActivityAt));

  return typeof input.limit === "number" ? summaries.slice(0, Math.max(1, input.limit)) : summaries;
}

export function getConsoleRoom(db: DatabaseSync, roomKey: string): ConsoleRoomDetail | null {
  const snapshot = replayRoom(db, roomKey);
  if (!snapshot.room || !roomVisibleInWorkbench(db, snapshot)) {
    return null;
  }
  const timeline = buildRoomTimeline(snapshot);
  const sourceMails = buildConsoleSourceMailSummaries(db, snapshot);

  return {
    terminology: consoleTerminology,
    boundaries: consoleBoundaries,
    room: buildConsoleRoomSummary(snapshot),
    taskMail: sourceMails[0] ?? null,
    publicMails: sourceMails.slice(1).reverse(),
    latestRun: buildLatestRoomRunSummary(snapshot),
    tasks: buildRoomTaskSummaries(snapshot),
    preSnapshots: snapshot.preSnapshots,
    roomNotes: snapshot.roomNotes,
    attachments: snapshot.attachments,
    virtualMessages: buildConsoleVirtualMessageSummaries(snapshot),
    mailboxDeliveries: buildConsoleMailboxDeliverySummaries(snapshot),
    outboxIntents: buildConsoleOutboxIntentSummaries(snapshot),
    timeline,
    approvals: buildApprovalSummaries(snapshot.room.accountId, snapshot.room.roomKey, snapshot.approvalRequests, snapshot.outboxIntents),
    mailboxes: buildRoomMailboxSummaries(db, snapshot.room.accountId, snapshot.room.roomKey),
    gatewayTrace: summarizeGatewayTrace(snapshot.gatewayProjectionTrace),
    counts: {
      providerEvents: snapshot.providerEvents.length,
      ledgerEvents: snapshot.ledger.length,
      taskNodes: snapshot.taskNodes.length,
      virtualMessages: snapshot.virtualMessages.length,
      mailboxDeliveries: snapshot.mailboxDeliveries.length,
      approvals: snapshot.approvalRequests.length,
      outboxIntents: snapshot.outboxIntents.length,
      preSnapshots: snapshot.preSnapshots.length,
      timelineByCategory: {
        provider: timeline.filter((entry) => entry.category === "provider").length,
        ledger: timeline.filter((entry) => entry.category === "ledger").length,
        virtualMail: timeline.filter((entry) => entry.category === "virtual_mail").length,
        approval: timeline.filter((entry) => entry.category === "approval").length,
        delivery: timeline.filter((entry) => entry.category === "delivery").length
      }
    }
  };
}

export function listConsoleApprovals(
  db: DatabaseSync,
  input: {
    accountId?: string;
    roomKey?: string;
    statuses?: ApprovalRequestRecord["status"][];
    limit?: number;
  } = {}
) {
  const rooms = input.roomKey
    ? [getThreadRoom(db, input.roomKey)].filter((value): value is ThreadRoom => value !== null)
    : listThreadRooms(db);
  const approvals = rooms.flatMap((room) => {
    const snapshot = replayRoom(db, room.roomKey);
    return buildApprovalSummaries(room.accountId, room.roomKey, snapshot.approvalRequests, snapshot.outboxIntents);
  });
  const filtered = approvals
    .filter((approval) => {
      if (input.accountId && approval.accountId !== input.accountId) {
        return false;
      }
      if (input.statuses && input.statuses.length > 0 && !input.statuses.includes(approval.status)) {
        return false;
      }
      return true;
    })
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt));

  return typeof input.limit === "number" ? filtered.slice(0, Math.max(1, input.limit)) : filtered;
}

export function listConsoleAccounts(
  db: DatabaseSync,
  input: {
    globalSmtpConfigured: boolean;
  }
) {
  return listMailAccounts(db)
    .map((account) => {
      const rooms = listConsoleRooms(db, {
        accountId: account.accountId
      });
      const providerState = summarizeAccountProviderState(
        account,
        listProviderCursors(db, account.accountId),
        listProviderEventsForAccount(db, account.accountId),
        {
          globalSmtpConfigured: input.globalSmtpConfigured
        }
      );
      const health = classifyAccountHealth(account.status, providerState);
      const pendingApprovalCount = listConsoleApprovals(db, {
        accountId: account.accountId,
        statuses: ["requested"]
      }).length;

      return {
        accountId: account.accountId,
        provider: account.provider,
        emailAddress: account.emailAddress,
        displayName: account.displayName ?? null,
        status: account.status,
        providerState,
        health,
        roomCount: rooms.length,
        activeRoomCount: rooms.filter((room) => !["done", "failed"].includes(room.state)).length,
        pendingApprovalCount,
        mailboxCount: listVirtualMailboxesForAccount(db, account.accountId).length,
        inboxCount: listPublicAgentInboxesForAccount(db, account.accountId).length,
        latestActivityAt: latestTimestamp(rooms.map((room) => room.latestActivityAt))
      } satisfies ConsoleAccountSummary;
    })
    .sort((left, right) => {
      const healthRank = rankHealth(left.health) - rankHealth(right.health);
      if (healthRank !== 0) {
        return healthRank;
      }
      return compareDescending(left.latestActivityAt, right.latestActivityAt);
    });
}

export function getConsoleAccount(
  db: DatabaseSync,
  accountId: string,
  input: {
    globalSmtpConfigured: boolean;
  }
): ConsoleAccountDetail | null {
  const account = listConsoleAccounts(db, input).find((entry) => entry.accountId === accountId);
  if (!account) {
    return null;
  }

  return {
    terminology: consoleTerminology,
    boundaries: consoleBoundaries,
    account,
    rooms: listConsoleRooms(db, {
      accountId
    }),
    mailboxes: buildAccountMailboxSummaries(db, accountId),
    inboxes: listPublicAgentInboxesForAccount(db, accountId).map((inbox) => ({
      inboxId: inbox.inboxId,
      agentId: inbox.agentId,
      activeRoomLimit: inbox.activeRoomLimit,
      ackSlaSeconds: inbox.ackSlaSeconds,
      burstCoalesceSeconds: inbox.burstCoalesceSeconds
    }))
  };
}

function buildConsoleRoomSummary(snapshot: ReturnType<typeof replayRoom>): ConsoleRoomSummary {
  if (!snapshot.room) {
    throw new Error("console room summary requires a room");
  }
  const room = snapshot.room;

  const latestMessage = [...snapshot.virtualMessages].sort((left, right) =>
    compareDescending(left.createdAt, right.createdAt)
  )[0];
  const latestOutbox = [...snapshot.outboxIntents].sort((left, right) =>
    compareDescending(left.updatedAt, right.updatedAt)
  )[0];
  const latestPreSnapshot = [...snapshot.preSnapshots].sort((left, right) =>
    compareDescending(left.createdAt, right.createdAt)
  )[0];
  const roomTasks = buildRoomTaskSummaries(snapshot);
  const currentMailTask = roomTasks.find((task) => task.revision === room.revision) ?? roomTasks[0] ?? null;
  const displayTitle = resolveRoomDisplayTitle({
    roomKey: room.roomKey,
    latestSubject: latestMessage?.subject ?? latestOutbox?.subject ?? null,
    latestPreSummary: latestPreSnapshot?.summary ?? null,
    taskTitle: currentMailTask?.title ?? null,
    taskSummary: currentMailTask?.summary ?? null
  });

  return {
    roomKey: room.roomKey,
    accountId: room.accountId,
    stableThreadId: room.stableThreadId,
    displayTitle,
    state: room.state,
    attention: classifyRoomAttention({
      state: room.state,
      pendingApprovalCount: snapshot.approvalRequests.filter((request) => request.status === "requested").length,
      openDeliveryCount: snapshot.outboxIntents.filter((intent) =>
        ["pending_approval", "queued", "sending"].includes(intent.status)
      ).length,
      failedGatewayDispatchCount: snapshot.gatewayProjectionTrace.outcomeProjections.filter(
        (projection) => projection.dispatchStatus === "failed"
      ).length
    }),
    revision: room.revision,
    frontAgentAddress: room.frontAgentAddress ?? null,
    frontAgentId: room.frontAgentId ?? null,
    publicAgentAddresses: [...(room.publicAgentAddresses ?? [])],
    publicAgentIds: [...(room.publicAgentIds ?? [])],
    collaboratorAgentAddresses: [...(room.collaboratorAgentAddresses ?? [])],
    collaboratorAgentIds: [...(room.collaboratorAgentIds ?? [])],
    summonedRoles: [...(room.summonedRoles ?? [])],
    mailboxIds: uniqueStrings(snapshot.mailboxDeliveries.map((delivery) => delivery.mailboxId)),
    mailboxCount: uniqueStrings(snapshot.mailboxDeliveries.map((delivery) => delivery.mailboxId)).length,
    originKinds: uniqueStrings(snapshot.virtualMessages.map((message) => message.originKind)) as VirtualMessageOriginKind[],
    latestSubject: latestMessage?.subject ?? latestOutbox?.subject ?? null,
    latestActivityAt: latestTimestamp([
      ...snapshot.ledger.map((event) => event.createdAt),
      ...snapshot.providerEvents.map((event) => event.createdAt),
      ...snapshot.virtualMessages.map((message) => message.createdAt),
      ...snapshot.mailboxDeliveries.map((delivery) => delivery.updatedAt),
      ...snapshot.outboxIntents.map((intent) => intent.updatedAt),
      ...snapshot.approvalRequests.map((request) => request.updatedAt)
    ]),
    latestInboundAt: latestTimestamp([
      ...snapshot.providerEvents.map((event) => event.createdAt),
      ...snapshot.ledger
        .filter((event) => event.type === "mail.inbound_received")
        .map((event) => event.createdAt)
    ]),
    latestOutboundAt: latestTimestamp(snapshot.outboxIntents.map((intent) => intent.updatedAt)),
    latestMessageAt: latestMessage?.createdAt ?? null,
    pendingApprovalCount: snapshot.approvalRequests.filter((request) => request.status === "requested").length,
    openDeliveryCount: snapshot.outboxIntents.filter((intent) =>
      ["pending_approval", "queued", "sending"].includes(intent.status)
    ).length,
    gatewayProjected:
      snapshot.gatewayProjectionTrace.messageIds.length > 0 ||
      snapshot.gatewayProjectionTrace.outcomeProjections.length > 0,
    gatewayOutcomeCount: snapshot.gatewayProjectionTrace.outcomeProjections.length,
    pendingGatewayDispatchCount: snapshot.gatewayProjectionTrace.outcomeProjections.filter(
      (projection) => projection.dispatchStatus === "pending"
    ).length,
    failedGatewayDispatchCount: snapshot.gatewayProjectionTrace.outcomeProjections.filter(
      (projection) => projection.dispatchStatus === "failed"
    ).length,
    preSnapshotCount: snapshot.preSnapshots.length,
    attachmentCount: snapshot.attachments.length,
    resourceCount:
      snapshot.attachments.length +
      snapshot.preSnapshots.length +
      (snapshot.roomNotes?.documents?.length ?? 0),
    visibleAgentCount: uniqueStrings([
      room.frontAgentId ?? "",
      room.frontAgentAddress ?? "",
      ...(room.publicAgentIds ?? []),
      ...(room.publicAgentAddresses ?? []),
      ...(room.collaboratorAgentIds ?? []),
      ...(room.collaboratorAgentAddresses ?? [])
    ]).length,
    latestPreKind: latestPreSnapshot?.kind ?? null,
    latestPreAudience: latestPreSnapshot?.audience ?? null,
    latestPreSummary: latestPreSnapshot?.summary ?? null,
    activeThreadCount: snapshot.virtualThreads.filter((thread) => !["closed", "superseded"].includes(thread.status))
      .length,
    messageCount: snapshot.virtualMessages.length,
    deliveryCount: snapshot.mailboxDeliveries.length,
    mailTaskKind: currentMailTask?.kind ?? null,
    mailTaskStage: currentMailTask?.stage ?? null,
    mailTaskStatus: currentMailTask?.status ?? null,
    nextAction: currentMailTask?.nextAction ?? null
  };
}

function roomVisibleInWorkbench(db: DatabaseSync, snapshot: ReturnType<typeof replayRoom>) {
  if (!snapshot.room) {
    return false;
  }

  const account = getMailAccount(db, snapshot.room.accountId);
  if (!account || !workbenchInboundGuardEnabled(account.settings)) {
    return true;
  }

  const latestSourceMail = listMailMessagesForRoom(db, {
    accountId: snapshot.room.accountId,
    stableThreadId: snapshot.room.stableThreadId
  })
    .sort((left, right) => compareDescending(left.receivedAt, right.receivedAt))[0];
  if (!latestSourceMail) {
    return true;
  }

  const acceptAfter = resolveWorkbenchAcceptAfter(account.createdAt, account.settings);
  if (acceptAfter) {
    const receivedAtMs = Date.parse(latestSourceMail.receivedAt);
    const acceptAfterMs = Date.parse(acceptAfter);
    if (Number.isFinite(receivedAtMs) && Number.isFinite(acceptAfterMs) && receivedAtMs < acceptAfterMs) {
      return false;
    }
  }

  const from = typeof latestSourceMail.from === "string" ? latestSourceMail.from.trim().toLowerCase() : "";
  if (!from) {
    return true;
  }

  return evaluateSenderPolicy({
    from,
    config: resolveWorkbenchSenderPolicy(account.emailAddress, account.settings)
  }).allowed;
}

function buildConsoleSourceMailSummaries(db: DatabaseSync, snapshot: ReturnType<typeof replayRoom>): ConsoleSourceMailSummary[] {
  if (!snapshot.room) {
    return [];
  }

  return listMailMessagesForRoom(db, {
    accountId: snapshot.room.accountId,
    stableThreadId: snapshot.room.stableThreadId
  }).map((message) => ({
    dedupeKey: message.dedupeKey,
    providerMessageId: message.providerMessageId ?? null,
    internetMessageId: message.internetMessageId,
    subject: message.rawSubject ?? message.normalizedSubject,
    from: message.from ?? null,
    to: [...(message.to ?? [])],
    cc: [...(message.cc ?? [])],
    receivedAt: message.receivedAt,
    createdAt: message.createdAt,
    excerpt: summarizeMailBody(message.textBody),
    textBody: typeof message.textBody === "string" && message.textBody.trim().length > 0 ? message.textBody.trim() : null
  }));
}

function buildLatestRoomRunSummary(snapshot: ReturnType<typeof replayRoom>): ConsoleRoomRunSummary | null {
  const latestRun = [...snapshot.runs].sort((left, right) => compareDescending(left.startedAt, right.startedAt))[0];
  if (!latestRun) {
    return null;
  }

  const startedAtMs = Date.parse(latestRun.startedAt);
  const completedAtMs = latestRun.completedAt ? Date.parse(latestRun.completedAt) : Date.now();
  const durationMs =
    Number.isFinite(startedAtMs) && Number.isFinite(completedAtMs) && completedAtMs >= startedAtMs
      ? completedAtMs - startedAtMs
      : null;

  return {
    runId: latestRun.runId,
    revision: latestRun.revision,
    status: latestRun.status,
    startedAt: latestRun.startedAt,
    completedAt: latestRun.completedAt ?? null,
    durationMs
  };
}

function resolveRoomDisplayTitle(input: {
  roomKey: string;
  latestSubject: string | null;
  latestPreSummary: string | null;
  taskTitle: string | null;
  taskSummary: string | null;
}) {
  return (
    normalizeTitleCandidate(input.taskTitle) ??
    normalizeTitleCandidate(input.taskSummary) ??
    normalizeTitleCandidate(input.latestPreSummary) ??
    normalizeTitleCandidate(input.latestSubject) ??
    input.roomKey
  );
}

function normalizeTitleCandidate(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function summarizeMailBody(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function buildRoomTaskSummaries(snapshot: ReturnType<typeof replayRoom>): ConsoleMailTaskSummary[] {
  return snapshot.taskNodes
    .filter(
      (task): task is typeof task & { mailTaskKind: MailTaskKind; mailTaskStage: MailTaskStage } =>
        task.taskClass === "mail_protocol" && !!task.mailTaskKind && !!task.mailTaskStage
    )
    .map((task) => ({
      nodeId: task.nodeId,
      revision: task.revision,
      kind: task.mailTaskKind,
      stage: task.mailTaskStage,
      status: task.status,
      title: task.title ?? null,
      summary: task.summary ?? null,
      nextAction: task.nextAction ?? null,
      priority: task.priority,
      deadlineMs: task.deadlineMs ?? null
    }));
}

function buildRoomTimeline(snapshot: ReturnType<typeof replayRoom>): ConsoleTimelineEntry[] {
  return [
    ...snapshot.providerEvents.map((event) => ({
      entryId: `provider:${event.providerEventId}`,
      roomKey: snapshot.room?.roomKey ?? "",
      at: event.createdAt,
      category: "provider" as const,
      type: event.eventType,
      title: event.eventType,
      detail: event.cursorValue ? `cursor ${event.cursorValue}` : undefined
    })),
    ...snapshot.ledger.map((event) => ({
      entryId: `ledger:${event.seq}`,
      roomKey: snapshot.room?.roomKey ?? "",
      at: event.createdAt,
      category: "ledger" as const,
      type: event.type,
      title: event.type,
      revision: event.revision
    })),
    ...snapshot.virtualMessages.map((message) => ({
      entryId: `message:${message.messageId}`,
      roomKey: snapshot.room?.roomKey ?? "",
      at: message.createdAt,
      category: "virtual_mail" as const,
      type: message.kind,
      title: message.subject,
      detail: `${message.fromMailboxId} -> ${message.toMailboxIds.join(", ")}`,
      revision: message.roomRevision,
      status: message.originKind
    })),
    ...buildApprovalSummaries(
      snapshot.room?.accountId ?? "",
      snapshot.room?.roomKey ?? "",
      snapshot.approvalRequests,
      snapshot.outboxIntents
    ).map((approval) => ({
      entryId: `approval:${approval.requestId}`,
      roomKey: approval.roomKey,
      at: approval.updatedAt,
      category: "approval" as const,
      type: approval.status,
      title: approval.subject,
      detail: approval.recipients.to.join(", "),
      status: approval.outboxStatus ?? undefined
    })),
    ...snapshot.outboxIntents.map((intent) => ({
      entryId: `delivery:${intent.intentId}`,
      roomKey: snapshot.room?.roomKey ?? "",
      at: intent.updatedAt,
      category: "delivery" as const,
      type: intent.status,
      title: intent.subject,
      detail: intent.to.join(", "),
      status: intent.kind
    }))
  ].sort((left, right) => compareDescending(left.at, right.at));
}

function buildApprovalSummaries(
  accountId: string,
  roomKey: string,
  approvalRequests: ApprovalRequestRecord[],
  outboxIntents: OutboxIntentRecord[]
) {
  return approvalRequests.map((request) => {
    const outboxIntent =
      outboxIntents.find((intent) => intent.intentId === request.requestId || intent.legacyOutboxId === request.legacyOutboxId) ??
      null;

    return {
      requestId: request.requestId,
      roomKey,
      accountId,
      status: request.status,
      outboxStatus: outboxIntent?.status ?? null,
      subject: request.subject,
      recipients: {
        to: [...request.to],
        cc: [...request.cc],
        bcc: [...request.bcc]
      },
      requestedAt: request.requestedAt,
      decidedAt: request.decidedAt ?? null,
      updatedAt: request.updatedAt,
      errorText: request.errorText ?? null
    } satisfies ConsoleApprovalSummary;
  });
}

function buildConsoleVirtualMessageSummaries(snapshot: ReturnType<typeof replayRoom>) {
  return [...snapshot.virtualMessages]
    .sort((left, right) => compareDescending(left.createdAt, right.createdAt))
    .map((message) => ({
      messageId: message.messageId,
      threadId: message.threadId,
      parentMessageId: message.parentMessageId ?? null,
      kind: message.kind,
      visibility: message.visibility,
      originKind: message.originKind,
      subject: message.subject,
      fromMailboxId: message.fromMailboxId,
      toMailboxIds: [...message.toMailboxIds],
      ccMailboxIds: [...message.ccMailboxIds],
      bodyText: readConsoleVirtualMessageBody(snapshot, message),
      attachments: buildConsoleVirtualMessageAttachments(snapshot, message),
      roomRevision: message.roomRevision,
      createdAt: message.createdAt
    }) satisfies ConsoleVirtualMessageSummary);
}

function readConsoleVirtualMessageBody(
  snapshot: ReturnType<typeof replayRoom>,
  message: ReturnType<typeof replayRoom>["virtualMessages"][number]
) {
  const artifactBody = readConsoleArtifactBody(message.bodyRef, message.subject);
  if (artifactBody) {
    return artifactBody;
  }

  const synthesizedBody = synthesizeConsoleVirtualMessageBody(snapshot, message);
  if (synthesizedBody) {
    return synthesizedBody;
  }

  const latestSnapshot = snapshot.preSnapshots.find((entry) => entry.roomRevision === message.roomRevision);
  if (latestSnapshot) {
    const draft = (latestSnapshot.draftBody ?? latestSnapshot.summary ?? "").trim();
    if (draft.length > 0) {
      return draft;
    }
  }

  return message.subject.trim();
}

function readConsoleArtifactBody(bodyRef: string | undefined, subject: string) {
  if (!bodyRef || bodyRef.startsWith("virtual-body://") || !fs.existsSync(bodyRef)) {
    return "";
  }

  try {
    const text = fs.readFileSync(bodyRef, "utf8").trim();
    if (!text) {
      return "";
    }

    const structured = tryRenderConsoleStructuredArtifact(text, subject);
    return structured || text;
  } catch {
    return "";
  }
}

function tryRenderConsoleStructuredArtifact(text: string, subject: string) {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const normalized = parsed.normalized;
    if (normalized && typeof normalized === "object") {
      return formatConsoleWorkerBody(normalized as Record<string, unknown>, subject);
    }

    if (typeof parsed.taskInputText === "string") {
      return formatConsoleTaskArtifactBody(parsed);
    }
  } catch {
    return "";
  }

  return "";
}

function synthesizeConsoleVirtualMessageBody(
  snapshot: ReturnType<typeof replayRoom>,
  message: ReturnType<typeof replayRoom>["virtualMessages"][number]
) {
  const workerResult = snapshot.ledger.find((event) => {
    if (event.type !== "worker.result" || !event.payload || typeof event.payload !== "object") {
      return false;
    }
    const payload = event.payload as { resultMessageId?: unknown };
    return payload.resultMessageId === message.messageId;
  });
  if (workerResult?.payload && typeof workerResult.payload === "object") {
    return formatConsoleWorkerBody(workerResult.payload as Record<string, unknown>, message.subject);
  }

  const taskAssigned = snapshot.ledger.find((event) => {
    if (event.type !== "worker.task_assigned" || !event.payload || typeof event.payload !== "object") {
      return false;
    }
    const payload = event.payload as { taskMessageId?: unknown };
    return payload.taskMessageId === message.messageId;
  });
  if (taskAssigned?.payload && typeof taskAssigned.payload === "object") {
    return formatConsoleTaskBody(taskAssigned.payload as Record<string, unknown>);
  }

  const reducerCompleted = snapshot.ledger.find((event) => {
    if (event.type !== "virtual_mail.reducer_completed" || !event.payload || typeof event.payload !== "object") {
      return false;
    }
    const payload = event.payload as { messageId?: unknown };
    return payload.messageId === message.messageId;
  });
  if (reducerCompleted) {
    const latestSnapshot = snapshot.preSnapshots.find((entry) => entry.roomRevision === message.roomRevision);
    if (latestSnapshot) {
      return formatConsoleReducerBody(latestSnapshot);
    }
  }

  return "";
}

function formatConsoleWorkerBody(payload: Record<string, unknown>, subject: string) {
  const headline = asConsoleText(payload.headline ?? payload.decision);
  const summary = asConsoleText(payload.summary) ?? subject;
  const evidence = normalizeConsoleLineList(payload.keyEvidence ?? payload.key_evidence);
  const facts = normalizeConsoleFactList(payload.facts);
  const evidenceLines = evidence.length > 0 ? evidence : facts;
  const risks = normalizeConsoleLineList(payload.risks);
  const questions = normalizeConsoleLineList(payload.openQuestions ?? payload.open_questions);
  const pendingLines = risks.length > 0 ? risks : questions;
  const nextStep = asConsoleText(payload.nextStep ?? payload.next_step ?? payload.recommendedAction ?? payload.recommended_action);
  const draftReply = asConsoleText(payload.draftReply ?? payload.draft_reply);

  const sections = ["关心结果", headline ?? summary];
  if (summary && summary !== headline) {
    sections.push(summary);
  }
  if (evidenceLines.length > 0) {
    sections.push("", "关键依据", ...evidenceLines.map((line) => `- ${line}`));
  }
  if (pendingLines.length > 0) {
    sections.push("", "待确认", ...pendingLines.map((line) => `- ${line}`));
  }
  if (nextStep) {
    sections.push("", "下一步", nextStep);
  }
  if (draftReply) {
    sections.push("", "回信草稿", draftReply);
  }

  return sections.join("\n").trim();
}

function formatConsoleTaskBody(payload: Record<string, unknown>) {
  const role = asConsoleText(payload.role) ?? "worker";
  const inputRefs = Array.isArray(payload.inputRefs)
    ? payload.inputRefs.map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  const sections = ["关心结果", `已派发给 ${role}，等待回信。`];
  if (inputRefs.length > 0) {
    sections.push("", "关键依据", ...inputRefs.slice(0, 4).map((line) => `- 输入引用：${line}`));
  }
  sections.push("", "下一步", "等待该智能体返回结果。");
  return sections.join("\n");
}

function formatConsoleTaskArtifactBody(payload: Record<string, unknown>) {
  const targetId = asConsoleText(payload.targetId) ?? asConsoleText(payload.mailboxId) ?? "subagent";
  const sections = ["关心结果", `已向 ${targetId} 派发协作任务。`];
  const taskInputText = asConsoleText(payload.taskInputText);
  if (taskInputText) {
    const lines = taskInputText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 6);
    if (lines.length > 0) {
      sections.push("", "关键依据", ...lines.map((line) => `- ${line}`));
    }
  }
  sections.push("", "下一步", "等待协作智能体返回分析。");
  return sections.join("\n");
}

function formatConsoleReducerBody(
  snapshot: ReturnType<typeof replayRoom>["preSnapshots"][number]
) {
  const sections = ["关心结果", snapshot.summary];
  if (snapshot.facts.length > 0) {
    sections.push("", "关键依据", ...snapshot.facts.slice(0, 4).map((fact) => `- ${fact.claim}`));
  }
  if (snapshot.openQuestions.length > 0) {
    sections.push("", "待确认", ...snapshot.openQuestions.slice(0, 3).map((question) => `- ${question}`));
  }
  if (snapshot.draftBody?.trim()) {
    sections.push("", "回信草稿", snapshot.draftBody.trim());
  }
  return sections.join("\n").trim();
}

function normalizeConsoleFactList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }
      const claim = asConsoleText((entry as { claim?: unknown }).claim);
      return claim ? [claim] : [];
    })
    .slice(0, 4);
}

function normalizeConsoleLineList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Map<string, string>();
  for (const entry of value) {
    const line =
      typeof entry === "string"
        ? entry.trim()
        : entry && typeof entry === "object"
          ? asConsoleText(
              (entry as { claim?: unknown; text?: unknown; summary?: unknown }).claim ??
                (entry as { text?: unknown }).text ??
                (entry as { summary?: unknown }).summary
            ) ?? ""
          : "";
    if (!line) {
      continue;
    }

    const key = line.toLowerCase().replace(/\s+/g, " ");
    if (!deduped.has(key)) {
      deduped.set(key, line);
    }
  }

  return Array.from(deduped.values()).slice(0, 4);
}

function asConsoleText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function buildConsoleVirtualMessageAttachments(
  snapshot: ReturnType<typeof replayRoom>,
  message: ReturnType<typeof replayRoom>["virtualMessages"][number]
) {
  const refs = new Set(message.artifactRefs ?? []);
  if (refs.size === 0) {
    return [];
  }

  return snapshot.attachments
    .filter((attachment) => {
      const plainId = attachment.attachmentId;
      const attachmentRef = `attachment:${attachment.attachmentId}`;
      return (
        refs.has(plainId) ||
        refs.has(attachmentRef) ||
        refs.has(`mailclaws-ref:${encodeURIComponent(plainId)}`) ||
        refs.has(`mailclaws-ref:${encodeURIComponent(attachmentRef)}`)
      );
    })
    .map((attachment) => ({
      attachmentId: attachment.attachmentId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      downloadPath:
        `/api/rooms/${encodeURIComponent(message.roomKey)}/attachments/${encodeURIComponent(attachment.attachmentId)}/content`
    }));
}

function buildConsoleMailboxDeliverySummaries(snapshot: ReturnType<typeof replayRoom>) {
  return [...snapshot.mailboxDeliveries]
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt))
    .map((delivery) => ({
      deliveryId: delivery.deliveryId,
      messageId: delivery.messageId,
      mailboxId: delivery.mailboxId,
      status: delivery.status,
      leaseOwner: delivery.leaseOwner ?? null,
      leaseUntil: delivery.leaseUntil ?? null,
      consumedAt: delivery.consumedAt ?? null,
      updatedAt: delivery.updatedAt
    }) satisfies ConsoleMailboxDeliverySummary);
}

function buildConsoleOutboxIntentSummaries(snapshot: ReturnType<typeof replayRoom>) {
  return [...snapshot.outboxIntents]
    .sort((left, right) => compareDescending(left.updatedAt, right.updatedAt))
    .map((intent) => ({
      intentId: intent.intentId,
      legacyOutboxId: intent.legacyOutboxId,
      kind: intent.kind,
      status: intent.status,
      subject: intent.subject,
      to: [...intent.to],
      cc: [...intent.cc],
      bcc: [...intent.bcc],
      providerMessageId: intent.providerMessageId ?? null,
      errorText: intent.errorText ?? null,
      createdAt: intent.createdAt,
      updatedAt: intent.updatedAt
    }) satisfies ConsoleOutboxIntentSummary);
}

function buildRoomMailboxSummaries(db: DatabaseSync, accountId: string, roomKey: string) {
  return buildAccountMailboxSummaries(db, accountId).filter((mailbox) =>
    projectMailboxFeed(db, {
      accountId,
      mailboxId: mailbox.mailboxId
    }).some((entry) => entry.delivery.roomKey === roomKey)
  );
}

function buildAccountMailboxSummaries(db: DatabaseSync, accountId: string): ConsoleMailboxSummary[] {
  return listVirtualMailboxesForAccount(db, accountId).map((mailbox) => {
    const feed = projectMailboxFeed(db, {
      accountId,
      mailboxId: mailbox.mailboxId
    });
    const latestEntry = [...feed].sort((left, right) =>
      compareDescending(left.message.createdAt, right.message.createdAt)
    )[0];

    return {
      mailboxId: mailbox.mailboxId,
      accountId,
      kind: mailbox.kind,
      role: mailbox.role ?? null,
      active: mailbox.active,
      messageCount: feed.length,
      roomCount: new Set(feed.map((entry) => entry.delivery.roomKey)).size,
      latestRoomKey: latestEntry?.delivery.roomKey ?? null,
      latestMessageAt: latestEntry?.message.createdAt ?? null,
      latestSubject: latestEntry?.message.subject ?? null,
      originKinds: uniqueStrings(feed.map((entry) => entry.message.originKind)) as VirtualMessageOriginKind[],
      deliveryStatusCounts: countBy(feed.map((entry) => entry.delivery.status))
    };
  });
}

function summarizeGatewayTrace(trace: GatewayProjectionTrace): ConsoleGatewayTraceSummary {
  return {
    projectedMessageCount: trace.messages.length,
    projectedDeliveryCount: trace.deliveries.length,
    projectedOutcomeCount: trace.outcomeProjections.length,
    pendingDispatchCount: trace.outcomeProjections.filter((projection) => projection.dispatchStatus === "pending").length,
    failedDispatchCount: trace.outcomeProjections.filter((projection) => projection.dispatchStatus === "failed").length,
    latestDispatchAttemptAt: latestTimestamp(
      trace.outcomeProjections.map((projection) => projection.dispatchAttemptedAt ?? null)
    ),
    outcomeProjections: trace.outcomeProjections.map((projection) => ({
      messageId: projection.messageId,
      sessionKey: projection.sessionKey,
      mode: projection.mode,
      projectedAt: projection.projectedAt,
      dispatchStatus: projection.dispatchStatus,
      dispatchTarget: projection.dispatchTarget,
      dispatchError: projection.dispatchError,
      dispatchAttemptedAt: projection.dispatchAttemptedAt
    })),
    outcomeModes: [...trace.outcomeModes],
    controlPlanes: [...trace.controlPlanes],
    sessionKeys: [...trace.sessionKeys],
    runIds: [...trace.runIds]
  };
}

function matchesRoomFilters(
  summary: ConsoleRoomSummary,
  input: Parameters<typeof listConsoleRooms>[1]
) {
  if (input?.accountId && summary.accountId !== input.accountId) {
    return false;
  }

  if (input?.roomKey && summary.roomKey !== input.roomKey) {
    return false;
  }

  if (input?.mailboxId && !summary.mailboxIds.includes(input.mailboxId)) {
    return false;
  }

  if (input?.statuses && input.statuses.length > 0 && !input.statuses.includes(summary.state)) {
    return false;
  }

  if (
    input?.originKinds &&
    input.originKinds.length > 0 &&
    !summary.originKinds.some((originKind) => input.originKinds?.includes(originKind))
  ) {
    return false;
  }

  return true;
}

function classifyAccountHealth(
  accountStatus: string,
  providerState: AccountProviderStateSummary
): ConsoleAccountSummary["health"] {
  if (accountStatus !== "active") {
    return "attention_required";
  }

  if (providerState.watch.expired === true || providerState.latestCursorInvalidatedAt) {
    return "degraded";
  }

  if (providerState.outbound.mode === "disabled") {
    return "degraded";
  }

  return "healthy";
}

function compareDescending(left?: string | null, right?: string | null) {
  const leftValue = left ? Date.parse(left) : 0;
  const rightValue = right ? Date.parse(right) : 0;
  return rightValue - leftValue;
}

function latestTimestamp(values: Array<string | null | undefined>) {
  const filtered = values.filter((value): value is string => typeof value === "string" && value.length > 0);
  if (filtered.length === 0) {
    return null;
  }

  return filtered.sort(compareDescending)[0] ?? null;
}

function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0)));
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Partial<Record<T, number>>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function rankHealth(health: ConsoleAccountSummary["health"]) {
  switch (health) {
    case "attention_required":
      return 0;
    case "degraded":
      return 1;
    default:
      return 2;
  }
}

function workbenchInboundGuardEnabled(settings: Record<string, unknown>) {
  const intake = readConsoleObject(settings.intake);
  if (intake.restrictToSelfAndAllowlist === true) {
    return true;
  }
  if (
    typeof intake.acceptAfter === "string" ||
    typeof settings.connectedAt === "string" ||
    typeof settings.mailboxConnectedAt === "string"
  ) {
    return true;
  }

  return [settings.senderPolicy, settings.allowlist, settings.whitelist, settings.agentRouting].some(
    (value) => value && typeof value === "object" && !Array.isArray(value)
  );
}

function resolveWorkbenchAcceptAfter(createdAt: string, settings: Record<string, unknown>) {
  const intake = readConsoleObject(settings.intake);
  return (
    readConsoleString(intake.acceptAfter) ??
    readConsoleString(settings.connectedAt) ??
    readConsoleString(settings.mailboxConnectedAt) ??
    createdAt
  );
}

function resolveWorkbenchSenderPolicy(emailAddress: string, settings: Record<string, unknown>) {
  const senderPolicy = readConsoleObject(settings.senderPolicy);
  const allowlist = readConsoleObject(settings.allowlist);
  const whitelist = readConsoleObject(settings.whitelist);

  return {
    allowEmails: uniqueConsoleStrings([
      emailAddress,
      ...readConsoleStringArray(senderPolicy.allowEmails),
      ...readConsoleStringArray(allowlist.emails),
      ...readConsoleStringArray(whitelist.emails)
    ]),
    allowDomains: uniqueConsoleStrings([
      ...readConsoleStringArray(senderPolicy.allowDomains),
      ...readConsoleStringArray(allowlist.domains),
      ...readConsoleStringArray(whitelist.domains)
    ]),
    denyEmails: uniqueConsoleStrings([
      ...readConsoleStringArray(senderPolicy.denyEmails),
      ...readConsoleStringArray(allowlist.denyEmails),
      ...readConsoleStringArray(whitelist.denyEmails)
    ]),
    denyDomains: uniqueConsoleStrings([
      ...readConsoleStringArray(senderPolicy.denyDomains),
      ...readConsoleStringArray(allowlist.denyDomains),
      ...readConsoleStringArray(whitelist.denyDomains)
    ])
  };
}

function readConsoleObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readConsoleString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readConsoleStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function uniqueConsoleStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

function classifyRoomAttention(input: {
  state: ThreadRoom["state"];
  pendingApprovalCount: number;
  openDeliveryCount: number;
  failedGatewayDispatchCount: number;
}): ConsoleRoomSummary["attention"] {
  if (input.state === "failed" || input.failedGatewayDispatchCount > 0) {
    return "critical";
  }

  if (
    input.pendingApprovalCount > 0 ||
    input.openDeliveryCount > 0 ||
    ["queued", "running", "waiting_approval", "handoff"].includes(input.state)
  ) {
    return "watch";
  }

  return "stable";
}
