import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface MailAttachmentRecord {
  attachmentId: string;
  roomKey: string;
  messageDedupeKey: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  contentSha256?: string;
  contentId?: string;
  disposition?: string;
  summaryText?: string;
  artifactPath?: string;
  createdAt: string;
}

export interface MailAttachmentInput {
  attachmentId?: string;
  roomKey: string;
  messageDedupeKey: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  contentSha256?: string;
  contentId?: string;
  disposition?: string;
  summaryText?: string;
  artifactPath?: string;
  createdAt: string;
}

export function insertMailAttachment(
  db: DatabaseSync,
  input: MailAttachmentInput
): MailAttachmentRecord {
  const record: MailAttachmentRecord = {
    attachmentId: input.attachmentId ?? randomUUID(),
    roomKey: input.roomKey,
    messageDedupeKey: input.messageDedupeKey,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    contentSha256: input.contentSha256,
    contentId: input.contentId,
    disposition: input.disposition,
    summaryText: input.summaryText,
    artifactPath: input.artifactPath,
    createdAt: input.createdAt
  };

  db.prepare(
    `
      INSERT INTO mail_attachments (
        attachment_id,
        room_key,
        message_dedupe_key,
        filename,
        mime_type,
        size_bytes,
        content_sha256,
        content_id,
        disposition,
        summary_text,
        artifact_path,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `
  ).run(
    record.attachmentId,
    record.roomKey,
    record.messageDedupeKey,
    record.filename,
    record.mimeType,
    record.sizeBytes ?? null,
    record.contentSha256 ?? null,
    record.contentId ?? null,
    record.disposition ?? null,
    record.summaryText ?? null,
    record.artifactPath ?? null,
    record.createdAt
  );

  return record;
}

export function listMailAttachmentsForRoom(
  db: DatabaseSync,
  roomKey: string
): MailAttachmentRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          attachment_id,
          room_key,
          message_dedupe_key,
          filename,
          mime_type,
          size_bytes,
          content_sha256,
          content_id,
          disposition,
          summary_text,
          artifact_path,
          created_at
        FROM mail_attachments
        WHERE room_key = ?
        ORDER BY created_at ASC;
      `
    )
    .all(roomKey) as unknown as MailAttachmentRow[];

  return rows.map(mapMailAttachmentRow);
}

export function findReusableMailAttachmentByHash(
  db: DatabaseSync,
  input: {
    roomKey: string;
    contentSha256: string;
  }
): MailAttachmentRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          attachment_id,
          room_key,
          message_dedupe_key,
          filename,
          mime_type,
          size_bytes,
          content_sha256,
          content_id,
          disposition,
          summary_text,
          artifact_path,
          created_at
        FROM mail_attachments
        WHERE room_key = ?
          AND content_sha256 = ?
          AND artifact_path IS NOT NULL
        ORDER BY created_at ASC, attachment_id ASC
        LIMIT 1;
      `
    )
    .get(input.roomKey, input.contentSha256) as MailAttachmentRow | undefined;

  return row ? mapMailAttachmentRow(row) : null;
}

interface MailAttachmentRow {
  attachment_id: string;
  room_key: string;
  message_dedupe_key: string;
  filename: string;
  mime_type: string;
  size_bytes: number | null;
  content_sha256: string | null;
  content_id: string | null;
  disposition: string | null;
  summary_text: string | null;
  artifact_path: string | null;
  created_at: string;
}

function mapMailAttachmentRow(row: MailAttachmentRow): MailAttachmentRecord {
  return {
    attachmentId: row.attachment_id,
    roomKey: row.room_key,
    messageDedupeKey: row.message_dedupe_key,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes ?? undefined,
    contentSha256: row.content_sha256 ?? undefined,
    contentId: row.content_id ?? undefined,
    disposition: row.disposition ?? undefined,
    summaryText: row.summary_text ?? undefined,
    artifactPath: row.artifact_path ?? undefined,
    createdAt: row.created_at
  };
}
