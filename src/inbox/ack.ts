import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

import type { AppConfig } from "../config.js";
import { renderPreToMail } from "../reporting/compose.js";
import { persistOutboxArtifact } from "../storage/artifacts.js";
import { findLatestMailMessageForThread, findMailMessageByDedupeKey, insertMailMessage } from "../storage/repositories/mail-messages.js";
import { findMailOutboxById, type MailOutboxRecord } from "../storage/repositories/mail-outbox.js";
import {
  findControlPlaneOutboxByReferenceId,
  insertControlPlaneOutboxRecord
} from "../storage/repositories/outbox-intents.js";
import { appendThreadLedgerEvent, listThreadLedgerEvents } from "../storage/repositories/thread-ledger.js";
import type { InboxItem, ThreadRoom } from "../core/types.js";
import { filterInternalAliasRecipients } from "../threading/mailbox-routing.js";
import { buildParticipantFingerprint, normalizeSubject } from "../threading/dedupe.js";

const ACK_BODY = "Received. Processing is still in progress.";

export function buildInboxAckOutboxId(roomKey: string, revision: number) {
  return `ack:${roomKey}:${revision}`;
}

export function hasAckForRoomRevision(
  db: DatabaseSync,
  input: {
    roomKey: string;
    revision: number;
  }
) {
  if (
    findControlPlaneOutboxByReferenceId(db, buildInboxAckOutboxId(input.roomKey, input.revision)) ||
    findMailOutboxById(db, buildInboxAckOutboxId(input.roomKey, input.revision))
  ) {
    return true;
  }

  return listThreadLedgerEvents(db, input.roomKey).some(
    (event) => event.type === "mail.ack_sent" && event.revision === input.revision
  );
}

export function emitInboxAck(
  db: DatabaseSync,
  config: AppConfig,
  input: {
    item: InboxItem;
    room: ThreadRoom;
    now: string;
  }
) {
  if (hasAckForRoomRevision(db, {
    roomKey: input.room.roomKey,
    revision: input.item.latestRevision
  })) {
    return null;
  }

  const latestMessage = findLatestMailMessageForThread(db, input.room.stableThreadId);
  if (!latestMessage) {
    return null;
  }

  const mailboxAddress = input.room.frontAgentAddress ?? latestMessage.mailboxAddress ?? "mailclaw@example.com";
  const recipients = buildReplyRecipients(latestMessage, mailboxAddress);
  if (recipients.to.length === 0) {
    return null;
  }

  const outboxId = buildInboxAckOutboxId(input.room.roomKey, input.item.latestRevision);
  const payload = renderPreToMail(
    {
      subject: latestMessage.rawSubject ?? latestMessage.normalizedSubject,
      from: mailboxAddress,
      to: recipients.to,
      cc: recipients.cc,
      messageId: `<mailclaw-${outboxId}@local>`,
      inReplyTo: latestMessage.internetMessageId,
      references: [...latestMessage.references, latestMessage.internetMessageId]
    },
    {
      kind: "ack",
      summary: ACK_BODY,
      draftBody: ACK_BODY,
      roomRevision: input.item.latestRevision,
      inputsHash: createHash("sha256").update(ACK_BODY).digest("hex"),
      createdBy: {
        mailboxId: `public:${encodeURIComponent(mailboxAddress)}`
      }
    }
  );
  const record: MailOutboxRecord = {
    outboxId,
    roomKey: input.room.roomKey,
    kind: "ack",
    status: "queued",
    subject: payload.headers.Subject,
    textBody: payload.body,
    to: recipients.to,
    cc: recipients.cc,
    bcc: [],
    headers: payload.headers,
    createdAt: input.now,
    updatedAt: input.now
  };
  const artifactPath = persistOutboxArtifact(config, {
    accountId: input.room.accountId,
    stableThreadId: input.room.stableThreadId,
    outboxId,
    payload: record
  });

  insertControlPlaneOutboxRecord(db, record);
  persistOutboundMessageIndex(db, {
    accountId: input.room.accountId,
    stableThreadId: input.room.stableThreadId,
    mailboxAddress,
    record
  });
  appendThreadLedgerEvent(db, {
    roomKey: input.room.roomKey,
    revision: input.item.latestRevision,
    type: "mail.ack_sent",
    payload: {
      outboxId: record.outboxId,
      subject: record.subject,
      artifactPath,
      source: "inbox_scheduler"
    }
  });

  return record;
}

function buildReplyRecipients(
  message: NonNullable<ReturnType<typeof findLatestMailMessageForThread>>,
  mailboxAddress: string
) {
  const to = uniqueRecipients(
    (message.replyTo ?? []).length > 0 ? message.replyTo ?? [] : message.from ? [message.from] : []
  ).filter((recipient) => {
    const filtered = filterInternalAliasRecipients([recipient], mailboxAddress);
    return filtered.length > 0;
  });
  const toSet = new Set(to.map((recipient) => normalizeRecipient(recipient)));
  const cc = filterInternalAliasRecipients(
    uniqueRecipients([
      ...(message.from ? [message.from] : []),
      ...(message.to ?? []),
      ...(message.cc ?? [])
    ]),
    mailboxAddress
  ).filter((recipient) => {
    const normalized = normalizeRecipient(recipient);
    return normalized.length > 0 && !toSet.has(normalized);
  });

  return {
    to,
    cc
  };
}

function uniqueRecipients(values: string[]) {
  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const value of values) {
    const normalized = normalizeRecipient(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    recipients.push(normalized);
  }

  return recipients;
}

function normalizeRecipient(value: string) {
  return value.trim().toLowerCase();
}

function persistOutboundMessageIndex(
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
    participantFingerprint: buildParticipantFingerprint(participants),
    receivedAt: input.record.createdAt,
    createdAt: input.record.createdAt
  });
}

function parseReferences(value: string | undefined) {
  return value?.split(/\s+/).map((entry) => entry.trim()).filter(Boolean) ?? [];
}
