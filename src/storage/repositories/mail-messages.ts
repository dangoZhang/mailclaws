import type { DatabaseSync } from "node:sqlite";

import type { MailIdentity } from "../../identity/trust.js";

export interface MailMessageRecord {
  dedupeKey: string;
  accountId: string;
  stableThreadId: string;
  providerMessageId?: string;
  internetMessageId: string;
  inReplyTo?: string;
  references: string[];
  mailboxAddress?: string;
  rawSubject?: string;
  textBody?: string;
  htmlBody?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  canonicalUserId?: string;
  trustLevel?: string;
  identity?: MailIdentity;
  normalizedSubject: string;
  participantFingerprint: string;
  receivedAt: string;
  createdAt: string;
}

export function insertMailMessage(db: DatabaseSync, message: MailMessageRecord) {
  db.prepare(
    `
      INSERT INTO mail_messages (
        dedupe_key,
        account_id,
        stable_thread_id,
        provider_message_id,
        internet_message_id,
        in_reply_to,
        references_json,
        mailbox_address,
        raw_subject,
        text_body,
        html_body,
        from_json,
        to_json,
        cc_json,
        bcc_json,
        reply_to_json,
        canonical_user_id,
        trust_level,
        identity_json,
        normalized_subject,
        participant_fingerprint,
        received_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `
  ).run(
    message.dedupeKey,
    message.accountId,
    message.stableThreadId,
    message.providerMessageId ?? null,
    message.internetMessageId,
    message.inReplyTo ?? null,
    JSON.stringify(message.references),
    message.mailboxAddress ?? null,
    message.rawSubject ?? null,
    message.textBody ?? null,
    message.htmlBody ?? null,
    JSON.stringify(message.from ?? null),
    JSON.stringify(message.to ?? []),
    JSON.stringify(message.cc ?? []),
    JSON.stringify(message.bcc ?? []),
    JSON.stringify(message.replyTo ?? []),
    message.canonicalUserId ?? null,
    message.trustLevel ?? null,
    message.identity ? JSON.stringify(message.identity) : null,
    message.normalizedSubject,
    message.participantFingerprint,
    message.receivedAt,
    message.createdAt
  );
}

export interface UpdateMailMessageContentInput {
  mailboxAddress?: string;
  rawSubject?: string;
  textBody?: string;
  htmlBody?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string[];
  canonicalUserId?: string;
  trustLevel?: string;
  identity?: MailIdentity;
}

export function updateMailMessageContent(
  db: DatabaseSync,
  dedupeKey: string,
  input: UpdateMailMessageContentInput
) {
  db.prepare(
    `
      UPDATE mail_messages
      SET
        mailbox_address = COALESCE(?, mailbox_address),
        raw_subject = COALESCE(?, raw_subject),
        text_body = COALESCE(?, text_body),
        html_body = COALESCE(?, html_body),
        from_json = COALESCE(?, from_json),
        to_json = COALESCE(?, to_json),
        cc_json = COALESCE(?, cc_json),
        bcc_json = COALESCE(?, bcc_json),
        reply_to_json = COALESCE(?, reply_to_json),
        canonical_user_id = COALESCE(?, canonical_user_id),
        trust_level = COALESCE(?, trust_level),
        identity_json = COALESCE(?, identity_json)
      WHERE dedupe_key = ?;
    `
  ).run(
    input.mailboxAddress ?? null,
    input.rawSubject ?? null,
    input.textBody ?? null,
    input.htmlBody ?? null,
    input.from ? JSON.stringify(input.from) : null,
    input.to ? JSON.stringify(input.to) : null,
    input.cc ? JSON.stringify(input.cc) : null,
    input.bcc ? JSON.stringify(input.bcc) : null,
    input.replyTo ? JSON.stringify(input.replyTo) : null,
    input.canonicalUserId ?? null,
    input.trustLevel ?? null,
    input.identity ? JSON.stringify(input.identity) : null,
    dedupeKey
  );
}

export function findMailMessageByDedupeKey(
  db: DatabaseSync,
  dedupeKey: string
): MailMessageRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          dedupe_key,
          account_id,
          stable_thread_id,
          provider_message_id,
          internet_message_id,
          in_reply_to,
          references_json,
          mailbox_address,
          raw_subject,
          text_body,
          html_body,
          from_json,
          to_json,
          cc_json,
          bcc_json,
          reply_to_json,
          canonical_user_id,
          trust_level,
          identity_json,
          normalized_subject,
          participant_fingerprint,
          received_at,
          created_at
        FROM mail_messages
        WHERE dedupe_key = ?
        LIMIT 1;
      `
    )
    .get(dedupeKey) as MailMessageRow | undefined;

  return row ? mapMailMessageRow(row) : null;
}

export function findMailMessageByInternetMessageId(
  db: DatabaseSync,
  accountId: string,
  internetMessageId: string
): MailMessageRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          dedupe_key,
          account_id,
          stable_thread_id,
          provider_message_id,
          internet_message_id,
          in_reply_to,
          references_json,
          mailbox_address,
          raw_subject,
          text_body,
          html_body,
          from_json,
          to_json,
          cc_json,
          bcc_json,
          reply_to_json,
          canonical_user_id,
          trust_level,
          identity_json,
          normalized_subject,
          participant_fingerprint,
          received_at,
          created_at
        FROM mail_messages
        WHERE account_id = ? AND internet_message_id = ?
        LIMIT 1;
      `
    )
    .get(accountId, internetMessageId) as MailMessageRow | undefined;

  return row ? mapMailMessageRow(row) : null;
}

export function findLatestMailMessageForThread(
  db: DatabaseSync,
  stableThreadId: string
): MailMessageRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          dedupe_key,
          account_id,
          stable_thread_id,
          provider_message_id,
          internet_message_id,
          in_reply_to,
          references_json,
          mailbox_address,
          raw_subject,
          text_body,
          html_body,
          from_json,
          to_json,
          cc_json,
          bcc_json,
          reply_to_json,
          canonical_user_id,
          trust_level,
          identity_json,
          normalized_subject,
          participant_fingerprint,
          received_at,
          created_at
        FROM mail_messages
        WHERE stable_thread_id = ?
        ORDER BY received_at DESC
        LIMIT 1;
      `
    )
    .get(stableThreadId) as MailMessageRow | undefined;

  return row ? mapMailMessageRow(row) : null;
}

export function listMailMessagesForThread(
  db: DatabaseSync,
  stableThreadId: string
): MailMessageRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          dedupe_key,
          account_id,
          stable_thread_id,
          provider_message_id,
          internet_message_id,
          in_reply_to,
          references_json,
          mailbox_address,
          raw_subject,
          text_body,
          html_body,
          from_json,
          to_json,
          cc_json,
          bcc_json,
          reply_to_json,
          canonical_user_id,
          trust_level,
          identity_json,
          normalized_subject,
          participant_fingerprint,
          received_at,
          created_at
        FROM mail_messages
        WHERE stable_thread_id = ?
        ORDER BY received_at ASC, created_at ASC;
      `
    )
    .all(stableThreadId) as unknown as MailMessageRow[];

  return rows.map(mapMailMessageRow);
}

export function listMailMessagesForRoom(
  db: DatabaseSync,
  input: {
    accountId: string;
    stableThreadId: string;
  }
): MailMessageRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          dedupe_key,
          account_id,
          stable_thread_id,
          provider_message_id,
          internet_message_id,
          in_reply_to,
          references_json,
          mailbox_address,
          raw_subject,
          text_body,
          html_body,
          from_json,
          to_json,
          cc_json,
          bcc_json,
          reply_to_json,
          canonical_user_id,
          trust_level,
          identity_json,
          normalized_subject,
          participant_fingerprint,
          received_at,
          created_at
        FROM mail_messages
        WHERE account_id = ? AND stable_thread_id = ?
        ORDER BY received_at ASC, created_at ASC;
      `
    )
    .all(input.accountId, input.stableThreadId) as unknown as MailMessageRow[];

  return rows.map(mapMailMessageRow);
}

function mapMailMessageRow(row: MailMessageRow): MailMessageRecord {
  return {
    dedupeKey: row.dedupe_key,
    accountId: row.account_id,
    stableThreadId: row.stable_thread_id,
    providerMessageId: row.provider_message_id ?? undefined,
    internetMessageId: row.internet_message_id,
    inReplyTo: row.in_reply_to ?? undefined,
    references: JSON.parse(row.references_json) as string[],
    mailboxAddress: row.mailbox_address ?? undefined,
    rawSubject: row.raw_subject ?? undefined,
    textBody: row.text_body ?? undefined,
    htmlBody: row.html_body ?? undefined,
    from: row.from_json ? (JSON.parse(row.from_json) as string) : undefined,
    to: parseJsonArray(row.to_json),
    cc: parseJsonArray(row.cc_json),
    bcc: parseJsonArray(row.bcc_json),
    replyTo: parseJsonArray(row.reply_to_json),
    canonicalUserId: row.canonical_user_id ?? undefined,
    trustLevel: row.trust_level ?? undefined,
    identity: parseJsonObject(row.identity_json),
    normalizedSubject: row.normalized_subject,
    participantFingerprint: row.participant_fingerprint,
    receivedAt: row.received_at,
    createdAt: row.created_at
  };
}

interface MailMessageRow {
  dedupe_key: string;
  account_id: string;
  stable_thread_id: string;
  provider_message_id: string | null;
  internet_message_id: string;
  in_reply_to: string | null;
  references_json: string;
  mailbox_address: string | null;
  raw_subject: string | null;
  text_body: string | null;
  html_body: string | null;
  from_json: string | null;
  to_json: string | null;
  cc_json: string | null;
  bcc_json: string | null;
  reply_to_json: string | null;
  canonical_user_id: string | null;
  trust_level: string | null;
  identity_json: string | null;
  normalized_subject: string;
  participant_fingerprint: string;
  received_at: string;
  created_at: string;
}

function parseJsonArray(value: string | null): string[] {
  return value ? (JSON.parse(value) as string[]) : [];
}

function parseJsonObject(value: string | null): MailIdentity | undefined {
  return value ? (JSON.parse(value) as MailIdentity) : undefined;
}
