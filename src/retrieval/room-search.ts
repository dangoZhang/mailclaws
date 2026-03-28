import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";

import { readAttachmentArtifactMetadata } from "../storage/artifacts.js";
import { listArtifactChunksForRoom } from "../storage/repositories/artifact-chunks.js";
import { searchRoomSearchIndex } from "../storage/repositories/room-search-index.js";
import { getThreadRoom } from "../storage/repositories/thread-rooms.js";
import { listMailAttachmentsForRoom } from "../storage/repositories/mail-attachments.js";
import { listMailMessagesForRoom } from "../storage/repositories/mail-messages.js";

export interface RoomSearchHit {
  kind: "attachment" | "message" | "room_note";
  roomKey: string;
  sourceId: string;
  title: string;
  excerpt: string;
  score: number;
  artifactPath?: string;
  chunkId?: string;
  chunkPath?: string;
}

export function searchRoomContext(
  db: DatabaseSync,
  input: {
    roomKey: string;
    query: string;
    limit?: number;
  }
): RoomSearchHit[] {
  const room = getThreadRoom(db, input.roomKey);
  if (!room) {
    return [];
  }

  const queryTerms = tokenize(input.query);
  if (queryTerms.length === 0) {
    return [];
  }

  const limit = input.limit ?? 5;
  const indexedHits = searchRoomSearchIndex(db, {
    roomKey: input.roomKey,
    query: input.query,
    limit
  }).map((hit) => ({
    kind: hit.kind,
    roomKey: hit.roomKey,
    sourceId: hit.sourceId,
    title: hit.title,
    excerpt: createExcerpt(hit.excerptSource, queryTerms),
    score: hit.score,
    artifactPath: hit.artifactPath,
    chunkId: hit.chunkId,
    chunkPath: hit.chunkPath
  }));
  const indexedSourceIds = new Set(indexedHits.map((hit) => hit.sourceId));
  const messageHits = listMailMessagesForRoom(db, {
    accountId: room.accountId,
    stableThreadId: room.stableThreadId
  }).flatMap((message) => {
    if (indexedSourceIds.has(message.dedupeKey)) {
      return [];
    }

    const hit = buildMessageHit(input.roomKey, message, queryTerms);
    return hit ? [hit] : [];
  });
  const indexedChunks = listArtifactChunksForRoom(db, input.roomKey);
  const indexedAttachmentIds = new Set(indexedChunks.map((chunk) => chunk.attachmentId));
  const attachmentHits = [
    ...buildAttachmentChunkHits(input.roomKey, indexedChunks, queryTerms).filter(
      (hit) => !indexedSourceIds.has(hit.sourceId)
    ),
    ...listMailAttachmentsForRoom(db, input.roomKey).flatMap((attachment) => {
      if (
        indexedAttachmentIds.has(attachment.attachmentId) ||
        indexedSourceIds.has(attachment.attachmentId)
      ) {
        return [];
      }

      return buildAttachmentHits(input.roomKey, attachment, queryTerms);
    })
  ];

  return [...indexedHits, ...messageHits, ...attachmentHits]
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, limit);
}

function buildMessageHit(
  roomKey: string,
  message: ReturnType<typeof listMailMessagesForRoom>[number],
  queryTerms: string[]
) {
  const haystack = [message.rawSubject, message.textBody, message.htmlBody]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n");
  const score = scoreText(haystack, queryTerms);
  if (score <= 0) {
    return null;
  }

  return {
    kind: "message" as const,
    roomKey,
    sourceId: message.dedupeKey,
    title: message.rawSubject ?? message.normalizedSubject,
    excerpt: createExcerpt(haystack, queryTerms),
    score
  };
}

function buildAttachmentHits(
  roomKey: string,
  attachment: ReturnType<typeof listMailAttachmentsForRoom>[number],
  queryTerms: string[]
) {
  return readAttachmentDocuments(attachment).flatMap((document) => {
    const score = scoreText(document.haystack, queryTerms);
    if (score <= 0) {
      return [];
    }

    return [
      {
        kind: "attachment" as const,
        roomKey,
        sourceId: document.sourceId,
        title: document.title,
        excerpt: createExcerpt(document.excerptSource, queryTerms),
        score,
        artifactPath: attachment.artifactPath,
        chunkId: document.chunkId,
        chunkPath: document.chunkPath
      }
    ];
  });
}

function buildAttachmentChunkHits(
  roomKey: string,
  chunks: ReturnType<typeof listArtifactChunksForRoom>,
  queryTerms: string[]
) {
  return chunks.flatMap((chunk) => {
    const haystack = [chunk.summaryText, chunk.bodyText]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join("\n");
    const score = scoreText(haystack, queryTerms);
    if (score <= 0) {
      return [];
    }

    return [
      {
        kind: "attachment" as const,
        roomKey,
        sourceId: `${chunk.attachmentId}:${chunk.chunkId}`,
        title: `${chunk.filename} (${chunk.chunkId})`,
        excerpt: createExcerpt(haystack, queryTerms),
        score,
        chunkId: chunk.chunkId,
        chunkPath: chunk.chunkPath
      }
    ];
  });
}

function readAttachmentDocuments(attachment: ReturnType<typeof listMailAttachmentsForRoom>[number]) {
  const metadata = readAttachmentArtifactMetadata(attachment.artifactPath);
  const shortSummary = readOptionalText(metadata?.summaryShortPath ?? metadata?.summaryPath);
  const longSummary = readOptionalText(metadata?.summaryLongPath);
  const extracted = readOptionalText(metadata?.extractedTextPath);

  if (metadata?.chunks?.length) {
    return metadata.chunks.map((chunk) => {
      const chunkText = readOptionalText(chunk.chunkPath);
      const chunkSummary = readOptionalText(chunk.summaryPath);

      return {
        sourceId: `${attachment.attachmentId}:${chunk.chunkId}`,
        title: `${attachment.filename} (${chunk.chunkId})`,
        haystack: [attachment.summaryText, shortSummary, longSummary, chunkSummary, chunkText]
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .join("\n"),
        excerptSource: [chunkText, chunkSummary, shortSummary]
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          .join("\n"),
        chunkId: chunk.chunkId,
        chunkPath: chunk.chunkPath
      };
    });
  }

  return [
    {
      sourceId: attachment.attachmentId,
      title: attachment.filename,
      haystack: [attachment.summaryText, shortSummary, longSummary, extracted]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join("\n"),
      excerptSource: [extracted, shortSummary, longSummary]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join("\n"),
      chunkId: undefined,
      chunkPath: undefined
    }
  ];
}

function readOptionalText(filePath?: string | null) {
  if (!filePath || !fs.existsSync(filePath)) {
    return "";
  }

  return fs.readFileSync(filePath, "utf8");
}

function scoreText(text: string, queryTerms: string[]) {
  const normalized = text.toLowerCase();

  return queryTerms.reduce((score, term) => {
    if (!term) {
      return score;
    }

    const matches = normalized.split(term).length - 1;
    return score + matches;
  }, 0);
}

function createExcerpt(text: string, queryTerms: string[]) {
  const normalized = text.toLowerCase();
  const firstIndex = queryTerms
    .map((term) => normalized.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  if (typeof firstIndex !== "number") {
    return text.slice(0, 240).trim();
  }

  const start = Math.max(0, firstIndex - 80);
  const end = Math.min(text.length, firstIndex + 160);
  return text.slice(start, end).trim();
}

function tokenize(query: string) {
  return [...new Set(query.toLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean))];
}
