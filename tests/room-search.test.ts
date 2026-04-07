import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { ingestIncomingMail, processNextRoomJob } from "../src/orchestration/service.js";
import { searchRoomContext } from "../src/retrieval/room-search.js";
import { initializeDatabase } from "../src/storage/db.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("room search", () => {
  it("retrieves only content from the current room", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-room-search-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true"
    });
    const handle = initializeDatabase(config);

    const first = ingestIncomingMail(
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
          subject: "Alpha room",
          from: {
            email: "sender@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          text: "Discuss project atlas rollout",
          attachments: [
            {
              filename: "atlas.txt",
              mimeType: "text/plain",
              data: "atlas runbook and deployment checklist"
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

    ingestIncomingMail(
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
          subject: "Beta room",
          from: {
            email: "sender@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          text: "Discuss unrelated phoenix task",
          attachments: [
            {
              filename: "phoenix.txt",
              mimeType: "text/plain",
              data: "phoenix task notes"
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

    const hits = searchRoomContext(handle.db, {
      roomKey: first.roomKey,
      query: "atlas"
    });

    expect(hits).not.toHaveLength(0);
    expect(hits.every((hit) => hit.roomKey === first.roomKey)).toBe(true);
    expect(hits.some((hit) => hit.excerpt.toLowerCase().includes("atlas"))).toBe(true);
    expect(hits.every((hit) => !hit.excerpt.toLowerCase().includes("phoenix"))).toBe(true);

    handle.close();
  });

  it("supports room-local prefix retrieval for message content", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-room-search-prefix-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true"
    });
    const handle = initializeDatabase(config);

    const first = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaws@example.com",
        envelope: {
          providerMessageId: "provider-21",
          messageId: "<msg-21@example.com>",
          subject: "Atlas launch",
          from: {
            email: "sender@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          text: "Discuss rollout timing and launch checklist.",
          headers: [
            {
              name: "Message-ID",
              value: "<msg-21@example.com>"
            }
          ]
        }
      }
    );

    ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaws@example.com",
        envelope: {
          providerMessageId: "provider-22",
          messageId: "<msg-22@example.com>",
          subject: "Phoenix launch",
          from: {
            email: "sender@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          text: "Discuss phoenix backlog only.",
          headers: [
            {
              name: "Message-ID",
              value: "<msg-22@example.com>"
            }
          ]
        }
      }
    );

    const hits = searchRoomContext(handle.db, {
      roomKey: first.roomKey,
      query: "roll*"
    });

    expect(hits).not.toHaveLength(0);
    expect(hits.every((hit) => hit.roomKey === first.roomKey)).toBe(true);
    expect(hits.some((hit) => hit.excerpt.toLowerCase().includes("rollout"))).toBe(true);
    expect(hits.every((hit) => !hit.excerpt.toLowerCase().includes("phoenix"))).toBe(true);

    handle.close();
  });

  it("retrieves chunk-backed attachment matches from the current room only", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-room-search-chunks-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true"
    });
    const handle = initializeDatabase(config);

    const first = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaws@example.com",
        envelope: {
          providerMessageId: "provider-11",
          messageId: "<msg-11@example.com>",
          subject: "Chunk room",
          from: {
            email: "sender@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          text: "Need the attachment evidence.",
          attachments: [
            {
              filename: "atlas.txt",
              mimeType: "text/plain",
              data: Array.from({ length: 6 }, (_, index) =>
                `Chunk ${index + 1} carries atlas evidence marker ${index + 1} and release detail.`
              ).join("\n\n")
            }
          ],
          headers: [
            {
              name: "Message-ID",
              value: "<msg-11@example.com>"
            }
          ]
        }
      }
    );

    ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaws@example.com",
        envelope: {
          providerMessageId: "provider-12",
          messageId: "<msg-12@example.com>",
          subject: "Other room",
          from: {
            email: "sender@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          text: "Other room context.",
          attachments: [
            {
              filename: "phoenix.txt",
              mimeType: "text/plain",
              data: "phoenix evidence should not leak into atlas retrieval"
            }
          ],
          headers: [
            {
              name: "Message-ID",
              value: "<msg-12@example.com>"
            }
          ]
        }
      }
    );

    const hits = searchRoomContext(handle.db, {
      roomKey: first.roomKey,
      query: "marker 6",
      limit: 3
    });

    expect(hits).not.toHaveLength(0);
    expect(hits.every((hit) => hit.roomKey === first.roomKey)).toBe(true);
    expect(hits.some((hit) => hit.chunkId)).toBe(true);
    expect(hits.some((hit) => hit.excerpt.includes("marker 6"))).toBe(true);
    expect(hits.every((hit) => !hit.excerpt.toLowerCase().includes("phoenix"))).toBe(true);

    handle.close();
  });

  it("retrieves durable room-note content after a room snapshot is captured", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-room-search-notes-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
      MAILCLAW_OPENCLAW_GATEWAY_TOKEN: "room-notes-token"
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
          providerMessageId: "provider-31",
          messageId: "<msg-31@example.com>",
          subject: "Notes room",
          from: {
            email: "sender@example.com"
          },
          to: [{ email: "mailclaws@example.com" }],
          text: "Please respond with the tracked summary only.",
          headers: [
            {
              name: "Message-ID",
              value: "<msg-31@example.com>"
            }
          ]
        }
      }
    );

    await processNextRoomJob({
      db: handle.db,
      config,
      agentExecutor: {
        async executeMailTurn() {
          return {
            startedAt: "2026-03-25T02:00:00.000Z",
            completedAt: "2026-03-25T02:00:05.000Z",
            responseText: "Escrow exception playbook is now captured in durable room notes.",
            request: {
              url: "http://127.0.0.1:11437/v1/responses",
              method: "POST",
              headers: {},
              body: {}
            }
          };
        }
      }
    });

    const hits = searchRoomContext(handle.db, {
      roomKey: ingested.roomKey,
      query: "escrow"
    });

    expect(hits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey: ingested.roomKey,
          kind: "room_note"
        })
      ])
    );
    expect(hits.some((hit) => hit.excerpt.toLowerCase().includes("escrow exception playbook"))).toBe(true);

    handle.close();
  });
});
