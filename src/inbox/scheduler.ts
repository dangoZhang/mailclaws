import type { DatabaseSync } from "node:sqlite";

import type { AppConfig } from "../config.js";
import type { InboxItem } from "../core/types.js";
import { saveInboxItem } from "../storage/repositories/inbox-items.js";
import { getPublicAgentInbox } from "../storage/repositories/public-agent-inboxes.js";
import { projectPublicAgentInbox } from "./projector.js";
import { triageInboxRoom } from "./triage.js";
import { getThreadRoom } from "../storage/repositories/thread-rooms.js";
import { emitInboxAck, hasAckForRoomRevision } from "./ack.js";

export function schedulePublicAgentInbox(
  db: DatabaseSync,
  config: AppConfig,
  input: {
    accountId: string;
    agentId: string;
    now?: string;
  }
) {
  const projected = projectPublicAgentInbox(db, input);
  const inbox = projected.inbox;
  const now = input.now ?? new Date().toISOString();
  const ordered = projected.items
    .map((item) => ({ item, sortPriority: item.priority }))
    .sort((left, right) => right.sortPriority - left.sortPriority || right.item.newestMessageAt.localeCompare(left.item.newestMessageAt))
    .map((entry) => entry.item);

  const scheduled: InboxItem[] = [];
  const deferred: InboxItem[] = [];
  const ackedRoomKeys = new Set<string>();
  let activeRoomCount = 0;

  for (const item of ordered) {
    const room = getThreadRoom(db, item.roomKey);
    if (!room) {
      continue;
    }
    const triage = triageInboxRoom(db, {
      room,
      now,
      ackSlaSeconds: inbox.ackSlaSeconds
    });
    const isCollaboratorView = item.participantRole === "collaborator";
    const coalescing =
      item.unreadCount > 0 &&
      item.state === "new" &&
      !isCollaboratorView &&
      triage.urgency !== "critical" &&
      Date.parse(now) - Date.parse(item.newestMessageAt) < inbox.burstCoalesceSeconds * 1000;
    const canActivate =
      !isCollaboratorView &&
      activeRoomCount < inbox.activeRoomLimit &&
      !triage.blockingReason;
    const nextState =
      isCollaboratorView
        ? item.state === "new"
          ? "triaged"
          : item.state
        : coalescing
        ? "new"
        : !triage.blockingReason && triage.shouldDelegate
        ? "delegated"
        : canActivate
        ? "active"
        : item.state === "new"
          ? "triaged"
          : item.state;
    const next: InboxItem = {
      ...item,
      priority: triage.priority,
      urgency: triage.urgency,
      estimatedEffort: triage.estimatedEffort,
      blockedReason: coalescing ? "coalescing" : triage.blockingReason,
      state: nextState,
      lastTriagedAt: now,
      unreadCount: nextState === "active" || nextState === "delegated" || nextState === "triaged" ? 0 : item.unreadCount,
      updatedAt: now
    };
    saveInboxItem(db, next);
    if (!isCollaboratorView && triage.needsAckNow && emitInboxAck(db, config, {
      item: next,
      room,
      now
    })) {
      ackedRoomKeys.add(next.roomKey);
    }
    if (nextState === "active" || nextState === "delegated") {
      scheduled.push(next);
      if (nextState === "active") {
        activeRoomCount += 1;
      }
    } else {
      deferred.push(next);
    }
  }

  return {
    inbox: getPublicAgentInbox(db, {
      inboxId: inbox.inboxId
    }) ?? inbox,
    scheduled,
    deferred,
    needsAckNow: [...scheduled, ...deferred].filter(
      (item) =>
        item.needsAckBy &&
        Date.parse(item.needsAckBy) <= Date.parse(now) &&
        !hasAckForRoomRevision(db, {
          roomKey: item.roomKey,
          revision: item.latestRevision
        }) &&
        !ackedRoomKeys.has(item.roomKey)
    )
  };
}
