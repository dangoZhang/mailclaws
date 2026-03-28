import type { DatabaseSync } from "node:sqlite";

import type { MailboxDelivery, VirtualMailboxViewEntry } from "../../core/types.js";

export function insertMailboxDelivery(db: DatabaseSync, delivery: MailboxDelivery) {
  db.prepare(
    `
      INSERT INTO mailbox_deliveries (
        delivery_id,
        room_key,
        message_id,
        mailbox_id,
        status,
        lease_owner,
        lease_until,
        consumed_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(delivery_id) DO UPDATE SET
        status = excluded.status,
        lease_owner = excluded.lease_owner,
        lease_until = excluded.lease_until,
        consumed_at = excluded.consumed_at,
        updated_at = excluded.updated_at;
    `
  ).run(
    delivery.deliveryId,
    delivery.roomKey,
    delivery.messageId,
    delivery.mailboxId,
    delivery.status,
    delivery.leaseOwner ?? null,
    delivery.leaseUntil ?? null,
    delivery.consumedAt ?? null,
    delivery.createdAt,
    delivery.updatedAt
  );
}

export function listMailboxDeliveriesForRoom(db: DatabaseSync, roomKey: string): MailboxDelivery[] {
  const rows = db
    .prepare(
      `
        SELECT
          delivery_id,
          room_key,
          message_id,
          mailbox_id,
          status,
          lease_owner,
          lease_until,
          consumed_at,
          created_at,
          updated_at
        FROM mailbox_deliveries
        WHERE room_key = ?
        ORDER BY created_at ASC, delivery_id ASC;
      `
    )
    .all(roomKey) as unknown as MailboxDeliveryRow[];

  return rows.map(mapMailboxDeliveryRow);
}

export function getMailboxDelivery(db: DatabaseSync, deliveryId: string): MailboxDelivery | null {
  const row = db
    .prepare(
      `
        SELECT
          delivery_id,
          room_key,
          message_id,
          mailbox_id,
          status,
          lease_owner,
          lease_until,
          consumed_at,
          created_at,
          updated_at
        FROM mailbox_deliveries
        WHERE delivery_id = ?;
      `
    )
    .get(deliveryId) as MailboxDeliveryRow | undefined;

  return row ? mapMailboxDeliveryRow(row) : null;
}

export function listMailboxDeliveriesForMessage(
  db: DatabaseSync,
  messageId: string
): MailboxDelivery[] {
  const rows = db
    .prepare(
      `
        SELECT
          delivery_id,
          room_key,
          message_id,
          mailbox_id,
          status,
          lease_owner,
          lease_until,
          consumed_at,
          created_at,
          updated_at
        FROM mailbox_deliveries
        WHERE message_id = ?
        ORDER BY created_at ASC, delivery_id ASC;
      `
    )
    .all(messageId) as unknown as MailboxDeliveryRow[];

  return rows.map(mapMailboxDeliveryRow);
}

export function listMailboxViewEntries(
  db: DatabaseSync,
  input: {
    roomKey: string;
    mailboxId: string;
    originKinds?: VirtualMailboxViewEntry["message"]["originKind"][];
  }
): VirtualMailboxViewEntry[] {
  const { clause, params } = buildOriginKindsFilter("message.origin_kind", input.originKinds);
  const rows = db
    .prepare(
      `
        SELECT
          delivery.delivery_id,
          delivery.room_key AS delivery_room_key,
          delivery.message_id AS delivery_message_id,
          delivery.mailbox_id AS delivery_mailbox_id,
          delivery.status AS delivery_status,
          delivery.lease_owner,
          delivery.lease_until,
          delivery.consumed_at,
          delivery.created_at AS delivery_created_at,
          delivery.updated_at AS delivery_updated_at,
          message.thread_id,
          message.parent_message_id,
          message.message_id_header,
          message.in_reply_to_json,
          message.references_json,
          message.from_principal_id,
          message.from_mailbox_id,
          message.to_mailbox_ids_json,
          message.cc_mailbox_ids_json,
          message.kind AS message_kind,
          message.visibility,
          message.origin_kind,
          message.projection_metadata_json,
          message.subject,
          message.body_ref,
          message.artifact_refs_json,
          message.memory_refs_json,
          message.room_revision,
          message.inputs_hash,
          message.created_at AS message_created_at,
          thread.kind AS thread_kind,
          thread.topic,
          thread.parent_work_thread_id,
          thread.created_by_message_id,
          thread.status AS thread_status,
          thread.created_at AS thread_created_at
        FROM mailbox_deliveries AS delivery
        JOIN virtual_messages AS message
          ON message.message_id = delivery.message_id
        JOIN virtual_threads AS thread
          ON thread.thread_id = message.thread_id
        WHERE delivery.room_key = ?
          AND delivery.mailbox_id = ?
          ${clause}
        ORDER BY message.created_at ASC, delivery.delivery_id ASC;
      `
    )
    .all(input.roomKey, input.mailboxId, ...params) as unknown as MailboxViewRow[];

  return rows.map(mapMailboxViewRow);
}

export function listMailboxFeedEntries(
  db: DatabaseSync,
  input: {
    mailboxId: string;
    limit?: number;
    originKinds?: VirtualMailboxViewEntry["message"]["originKind"][];
  }
): VirtualMailboxViewEntry[] {
  const limitClause = typeof input.limit === "number" ? `LIMIT ${Math.max(1, input.limit)}` : "";
  const { clause, params } = buildOriginKindsFilter("message.origin_kind", input.originKinds);
  const rows = db
    .prepare(
      `
        SELECT
          delivery.delivery_id,
          delivery.room_key AS delivery_room_key,
          delivery.message_id AS delivery_message_id,
          delivery.mailbox_id AS delivery_mailbox_id,
          delivery.status AS delivery_status,
          delivery.lease_owner,
          delivery.lease_until,
          delivery.consumed_at,
          delivery.created_at AS delivery_created_at,
          delivery.updated_at AS delivery_updated_at,
          message.thread_id,
          message.parent_message_id,
          message.message_id_header,
          message.in_reply_to_json,
          message.references_json,
          message.from_principal_id,
          message.from_mailbox_id,
          message.to_mailbox_ids_json,
          message.cc_mailbox_ids_json,
          message.kind AS message_kind,
          message.visibility,
          message.origin_kind,
          message.projection_metadata_json,
          message.subject,
          message.body_ref,
          message.artifact_refs_json,
          message.memory_refs_json,
          message.room_revision,
          message.inputs_hash,
          message.created_at AS message_created_at,
          thread.kind AS thread_kind,
          thread.topic,
          thread.parent_work_thread_id,
          thread.created_by_message_id,
          thread.status AS thread_status,
          thread.created_at AS thread_created_at
        FROM mailbox_deliveries AS delivery
        JOIN virtual_messages AS message
          ON message.message_id = delivery.message_id
        JOIN virtual_threads AS thread
          ON thread.thread_id = message.thread_id
        WHERE delivery.mailbox_id = ?
          ${clause}
        ORDER BY message.created_at DESC, delivery.delivery_id DESC
        ${limitClause};
      `
    )
    .all(input.mailboxId, ...params) as unknown as MailboxViewRow[];

  return rows.map(mapMailboxViewRow);
}

export function deleteMailboxDeliveriesForRoom(db: DatabaseSync, roomKey: string) {
  db.prepare("DELETE FROM mailbox_deliveries WHERE room_key = ?;").run(roomKey);
}

interface MailboxDeliveryRow {
  delivery_id: string;
  room_key: string;
  message_id: string;
  mailbox_id: string;
  status: MailboxDelivery["status"];
  lease_owner: string | null;
  lease_until: string | null;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MailboxViewRow {
  delivery_id: string;
  delivery_room_key: string;
  delivery_message_id: string;
  delivery_mailbox_id: string;
  delivery_status: MailboxDelivery["status"];
  lease_owner: string | null;
  lease_until: string | null;
  consumed_at: string | null;
  delivery_created_at: string;
  delivery_updated_at: string;
  thread_id: string;
  parent_message_id: string | null;
  message_id_header: string;
  in_reply_to_json: string;
  references_json: string;
  from_principal_id: string;
  from_mailbox_id: string;
  to_mailbox_ids_json: string;
  cc_mailbox_ids_json: string;
  message_kind: VirtualMailboxViewEntry["message"]["kind"];
  visibility: VirtualMailboxViewEntry["message"]["visibility"];
  origin_kind: VirtualMailboxViewEntry["message"]["originKind"];
  projection_metadata_json: string;
  subject: string;
  body_ref: string;
  artifact_refs_json: string;
  memory_refs_json: string;
  room_revision: number;
  inputs_hash: string;
  message_created_at: string;
  thread_kind: VirtualMailboxViewEntry["thread"]["kind"];
  topic: string;
  parent_work_thread_id: string | null;
  created_by_message_id: string;
  thread_status: VirtualMailboxViewEntry["thread"]["status"];
  thread_created_at: string;
}

function mapMailboxViewRow(row: MailboxViewRow): VirtualMailboxViewEntry {
  return {
    delivery: mapMailboxDeliveryRow({
      delivery_id: row.delivery_id,
      room_key: row.delivery_room_key,
      message_id: row.delivery_message_id,
      mailbox_id: row.delivery_mailbox_id,
      status: row.delivery_status,
      lease_owner: row.lease_owner,
      lease_until: row.lease_until,
      consumed_at: row.consumed_at,
      created_at: row.delivery_created_at,
      updated_at: row.delivery_updated_at
    }),
    message: {
      messageId: row.delivery_message_id,
      roomKey: row.delivery_room_key,
      threadId: row.thread_id,
      parentMessageId: row.parent_message_id ?? undefined,
      messageIdHeader: row.message_id_header,
      inReplyTo: parseStringArray(row.in_reply_to_json),
      references: parseStringArray(row.references_json),
      fromPrincipalId: row.from_principal_id,
      fromMailboxId: row.from_mailbox_id,
      toMailboxIds: parseStringArray(row.to_mailbox_ids_json),
      ccMailboxIds: parseStringArray(row.cc_mailbox_ids_json),
      kind: row.message_kind,
      visibility: row.visibility,
      originKind: row.origin_kind,
      projectionMetadata: parseProjectionMetadata(row.projection_metadata_json, row.origin_kind),
      subject: row.subject,
      bodyRef: row.body_ref,
      artifactRefs: parseStringArray(row.artifact_refs_json),
      memoryRefs: parseStringArray(row.memory_refs_json),
      roomRevision: row.room_revision,
      inputsHash: row.inputs_hash,
      createdAt: row.message_created_at
    },
    thread: {
      threadId: row.thread_id,
      roomKey: row.delivery_room_key,
      kind: row.thread_kind,
      topic: row.topic,
      parentWorkThreadId: row.parent_work_thread_id ?? undefined,
      createdByMessageId: row.created_by_message_id,
      status: row.thread_status,
      createdAt: row.thread_created_at
    }
  };
}

function mapMailboxDeliveryRow(row: MailboxDeliveryRow): MailboxDelivery {
  return {
    deliveryId: row.delivery_id,
    roomKey: row.room_key,
    messageId: row.message_id,
    mailboxId: row.mailbox_id,
    status: row.status,
    leaseOwner: row.lease_owner ?? undefined,
    leaseUntil: row.lease_until ?? undefined,
    consumedAt: row.consumed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseStringArray(value: string) {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
}

function parseProjectionMetadata(
  value: string,
  originKind: VirtualMailboxViewEntry["message"]["originKind"]
): VirtualMailboxViewEntry["message"]["projectionMetadata"] {
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null) {
    return {
      origin: {
        kind: originKind
      }
    };
  }

  const record = parsed as {
    origin?: {
      controlPlane?: unknown;
      sessionKey?: unknown;
      runId?: unknown;
      frontAgentId?: unknown;
      sourceMessageId?: unknown;
    };
  };

  return {
    origin: {
      kind: originKind,
      ...(typeof record.origin?.controlPlane === "string"
        ? { controlPlane: record.origin.controlPlane }
        : {}),
      ...(typeof record.origin?.sessionKey === "string"
        ? { sessionKey: record.origin.sessionKey }
        : {}),
      ...(typeof record.origin?.runId === "string" ? { runId: record.origin.runId } : {}),
      ...(typeof record.origin?.frontAgentId === "string"
        ? { frontAgentId: record.origin.frontAgentId }
        : {}),
      ...(typeof record.origin?.sourceMessageId === "string"
        ? { sourceMessageId: record.origin.sourceMessageId }
        : {})
    }
  };
}

function buildOriginKindsFilter(
  qualifiedColumn: string,
  originKinds?: VirtualMailboxViewEntry["message"]["originKind"][]
) {
  const filtered = Array.from(new Set((originKinds ?? []).filter((value) => typeof value === "string")));
  if (filtered.length === 0) {
    return {
      clause: "",
      params: [] as string[]
    };
  }

  const placeholders = filtered.map(() => "?").join(", ");
  return {
    clause: `AND ${qualifiedColumn} IN (${placeholders})`,
    params: filtered
  };
}
