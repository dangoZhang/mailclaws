import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import { replayRoom } from "../src/core/replay.js";
import { ingestIncomingMail } from "../src/orchestration/service.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import type { ImapClientLike } from "../src/providers/imap.js";
import type { ProviderMailEnvelope } from "../src/providers/types.js";
import { initializeDatabase } from "../src/storage/db.js";
import { upsertMailAccount } from "../src/storage/repositories/mail-accounts.js";
import { findProviderCursor } from "../src/storage/repositories/provider-cursors.js";
import { listProviderEventsForAccount } from "../src/storage/repositories/provider-events.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createDb(prefix: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
    MAILCLAW_FEATURE_MAIL_INGEST: "true",
    MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false"
  });

  return {
    config,
    handle: initializeDatabase(config)
  };
}

function buildEnvelope(overrides: Partial<ProviderMailEnvelope> = {}): ProviderMailEnvelope {
  return {
    providerMessageId: "provider-1",
    messageId: "<provider-1@example.com>",
    subject: "Provider durability",
    from: {
      email: "sender@example.com",
      name: "Sender"
    },
    to: [
      {
        email: "mailclaw@example.com"
      }
    ],
    headers: [
      {
        name: "Message-ID",
        value: "<provider-1@example.com>"
      }
    ],
    text: "Please preserve provider durability signals.",
    attachments: [],
    ...overrides
  };
}

function tableExists(db: DatabaseSync, tableName: string) {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1;")
    .get(tableName) as { name: string } | undefined;

  return row?.name === tableName;
}

function listTableRows(db: DatabaseSync, tableName: string): Array<Record<string, unknown>> {
  return db.prepare(`SELECT * FROM ${tableName} ORDER BY rowid ASC;`).all() as Array<Record<string, unknown>>;
}

describe("provider durability", () => {
  it("persists watcher checkpoints to a dedicated provider cursor store while keeping account watch settings visible", async () => {
    const { config, handle } = createDb("mailclaw-provider-cursors-");
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config
    });

    runtime.upsertAccount({
      accountId: "acct-imap",
      provider: "imap",
      emailAddress: "mailclaw@example.com",
      status: "active",
      settings: {
        host: "imap.example.com",
        port: 993,
        secure: true,
        username: "mailclaw@example.com",
        password: "secret",
        mailbox: "INBOX",
        watch: {
          checkpoint: "1",
          intervalMs: 1
        }
      }
    });

    const controllers = runtime.startWatchers({
      imap: {
        clientFactory(imapConfig) {
          expect(imapConfig).toMatchObject({
            host: "imap.example.com",
            port: 993,
            secure: true,
            auth: {
              user: "mailclaw@example.com",
              pass: "secret"
            }
          });

          return {
            async connect() {
              return undefined;
            },
            async mailboxOpen(mailboxPath) {
              expect(mailboxPath).toBe("INBOX");
              return {
                uidValidity: 7001
              };
            },
            fetch(range) {
              expect(range).toBe("2:*");
              return [
                {
                  uid: 2,
                  envelope: {
                    subject: "Watcher message",
                    from: [{ address: "sender@example.com" }],
                    to: [{ address: "mailclaw@example.com" }]
                  },
                  source: [
                    "Message-ID: <watcher-2@example.com>",
                    "Subject: Watcher message",
                    "From: sender@example.com",
                    "To: mailclaw@example.com",
                    "",
                    "Watcher body"
                  ].join("\r\n")
                }
              ];
            },
            async logout() {
              return undefined;
            }
          } satisfies ImapClientLike;
        }
      }
    });

    await vi.waitFor(() => expect(runtime.listRooms()).toHaveLength(1));

    expect(controllers["acct-imap"]?.checkpoint()).toBe("2");
    expect(runtime.listAccounts().find((account) => account.accountId === "acct-imap")?.settings).toMatchObject({
      watch: {
        checkpoint: "2"
      }
    });

    const hasProviderCursorStore = tableExists(handle.db, "provider_cursors");
    expect(hasProviderCursorStore).toBe(true);

    const providerCursorRows = hasProviderCursorStore ? listTableRows(handle.db, "provider_cursors") : [];
    expect(
      providerCursorRows.some((row) =>
        ["acct-imap", "imap", "2"].every((value) => Object.values(row).includes(value))
      )
    ).toBe(true);
    expect(findProviderCursor(handle.db, { accountId: "acct-imap", cursorKind: "watch" })).toMatchObject({
      provider: "imap",
      cursorValue: "2",
      metadata: expect.objectContaining({
        uidValidity: "7001"
      })
    });
    expect(runtime.getAccountProviderState("acct-imap")).toMatchObject({
      summary: {
        watch: {
          checkpoint: "2",
          uidValidity: "7001"
        }
      }
    });

    await controllers["acct-imap"]?.stop();
    handle.close();
  });

  it("records IMAP UIDVALIDITY invalidation and backfill events when the mailbox identity changes", async () => {
    const { config, handle } = createDb("mailclaw-provider-imap-invalidated-");
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config
    });

    runtime.upsertAccount({
      accountId: "acct-imap",
      provider: "imap",
      emailAddress: "mailclaw@example.com",
      status: "active",
      settings: {
        host: "imap.example.com",
        port: 993,
        secure: true,
        username: "mailclaw@example.com",
        password: "secret",
        mailbox: "INBOX",
        watch: {
          checkpoint: "9",
          uidValidity: "7001",
          intervalMs: 1
        }
      }
    });

    const ranges: string[] = [];
    const controllers = runtime.startWatchers({
      imap: {
        clientFactory() {
          return {
            async connect() {
              return undefined;
            },
            async mailboxOpen() {
              return {
                uidValidity: 8002
              };
            },
            fetch(range) {
              ranges.push(range);
              return [];
            },
            async logout() {
              return undefined;
            }
          } satisfies ImapClientLike;
        }
      }
    });

    await vi.waitFor(() =>
      expect(listProviderEventsForAccount(handle.db, "acct-imap").map((event) => event.eventType)).toEqual(
        expect.arrayContaining([
          "provider.cursor.invalidated",
          "provider.backfill.started",
          "provider.backfill.completed"
        ])
      )
    );

    expect(ranges).toContain("1:*");
    expect(findProviderCursor(handle.db, { accountId: "acct-imap", cursorKind: "watch" })).toMatchObject({
      cursorValue: "0",
      metadata: expect.objectContaining({
        uidValidity: "8002",
        cursorInvalidated: true,
        previousUidValidity: "7001"
      })
    });
    expect(runtime.getAccountProviderState("acct-imap")).toMatchObject({
      summary: {
        watch: {
          checkpoint: "0",
          uidValidity: "8002"
        },
        latestCursorInvalidatedAt: expect.any(String),
        latestBackfillCompletedAt: expect.any(String)
      }
    });

    await controllers["acct-imap"]?.stop();
    handle.close();
  });

  it("persists durable provider events and surfaces them in replay for received, canonicalized, and duplicated mail", () => {
    const { config, handle } = createDb("mailclaw-provider-events-");
    const timestamp = "2026-03-25T00:00:00.000Z";

    upsertMailAccount(handle.db, {
      accountId: "acct-1",
      provider: "imap",
      emailAddress: "mailclaw@example.com",
      status: "active",
      settings: {},
      createdAt: timestamp,
      updatedAt: timestamp
    });

    const first = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaw@example.com",
        envelope: buildEnvelope()
      }
    );
    const duplicate = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaw@example.com",
        envelope: buildEnvelope()
      }
    );

    expect(first.status).toBe("queued");
    expect(duplicate).toMatchObject({
      status: "duplicate",
      roomKey: first.roomKey
    });

    const hasProviderEventStore = tableExists(handle.db, "provider_events");
    expect(hasProviderEventStore).toBe(true);

    const providerEventRows = hasProviderEventStore ? listTableRows(handle.db, "provider_events") : [];
    expect(providerEventRows.some((row) => Object.values(row).includes("provider.event.received"))).toBe(true);
    expect(providerEventRows.some((row) => Object.values(row).includes("provider.event.canonicalized"))).toBe(true);
    expect(providerEventRows.some((row) => Object.values(row).includes("provider.event.duplicated"))).toBe(true);
    expect(listProviderEventsForAccount(handle.db, "acct-1").map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "provider.event.received",
        "provider.event.canonicalized",
        "provider.event.duplicated"
      ])
    );

    const replay = replayRoom(handle.db, first.roomKey) as ReturnType<typeof replayRoom> & {
      providerEvents?: Array<{
        eventType: string;
        payload?: Record<string, unknown>;
      }>;
    };
    const providerEvents = replay.providerEvents ?? [];

    expect(providerEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "provider.event.received",
        "provider.event.canonicalized",
        "provider.event.duplicated"
      ])
    );
    expect(providerEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "provider.event.received",
          payload: expect.objectContaining({
            providerMessageId: "provider-1"
          })
        }),
        expect.objectContaining({
          eventType: "provider.event.canonicalized",
          payload: expect.objectContaining({
            canonicalMailboxAddress: "mailclaw@example.com"
          })
        }),
        expect.objectContaining({
          eventType: "provider.event.duplicated",
          payload: expect.objectContaining({
            providerMessageId: "provider-1"
          })
        })
      ])
    );

    handle.close();
  });

  it("records provider cursor invalidation and bounded backfill events for gmail history gaps", async () => {
    const { config, handle } = createDb("mailclaw-provider-gmail-invalidated-");
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config
    });

    runtime.upsertAccount({
      accountId: "acct-gmail",
      provider: "gmail",
      emailAddress: "assistant@example.com",
      status: "active",
      settings: {
        watch: {
          checkpoint: "90",
          intervalMs: 1
        },
        gmail: {
          accessToken: "token",
          topicName: "projects/example/topics/mailclaw",
          watch: {
            historyId: "90",
            expiration: "2026-03-24T00:00:00.000Z"
          }
        }
      }
    });

    const controllers = runtime.startWatchers({
      gmail: {
        clientFactory() {
          return {
            async watch() {
              return {
                historyId: "120",
                expiration: "2026-03-30T00:00:00.000Z"
              };
            },
            async listHistory() {
              const error = new Error("history invalidated") as Error & { status?: number };
              error.status = 404;
              throw error;
            },
            async listMessages() {
              return {
                messages: [
                  {
                    id: "gmail-backfill-1",
                    threadId: "gmail-thread-1"
                  }
                ]
              };
            },
            async getMessage() {
              return {
                id: "gmail-backfill-1",
                threadId: "gmail-thread-1",
                payload: {
                  headers: [
                    { name: "Message-ID", value: "<gmail-backfill-1@example.com>" },
                    { name: "Subject", value: "Backfill watcher message" },
                    { name: "From", value: "sender@example.com" },
                    { name: "To", value: "assistant@example.com" }
                  ]
                },
                textBody: "Backfill body"
              };
            }
          };
        }
      }
    });

    await vi.waitFor(() =>
      expect(listProviderEventsForAccount(handle.db, "acct-gmail").map((event) => event.eventType)).toEqual(
        expect.arrayContaining([
          "provider.cursor.invalidated",
          "provider.backfill.started",
          "provider.backfill.completed"
        ])
      )
    );

    expect(runtime.getAccountProviderState("acct-gmail")).toMatchObject({
      account: {
        accountId: "acct-gmail",
        provider: "gmail"
      },
      cursors: expect.arrayContaining([
        expect.objectContaining({
          cursorKind: "watch",
          cursorValue: "120"
        })
      ]),
      summary: expect.objectContaining({
        watch: expect.objectContaining({
          checkpoint: "120",
          historyId: "120"
        }),
        latestCursorInvalidatedAt: expect.any(String),
        latestBackfillCompletedAt: expect.any(String)
      })
    });

    await controllers["acct-gmail"]?.stop();
    handle.close();
  });

  it("records gmail pubsub notification receipt and explicit full mailbox recovery events", async () => {
    const { config, handle } = createDb("mailclaw-provider-gmail-pubsub-recovery-");
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config
    });

    runtime.upsertAccount({
      accountId: "acct-gmail",
      provider: "gmail",
      emailAddress: "assistant@example.com",
      status: "active",
      settings: {
        gmail: {
          accessToken: "token",
          topicName: "projects/example/topics/mailclaw"
        }
      }
    });

    await runtime.ingestGmailNotification({
      accountId: "acct-gmail",
      notification: {
        message: {
          data: Buffer.from(
            JSON.stringify({
              emailAddress: "assistant@example.com",
              historyId: "150"
            })
          ).toString("base64url"),
          messageId: "pubsub-1",
          publishTime: "2026-03-25T00:00:00.000Z"
        },
        subscription: "projects/example/subscriptions/mailclaw"
      },
      clientFactory() {
        return {
          async watch() {
            return {
              historyId: "160",
              expiration: "2026-03-30T00:00:00.000Z"
            };
          },
          async listHistory() {
            throw new Error("not used in this test");
          },
          async listMessages() {
            return {
              messages: [
                {
                  id: "gmail-recovery-1",
                  threadId: "gmail-thread-1"
                }
              ]
            };
          },
          async getMessage() {
            return {
              id: "gmail-recovery-1",
              threadId: "gmail-thread-1",
              payload: {
                headers: [
                  { name: "Message-ID", value: "<gmail-recovery-1@example.com>" },
                  { name: "Subject", value: "Recovered Gmail message" },
                  { name: "From", value: "sender@example.com" },
                  { name: "To", value: "assistant@example.com" }
                ]
              },
              textBody: "Recovered body"
            };
          }
        };
      }
    });

    const events = listProviderEventsForAccount(handle.db, "acct-gmail");
    expect(events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "provider.notification.received",
        "provider.mailbox.recovery.completed",
        "provider.cursor.advanced"
      ])
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "provider.notification.received",
          cursorValue: "150",
          payload: expect.objectContaining({
            source: "gmail.pubsub",
            emailAddress: "assistant@example.com",
            pubsubMessageId: "pubsub-1"
          })
        }),
        expect.objectContaining({
          eventType: "provider.mailbox.recovery.completed",
          cursorValue: "160",
          payload: expect.objectContaining({
            source: "gmail.pubsub",
            reason: "missing_checkpoint",
            notificationCount: 1
          })
        })
      ])
    );

    handle.close();
  });
});
