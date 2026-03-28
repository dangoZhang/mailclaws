import type {
  MailTaskKind,
  MailTaskStage,
  TaskNode,
  TaskStatus,
  ThreadRoom
} from "../core/types.js";
import type { MailOutboxRecord } from "../storage/repositories/mail-outbox.js";

const MAIL_TASK_NODE_ROLE = "mail-orchestrator";

export function buildRoomMailTaskNodeId(roomKey: string, revision: number) {
  return `mail-task:${roomKey}:r${String(revision).padStart(6, "0")}`;
}

export function buildRoomMailTaskInputRefs(input: {
  messageDedupeKey: string;
  attachmentIds?: string[];
}) {
  return [
    `message:${input.messageDedupeKey}`,
    ...(input.attachmentIds ?? []).map((attachmentId) => `attachment:${attachmentId}`)
  ];
}

export function classifyRoomMailTask(input: {
  room: ThreadRoom;
  subject?: string;
  body?: string;
  attachmentCount: number;
  handoffActive?: boolean;
}): {
  kind: MailTaskKind;
  stage: MailTaskStage;
  title: string;
  summary: string;
  nextAction: string;
} {
  const haystack = `${input.subject ?? ""}\n${input.body ?? ""}`.toLowerCase();
  const kind = resolveMailTaskKind({
    haystack,
    attachmentCount: input.attachmentCount,
    revision: input.room.revision,
    summonedRoleCount: input.room.summonedRoles?.length ?? 0,
    handoffActive: input.handoffActive ?? false
  });
  const stage: MailTaskStage = (input.handoffActive ?? false) ? "handoff" : "triaged";

  return {
    kind,
    stage,
    title: (input.subject ?? "").trim() || "(no subject)",
    summary: summarizeMailTaskKind(kind, input.attachmentCount),
    nextAction: describeNextActionForStage(stage, kind)
  };
}

export function createRoomMailTaskNode(input: {
  room: ThreadRoom;
  revision: number;
  messageDedupeKey: string;
  attachmentIds?: string[];
  priority: number;
  subject?: string;
  body?: string;
  handoffActive?: boolean;
  deadlineMs?: number;
  status?: TaskStatus;
}): TaskNode {
  const classified = classifyRoomMailTask({
    room: input.room,
    subject: input.subject,
    body: input.body,
    attachmentCount: input.attachmentIds?.length ?? 0,
    handoffActive: input.handoffActive
  });

  return {
    nodeId: buildRoomMailTaskNodeId(input.room.roomKey, input.revision),
    roomKey: input.room.roomKey,
    revision: input.revision,
    role: MAIL_TASK_NODE_ROLE,
    dependsOn: [],
    inputRefs: buildRoomMailTaskInputRefs({
      messageDedupeKey: input.messageDedupeKey,
      attachmentIds: input.attachmentIds
    }),
    deadlineMs: input.deadlineMs,
    priority: input.priority,
    status: input.status ?? (classified.stage === "handoff" ? "cancelled" : "queued"),
    taskClass: "mail_protocol" as const,
    mailTaskKind: classified.kind,
    mailTaskStage: classified.stage,
    title: classified.title,
    summary: classified.summary,
    nextAction: classified.nextAction
  };
}

export function updateRoomMailTaskNode(
  current: TaskNode,
  input: {
    status?: TaskStatus;
    stage?: MailTaskStage;
    summary?: string;
    nextAction?: string;
    deadlineMs?: number;
  }
): TaskNode {
  const stage = input.stage ?? current.mailTaskStage ?? "triaged";
  const kind = current.mailTaskKind ?? "reply_now";
  return {
    ...current,
    status: input.status ?? current.status,
    deadlineMs: input.deadlineMs ?? current.deadlineMs,
    mailTaskStage: stage,
    summary: input.summary ?? current.summary ?? summarizeMailTaskKind(kind, 0),
    nextAction: input.nextAction ?? current.nextAction ?? describeNextActionForStage(stage, kind)
  };
}

export function resolveMailTaskStageForOutbox(outbox: MailOutboxRecord) {
  if (outbox.status === "pending_approval") {
    return "waiting_approval" as const;
  }
  if (outbox.kind === "ack") {
    return "ack" as const;
  }
  if (outbox.kind === "progress") {
    return "progress" as const;
  }
  return "final" as const;
}

export function resolveMailTaskStageForOutboxRecord(outbox: MailOutboxRecord) {
  const stage = resolveMailTaskStageForOutbox(outbox);
  return {
    stage,
    status: stage === "waiting_approval" || stage === "final" ? ("done" as const) : ("running" as const),
    nextAction: describeNextActionForStage(stage, "reply_now")
  };
}

export function resolveHandoffMailTaskStage() {
  return {
    stage: "handoff" as const,
    status: "cancelled" as const,
    nextAction: describeNextActionForStage("handoff", "share_forward")
  };
}

export function resolveFailedMailTaskStage() {
  return {
    stage: "failed" as const,
    status: "failed" as const,
    nextAction: describeNextActionForStage("failed", "reply_now")
  };
}

export function resolveStaleMailTaskStage() {
  return {
    stage: "stale" as const,
    status: "cancelled" as const,
    nextAction: describeNextActionForStage("stale", "reply_now")
  };
}

export function describeNextActionForStage(stage: MailTaskStage, kind: MailTaskKind) {
  switch (stage) {
    case "triaged":
      return kind === "reply_now"
        ? "Prepare the first reply and decide whether ACK can be skipped."
        : "Fan out work, gather evidence, and decide whether an ACK is needed.";
    case "in_progress":
      return "Continue the orchestrator pipeline and decide the next visible reply stage.";
    case "ack":
      return "Keep the room warm with progress or move directly to the final reply.";
    case "progress":
      return "Continue work and publish a final reply or a wait-state update.";
    case "final":
      return "Delivery is ready; monitor the room for follow-up turns.";
    case "follow_up":
      return "Wait for the scheduled follow-up window and re-open the room if needed.";
    case "waiting_approval":
      return "Await approval before external delivery continues.";
    case "waiting_external":
      return "Await an external reply or delivery confirmation.";
    case "handoff":
      return "Human handoff is active; automation must stay silent.";
    case "failed":
      return "Inspect replay, fix the room state, and retry safely.";
    case "stale":
      return "A newer room revision exists; discard this task result and continue from the latest state.";
  }
}

function resolveMailTaskKind(input: {
  haystack: string;
  attachmentCount: number;
  revision: number;
  summonedRoleCount: number;
  handoffActive: boolean;
}): MailTaskKind {
  if (
    input.handoffActive ||
    /\b(forward|fwd|cc|bcc|loop in|share|handoff|escalat|delegate|review|approve|sign[ -]?off)\b/.test(
      input.haystack
    )
  ) {
    return "share_forward";
  }
  if (
    /\b(remind|reminder|follow[ -]?up|check[ -]?in|schedule|tomorrow|next week|next month|daily|weekly|monthly|every)\b/.test(
      input.haystack
    )
  ) {
    return "scheduled_mail";
  }
  if (
    /\b(project|milestone|timeline|roadmap|kickoff|launch|deliverable|dependency|owner|status update|weekly report)\b/.test(
      input.haystack
    ) ||
    input.revision >= 3
  ) {
    return "project_work";
  }
  if (input.attachmentCount > 0 || input.summonedRoleCount > 0 || input.haystack.length > 1_200) {
    return "long_running";
  }
  return "reply_now";
}

function summarizeMailTaskKind(kind: MailTaskKind, attachmentCount: number) {
  switch (kind) {
    case "reply_now":
      return "Single-room reply task with no long-running signals yet.";
    case "long_running":
      return attachmentCount > 0
        ? `Long-running mail task with ${attachmentCount} attachment reference(s).`
        : "Long-running mail task that likely needs ACK/progress/final stages.";
    case "share_forward":
      return "Mail task involves forwarding, sharing, review, or handoff semantics.";
    case "project_work":
      return "Mail task shows project-style coordination and should accumulate durable state.";
    case "scheduled_mail":
      return "Mail task implies a future reminder, follow-up, or recurring mail action.";
  }
}
