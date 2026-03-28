import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import {
  getThreadStateDir,
  persistAttachmentArtifact,
  persistInboundArtifact,
  persistInboundMimeArtifact,
  persistRoomFactsArtifact,
  persistOutboxArtifact,
  persistRunArtifact
} from "../src/storage/artifacts.js";
import { toSafeStorageFileName, toSafeStoragePathSegment } from "../src/storage/path-safety.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("thread artifacts", () => {
  it("isolates artifacts per room and writes JSON payloads", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-artifacts-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const inboundPath = persistInboundArtifact(config, {
      accountId: "acct-1",
      stableThreadId: "thread-1",
      dedupeKey: "dedupe-1",
      payload: {
        subject: "Inbound"
      }
    });
    const runPath = persistRunArtifact(config, {
      accountId: "acct-1",
      stableThreadId: "thread-1",
      runId: "run-1",
      payload: {
        responseText: "Done"
      }
    });
    const outboxPath = persistOutboxArtifact(config, {
      accountId: "acct-2",
      stableThreadId: "thread-2",
      outboxId: "outbox-1",
      payload: {
        subject: "Reply"
      }
    });

    expect(inboundPath).toContain("/threads/acct-1/thread-1/messages/");
    expect(runPath).toContain("/threads/acct-1/thread-1/runs/");
    expect(outboxPath).toContain("/threads/acct-2/thread-2/outbox/");

    const roomOneDir = getThreadStateDir(config, "acct-1", "thread-1");
    const roomTwoDir = getThreadStateDir(config, "acct-2", "thread-2");

    expect(roomOneDir).not.toBe(roomTwoDir);
    expect(JSON.parse(fs.readFileSync(inboundPath, "utf8"))).toMatchObject({
      subject: "Inbound"
    });
    expect(JSON.parse(fs.readFileSync(runPath, "utf8"))).toMatchObject({
      responseText: "Done"
    });
    expect(JSON.parse(fs.readFileSync(outboxPath, "utf8"))).toMatchObject({
      subject: "Reply"
    });
  });

  it("persists attachment artifacts with extracted text and summaries", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-attachment-artifacts-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const metadataPath = persistAttachmentArtifact(config, {
      accountId: "acct-1",
      stableThreadId: "thread-1",
      attachmentId: "attachment-1",
      payload: {
        filename: "notes.txt",
        mimeType: "text/plain",
        summaryText: "notes.txt (text/plain): Important summary",
        extractedText: "Important summary",
        rawData: "Important summary"
      }
    });

    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as {
      rawDataPath: string;
      extractedTextPath: string;
      summaryPath: string;
    };

    expect(metadataPath).toContain("/threads/acct-1/thread-1/attachments/attachment-1/");
    expect(fs.readFileSync(metadata.rawDataPath, "utf8")).toBe("Important summary");
    expect(fs.readFileSync(metadata.extractedTextPath, "utf8")).toBe("Important summary");
    expect(fs.readFileSync(metadata.summaryPath, "utf8")).toContain("notes.txt");
  });

  it("persists chunk files and summary pyramid for larger attachment text", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-attachment-chunks-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const longText = Array.from({ length: 8 }, (_, index) =>
      `Section ${index + 1}: Atlas rollout detail ${index + 1} with evidence and longer context for chunking.`
    ).join("\n\n");

    const metadataPath = persistAttachmentArtifact(config, {
      accountId: "acct-1",
      stableThreadId: "thread-1",
      attachmentId: "attachment-2",
      payload: {
        filename: "atlas.txt",
        mimeType: "text/plain",
        summaryText: "atlas.txt (text/plain): Atlas rollout summary",
        extractedText: longText,
        rawData: longText
      }
    });

    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as {
      summaryShortPath?: string;
      summaryLongPath?: string;
      chunks?: Array<{
        chunkId: string;
        chunkPath: string;
        summaryPath?: string | null;
        tokenEstimate: number;
      }>;
    };

    expect(metadata.summaryShortPath).toBeTruthy();
    expect(metadata.summaryLongPath).toBeTruthy();
    expect(fs.readFileSync(metadata.summaryShortPath ?? "", "utf8")).toContain("Atlas rollout summary");
    expect(fs.readFileSync(metadata.summaryLongPath ?? "", "utf8")).toContain("Section 1");
    expect(metadata.chunks?.length).toBeGreaterThan(1);
    expect(metadata.chunks?.every((chunk) => chunk.tokenEstimate > 0)).toBe(true);
    expect(fs.readFileSync(metadata.chunks?.[0]?.chunkPath ?? "", "utf8")).toContain("Section 1");
    expect(fs.readFileSync(metadata.chunks?.[0]?.summaryPath ?? "", "utf8")).toContain("Atlas rollout");
  });

  it("persists raw inbound mime payloads alongside normalized artifacts", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-inbound-mime-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const mimePath = persistInboundMimeArtifact(config, {
      accountId: "acct-1",
      stableThreadId: "thread-1",
      dedupeKey: "dedupe-1",
      rawMime: "From: sender@example.com\nSubject: MIME test\n\nHello"
    });

    expect(mimePath).toContain("/threads/acct-1/thread-1/messages/dedupe-1.eml");
    expect(fs.readFileSync(mimePath, "utf8")).toContain("Subject: MIME test");
  });

  it("writes versioned room facts snapshots while keeping shared/facts.json current", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-room-facts-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const firstSnapshot = persistRoomFactsArtifact(config, {
      accountId: "acct-1",
      stableThreadId: "thread-1",
      snapshotId: "r1-ingest",
      payload: {
        roomKey: "room-1",
        facts: ["first"]
      }
    });
    const secondSnapshot = persistRoomFactsArtifact(config, {
      accountId: "acct-1",
      stableThreadId: "thread-1",
      snapshotId: "r1-final",
      payload: {
        roomKey: "room-1",
        facts: ["second"]
      }
    });

    expect(firstSnapshot).not.toBe(secondSnapshot);
    expect(firstSnapshot).toContain("/threads/acct-1/thread-1/shared/history/r1-ingest.json");
    expect(secondSnapshot).toContain("/threads/acct-1/thread-1/shared/history/r1-final.json");

    const latestPath = path.join(
      getThreadStateDir(config, "acct-1", "thread-1"),
      "shared",
      "facts.json"
    );
    expect(JSON.parse(fs.readFileSync(firstSnapshot, "utf8"))).toMatchObject({
      facts: ["first"]
    });
    expect(JSON.parse(fs.readFileSync(secondSnapshot, "utf8"))).toMatchObject({
      facts: ["second"]
    });
    expect(JSON.parse(fs.readFileSync(latestPath, "utf8"))).toMatchObject({
      facts: ["second"]
    });
  });

  it("sanitizes account, thread, and artifact identifiers before writing to disk", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-artifacts-safe-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const accountId = "../acct-unsafe";
    const stableThreadId = "../../thread-unsafe";
    const inboundPath = persistInboundArtifact(config, {
      accountId,
      stableThreadId,
      dedupeKey: "../dedupe-unsafe",
      payload: { ok: true }
    });
    const mimePath = persistInboundMimeArtifact(config, {
      accountId,
      stableThreadId,
      dedupeKey: "../dedupe-mime",
      rawMime: "Subject: unsafe"
    });
    const attachmentPath = persistAttachmentArtifact(config, {
      accountId,
      stableThreadId,
      attachmentId: "../attachment-unsafe",
      payload: {
        filename: "unsafe.txt",
        mimeType: "text/plain",
        extractedText: "unsafe text",
        rawData: "unsafe text"
      }
    });

    const threadDir = getThreadStateDir(config, accountId, stableThreadId);
    expect(threadDir).toContain(
      `/threads/${toSafeStoragePathSegment(accountId, "account")}/${toSafeStoragePathSegment(stableThreadId, "thread")}`
    );
    expect(inboundPath).toContain(toSafeStorageFileName("../dedupe-unsafe", ".json", "artifact"));
    expect(mimePath).toContain(toSafeStorageFileName("../dedupe-mime", ".eml", "message"));
    expect(attachmentPath).toContain(`/attachments/${toSafeStoragePathSegment("../attachment-unsafe", "attachment")}/`);
    expect(path.relative(tempDir, inboundPath)).not.toContain("..");
    expect(path.relative(tempDir, mimePath)).not.toContain("..");
    expect(path.relative(tempDir, attachmentPath)).not.toContain("..");
  });
});
