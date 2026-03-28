import type { DatabaseSync } from "node:sqlite";

export type MailOutboxAttemptStatus = "sending" | "sent" | "failed";

export interface MailOutboxAttemptRecord {
  attemptId: string;
  outboxId: string;
  roomKey: string;
  status: MailOutboxAttemptStatus;
  providerMessageId?: string;
  errorText?: string;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
}

export function insertMailOutboxAttempt(db: DatabaseSync, record: MailOutboxAttemptRecord) {
  db.prepare(
    `
      INSERT INTO mail_outbox_attempts (
        attempt_id,
        outbox_id,
        room_key,
        status,
        provider_message_id,
        error_text,
        started_at,
        completed_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `
  ).run(
    record.attemptId,
    record.outboxId,
    record.roomKey,
    record.status,
    record.providerMessageId ?? null,
    record.errorText ?? null,
    record.startedAt,
    record.completedAt ?? null,
    record.createdAt
  );
}

export function updateMailOutboxAttempt(
  db: DatabaseSync,
  attemptId: string,
  input: {
    status: MailOutboxAttemptStatus;
    providerMessageId?: string;
    errorText?: string;
    completedAt?: string;
  }
) {
  db.prepare(
    `
      UPDATE mail_outbox_attempts
      SET
        status = ?,
        provider_message_id = ?,
        error_text = ?,
        completed_at = ?
      WHERE attempt_id = ?;
    `
  ).run(
    input.status,
    input.providerMessageId ?? null,
    input.errorText ?? null,
    input.completedAt ?? null,
    attemptId
  );
}

export function listMailOutboxAttemptsForRoom(db: DatabaseSync, roomKey: string): MailOutboxAttemptRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          attempt_id,
          outbox_id,
          room_key,
          status,
          provider_message_id,
          error_text,
          started_at,
          completed_at,
          created_at
        FROM mail_outbox_attempts
        WHERE room_key = ?
        ORDER BY created_at ASC;
      `
    )
    .all(roomKey) as unknown as MailOutboxAttemptRow[];

  return rows.map(mapMailOutboxAttemptRow);
}

export function findLatestSuccessfulMailOutboxAttempt(
  db: DatabaseSync,
  outboxId: string
): MailOutboxAttemptRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          attempt_id,
          outbox_id,
          room_key,
          status,
          provider_message_id,
          error_text,
          started_at,
          completed_at,
          created_at
        FROM mail_outbox_attempts
        WHERE outbox_id = ? AND status = 'sent'
        ORDER BY created_at DESC
        LIMIT 1;
      `
    )
    .get(outboxId) as MailOutboxAttemptRow | undefined;

  return row ? mapMailOutboxAttemptRow(row) : null;
}

interface MailOutboxAttemptRow {
  attempt_id: string;
  outbox_id: string;
  room_key: string;
  status: MailOutboxAttemptStatus;
  provider_message_id: string | null;
  error_text: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

function mapMailOutboxAttemptRow(row: MailOutboxAttemptRow): MailOutboxAttemptRecord {
  return {
    attemptId: row.attempt_id,
    outboxId: row.outbox_id,
    roomKey: row.room_key,
    status: row.status,
    providerMessageId: row.provider_message_id ?? undefined,
    errorText: row.error_text ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at
  };
}
