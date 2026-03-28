import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { AppConfig } from "../config.js";
import { toSafeStorageFileName, toSafeStoragePathSegment } from "./path-safety.js";

const ATTACHMENT_CHUNK_TARGET_CHARS = 240;

export interface PersistedAttachmentChunk {
  chunkId: string;
  chunkPath: string;
  summaryPath?: string | null;
  sourcePath?: string | null;
  tokenEstimate: number;
  sha256: string;
}

export interface PersistedAttachmentArtifactMetadata {
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  contentSha256?: string;
  contentId?: string;
  disposition?: string;
  summaryText?: string;
  extractedTextPath?: string | null;
  rawDataPath?: string | null;
  summaryPath?: string | null;
  summaryShortPath?: string | null;
  summaryLongPath?: string | null;
  chunks?: PersistedAttachmentChunk[];
}

export function getThreadStateDir(
  config: AppConfig,
  accountId: string,
  stableThreadId: string
) {
  return path.join(
    config.storage.stateDir,
    "threads",
    toSafeStoragePathSegment(accountId, "account"),
    toSafeStoragePathSegment(stableThreadId, "thread")
  );
}

export function persistInboundArtifact(
  config: AppConfig,
  input: {
    accountId: string;
    stableThreadId: string;
    dedupeKey: string;
    payload: unknown;
  }
) {
  return writeArtifact(
    config,
    input.accountId,
    input.stableThreadId,
    ["messages", toSafeStorageFileName(input.dedupeKey, ".json", "message")],
    input.payload
  );
}

export function persistInboundMimeArtifact(
  config: AppConfig,
  input: {
    accountId: string;
    stableThreadId: string;
    dedupeKey: string;
    rawMime: string;
  }
) {
  const threadDir = getThreadStateDir(config, input.accountId, input.stableThreadId);
  const artifactPath = path.join(threadDir, "messages", toSafeStorageFileName(input.dedupeKey, ".eml", "message"));

  fs.mkdirSync(path.dirname(artifactPath), {
    recursive: true
  });
  fs.writeFileSync(artifactPath, input.rawMime, "utf8");

  return artifactPath;
}

export function persistRunArtifact(
  config: AppConfig,
  input: {
    accountId: string;
    stableThreadId: string;
    runId: string;
    payload: unknown;
  }
) {
  return writeArtifact(
    config,
    input.accountId,
    input.stableThreadId,
    ["runs", toSafeStorageFileName(input.runId, ".json", "run")],
    input.payload
  );
}

export function persistSubAgentArtifact(
  config: AppConfig,
  input: {
    accountId: string;
    stableThreadId: string;
    runId: string;
    payload: unknown;
  }
) {
  return writeArtifact(
    config,
    input.accountId,
    input.stableThreadId,
    ["subagents", toSafeStorageFileName(input.runId, ".json", "subagent")],
    input.payload
  );
}

export function persistOutboxArtifact(
  config: AppConfig,
  input: {
    accountId: string;
    stableThreadId: string;
    outboxId: string;
    payload: unknown;
  }
) {
  return writeArtifact(
    config,
    input.accountId,
    input.stableThreadId,
    ["outbox", toSafeStorageFileName(input.outboxId, ".json", "outbox")],
    input.payload
  );
}

export function persistRoomDigestArtifact(
  config: AppConfig,
  input: {
    accountId: string;
    stableThreadId: string;
    content: string;
  }
) {
  return writeTextArtifact(
    config,
    input.accountId,
    input.stableThreadId,
    ["shared", "digest.md"],
    input.content
  );
}

export function persistRoomFactsArtifact(
  config: AppConfig,
  input: {
    accountId: string;
    stableThreadId: string;
    snapshotId?: string;
    payload: unknown;
  }
) {
  const latestPath = writeArtifact(
    config,
    input.accountId,
    input.stableThreadId,
    ["shared", "facts.json"],
    input.payload
  );

  if (!input.snapshotId) {
    return latestPath;
  }

  return writeArtifact(
    config,
    input.accountId,
    input.stableThreadId,
    ["shared", "history", `${sanitizeSnapshotId(input.snapshotId)}.json`],
    input.payload
  );
}

export function persistAttachmentArtifact(
  config: AppConfig,
  input: {
    accountId: string;
    stableThreadId: string;
    attachmentId: string;
    payload: {
      filename: string;
      mimeType: string;
      sizeBytes?: number;
      contentSha256?: string;
      contentId?: string;
      disposition?: string;
      summaryText?: string;
      extractedText?: string;
      rawData?: string | Uint8Array;
    };
  }
) {
  const threadDir = getThreadStateDir(config, input.accountId, input.stableThreadId);
  const attachmentDir = path.join(threadDir, "attachments", toSafeStoragePathSegment(input.attachmentId, "attachment"));
  const metadataPath = path.join(attachmentDir, "metadata.json");
  const extractedText = normalizeAttachmentText(input.payload.extractedText);

  fs.mkdirSync(attachmentDir, { recursive: true });

  const rawDataPath = writeAttachmentRawData(attachmentDir, input.payload.rawData);
  const extractedPath = writeAttachmentTextFile(
    attachmentDir,
    "extracted.md",
    extractedText
  );
  const chunks = persistAttachmentChunks(attachmentDir, extractedText, extractedPath);
  const shortSummaryText = buildAttachmentShortSummary({
    filename: input.payload.filename,
    mimeType: input.payload.mimeType,
    summaryText: input.payload.summaryText,
    extractedText
  });
  const longSummaryText = buildAttachmentLongSummary({
    filename: input.payload.filename,
    mimeType: input.payload.mimeType,
    sizeBytes: input.payload.sizeBytes,
    summaryText: input.payload.summaryText,
    extractedText,
    chunks
  });
  const summaryShortPath = writeAttachmentTextFile(
    path.join(attachmentDir, "summaries"),
    "short.md",
    shortSummaryText
  );
  const summaryLongPath = writeAttachmentTextFile(
    path.join(attachmentDir, "summaries"),
    "long.md",
    longSummaryText
  );
  const summaryPath = summaryShortPath;

  const metadata: PersistedAttachmentArtifactMetadata = {
    filename: input.payload.filename,
    mimeType: input.payload.mimeType,
    sizeBytes: input.payload.sizeBytes,
    contentSha256: input.payload.contentSha256,
    contentId: input.payload.contentId,
    disposition: input.payload.disposition,
    summaryText: input.payload.summaryText,
    extractedTextPath: extractedPath ?? null,
    rawDataPath: rawDataPath ?? null,
    summaryPath: summaryPath ?? null,
    summaryShortPath: summaryShortPath ?? null,
    summaryLongPath: summaryLongPath ?? null,
    chunks
  };
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(metadata, null, 2)
  );

  return metadataPath;
}

export function readAttachmentArtifactMetadata(artifactPath?: string) {
  if (!artifactPath || !fs.existsSync(artifactPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(artifactPath, "utf8")) as PersistedAttachmentArtifactMetadata;
  } catch {
    return null;
  }
}

function writeArtifact(
  config: AppConfig,
  accountId: string,
  stableThreadId: string,
  relativePath: string[],
  payload: unknown
) {
  const threadDir = getThreadStateDir(config, accountId, stableThreadId);
  const artifactPath = path.join(threadDir, ...relativePath);

  fs.mkdirSync(path.dirname(artifactPath), {
    recursive: true
  });
  fs.writeFileSync(artifactPath, JSON.stringify(payload, null, 2));

  return artifactPath;
}

function writeTextArtifact(
  config: AppConfig,
  accountId: string,
  stableThreadId: string,
  relativePath: string[],
  content: string
) {
  const threadDir = getThreadStateDir(config, accountId, stableThreadId);
  const artifactPath = path.join(threadDir, ...relativePath);

  fs.mkdirSync(path.dirname(artifactPath), {
    recursive: true
  });
  fs.writeFileSync(artifactPath, content, "utf8");

  return artifactPath;
}

function writeAttachmentRawData(
  attachmentDir: string,
  rawData: string | Uint8Array | undefined
) {
  if (typeof rawData === "undefined") {
    return null;
  }

  const filePath = path.join(attachmentDir, typeof rawData === "string" ? "original.txt" : "original.bin");
  fs.writeFileSync(filePath, rawData);
  return filePath;
}

function writeAttachmentTextFile(
  attachmentDir: string,
  filename: string,
  value: string | undefined
) {
  if (!value) {
    return null;
  }

  const filePath = path.join(attachmentDir, filename);
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });
  fs.writeFileSync(filePath, value, "utf8");
  return filePath;
}

function normalizeAttachmentText(value?: string) {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function persistAttachmentChunks(
  attachmentDir: string,
  extractedText: string | undefined,
  extractedPath: string | null
) {
  if (!extractedText) {
    return [] satisfies PersistedAttachmentChunk[];
  }

  return chunkAttachmentText(extractedText).map((chunkText, index) => {
    const chunkId = `chunk-${String(index + 1).padStart(4, "0")}`;
    const chunkPath = writeAttachmentTextFile(
      path.join(attachmentDir, "chunks"),
      `${chunkId}.md`,
      chunkText
    );
    const summaryPath = writeAttachmentTextFile(
      path.join(attachmentDir, "summaries"),
      `${chunkId}.md`,
      summarizeChunkText(chunkText)
    );

    return {
      chunkId,
      chunkPath: chunkPath ?? "",
      summaryPath: summaryPath ?? null,
      sourcePath: extractedPath,
      tokenEstimate: estimateTokens(chunkText),
      sha256: hashText(chunkText)
    };
  });
}

function chunkAttachmentText(text: string) {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    if (remaining.length <= ATTACHMENT_CHUNK_TARGET_CHARS) {
      chunks.push(remaining);
      break;
    }

    const target = remaining.slice(0, ATTACHMENT_CHUNK_TARGET_CHARS);
    const splitIndex = findChunkSplitIndex(target);
    const nextChunk = remaining.slice(0, splitIndex).trim();

    if (!nextChunk) {
      chunks.push(remaining.slice(0, ATTACHMENT_CHUNK_TARGET_CHARS).trim());
      remaining = remaining.slice(ATTACHMENT_CHUNK_TARGET_CHARS).trimStart();
      continue;
    }

    chunks.push(nextChunk);
    remaining = remaining.slice(splitIndex).trimStart();
  }

  return chunks;
}

function findChunkSplitIndex(text: string) {
  const separators = ["\n\n", "\n", ". ", "; ", ", "];

  for (const separator of separators) {
    const index = text.lastIndexOf(separator);
    if (index >= Math.floor(text.length * 0.6)) {
      return index + separator.length;
    }
  }

  return text.length;
}

function summarizeChunkText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 177).trimEnd()}...`;
}

function buildAttachmentShortSummary(input: {
  filename: string;
  mimeType: string;
  summaryText?: string;
  extractedText?: string;
}) {
  const summary = input.summaryText?.trim();
  if (summary) {
    return summary;
  }

  const preview = summarizeChunkText(input.extractedText ?? "");
  if (preview.length > 0) {
    return `${input.filename} (${input.mimeType}): ${preview}`;
  }

  return `${input.filename} (${input.mimeType})`;
}

function buildAttachmentLongSummary(input: {
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  summaryText?: string;
  extractedText?: string;
  chunks: PersistedAttachmentChunk[];
}) {
  const parts = [
    `${input.filename} (${input.mimeType}${typeof input.sizeBytes === "number" ? `, ${input.sizeBytes} bytes` : ""})`,
    input.summaryText?.trim() ? `Short summary:\n${input.summaryText.trim()}` : undefined,
    input.chunks.length > 0
      ? `Chunk highlights:\n${input.chunks
          .map((chunk) => {
            const summary = chunk.summaryPath ? fs.readFileSync(chunk.summaryPath, "utf8").trim() : "";
            return summary.length > 0 ? `- ${chunk.chunkId}: ${summary}` : undefined;
          })
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .join("\n")}`
      : undefined,
    input.extractedText?.trim()
      ? `Extracted preview:\n${input.extractedText.trim().slice(0, 800)}`
      : undefined
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return parts.join("\n\n");
}

function sanitizeSnapshotId(snapshotId: string) {
  return toSafeStoragePathSegment(snapshotId, "facts");
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.trim().length / 4));
}

function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex");
}
