import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { InboxItem, PublicAgentInbox, ThreadRoom } from "../core/types.js";
import { findLatestMailMessageForThread } from "../storage/repositories/mail-messages.js";
import { listRoomQueueJobs } from "../queue/thread-queue.js";
import { listSubAgentRunsForRoom } from "../storage/repositories/subagent-runs.js";
import { getThreadRoom, listThreadRooms } from "../storage/repositories/thread-rooms.js";
import { getInboxItemForRoom, listInboxItemsForInbox, saveInboxItem } from "../storage/repositories/inbox-items.js";
import {
  getPublicAgentInbox,
  savePublicAgentInbox
} from "../storage/repositories/public-agent-inboxes.js";
import { triageInboxRoom } from "./triage.js";

export function ensurePublicAgentInbox(
  db: DatabaseSync,
  input: {
    accountId: string;
    agentId: string;
    activeRoomLimit?: number;
    ackSlaSeconds?: number;
    burstCoalesceSeconds?: number;
    now?: string;
  }
) {
  const existing = getPublicAgentInbox(db, {
    accountId: input.accountId,
    agentId: input.agentId
  });
  if (existing) {
    return existing;
  }

  const now = input.now ?? new Date().toISOString();
  const created: PublicAgentInbox = {
    inboxId: randomUUID(),
    accountId: input.accountId,
    agentId: input.agentId,
    activeRoomLimit: input.activeRoomLimit ?? 3,
    ackSlaSeconds: input.ackSlaSeconds ?? 30,
    burstCoalesceSeconds: input.burstCoalesceSeconds ?? 60,
    createdAt: now,
    updatedAt: now
  };
  savePublicAgentInbox(db, created);
  return created;
}

export function projectPublicAgentInbox(
  db: DatabaseSync,
  input: {
    accountId: string;
    agentId: string;
    activeRoomLimit?: number;
    ackSlaSeconds?: number;
    burstCoalesceSeconds?: number;
    now?: string;
  }
) {
  const now = input.now ?? new Date().toISOString();
  const inbox = ensurePublicAgentInbox(db, {
    accountId: input.accountId,
    agentId: input.agentId,
    activeRoomLimit: input.activeRoomLimit,
    ackSlaSeconds: input.ackSlaSeconds,
    burstCoalesceSeconds: input.burstCoalesceSeconds,
    now
  });
  const items = listThreadRooms(db)
    .filter(
      (room) =>
        room.accountId === input.accountId &&
        resolveInboxParticipantRole(room, input.agentId) !== null
    )
    .map((room) => projectInboxItemForRoom(db, {
      inbox,
      roomKey: room.roomKey,
      now
    }))
    .filter((item): item is InboxItem => item !== null)
    .sort((left, right) => right.priority - left.priority || right.newestMessageAt.localeCompare(left.newestMessageAt));

  return {
    inbox,
    items
  };
}

export function projectInboxItemForRoom(
  db: DatabaseSync,
  input: {
    inbox: PublicAgentInbox;
    roomKey: string;
    now?: string;
  }
): InboxItem | null {
  const now = input.now ?? new Date().toISOString();
  const room = getThreadRoom(db, input.roomKey);
  const participantRole =
    room && room.accountId === input.inbox.accountId
      ? resolveInboxParticipantRole(room, input.inbox.agentId)
      : null;
  if (!room || !participantRole) {
    return null;
  }

  const latestMessage = findLatestMailMessageForThread(db, room.stableThreadId);
  if (!latestMessage) {
    return null;
  }

  const triage = triageInboxRoom(db, {
    room,
    now,
    ackSlaSeconds: input.inbox.ackSlaSeconds
  });
  const prior = getInboxItemForRoom(db, {
    inboxId: input.inbox.inboxId,
    roomKey: room.roomKey
  });
  const activeWorkerCount = listSubAgentRunsForRoom(db, room.roomKey).filter(
    (run) => run.status === "accepted" || run.status === "running"
  ).length;
  const queueJobs = listRoomQueueJobs(db, {
    statuses: ["queued", "leased"]
  }).filter((job) => job.roomKey === room.roomKey);
  const needsReset = !prior || room.revision > prior.latestRevision;
  const baseState = deriveInboxItemState({
    roomState: room.state,
    priorState: prior?.state,
    blockingReason: triage.blockingReason,
    queueDepth: queueJobs.length,
    activeWorkerCount,
    needsReset,
    participantRole
  });

  const item: InboxItem = {
    inboxItemId: prior?.inboxItemId ?? randomUUID(),
    inboxId: input.inbox.inboxId,
    accountId: input.inbox.accountId,
    agentId: input.inbox.agentId,
    participantRole,
    roomKey: room.roomKey,
    latestRevision: room.revision,
    unreadCount: needsReset ? Math.max(1, room.revision - (prior?.latestRevision ?? 0)) : prior?.unreadCount ?? 1,
    newestMessageAt: latestMessage.receivedAt,
    state: baseState,
    priority: triage.priority,
    urgency: triage.urgency,
    estimatedEffort: triage.estimatedEffort,
    blockedReason: triage.blockingReason,
    activeWorkerCount,
    latestSummaryRef: room.summaryRef,
    needsAckBy: new Date(Date.parse(latestMessage.receivedAt) + input.inbox.ackSlaSeconds * 1000).toISOString(),
    lastTriagedAt: needsReset ? undefined : prior?.lastTriagedAt,
    createdAt: prior?.createdAt ?? now,
    updatedAt: now
  };
  saveInboxItem(db, item);
  return item;
}

export function markInboxItemTriaged(
  db: DatabaseSync,
  input: {
    inboxId: string;
    roomKey: string;
    now?: string;
  }
) {
  const item = getInboxItemForRoom(db, input);
  if (!item) {
    return null;
  }
  const now = input.now ?? new Date().toISOString();
  const next: InboxItem = {
    ...item,
    unreadCount: 0,
    state: item.blockedReason
      ? item.blockedReason === "handoff"
        ? "handoff"
        : item.blockedReason === "waiting_approval"
          ? "waiting_approval"
          : "waiting_external"
      : "triaged",
    lastTriagedAt: now,
    updatedAt: now
  };
  saveInboxItem(db, next);
  return next;
}

function deriveInboxItemState(input: {
  roomState: ThreadRoom["state"];
  priorState?: InboxItem["state"];
  blockingReason?: string;
  queueDepth: number;
  activeWorkerCount: number;
  needsReset: boolean;
  participantRole: InboxItem["participantRole"];
}): InboxItem["state"] {
  if (input.blockingReason === "handoff") {
    return "handoff";
  }
  if (input.blockingReason === "waiting_approval") {
    return "waiting_approval";
  }
  if (input.blockingReason === "waiting_external") {
    return "waiting_external";
  }
  if (input.roomState === "done") {
    return "done";
  }
  if (input.participantRole === "collaborator") {
    return input.needsReset ? "new" : input.priorState ?? "triaged";
  }
  if (input.activeWorkerCount > 0) {
    return "delegated";
  }
  if (input.roomState === "running" || input.roomState === "replying") {
    return "active";
  }
  if (input.needsReset) {
    return "new";
  }
  if (input.queueDepth > 0) {
    return input.priorState === "active" ? "active" : "triaged";
  }
  return input.priorState ?? "triaged";
}

export function listProjectedInboxItems(db: DatabaseSync, inboxId: string) {
  return listInboxItemsForInbox(db, inboxId);
}

function resolveInboxParticipantRole(
  room: ThreadRoom,
  agentId: string
): InboxItem["participantRole"] | null {
  const normalizedAgentId = normalizeAddress(agentId);
  if (!normalizedAgentId) {
    return null;
  }

  if (normalizeAddress(room.frontAgentAddress) === normalizedAgentId) {
    return "front";
  }

  if (
    (room.collaboratorAgentAddresses ?? []).some(
      (address) => normalizeAddress(address) === normalizedAgentId
    ) ||
    (room.publicAgentAddresses ?? []).some((address) => normalizeAddress(address) === normalizedAgentId)
  ) {
    return "collaborator";
  }

  return null;
}

function normalizeAddress(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}
