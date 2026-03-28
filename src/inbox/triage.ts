import type { DatabaseSync } from "node:sqlite";

import type { TriageResult, ThreadRoom } from "../core/types.js";
import { hasAckForRoomRevision } from "./ack.js";
import { listMailAttachmentsForRoom } from "../storage/repositories/mail-attachments.js";
import { findLatestMailMessageForThread } from "../storage/repositories/mail-messages.js";
import { listControlPlaneOutboxForRoom } from "../storage/repositories/outbox-intents.js";
import { listRoomQueueJobs } from "../queue/thread-queue.js";
import { listSubAgentRunsForRoom } from "../storage/repositories/subagent-runs.js";

export function triageInboxRoom(
  db: DatabaseSync,
  input: {
    room: ThreadRoom;
    now?: string;
    ackSlaSeconds: number;
  }
): TriageResult {
  const latestMessage = findLatestMailMessageForThread(db, input.room.stableThreadId);
  const attachments = listMailAttachmentsForRoom(db, input.room.roomKey);
  const queuedJobs = listRoomQueueJobs(db, {
    statuses: ["queued", "leased"]
  }).filter((job) => job.roomKey === input.room.roomKey);
  const outbox = listControlPlaneOutboxForRoom(db, input.room.roomKey);
  const activeSubagents = listSubAgentRunsForRoom(db, input.room.roomKey).filter(
    (run) => run.status === "accepted" || run.status === "running"
  );

  const urgency = resolveUrgency({
    subject: latestMessage?.rawSubject ?? latestMessage?.normalizedSubject,
    body: latestMessage?.textBody,
    queueDepth: queuedJobs.length
  });
  const estimatedEffort = resolveEffort({
    attachments: attachments.length,
    bodyLength: latestMessage?.textBody?.length ?? 0,
    queuedJobs: queuedJobs.length,
    activeSubagents: activeSubagents.length
  });
  const blockingReason = resolveBlockingReason({
    roomState: input.room.state,
    outboxStatuses: outbox.map((record) => ({
      kind: record.kind,
      status: record.status
    }))
  });
  const shouldDelegate = blockingReason === undefined && (attachments.length > 0 || estimatedEffort === "heavy");
  const preferredTargets = shouldDelegate
    ? attachments.length > 0
      ? ["subagent:research"]
      : ["subagent:drafter"]
    : [];
  const needsAckNow =
    latestMessage !== null &&
    !hasAckForRoomRevision(db, {
      roomKey: input.room.roomKey,
      revision: input.room.revision
    }) &&
    Date.parse(input.now ?? new Date().toISOString()) >=
      Date.parse(latestMessage.receivedAt) + input.ackSlaSeconds * 1000 &&
    blockingReason === undefined &&
    input.room.state !== "done";

  return {
    priority: resolvePriority({ urgency, estimatedEffort, queuedJobs: queuedJobs.length, activeSubagents: activeSubagents.length }),
    urgency,
    estimatedEffort,
    needsAckNow,
    shouldDelegate,
    preferredTargets,
    ...(blockingReason ? { blockingReason } : {})
  };
}

function resolveUrgency(input: {
  subject?: string;
  body?: string;
  queueDepth: number;
}): TriageResult["urgency"] {
  const haystack = `${input.subject ?? ""}\n${input.body ?? ""}`.toLowerCase();
  if (/\b(critical|p0|sev0|urgent|asap|immediately)\b/.test(haystack)) {
    return "critical";
  }
  if (/\b(deadline|today|soon|expedite|priority|vip)\b/.test(haystack) || input.queueDepth > 1) {
    return "high";
  }
  if (haystack.trim().length > 0) {
    return "normal";
  }
  return "low";
}

function resolveEffort(input: {
  attachments: number;
  bodyLength: number;
  queuedJobs: number;
  activeSubagents: number;
}): TriageResult["estimatedEffort"] {
  if (input.attachments > 0 || input.bodyLength > 2_000 || input.activeSubagents > 0) {
    return "heavy";
  }
  if (input.bodyLength > 500 || input.queuedJobs > 1) {
    return "medium";
  }
  return "quick";
}

function resolveBlockingReason(input: {
  roomState: ThreadRoom["state"];
  outboxStatuses: Array<{
    kind: "ack" | "progress" | "final";
    status: string;
  }>;
}) {
  if (input.roomState === "handoff") {
    return "handoff";
  }
  const blockingOutbox = input.outboxStatuses.filter((record) => record.kind !== "ack");
  if (blockingOutbox.some((record) => record.status === "pending_approval")) {
    return "waiting_approval";
  }
  if (blockingOutbox.some((record) => record.status === "queued" || record.status === "sending")) {
    return "waiting_external";
  }
  return undefined;
}

function resolvePriority(input: {
  urgency: TriageResult["urgency"];
  estimatedEffort: TriageResult["estimatedEffort"];
  queuedJobs: number;
  activeSubagents: number;
}) {
  const urgencyScore =
    input.urgency === "critical" ? 400 : input.urgency === "high" ? 300 : input.urgency === "normal" ? 200 : 100;
  const effortScore = input.estimatedEffort === "quick" ? 40 : input.estimatedEffort === "medium" ? 20 : 0;
  return urgencyScore + effortScore + input.queuedJobs * 5 + input.activeSubagents * 10;
}
