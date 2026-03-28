import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import type { PersistedAttachmentArtifactMetadata } from "../artifacts.js";
import type { MailAttachmentRecord } from "./mail-attachments.js";
import type { MailMessageRecord } from "./mail-messages.js";

export interface RoomSearchIndexHit {
  kind: "attachment" | "message" | "room_note";
  roomKey: string;
  sourceId: string;
  title: string;
  excerptSource: string;
  score: number;
  artifactPath?: string;
  attachmentId?: string;
  chunkId?: string;
  chunkPath?: string;
}

export function replaceRoomSearchDocumentsForRoomNotes(
  db: DatabaseSync,
  input: {
    roomKey: string;
    createdAt: string;
    documents: Array<{
      noteId: string;
      title: string;
      path: string;
      content: string;
    }>;
  }
) {
  db.prepare(
    `
      DELETE FROM room_search_fts
      WHERE room_key = ? AND kind = 'room_note';
    `
  ).run(input.roomKey);

  if (input.documents.length === 0) {
    return;
  }

  const insert = db.prepare(
    `
      INSERT INTO room_search_fts (
        room_key,
        kind,
        source_id,
        attachment_id,
        title,
        body,
        excerpt_source,
        chunk_id,
        chunk_path,
        artifact_path,
        created_at
      ) VALUES (?, 'room_note', ?, NULL, ?, ?, ?, NULL, NULL, ?, ?);
    `
  );

  for (const document of input.documents) {
    if (document.content.trim().length === 0) {
      continue;
    }

    insert.run(
      input.roomKey,
      document.noteId,
      document.title,
      document.content,
      document.content,
      document.path,
      input.createdAt
    );
  }
}

export function replaceRoomSearchDocumentForMessage(
  db: DatabaseSync,
  input: {
    roomKey: string;
    message: MailMessageRecord;
  }
) {
  db.prepare(
    `
      DELETE FROM room_search_fts
      WHERE kind = 'message' AND source_id = ?;
    `
  ).run(input.message.dedupeKey);

  const body = [input.message.rawSubject, input.message.textBody, input.message.htmlBody]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  if (!body) {
    return;
  }

  db.prepare(
    `
      INSERT INTO room_search_fts (
        room_key,
        kind,
        source_id,
        attachment_id,
        title,
        body,
        excerpt_source,
        chunk_id,
        chunk_path,
        artifact_path,
        created_at
      ) VALUES (?, 'message', ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?);
    `
  ).run(
    input.roomKey,
    input.message.dedupeKey,
    input.message.rawSubject ?? input.message.normalizedSubject,
    body,
    body,
    input.message.receivedAt
  );
}

export function replaceRoomSearchDocumentForVirtualMessage(
  db: DatabaseSync,
  input: {
    roomKey: string;
    messageId: string;
    title: string;
    body: string;
    createdAt: string;
    artifactPath?: string;
  }
) {
  db.prepare(
    `
      DELETE FROM room_search_fts
      WHERE kind = 'message' AND source_id = ?;
    `
  ).run(input.messageId);

  const body = [input.title, input.body]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  if (!body) {
    return;
  }

  db.prepare(
    `
      INSERT INTO room_search_fts (
        room_key,
        kind,
        source_id,
        attachment_id,
        title,
        body,
        excerpt_source,
        chunk_id,
        chunk_path,
        artifact_path,
        created_at
      ) VALUES (?, 'message', ?, NULL, ?, ?, ?, NULL, NULL, ?, ?);
    `
  ).run(
    input.roomKey,
    input.messageId,
    input.title,
    body,
    input.body,
    input.artifactPath ?? null,
    input.createdAt
  );
}

export function replaceRoomSearchDocumentsForAttachment(
  db: DatabaseSync,
  input: {
    attachment: MailAttachmentRecord;
    metadata: PersistedAttachmentArtifactMetadata | null;
  }
) {
  db.prepare(
    `
      DELETE FROM room_search_fts
      WHERE kind = 'attachment' AND attachment_id = ?;
    `
  ).run(input.attachment.attachmentId);

  if (!input.metadata) {
    return;
  }

  const shortSummary = readOptionalText(input.metadata.summaryShortPath ?? input.metadata.summaryPath);
  const longSummary = readOptionalText(input.metadata.summaryLongPath);
  const extracted = readOptionalText(input.metadata.extractedTextPath);
  const title = input.attachment.filename;
  const createdAt = input.attachment.createdAt;

  const chunks = input.metadata.chunks ?? [];
  if (chunks.length > 0) {
    const insert = db.prepare(
      `
        INSERT INTO room_search_fts (
          room_key,
          kind,
          source_id,
          attachment_id,
          title,
          body,
          excerpt_source,
          chunk_id,
          chunk_path,
          artifact_path,
          created_at
        ) VALUES (?, 'attachment', ?, ?, ?, ?, ?, ?, ?, ?, ?);
      `
    );

    for (const chunk of chunks) {
      const chunkText = readOptionalText(chunk.chunkPath);
      const chunkSummary = readOptionalText(chunk.summaryPath);
      const body = [input.attachment.summaryText, shortSummary, longSummary, chunkSummary, chunkText]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join("\n");
      if (!body) {
        continue;
      }

      const excerptSource = [chunkText, chunkSummary, shortSummary, longSummary]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join("\n");
      insert.run(
        input.attachment.roomKey,
        `${input.attachment.attachmentId}:${chunk.chunkId}`,
        input.attachment.attachmentId,
        `${title} (${chunk.chunkId})`,
        body,
        excerptSource || body,
        chunk.chunkId,
        chunk.chunkPath,
        input.attachment.artifactPath ?? null,
        createdAt
      );
    }
    return;
  }

  const body = [input.attachment.summaryText, shortSummary, longSummary, extracted]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  if (!body) {
    return;
  }

  db.prepare(
    `
      INSERT INTO room_search_fts (
        room_key,
        kind,
        source_id,
        attachment_id,
        title,
        body,
        excerpt_source,
        chunk_id,
        chunk_path,
        artifact_path,
        created_at
      ) VALUES (?, 'attachment', ?, ?, ?, ?, ?, NULL, NULL, ?, ?);
    `
  ).run(
    input.attachment.roomKey,
    input.attachment.attachmentId,
    input.attachment.attachmentId,
    title,
    body,
    extracted || shortSummary || longSummary || body,
    input.attachment.artifactPath ?? null,
    createdAt
  );
}

export function searchRoomSearchIndex(
  db: DatabaseSync,
  input: {
    roomKey: string;
    query: string;
    limit: number;
  }
): RoomSearchIndexHit[] {
  const ftsQuery = buildFtsQuery(input.query);
  if (!ftsQuery) {
    return [];
  }

  const rows = db
    .prepare(
      `
        SELECT
          room_key,
          kind,
          source_id,
          attachment_id,
          title,
          excerpt_source,
          chunk_id,
          chunk_path,
          artifact_path,
          bm25(room_search_fts) AS rank
        FROM room_search_fts
        WHERE room_key = ? AND room_search_fts MATCH ?
        ORDER BY rank ASC
        LIMIT ?;
      `
    )
    .all(input.roomKey, ftsQuery, input.limit) as Array<{
      room_key: string;
      kind: "attachment" | "message" | "room_note";
      source_id: string;
      attachment_id: string | null;
      title: string;
      excerpt_source: string;
      chunk_id: string | null;
      chunk_path: string | null;
      artifact_path: string | null;
      rank: number;
    }>;

  return rows.map((row) => ({
    kind: row.kind,
    roomKey: row.room_key,
    sourceId: row.source_id,
    title: row.title,
    excerptSource: row.excerpt_source,
    score: normalizeRank(row.rank),
    artifactPath: row.artifact_path ?? undefined,
    attachmentId: row.attachment_id ?? undefined,
    chunkId: row.chunk_id ?? undefined,
    chunkPath: row.chunk_path ?? undefined
  }));
}

function buildFtsQuery(query: string) {
  const tokens = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .map((term) => {
      const prefix = term.endsWith("*");
      const normalized = term.replace(/[^\p{L}\p{N}_*]+/gu, "");
      if (!normalized) {
        return null;
      }

      if (prefix) {
        const base = normalized.slice(0, -1);
        if (!base) {
          return null;
        }

        return `${escapeFtsToken(base)}*`;
      }

      return escapeFtsToken(normalized);
    })
    .filter((term): term is string => typeof term === "string" && term.length > 0);

  if (tokens.length === 0) {
    return null;
  }

  return tokens.join(" OR ");
}

function escapeFtsToken(token: string) {
  return `"${token.replace(/"/g, "\"\"")}"`;
}

function normalizeRank(rank: number) {
  if (!Number.isFinite(rank)) {
    return 0;
  }

  return 1 / (1 + Math.abs(rank));
}

function readOptionalText(filePath?: string | null) {
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }

  return fs.readFileSync(filePath, "utf8");
}
