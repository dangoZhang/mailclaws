import type { DatabaseSync } from "node:sqlite";

import type { VirtualMessage } from "../../core/types.js";

export function insertVirtualMessage(db: DatabaseSync, message: VirtualMessage) {
  db.prepare(
    `
      INSERT INTO virtual_messages (
        message_id,
        room_key,
        thread_id,
        parent_message_id,
        message_id_header,
        in_reply_to_json,
        references_json,
        from_principal_id,
        from_mailbox_id,
        to_mailbox_ids_json,
        cc_mailbox_ids_json,
        kind,
        visibility,
        origin_kind,
        projection_metadata_json,
        subject,
        body_ref,
        artifact_refs_json,
        memory_refs_json,
        room_revision,
        inputs_hash,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `
  ).run(
    message.messageId,
    message.roomKey,
    message.threadId,
    message.parentMessageId ?? null,
    message.messageIdHeader,
    JSON.stringify(message.inReplyTo),
    JSON.stringify(message.references),
    message.fromPrincipalId,
    message.fromMailboxId,
    JSON.stringify(message.toMailboxIds),
    JSON.stringify(message.ccMailboxIds),
    message.kind,
    message.visibility,
    message.originKind,
    JSON.stringify(message.projectionMetadata),
    message.subject,
    message.bodyRef,
    JSON.stringify(message.artifactRefs),
    JSON.stringify(message.memoryRefs),
    message.roomRevision,
    message.inputsHash,
    message.createdAt
  );
}

export function getVirtualMessage(db: DatabaseSync, messageId: string): VirtualMessage | null {
  const row = db
    .prepare(
      `
        SELECT
          message_id,
          room_key,
          thread_id,
          parent_message_id,
          message_id_header,
          in_reply_to_json,
          references_json,
          from_principal_id,
          from_mailbox_id,
          to_mailbox_ids_json,
          cc_mailbox_ids_json,
          kind,
          visibility,
          origin_kind,
          projection_metadata_json,
          subject,
          body_ref,
          artifact_refs_json,
          memory_refs_json,
          room_revision,
          inputs_hash,
          created_at
        FROM virtual_messages
        WHERE message_id = $messageId;
      `
    )
    .get({
      $messageId: messageId
    }) as VirtualMessageRow | undefined;

  return row ? mapVirtualMessageRow(row) : null;
}

export function listVirtualMessagesForRoom(db: DatabaseSync, roomKey: string): VirtualMessage[] {
  const rows = db
    .prepare(
      `
        SELECT
          message_id,
          room_key,
          thread_id,
          parent_message_id,
          message_id_header,
          in_reply_to_json,
          references_json,
          from_principal_id,
          from_mailbox_id,
          to_mailbox_ids_json,
          cc_mailbox_ids_json,
          kind,
          visibility,
          origin_kind,
          projection_metadata_json,
          subject,
          body_ref,
          artifact_refs_json,
          memory_refs_json,
          room_revision,
          inputs_hash,
          created_at
        FROM virtual_messages
        WHERE room_key = ?
        ORDER BY created_at ASC, message_id ASC;
      `
    )
    .all(roomKey) as unknown as VirtualMessageRow[];

  return rows.map(mapVirtualMessageRow);
}

export function listVirtualMessagesForThread(
  db: DatabaseSync,
  threadId: string
): VirtualMessage[] {
  const rows = db
    .prepare(
      `
        SELECT
          message_id,
          room_key,
          thread_id,
          parent_message_id,
          message_id_header,
          in_reply_to_json,
          references_json,
          from_principal_id,
          from_mailbox_id,
          to_mailbox_ids_json,
          cc_mailbox_ids_json,
          kind,
          visibility,
          origin_kind,
          projection_metadata_json,
          subject,
          body_ref,
          artifact_refs_json,
          memory_refs_json,
          room_revision,
          inputs_hash,
          created_at
        FROM virtual_messages
        WHERE thread_id = ?
        ORDER BY created_at ASC, message_id ASC;
      `
    )
    .all(threadId) as unknown as VirtualMessageRow[];

  return rows.map(mapVirtualMessageRow);
}

export function deleteVirtualMessagesForRoom(db: DatabaseSync, roomKey: string) {
  db.prepare("DELETE FROM virtual_messages WHERE room_key = ?;").run(roomKey);
}

interface VirtualMessageRow {
  message_id: string;
  room_key: string;
  thread_id: string;
  parent_message_id: string | null;
  message_id_header: string;
  in_reply_to_json: string;
  references_json: string;
  from_principal_id: string;
  from_mailbox_id: string;
  to_mailbox_ids_json: string;
  cc_mailbox_ids_json: string;
  kind: VirtualMessage["kind"];
  visibility: VirtualMessage["visibility"];
  origin_kind: VirtualMessage["originKind"];
  projection_metadata_json: string;
  subject: string;
  body_ref: string;
  artifact_refs_json: string;
  memory_refs_json: string;
  room_revision: number;
  inputs_hash: string;
  created_at: string;
}

function mapVirtualMessageRow(row: VirtualMessageRow): VirtualMessage {
  return {
    messageId: row.message_id,
    roomKey: row.room_key,
    threadId: row.thread_id,
    parentMessageId: row.parent_message_id ?? undefined,
    messageIdHeader: row.message_id_header,
    inReplyTo: parseStringArray(row.in_reply_to_json),
    references: parseStringArray(row.references_json),
    fromPrincipalId: row.from_principal_id,
    fromMailboxId: row.from_mailbox_id,
    toMailboxIds: parseStringArray(row.to_mailbox_ids_json),
    ccMailboxIds: parseStringArray(row.cc_mailbox_ids_json),
    kind: row.kind,
    visibility: row.visibility,
    originKind: row.origin_kind,
    projectionMetadata: parseProjectionMetadata(row.projection_metadata_json, row.origin_kind),
    subject: row.subject,
    bodyRef: row.body_ref,
    artifactRefs: parseStringArray(row.artifact_refs_json),
    memoryRefs: parseStringArray(row.memory_refs_json),
    roomRevision: row.room_revision,
    inputsHash: row.inputs_hash,
    createdAt: row.created_at
  };
}

function parseStringArray(value: string) {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
}

function parseProjectionMetadata(
  value: string,
  originKind: VirtualMessage["originKind"]
): VirtualMessage["projectionMetadata"] {
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
