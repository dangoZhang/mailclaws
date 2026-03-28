import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import type { PersistedAttachmentArtifactMetadata } from "../../storage/artifacts.js";

export interface ArtifactChunkRecord {
  chunkId: string;
  attachmentId: string;
  roomKey: string;
  filename: string;
  chunkPath: string;
  summaryPath?: string;
  bodyText: string;
  summaryText?: string;
  tokenEstimate: number;
  textHash: string;
  createdAt: string;
}

export function replaceArtifactChunksForAttachment(
  db: DatabaseSync,
  input: {
    attachmentId: string;
    roomKey: string;
    filename: string;
    createdAt: string;
    metadata: PersistedAttachmentArtifactMetadata | null;
  }
) {
  db.prepare("DELETE FROM artifact_chunks WHERE attachment_id = ?;").run(input.attachmentId);

  const chunks = input.metadata?.chunks ?? [];
  const insert = db.prepare(
    `
      INSERT INTO artifact_chunks (
        artifact_chunk_id,
        chunk_id,
        attachment_id,
        room_key,
        filename,
        chunk_path,
        summary_path,
        body_text,
        summary_text,
        token_estimate,
        text_hash,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `
  );

  for (const chunk of chunks) {
    insert.run(
      `${input.attachmentId}:${chunk.chunkId}`,
      chunk.chunkId,
      input.attachmentId,
      input.roomKey,
      input.filename,
      chunk.chunkPath,
      chunk.summaryPath ?? null,
      readOptionalText(chunk.chunkPath),
      readOptionalText(chunk.summaryPath),
      chunk.tokenEstimate,
      chunk.sha256,
      input.createdAt
    );
  }
}

export function listArtifactChunksForRoom(
  db: DatabaseSync,
  roomKey: string
): ArtifactChunkRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          artifact_chunk_id,
          chunk_id,
          attachment_id,
          room_key,
          filename,
          chunk_path,
          summary_path,
          body_text,
          summary_text,
          token_estimate,
          text_hash,
          created_at
        FROM artifact_chunks
        WHERE room_key = ?
        ORDER BY created_at ASC, chunk_id ASC;
      `
    )
    .all(roomKey) as Array<{
    artifact_chunk_id: string;
    chunk_id: string;
    attachment_id: string;
    room_key: string;
    filename: string;
    chunk_path: string;
    summary_path: string | null;
    body_text: string;
    summary_text: string | null;
    token_estimate: number;
    text_hash: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    chunkId: row.chunk_id,
    attachmentId: row.attachment_id,
    roomKey: row.room_key,
    filename: row.filename,
    chunkPath: row.chunk_path,
    summaryPath: row.summary_path ?? undefined,
    bodyText: row.body_text,
    summaryText: row.summary_text ?? undefined,
    tokenEstimate: row.token_estimate,
    textHash: row.text_hash,
    createdAt: row.created_at
  }));
}

function readOptionalText(filePath?: string | null) {
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }

  return fs.readFileSync(filePath, "utf8");
}
