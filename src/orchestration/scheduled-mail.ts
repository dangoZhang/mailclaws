import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { AppConfig } from "../config.js";
import type { ScheduledMailJob } from "../core/types.js";
import { getRoomProject } from "./project-runtime.js";
import { composeFinalReply } from "../reporting/compose.js";
import {
  findLatestMailMessageForThread,
  findMailMessageByDedupeKey,
  insertMailMessage
} from "../storage/repositories/mail-messages.js";
import { insertControlPlaneOutboxRecord } from "../storage/repositories/outbox-intents.js";
import type { MailOutboxRecord } from "../storage/repositories/mail-outbox.js";
import {
  findScheduledMailJobById,
  listScheduledMailJobs,
  listScheduledMailJobsForRoom,
  upsertScheduledMailJob
} from "../storage/repositories/scheduled-mail-jobs.js";
import { getThreadRoom } from "../storage/repositories/thread-rooms.js";
import { normalizeSubject } from "../threading/dedupe.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function maybeCreateScheduledMailJob(input: {
  db: DatabaseSync;
  config: AppConfig;
  roomKey: string;
  accountId: string;
  sourceMessageDedupeKey: string;
  subject?: string;
  body?: string;
  createdAt: string;
}) {
  const definition = deriveScheduleDefinition(input.subject, input.body, input.createdAt);
  if (!definition) {
    return null;
  }

  const existing = listScheduledMailJobsForRoom(input.db, input.roomKey).find((job) =>
    job.status !== "cancelled" &&
    job.status !== "completed" &&
    job.scheduleRef === definition.scheduleRef
  );

  return upsertScheduledMailJob(input.db, {
    jobId: existing?.jobId ?? randomUUID(),
    roomKey: input.roomKey,
    accountId: input.accountId,
    sourceMessageDedupeKey: input.sourceMessageDedupeKey,
    kind: definition.kind,
    status: existing?.status ?? "active",
    scheduleRef: definition.scheduleRef,
    cronLike: definition.cronLike,
    nextRunAt: definition.nextRunAt,
    lastRunAt: existing?.lastRunAt,
    followUpSubject: definition.followUpSubject,
    followUpBody: definition.followUpBody,
    lastOutboxId: existing?.lastOutboxId,
    cancellationReason: undefined,
    createdAt: existing?.createdAt ?? input.createdAt,
    updatedAt: input.createdAt
  });
}

export function cancelScheduledMailJobsForRoom(input: {
  db: DatabaseSync;
  roomKey: string;
  reason: string;
  updatedAt: string;
}) {
  return listScheduledMailJobsForRoom(input.db, input.roomKey)
    .filter((job) => job.status === "active" || job.status === "paused")
    .map((job) =>
      upsertScheduledMailJob(input.db, {
        ...job,
        status: "cancelled",
        nextRunAt: undefined,
        cancellationReason: input.reason,
        updatedAt: input.updatedAt
      })
    );
}

export function pauseScheduledMailJob(db: DatabaseSync, jobId: string, updatedAt: string) {
  const job = findScheduledMailJobById(db, jobId);
  if (!job) {
    return null;
  }
  return upsertScheduledMailJob(db, {
    ...job,
    status: "paused",
    updatedAt
  });
}

export function resumeScheduledMailJob(db: DatabaseSync, jobId: string, updatedAt: string) {
  const job = findScheduledMailJobById(db, jobId);
  if (!job) {
    return null;
  }
  return upsertScheduledMailJob(db, {
    ...job,
    status: "active",
    nextRunAt: job.nextRunAt ?? computeNextRunAt(job.cronLike, updatedAt),
    updatedAt
  });
}

export function cancelScheduledMailJob(db: DatabaseSync, jobId: string, reason: string, updatedAt: string) {
  const job = findScheduledMailJobById(db, jobId);
  if (!job) {
    return null;
  }
  return upsertScheduledMailJob(db, {
    ...job,
    status: "cancelled",
    nextRunAt: undefined,
    cancellationReason: reason,
    updatedAt
  });
}

export function runScheduledMailJobNow(input: {
  db: DatabaseSync;
  config: AppConfig;
  jobId: string;
  now: string;
}) {
  const job = findScheduledMailJobById(input.db, input.jobId);
  if (!job) {
    return null;
  }

  return runScheduledMailJobs({
    db: input.db,
    config: input.config,
    now: input.now,
    jobIds: [job.jobId]
  }).jobs[0] ?? null;
}

export function runScheduledMailJobs(input: {
  db: DatabaseSync;
  config: AppConfig;
  now: string;
  jobIds?: string[];
}) {
  const candidates = (input.jobIds
    ? input.jobIds
        .map((jobId) => findScheduledMailJobById(input.db, jobId))
        .filter((job): job is ScheduledMailJob => job !== null)
    : listScheduledMailJobs(input.db, {
        statuses: ["active"],
        dueBefore: input.now
      }))
    .filter((job) => job.status === "active");

  const jobs = candidates.map((job) => {
    const room = getThreadRoom(input.db, job.roomKey);
    if (!room) {
      return upsertScheduledMailJob(input.db, {
        ...job,
        status: "cancelled",
        nextRunAt: undefined,
        cancellationReason: "room_missing",
        updatedAt: input.now
      });
    }

    const project = getRoomProject(input.db, room.roomKey);
    if (project?.status === "done") {
      return upsertScheduledMailJob(input.db, {
        ...job,
        status: "cancelled",
        nextRunAt: undefined,
        cancellationReason: "project_closed",
        updatedAt: input.now
      });
    }

    const sourceMessage =
      findMailMessageByDedupeKey(input.db, job.sourceMessageDedupeKey) ??
      findLatestMailMessageForThread(input.db, room.stableThreadId);
    if (!sourceMessage) {
      return upsertScheduledMailJob(input.db, {
        ...job,
        status: "cancelled",
        nextRunAt: undefined,
        cancellationReason: "source_message_missing",
        updatedAt: input.now
      });
    }

    const recipients = buildReplyRecipients(sourceMessage, room.frontAgentAddress ?? sourceMessage.mailboxAddress ?? "mailclaws@example.com");
    const reply = composeFinalReply(
      {
        subject: sourceMessage.rawSubject ?? sourceMessage.normalizedSubject,
        from: room.frontAgentAddress ?? sourceMessage.mailboxAddress ?? "mailclaws@example.com",
        to: recipients.to,
        cc: recipients.cc,
        messageId: `<mailclaws-${randomUUID()}@local>`,
        inReplyTo: sourceMessage.internetMessageId,
        references: [...sourceMessage.references, sourceMessage.internetMessageId]
      },
      job.followUpBody
    );
    const status = input.config.features.approvalGate ? "pending_approval" : "queued";
    const outbox: MailOutboxRecord = {
      outboxId: randomUUID(),
      roomKey: room.roomKey,
      kind: "final",
      status,
      subject: reply.headers.Subject,
      textBody: reply.body,
      to: recipients.to,
      cc: recipients.cc,
      bcc: [],
      headers: reply.headers,
      createdAt: input.now,
      updatedAt: input.now
    };
    insertControlPlaneOutboxRecord(input.db, outbox);
    persistScheduledOutboundMessageIndex(input.db, {
      accountId: room.accountId,
      stableThreadId: room.stableThreadId,
      mailboxAddress: room.frontAgentAddress ?? sourceMessage.mailboxAddress ?? "mailclaws@example.com",
      record: outbox
    });

    return upsertScheduledMailJob(input.db, {
      ...job,
      status: job.kind === "run_at" ? "completed" : "active",
      lastRunAt: input.now,
      nextRunAt: job.kind === "cron_like" ? computeNextRunAt(job.cronLike, input.now) : undefined,
      lastOutboxId: outbox.outboxId,
      updatedAt: input.now
    });
  });

  return {
    attempted: candidates.length,
    jobs
  };
}

export function deriveScheduleDefinition(subject: string | undefined, body: string | undefined, now: string) {
  const haystack = `${subject ?? ""}\n${body ?? ""}`.toLowerCase();
  const trimmedSubject = (subject ?? "").trim() || "Scheduled follow-up";
  if (/\b(tomorrow)\b/.test(haystack)) {
    return {
      kind: "run_at" as const,
      scheduleRef: "tomorrow",
      nextRunAt: new Date(Date.parse(now) + DAY_MS).toISOString(),
      followUpSubject: normalizeScheduledSubject(trimmedSubject),
      followUpBody: "Scheduled follow-up: checking back on the requested update."
    };
  }
  if (/\b(next week)\b/.test(haystack)) {
    return {
      kind: "run_at" as const,
      scheduleRef: "next_week",
      nextRunAt: new Date(Date.parse(now) + DAY_MS * 7).toISOString(),
      followUpSubject: normalizeScheduledSubject(trimmedSubject),
      followUpBody: "Scheduled follow-up: sharing the requested next-week reminder."
    };
  }
  if (/\b(daily|every day)\b/.test(haystack)) {
    return {
      kind: "cron_like" as const,
      scheduleRef: "daily",
      cronLike: "daily",
      nextRunAt: new Date(Date.parse(now) + DAY_MS).toISOString(),
      followUpSubject: normalizeScheduledSubject(trimmedSubject),
      followUpBody: "Scheduled follow-up: daily reminder for this thread."
    };
  }
  if (/\b(weekly|every week)\b/.test(haystack)) {
    return {
      kind: "cron_like" as const,
      scheduleRef: "weekly",
      cronLike: "weekly",
      nextRunAt: new Date(Date.parse(now) + DAY_MS * 7).toISOString(),
      followUpSubject: normalizeScheduledSubject(trimmedSubject),
      followUpBody: "Scheduled follow-up: weekly reminder for this thread."
    };
  }

  return null;
}

function normalizeScheduledSubject(subject: string) {
  return subject.toLowerCase().startsWith("re:") ? subject : `Re: ${subject}`;
}

function computeNextRunAt(cronLike: string | undefined, from: string) {
  switch (cronLike) {
    case "daily":
      return new Date(Date.parse(from) + DAY_MS).toISOString();
    case "weekly":
      return new Date(Date.parse(from) + DAY_MS * 7).toISOString();
    case "monthly":
      return new Date(Date.parse(from) + DAY_MS * 30).toISOString();
    default:
      return undefined;
  }
}

function persistScheduledOutboundMessageIndex(
  db: DatabaseSync,
  input: {
    accountId: string;
    stableThreadId: string;
    mailboxAddress: string;
    record: MailOutboxRecord;
  }
) {
  const internetMessageId = input.record.headers["Message-ID"];
  if (!internetMessageId) {
    return;
  }

  const dedupeKey = `outbox:${input.record.outboxId}`;
  if (findMailMessageByDedupeKey(db, dedupeKey)) {
    return;
  }

  const participants = [input.mailboxAddress, ...input.record.to, ...input.record.cc, ...input.record.bcc];
  insertMailMessage(db, {
    dedupeKey,
    accountId: input.accountId,
    stableThreadId: input.stableThreadId,
    internetMessageId,
    inReplyTo: input.record.headers["In-Reply-To"],
    references: parseReferences(input.record.headers.References),
    mailboxAddress: input.mailboxAddress,
    rawSubject: input.record.subject,
    textBody: input.record.textBody,
    htmlBody: input.record.htmlBody,
    from: input.mailboxAddress,
    to: input.record.to,
    cc: input.record.cc,
    bcc: input.record.bcc,
    replyTo: [],
    normalizedSubject: normalizeSubject(input.record.subject),
    participantFingerprint: participants.map((participant) => participant.toLowerCase()).sort().join("|"),
    receivedAt: input.record.createdAt,
    createdAt: input.record.createdAt
  });
}

function parseReferences(value: string | undefined) {
  return value?.split(/\s+/).map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function uniqueRecipients(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function buildReplyRecipients(
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>,
  mailboxAddress: string
) {
  const to = uniqueRecipients((message.replyTo ?? []).length > 0 ? (message.replyTo ?? []) : message.from ? [message.from] : []).filter(
    (recipient) => recipient.toLowerCase() !== mailboxAddress.toLowerCase()
  );
  const cc = uniqueRecipients([message.from ?? "", ...(message.to ?? []), ...(message.cc ?? [])]).filter((recipient) => {
    const normalized = recipient.toLowerCase();
    return normalized !== mailboxAddress.toLowerCase() && !to.some((entry) => entry.toLowerCase() === normalized);
  });

  return {
    to,
    cc
  };
}
