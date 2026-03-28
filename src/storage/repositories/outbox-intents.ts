import type { DatabaseSync } from "node:sqlite";

import type { MailOutboxKind, MailOutboxRecord, MailOutboxStatus } from "./mail-outbox.js";

export type ApprovalRequestStatus = "requested" | "approved" | "rejected";

export interface OutboxIntentRecord {
  intentId: string;
  legacyOutboxId: string;
  roomKey: string;
  runId?: string;
  kind: MailOutboxKind;
  status: MailOutboxStatus;
  subject: string;
  textBody: string;
  htmlBody?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  headers: Record<string, string>;
  providerMessageId?: string;
  errorText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRequestRecord {
  requestId: string;
  legacyOutboxId: string;
  roomKey: string;
  runId?: string;
  status: ApprovalRequestStatus;
  subject: string;
  to: string[];
  cc: string[];
  bcc: string[];
  requestedAt: string;
  decidedAt?: string;
  errorText?: string;
  createdAt: string;
  updatedAt: string;
}

export function insertControlPlaneOutboxRecord(db: DatabaseSync, record: MailOutboxRecord) {
  upsertOutboxIntentFromMailOutbox(db, record);
  upsertApprovalRequestFromMailOutbox(db, record);
}

export function upsertOutboxIntentFromMailOutbox(db: DatabaseSync, record: MailOutboxRecord) {
  db.prepare(
    `
      INSERT INTO outbox_intents (
        intent_id,
        legacy_outbox_id,
        room_key,
        run_id,
        kind,
        status,
        subject,
        text_body,
        html_body,
        to_json,
        cc_json,
        bcc_json,
        headers_json,
        provider_message_id,
        error_text,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(intent_id) DO UPDATE SET
        legacy_outbox_id = excluded.legacy_outbox_id,
        room_key = excluded.room_key,
        run_id = excluded.run_id,
        kind = excluded.kind,
        status = excluded.status,
        subject = excluded.subject,
        text_body = excluded.text_body,
        html_body = excluded.html_body,
        to_json = excluded.to_json,
        cc_json = excluded.cc_json,
        bcc_json = excluded.bcc_json,
        headers_json = excluded.headers_json,
        provider_message_id = excluded.provider_message_id,
        error_text = excluded.error_text,
        updated_at = excluded.updated_at;
    `
  ).run(
    record.outboxId,
    record.outboxId,
    record.roomKey,
    record.runId ?? null,
    record.kind,
    record.status,
    record.subject,
    record.textBody,
    record.htmlBody ?? null,
    JSON.stringify(record.to),
    JSON.stringify(record.cc),
    JSON.stringify(record.bcc),
    JSON.stringify(record.headers),
    record.providerMessageId ?? null,
    record.errorText ?? null,
    record.createdAt,
    record.updatedAt
  );
}

export function upsertApprovalRequestFromMailOutbox(db: DatabaseSync, record: MailOutboxRecord) {
  if (record.status !== "pending_approval") {
    return;
  }

  db.prepare(
    `
      INSERT INTO approval_requests (
        request_id,
        legacy_outbox_id,
        room_key,
        run_id,
        status,
        subject,
        to_json,
        cc_json,
        bcc_json,
        requested_at,
        decided_at,
        error_text,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(request_id) DO UPDATE SET
        legacy_outbox_id = excluded.legacy_outbox_id,
        room_key = excluded.room_key,
        run_id = excluded.run_id,
        status = excluded.status,
        subject = excluded.subject,
        to_json = excluded.to_json,
        cc_json = excluded.cc_json,
        bcc_json = excluded.bcc_json,
        requested_at = excluded.requested_at,
        error_text = excluded.error_text,
        updated_at = excluded.updated_at;
    `
  ).run(
    record.outboxId,
    record.outboxId,
    record.roomKey,
    record.runId ?? null,
    "requested",
    record.subject,
    JSON.stringify(record.to),
    JSON.stringify(record.cc),
    JSON.stringify(record.bcc),
    record.updatedAt,
    null,
    record.errorText ?? null,
    record.createdAt,
    record.updatedAt
  );
}

export function listOutboxIntentsForRoom(db: DatabaseSync, roomKey: string): OutboxIntentRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          intent_id,
          legacy_outbox_id,
          room_key,
          run_id,
          kind,
          status,
          subject,
          text_body,
          html_body,
          to_json,
          cc_json,
          bcc_json,
          headers_json,
          provider_message_id,
          error_text,
          created_at,
          updated_at
        FROM outbox_intents
        WHERE room_key = ?
        ORDER BY created_at ASC;
      `
    )
    .all(roomKey) as unknown as OutboxIntentRow[];

  return rows.map(mapOutboxIntentRow);
}

export function listControlPlaneOutboxForRoom(db: DatabaseSync, roomKey: string): OutboxIntentRecord[] {
  return listOutboxIntentsForRoom(db, roomKey);
}

export function listOutboxIntentsByStatus(
  db: DatabaseSync,
  statuses: MailOutboxStatus[],
  limit?: number
): OutboxIntentRecord[] {
  const placeholders = statuses.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT
          intent_id,
          legacy_outbox_id,
          room_key,
          run_id,
          kind,
          status,
          subject,
          text_body,
          html_body,
          to_json,
          cc_json,
          bcc_json,
          headers_json,
          provider_message_id,
          error_text,
          created_at,
          updated_at
        FROM outbox_intents
        WHERE status IN (${placeholders})
        ORDER BY created_at ASC
        ${typeof limit === "number" ? `LIMIT ${limit}` : ""};
      `
    )
    .all(...statuses) as unknown as OutboxIntentRow[];

  return rows.map(mapOutboxIntentRow);
}

export function listControlPlaneOutboxByStatus(
  db: DatabaseSync,
  statuses: MailOutboxStatus[],
  limit?: number
): OutboxIntentRecord[] {
  return listOutboxIntentsByStatus(db, statuses, limit);
}

export function findOutboxIntentById(db: DatabaseSync, intentId: string): OutboxIntentRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          intent_id,
          legacy_outbox_id,
          room_key,
          run_id,
          kind,
          status,
          subject,
          text_body,
          html_body,
          to_json,
          cc_json,
          bcc_json,
          headers_json,
          provider_message_id,
          error_text,
          created_at,
          updated_at
        FROM outbox_intents
        WHERE intent_id = ?
        LIMIT 1;
      `
    )
    .get(intentId) as OutboxIntentRow | undefined;

  return row ? mapOutboxIntentRow(row) : null;
}

export function findOutboxIntentByReferenceId(
  db: DatabaseSync,
  referenceId: string
): OutboxIntentRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          intent_id,
          legacy_outbox_id,
          room_key,
          run_id,
          kind,
          status,
          subject,
          text_body,
          html_body,
          to_json,
          cc_json,
          bcc_json,
          headers_json,
          provider_message_id,
          error_text,
          created_at,
          updated_at
        FROM outbox_intents
        WHERE intent_id = ? OR legacy_outbox_id = ?
        ORDER BY CASE WHEN intent_id = ? THEN 0 ELSE 1 END
        LIMIT 1;
      `
    )
    .get(referenceId, referenceId, referenceId) as OutboxIntentRow | undefined;

  return row ? mapOutboxIntentRow(row) : null;
}

export function findControlPlaneOutboxByReferenceId(
  db: DatabaseSync,
  referenceId: string
): OutboxIntentRecord | null {
  const existing = findOutboxIntentByReferenceId(db, referenceId);
  if (existing) {
    return existing;
  }

  const legacy = findLegacyMailOutboxByReferenceId(db, referenceId);
  if (!legacy) {
    return null;
  }

  upsertOutboxIntentFromMailOutbox(db, legacy);
  if (legacy.status === "pending_approval") {
    upsertApprovalRequestFromMailOutbox(db, legacy);
  }

  return findOutboxIntentByReferenceId(db, referenceId);
}

export function updateOutboxIntentStatus(
  db: DatabaseSync,
  intentId: string,
  input: {
    status: MailOutboxStatus;
    updatedAt: string;
    providerMessageId?: string;
    errorText?: string;
  }
) {
  db.prepare(
    `
      UPDATE outbox_intents
      SET
        status = ?,
        provider_message_id = ?,
        error_text = ?,
        updated_at = ?
      WHERE intent_id = ?;
    `
  ).run(input.status, input.providerMessageId ?? null, input.errorText ?? null, input.updatedAt, intentId);
}

export function claimOutboxIntentForDelivery(
  db: DatabaseSync,
  intentId: string,
  input: {
    updatedAt: string;
  }
) {
  const result = db
    .prepare(
      `
        UPDATE outbox_intents
        SET
          status = 'sending',
          updated_at = ?
        WHERE intent_id = ? AND status = 'queued';
      `
    )
    .run(input.updatedAt, intentId);

  return result.changes > 0;
}

export function findApprovalRequestById(db: DatabaseSync, requestId: string): ApprovalRequestRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          request_id,
          legacy_outbox_id,
          room_key,
          run_id,
          status,
          subject,
          to_json,
          cc_json,
          bcc_json,
          requested_at,
          decided_at,
          error_text,
          created_at,
          updated_at
        FROM approval_requests
        WHERE request_id = ?
        LIMIT 1;
      `
    )
    .get(requestId) as ApprovalRequestRow | undefined;

  return row ? mapApprovalRequestRow(row) : null;
}

export function findApprovalRequestByReferenceId(
  db: DatabaseSync,
  referenceId: string
): ApprovalRequestRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          request_id,
          legacy_outbox_id,
          room_key,
          run_id,
          status,
          subject,
          to_json,
          cc_json,
          bcc_json,
          requested_at,
          decided_at,
          error_text,
          created_at,
          updated_at
        FROM approval_requests
        WHERE request_id = ? OR legacy_outbox_id = ?
        ORDER BY CASE WHEN request_id = ? THEN 0 ELSE 1 END
        LIMIT 1;
      `
    )
    .get(referenceId, referenceId, referenceId) as ApprovalRequestRow | undefined;

  return row ? mapApprovalRequestRow(row) : null;
}

export function listApprovalRequestsForRoom(db: DatabaseSync, roomKey: string): ApprovalRequestRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          request_id,
          legacy_outbox_id,
          room_key,
          run_id,
          status,
          subject,
          to_json,
          cc_json,
          bcc_json,
          requested_at,
          decided_at,
          error_text,
          created_at,
          updated_at
        FROM approval_requests
        WHERE room_key = ?
        ORDER BY created_at ASC;
      `
    )
    .all(roomKey) as unknown as ApprovalRequestRow[];

  return rows.map(mapApprovalRequestRow);
}

export function backfillOutboxControlPlane(db: DatabaseSync) {
  if (!hasLegacyMailOutboxTable(db)) {
    return {
      mirroredIntents: 0,
      mirroredApprovals: 0
    };
  }

  const legacyRows = listLegacyMailOutboxRows(db);
  let mirroredIntents = 0;
  let mirroredApprovals = 0;

  for (const legacy of legacyRows) {
    if (!findOutboxIntentByReferenceId(db, legacy.outboxId)) {
      upsertOutboxIntentFromMailOutbox(db, legacy);
      mirroredIntents += 1;
    }

    if (legacy.status === "pending_approval" && !findApprovalRequestByReferenceId(db, legacy.outboxId)) {
      upsertApprovalRequestFromMailOutbox(db, legacy);
      mirroredApprovals += 1;
    }
  }

  return {
    mirroredIntents,
    mirroredApprovals
  };
}

export function updateApprovalRequestStatus(
  db: DatabaseSync,
  requestId: string,
  input: {
    status: Exclude<ApprovalRequestStatus, "requested">;
    decidedAt: string;
    errorText?: string;
  }
) {
  db.prepare(
    `
      UPDATE approval_requests
      SET
        status = ?,
        decided_at = ?,
        error_text = ?,
        updated_at = ?
      WHERE request_id = ?;
    `
  ).run(input.status, input.decidedAt, input.errorText ?? null, input.decidedAt, requestId);
}

interface OutboxIntentRow {
  intent_id: string;
  legacy_outbox_id: string;
  room_key: string;
  run_id: string | null;
  kind: MailOutboxKind;
  status: MailOutboxStatus;
  subject: string;
  text_body: string;
  html_body: string | null;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  headers_json: string;
  provider_message_id: string | null;
  error_text: string | null;
  created_at: string;
  updated_at: string;
}

interface ApprovalRequestRow {
  request_id: string;
  legacy_outbox_id: string;
  room_key: string;
  run_id: string | null;
  status: ApprovalRequestStatus;
  subject: string;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  requested_at: string;
  decided_at: string | null;
  error_text: string | null;
  created_at: string;
  updated_at: string;
}

function mapOutboxIntentRow(row: OutboxIntentRow): OutboxIntentRecord {
  return {
    intentId: row.intent_id,
    legacyOutboxId: row.legacy_outbox_id,
    roomKey: row.room_key,
    runId: row.run_id ?? undefined,
    kind: row.kind,
    status: row.status,
    subject: row.subject,
    textBody: row.text_body,
    htmlBody: row.html_body ?? undefined,
    to: JSON.parse(row.to_json) as string[],
    cc: JSON.parse(row.cc_json) as string[],
    bcc: JSON.parse(row.bcc_json) as string[],
    headers: JSON.parse(row.headers_json) as Record<string, string>,
    providerMessageId: row.provider_message_id ?? undefined,
    errorText: row.error_text ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapOutboxIntentToMailOutboxRecord(record: OutboxIntentRecord): MailOutboxRecord {
  return {
    outboxId: record.legacyOutboxId,
    roomKey: record.roomKey,
    runId: record.runId,
    kind: record.kind,
    status: record.status,
    subject: record.subject,
    textBody: record.textBody,
    htmlBody: record.htmlBody,
    to: record.to,
    cc: record.cc,
    bcc: record.bcc,
    headers: record.headers,
    providerMessageId: record.providerMessageId,
    errorText: record.errorText,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function mapApprovalRequestRow(row: ApprovalRequestRow): ApprovalRequestRecord {
  return {
    requestId: row.request_id,
    legacyOutboxId: row.legacy_outbox_id,
    roomKey: row.room_key,
    runId: row.run_id ?? undefined,
    status: row.status,
    subject: row.subject,
    to: JSON.parse(row.to_json) as string[],
    cc: JSON.parse(row.cc_json) as string[],
    bcc: JSON.parse(row.bcc_json) as string[],
    requestedAt: row.requested_at,
    decidedAt: row.decided_at ?? undefined,
    errorText: row.error_text ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

interface LegacyMailOutboxRow {
  outbox_id: string;
  room_key: string;
  run_id: string | null;
  kind: MailOutboxKind;
  status: MailOutboxStatus;
  subject: string;
  text_body: string;
  html_body: string | null;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  headers_json: string;
  provider_message_id: string | null;
  error_text: string | null;
  created_at: string;
  updated_at: string;
}

function hasLegacyMailOutboxTable(db: DatabaseSync) {
  const row = db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = 'mail_outbox'
        LIMIT 1;
      `
    )
    .get() as { name: string } | undefined;

  return row?.name === "mail_outbox";
}

function listLegacyMailOutboxRows(db: DatabaseSync): MailOutboxRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          outbox_id,
          room_key,
          run_id,
          kind,
          status,
          subject,
          text_body,
          html_body,
          to_json,
          cc_json,
          bcc_json,
          headers_json,
          provider_message_id,
          error_text,
          created_at,
          updated_at
        FROM mail_outbox
        ORDER BY created_at ASC;
      `
    )
    .all() as unknown as LegacyMailOutboxRow[];

  return rows.map(mapLegacyMailOutboxRow);
}

function findLegacyMailOutboxByReferenceId(
  db: DatabaseSync,
  referenceId: string
): MailOutboxRecord | null {
  if (!hasLegacyMailOutboxTable(db)) {
    return null;
  }

  const row = db
    .prepare(
      `
        SELECT
          outbox_id,
          room_key,
          run_id,
          kind,
          status,
          subject,
          text_body,
          html_body,
          to_json,
          cc_json,
          bcc_json,
          headers_json,
          provider_message_id,
          error_text,
          created_at,
          updated_at
        FROM mail_outbox
        WHERE outbox_id = ?
        LIMIT 1;
      `
    )
    .get(referenceId) as LegacyMailOutboxRow | undefined;

  return row ? mapLegacyMailOutboxRow(row) : null;
}

function mapLegacyMailOutboxRow(row: LegacyMailOutboxRow): MailOutboxRecord {
  return {
    outboxId: row.outbox_id,
    roomKey: row.room_key,
    runId: row.run_id ?? undefined,
    kind: row.kind,
    status: row.status,
    subject: row.subject,
    textBody: row.text_body,
    htmlBody: row.html_body ?? undefined,
    to: JSON.parse(row.to_json) as string[],
    cc: JSON.parse(row.cc_json) as string[],
    bcc: JSON.parse(row.bcc_json) as string[],
    headers: JSON.parse(row.headers_json) as Record<string, string>,
    providerMessageId: row.provider_message_id ?? undefined,
    errorText: row.error_text ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
