import type { DatabaseSync } from "node:sqlite";

export interface MailThreadRecord {
  stableThreadId: string;
  accountId: string;
  providerThreadId?: string;
  normalizedSubject: string;
  participantFingerprint: string;
  createdAt: string;
  lastMessageAt: string;
}

export function upsertMailThread(db: DatabaseSync, thread: MailThreadRecord) {
  db.prepare(
    `
      INSERT INTO mail_threads (
        stable_thread_id,
        account_id,
        provider_thread_id,
        normalized_subject,
        participant_fingerprint,
        created_at,
        last_message_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stable_thread_id) DO UPDATE SET
        account_id = excluded.account_id,
        provider_thread_id = COALESCE(excluded.provider_thread_id, mail_threads.provider_thread_id),
        normalized_subject = excluded.normalized_subject,
        participant_fingerprint = excluded.participant_fingerprint,
        last_message_at = excluded.last_message_at;
    `
  ).run(
    thread.stableThreadId,
    thread.accountId,
    thread.providerThreadId ?? null,
    thread.normalizedSubject,
    thread.participantFingerprint,
    thread.createdAt,
    thread.lastMessageAt
  );
}

export function findMailThreadByProviderThreadId(
  db: DatabaseSync,
  accountId: string,
  providerThreadId: string
): MailThreadRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          stable_thread_id,
          account_id,
          provider_thread_id,
          normalized_subject,
          participant_fingerprint,
          created_at,
          last_message_at
        FROM mail_threads
        WHERE account_id = ? AND provider_thread_id = ?
        LIMIT 1;
      `
    )
    .get(accountId, providerThreadId) as MailThreadRow | undefined;

  return row ? mapMailThreadRow(row) : null;
}

export function getMailThread(
  db: DatabaseSync,
  stableThreadId: string
): MailThreadRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          stable_thread_id,
          account_id,
          provider_thread_id,
          normalized_subject,
          participant_fingerprint,
          created_at,
          last_message_at
        FROM mail_threads
        WHERE stable_thread_id = ?
        LIMIT 1;
      `
    )
    .get(stableThreadId) as MailThreadRow | undefined;

  return row ? mapMailThreadRow(row) : null;
}

export function findRecentMailThreadBySubjectParticipants(
  db: DatabaseSync,
  accountId: string,
  normalizedSubject: string,
  participantFingerprint: string,
  notBefore: string
): MailThreadRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          stable_thread_id,
          account_id,
          provider_thread_id,
          normalized_subject,
          participant_fingerprint,
          created_at,
          last_message_at
        FROM mail_threads
        WHERE
          account_id = ?
          AND normalized_subject = ?
          AND participant_fingerprint = ?
          AND last_message_at >= ?
        ORDER BY last_message_at DESC
        LIMIT 1;
      `
    )
    .get(accountId, normalizedSubject, participantFingerprint, notBefore) as MailThreadRow | undefined;

  return row ? mapMailThreadRow(row) : null;
}

function mapMailThreadRow(row: MailThreadRow): MailThreadRecord {
  return {
    stableThreadId: row.stable_thread_id,
    accountId: row.account_id,
    providerThreadId: row.provider_thread_id ?? undefined,
    normalizedSubject: row.normalized_subject,
    participantFingerprint: row.participant_fingerprint,
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at
  };
}

interface MailThreadRow {
  stable_thread_id: string;
  account_id: string;
  provider_thread_id: string | null;
  normalized_subject: string;
  participant_fingerprint: string;
  created_at: string;
  last_message_at: string;
}
