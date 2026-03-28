import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import {
  findMailMessageByDedupeKey,
  findMailMessageByInternetMessageId,
  insertMailMessage
} from "../storage/repositories/mail-messages.js";
import {
  upsertMailThread
} from "../storage/repositories/mail-threads.js";
import { buildParticipantFingerprint, buildInboundDedupKey, normalizeSubject } from "./dedupe.js";

export interface ThreadResolutionInput {
  accountId: string;
  providerMessageId?: string;
  providerThreadId?: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  subject: string;
  normalizedText: string;
  participants: string[];
  receivedAt: string;
}

export interface ThreadResolution {
  stableThreadId: string;
  dedupeKey: string;
  source: "duplicate" | "in_reply_to" | "references" | "new_thread";
  isDuplicate: boolean;
  matchedMessageId?: string;
  providerThreadId?: string;
}

export function resolveThreadForMail(
  db: DatabaseSync,
  input: ThreadResolutionInput
): ThreadResolution {
  const normalizedSubject = normalizeSubject(input.subject);
  const participantFingerprint = buildParticipantFingerprint(input.participants);
  const dedupeKey = buildInboundDedupKey({
    accountId: input.accountId,
    providerMessageId: input.providerMessageId,
    messageId: input.messageId,
    normalizedSubject,
    normalizedText: input.normalizedText,
    participants: input.participants
  });

  const existing = findMailMessageByDedupeKey(db, dedupeKey);
  if (existing) {
    return {
      stableThreadId: existing.stableThreadId,
      dedupeKey,
      source: "duplicate",
      isDuplicate: true,
      matchedMessageId: existing.internetMessageId,
      providerThreadId: input.providerThreadId
    };
  }

  const referenced = resolveExistingThread(db, input);
  const stableThreadId =
    referenced?.stableThreadId ??
    buildStableThreadId({
      accountId: input.accountId,
      rootMessageId: input.messageId
    });
  const source = referenced?.source ?? "new_thread";

  upsertMailThread(db, {
    stableThreadId,
    accountId: input.accountId,
    providerThreadId: input.providerThreadId,
    normalizedSubject,
    participantFingerprint,
    createdAt: input.receivedAt,
    lastMessageAt: input.receivedAt
  });

  insertMailMessage(db, {
    dedupeKey,
    accountId: input.accountId,
    stableThreadId,
    providerMessageId: input.providerMessageId,
    internetMessageId: input.messageId,
    inReplyTo: input.inReplyTo,
    references: input.references ?? [],
    to: [],
    cc: [],
    bcc: [],
    replyTo: [],
    normalizedSubject,
    participantFingerprint,
    receivedAt: input.receivedAt,
    createdAt: input.receivedAt
  });

  return {
    stableThreadId,
    dedupeKey,
    source,
    isDuplicate: false,
    matchedMessageId: referenced?.matchedMessageId,
    providerThreadId: input.providerThreadId
  };
}

function resolveExistingThread(
  db: DatabaseSync,
  input: ThreadResolutionInput
) {
  if (input.inReplyTo) {
    const replied = findMailMessageByInternetMessageId(db, input.accountId, input.inReplyTo);
    if (replied) {
      return {
        stableThreadId: replied.stableThreadId,
        source: "in_reply_to" as const,
        matchedMessageId: replied.internetMessageId
      };
    }
  }

  for (const reference of input.references ?? []) {
    const referenced = findMailMessageByInternetMessageId(db, input.accountId, reference);
    if (referenced) {
      return {
        stableThreadId: referenced.stableThreadId,
        source: "references" as const,
        matchedMessageId: referenced.internetMessageId
      };
    }
  }

  return null;
}

function buildStableThreadId(input: {
  accountId: string;
  rootMessageId: string;
}) {
  const hash = createHash("sha256")
    .update(input.accountId)
    .update("\n")
    .update(input.rootMessageId.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);

  return `thread-${hash}`;
}
