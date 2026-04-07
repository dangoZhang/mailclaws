import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { ingestIncomingMail } from "../src/orchestration/service.js";
import { searchRoomContext } from "../src/retrieval/room-search.js";
import { initializeDatabase } from "../src/storage/db.js";
import { listArtifactChunksForRoom } from "../src/storage/repositories/artifact-chunks.js";
import { listMailAttachmentsForRoom } from "../src/storage/repositories/mail-attachments.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("artifact chunk index", () => {
  it("persists attachment chunk rows for a room", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-artifact-chunks-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true"
    });
    const handle = initializeDatabase(config);

    const ingested = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaws@example.com",
        envelope: {
          providerMessageId: "provider-1",
          messageId: "<msg-1@example.com>",
          subject: "Chunk rows",
          from: {
            email: "sender@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          text: "Persist chunk rows.",
          attachments: [
            {
              filename: "atlas.txt",
              mimeType: "text/plain",
              data: Array.from({ length: 6 }, (_, index) =>
                `Section ${index + 1} holds Atlas indexed evidence ${index + 1}.`
              ).join("\n\n")
            }
          ],
          headers: [
            {
              name: "Message-ID",
              value: "<msg-1@example.com>"
            }
          ]
        }
      }
    );

    const chunks = listArtifactChunksForRoom(handle.db, ingested.roomKey);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.roomKey === ingested.roomKey)).toBe(true);
    expect(chunks.every((chunk) => fs.existsSync(chunk.chunkPath))).toBe(true);

    handle.close();
  });

  it("retrieves room chunk hits from the sqlite index even after chunk files are removed", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-artifact-chunks-search-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true"
    });
    const handle = initializeDatabase(config);

    const ingested = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaws@example.com",
        envelope: {
          providerMessageId: "provider-2",
          messageId: "<msg-2@example.com>",
          subject: "Indexed retrieval",
          from: {
            email: "sender@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          text: "Use the stored attachment context.",
          attachments: [
            {
              filename: "atlas.txt",
              mimeType: "text/plain",
              data: "Escalation owner is Dana Atlas."
            }
          ],
          headers: [
            {
              name: "Message-ID",
              value: "<msg-2@example.com>"
            }
          ]
        }
      }
    );

    for (const chunk of listArtifactChunksForRoom(handle.db, ingested.roomKey)) {
      fs.rmSync(chunk.chunkPath, { force: true });
      if (chunk.summaryPath) {
        fs.rmSync(chunk.summaryPath, { force: true });
      }
    }

    const hits = searchRoomContext(handle.db, {
      roomKey: ingested.roomKey,
      query: "Dana"
    });

    expect(hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey: ingested.roomKey,
          chunkId: expect.any(String)
        })
      ])
    );

    handle.close();
  });

  it("supports prefix retrieval from indexed chunk content after source files are removed", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-artifact-chunks-prefix-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true"
    });
    const handle = initializeDatabase(config);

    const ingested = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaws@example.com",
        envelope: {
          providerMessageId: "provider-3",
          messageId: "<msg-3@example.com>",
          subject: "Indexed prefix retrieval",
          from: {
            email: "sender@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          text: "Use the stored attachment context.",
          attachments: [
            {
              filename: "atlas.txt",
              mimeType: "text/plain",
              data: "Escalation owner is Dana Atlas."
            }
          ],
          headers: [
            {
              name: "Message-ID",
              value: "<msg-3@example.com>"
            }
          ]
        }
      }
    );

    for (const chunk of listArtifactChunksForRoom(handle.db, ingested.roomKey)) {
      fs.rmSync(chunk.chunkPath, { force: true });
      if (chunk.summaryPath) {
        fs.rmSync(chunk.summaryPath, { force: true });
      }
    }

    const hits = searchRoomContext(handle.db, {
      roomKey: ingested.roomKey,
      query: "Escal*"
    });

    expect(hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey: ingested.roomKey,
          chunkId: expect.any(String)
        })
      ])
    );
    expect(hits.some((hit) => hit.excerpt.includes("Escalation"))).toBe(true);

    handle.close();
  });

  it("reuses existing chunk files when the same attachment content reappears in the same room", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-artifact-chunks-dedupe-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true"
    });
    const handle = initializeDatabase(config);
    const attachmentText = Array.from({ length: 6 }, (_, index) =>
      `Section ${index + 1} holds Atlas indexed evidence ${index + 1}.`
    ).join("\n\n");

    const first = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaws@example.com",
        envelope: {
          providerMessageId: "provider-4",
          messageId: "<msg-4@example.com>",
          subject: "Chunk dedupe",
          from: {
            email: "sender@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          text: "Store the first copy.",
          attachments: [
            {
              filename: "atlas.txt",
              mimeType: "text/plain",
              data: attachmentText
            }
          ],
          headers: [
            {
              name: "Message-ID",
              value: "<msg-4@example.com>"
            }
          ]
        }
      }
    );

    const second = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaws@example.com",
        envelope: {
          providerMessageId: "provider-5",
          messageId: "<msg-5@example.com>",
          subject: "Chunk dedupe",
          from: {
            email: "sender@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          text: "Store the repeated copy.",
          attachments: [
            {
              filename: "atlas.txt",
              mimeType: "text/plain",
              data: attachmentText
            }
          ],
          headers: [
            {
              name: "Message-ID",
              value: "<msg-5@example.com>"
            },
            {
              name: "In-Reply-To",
              value: "<msg-4@example.com>"
            },
            {
              name: "References",
              value: "<msg-4@example.com>"
            }
          ]
        }
      }
    );

    expect(second.roomKey).toBe(first.roomKey);

    const attachments = listMailAttachmentsForRoom(handle.db, first.roomKey);
    const chunks = listArtifactChunksForRoom(handle.db, first.roomKey);
    const firstAttachment = attachments[0];
    const secondAttachment = attachments[1];
    const firstChunks = chunks.filter((chunk) => chunk.attachmentId === firstAttachment?.attachmentId);
    const secondChunks = chunks.filter((chunk) => chunk.attachmentId === secondAttachment?.attachmentId);

    expect(attachments).toHaveLength(2);
    expect(firstAttachment?.artifactPath).toBeTruthy();
    expect(secondAttachment?.artifactPath).toBe(firstAttachment?.artifactPath);
    expect(firstChunks.length).toBeGreaterThan(1);
    expect(secondChunks).toHaveLength(firstChunks.length);
    expect(secondChunks.map((chunk) => chunk.chunkPath)).toEqual(firstChunks.map((chunk) => chunk.chunkPath));
    expect(secondChunks.map((chunk) => chunk.summaryPath)).toEqual(firstChunks.map((chunk) => chunk.summaryPath));
    expect(new Set(chunks.map((chunk) => chunk.chunkPath)).size).toBe(firstChunks.length);

    handle.close();
  });
});
