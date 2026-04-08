import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import type { ImapClientLike } from "../src/providers/imap.js";
import { MAIL_IO_PROTOCOL_NAME, MAIL_IO_PROTOCOL_VERSION } from "../src/providers/mail-io-command.js";
import type { MailIoPlane } from "../src/providers/mail-io-plane.js";
import type { SmtpSender } from "../src/providers/smtp.js";
import { initializeDatabase } from "../src/storage/db.js";
import { findProviderCursor } from "../src/storage/repositories/provider-cursors.js";
import { listProviderEventsForAccount } from "../src/storage/repositories/provider-events.js";
import { createMailLab } from "./helpers/mail-lab.js";

const tempDirs: string[] = [];

function createStubMailIoPlane(overrides: Partial<MailIoPlane> = {}): MailIoPlane {
  return {
    async deliverQueuedOutbox() {
      return {
        sent: 0,
        failed: 0
      };
    },
    async fetchImapMessages() {
      return {
        messages: [],
        done: true
      };
    },
    async fetchGmailWatchBatch() {
      return {
        notifications: [],
        done: true
      };
    },
    async fetchGmailMessage() {
      return null;
    },
    async fetchGmailNotificationBatch() {
      return {
        notifications: [],
        done: true
      };
    },
    async recoverGmailMailbox() {
      return {
        notifications: [],
        done: true
      };
    },
    ...overrides
  };
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("runtime watchers", () => {
  it("starts configured account watchers and persists checkpoints", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-watchers-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false"
    });
    const handle = initializeDatabase(config);
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config
    });

    runtime.upsertAccount({
      accountId: "acct-imap",
      provider: "imap",
      emailAddress: "mailclaws@example.com",
      status: "active",
      settings: {
        host: "imap.example.com",
        port: 993,
        secure: true,
        username: "mailclaws@example.com",
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
        clientFactory(config) {
          expect(config).toMatchObject({
            host: "imap.example.com",
            port: 993,
            secure: true,
            auth: {
              user: "mailclaws@example.com",
              pass: "secret"
            }
          });

          return {
            async connect() {
              return undefined;
            },
            async mailboxOpen(path) {
              expect(path).toBe("INBOX");
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
                    to: [{ address: "mailclaws@example.com" }]
                  },
                  source: [
                    "Message-ID: <watcher-2@example.com>",
                    "Subject: Watcher message",
                    "From: sender@example.com",
                    "To: mailclaws@example.com",
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
        checkpoint: "2",
        uidValidity: "7001"
      }
    });
    expect(findProviderCursor(handle.db, { accountId: "acct-imap", cursorKind: "watch" })).toMatchObject({
      cursorValue: "2",
      metadata: expect.objectContaining({
        uidValidity: "7001"
      })
    });

    await controllers["acct-imap"]?.stop();
    handle.close();
  });

  it("invalidates the IMAP watch cursor when UIDVALIDITY changes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-watchers-imap-uidvalidity-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false"
    });
    const handle = initializeDatabase(config);
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config
    });

    runtime.upsertAccount({
      accountId: "acct-imap",
      provider: "imap",
      emailAddress: "mailclaws@example.com",
      status: "active",
      settings: {
        host: "imap.example.com",
        port: 993,
        secure: true,
        username: "mailclaws@example.com",
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
      expect(findProviderCursor(handle.db, { accountId: "acct-imap", cursorKind: "watch" })).toMatchObject({
        cursorValue: "0",
        metadata: expect.objectContaining({
          uidValidity: "8002",
          cursorInvalidated: true
        })
      })
    );

    expect(ranges).toContain("1:*");
    expect(listProviderEventsForAccount(handle.db, "acct-imap").map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "provider.cursor.invalidated",
        "provider.backfill.started",
        "provider.backfill.completed",
        "provider.cursor.advanced"
      ])
    );
    expect(runtime.listAccounts().find((account) => account.accountId === "acct-imap")?.settings).toMatchObject({
      watch: {
        checkpoint: "0",
        uidValidity: "8002"
      }
    });
    expect(controllers["acct-imap"]?.checkpoint()).toBe("0");

    await controllers["acct-imap"]?.stop();
    handle.close();
  });

  it("runs a minimal provider-simulator smoke from watcher ingest through final delivery", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-watchers-smoke-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true"
    });
    const handle = initializeDatabase(config);
    const lab = createMailLab("watcher-smoke");
    const sent: Array<{ subject: string; textBody: string; to: string[] }> = [];
    const smtpSender: SmtpSender = {
      async send(message) {
        sent.push({
          subject: message.subject,
          textBody: message.textBody,
          to: [...message.to]
        });
        return {
          providerMessageId: "<watcher-smoke@smtp.local>"
        };
      }
    };
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      smtpSender
    });

    runtime.upsertAccount({
      accountId: "acct-imap",
      provider: "imap",
      emailAddress: lab.addresses.assistant,
      status: "active",
      settings: {
        host: "imap.example.com",
        port: 993,
        secure: true,
        username: lab.addresses.assistant,
        password: "secret",
        mailbox: "INBOX",
        watch: {
          checkpoint: "0",
          intervalMs: 1
        }
      }
    });

    const inbound = lab.newMail({
      providerMessageId: "watcher-smoke-provider-1",
      subject: "Watcher smoke room",
      text: "hello world",
      attachments: [
        {
          filename: "notes.txt",
          mimeType: "text/plain",
          data: "Watcher smoke attachment."
        }
      ]
    });

    const controllers = runtime.startWatchers({
      processImmediately: true,
      imap: {
        async fetch() {
          return {
            messages: [
              {
                uid: "1",
                subject: inbound.subject,
                messageId: inbound.messageId,
                from: [
                  {
                    email: inbound.from.email
                  }
                ],
                to: inbound.to.map((entry) => ({
                  email: entry.email
                })),
                headers: Object.fromEntries(inbound.headers.map((header) => [header.name, header.value])),
                text: inbound.text,
                attachments: inbound.attachments?.map((attachment) => ({
                  filename: attachment.filename,
                  contentType: attachment.mimeType,
                  size: attachment.size,
                  data: attachment.data
                })),
                raw: inbound.rawMime
              }
            ],
            checkpoint: "1",
            checkpointMetadata: {
              uidValidity: "7001"
            },
            done: true
          };
        }
      }
    });

    await vi.waitFor(() => expect(runtime.listRooms()).toHaveLength(1));

    const roomKey = runtime.listRooms()[0]?.roomKey;
    if (!roomKey) {
      throw new Error("expected watcher smoke room");
    }
    await vi.waitFor(() => expect(runtime.replay(roomKey).outbox).toHaveLength(1));
    const inboxes = runtime.listPublicAgentInboxes("acct-imap");
    expect(inboxes).toHaveLength(1);
    expect(runtime.listInboxItems(inboxes[0]!.inboxId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey,
          agentId: lab.addresses.assistant
        })
      ])
    );
    expect(findProviderCursor(handle.db, { accountId: "acct-imap", cursorKind: "watch" })).toMatchObject({
      cursorValue: "1",
      metadata: expect.objectContaining({
        uidValidity: "7001"
      })
    });

    await controllers["acct-imap"]?.stop();
    const delivered = await runtime.deliverOutbox();
    const replay = runtime.replay(roomKey);

    expect(delivered).toEqual({
      sent: 1,
      failed: 0
    });
    expect(sent).toEqual([
      {
        subject: "Watcher smoke room",
        textBody: "hello world",
        to: [lab.addresses.customerA]
      }
    ]);
    expect(replay.outbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "final",
          status: "sent",
          textBody: "hello world"
        })
      ])
    );
    expect(replay.outboxAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "sent",
          providerMessageId: "<watcher-smoke@smtp.local>"
        })
      ])
    );

    handle.close();
  });

  it("starts built-in gmail watch/history ingestion and persists watch metadata durably", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-gmail-watchers-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false"
    });
    const handle = initializeDatabase(config);
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
          topicName: "projects/example/topics/mailclaws",
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
                historyId: "95",
                expiration: "2026-03-30T00:00:00.000Z"
              };
            },
            async listHistory() {
              return {
                historyId: "101",
                history: [
                  {
                    id: "101",
                    messagesAdded: [
                      {
                        message: {
                          id: "gmail-1",
                          threadId: "gmail-thread-1"
                        }
                      }
                    ]
                  }
                ]
              };
            },
            async listMessages() {
              throw new Error("not used in this test");
            },
            async getMessage() {
              return {
                id: "gmail-1",
                threadId: "gmail-thread-1",
                payload: {
                  headers: [
                    { name: "Message-ID", value: "<gmail-1@example.com>" },
                    { name: "Subject", value: "Gmail watcher message" },
                    { name: "From", value: "sender@example.com" },
                    { name: "To", value: "assistant@example.com" }
                  ]
                },
                textBody: "Watcher body"
              };
            }
          };
        }
      }
    });

    await vi.waitFor(() => expect(runtime.listRooms()).toHaveLength(1));
    expect(controllers["acct-gmail"]?.checkpoint()).toBe("101");

    const cursor = findProviderCursor(handle.db, {
      accountId: "acct-gmail",
      cursorKind: "watch"
    });
    expect(cursor).toMatchObject({
      provider: "gmail",
      cursorValue: "101",
      metadata: expect.objectContaining({
        watchHistoryId: "95",
        watchExpiration: "2026-03-30T00:00:00.000Z"
      })
    });
    expect(runtime.listAccounts().find((account) => account.accountId === "acct-gmail")?.settings).toMatchObject({
      watch: {
        checkpoint: "101",
        historyId: "95",
        expiration: "2026-03-30T00:00:00.000Z"
      }
    });

    await controllers["acct-gmail"]?.stop();
    handle.close();
  });

  it("ingests explicit gmail pubsub notifications and persists the advanced checkpoint", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-gmail-pubsub-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false"
    });
    const handle = initializeDatabase(config);
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
          topicName: "projects/example/topics/mailclaws",
          watch: {
            historyId: "90",
            expiration: "2026-03-24T00:00:00.000Z"
          }
        }
      }
    });

    const result = await runtime.ingestGmailNotification({
      accountId: "acct-gmail",
      notification: {
        message: {
          data: Buffer.from(
            JSON.stringify({
              emailAddress: "assistant@example.com",
              historyId: "101"
            })
          ).toString("base64url"),
          messageId: "pubsub-1",
          publishTime: "2026-03-25T00:00:00.000Z"
        },
        subscription: "projects/example/subscriptions/mailclaws"
      },
      clientFactory() {
        return {
          async watch() {
            return {
              historyId: "95",
              expiration: "2026-03-30T00:00:00.000Z"
            };
          },
          async listHistory() {
            return {
              historyId: "101",
              history: [
                {
                  id: "101",
                  messagesAdded: [
                    {
                      message: {
                        id: "gmail-1",
                        threadId: "gmail-thread-1"
                      }
                    }
                  ]
                }
              ]
            };
          },
          async listMessages() {
            throw new Error("not used in this test");
          },
          async getMessage() {
            return {
              id: "gmail-1",
              threadId: "gmail-thread-1",
              payload: {
                headers: [
                  { name: "Message-ID", value: "<gmail-1@example.com>" },
                  { name: "Subject", value: "Gmail pubsub message" },
                  { name: "From", value: "sender@example.com" },
                  { name: "To", value: "assistant@example.com" }
                ]
              },
              textBody: "Pubsub body"
            };
          }
        };
      }
    });

    expect(result.checkpoint).toBe("101");
    expect(result.checkpointMetadata).toMatchObject({
      source: "gmail.pubsub",
      watchHistoryId: "95",
      notificationHistoryId: "101",
      notificationEmailAddress: "assistant@example.com"
    });
    expect(runtime.listRooms()).toHaveLength(1);

    const cursor = findProviderCursor(handle.db, {
      accountId: "acct-gmail",
      cursorKind: "watch"
    });
    expect(cursor).toMatchObject({
      provider: "gmail",
      cursorValue: "101",
      metadata: expect.objectContaining({
        source: "gmail.pubsub",
        watchHistoryId: "95",
        watchExpiration: "2026-03-30T00:00:00.000Z",
        notificationHistoryId: "101"
      })
    });

    handle.close();
  });

  it("delegates gmail notification fetches through an injected mail io plane", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-gmail-pubsub-mail-io-plane-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false"
    });
    const handle = initializeDatabase(config);
    const fetchGmailNotificationBatch = vi.fn(async () => ({
      notifications: [
        {
          id: "gmail-1",
          threadId: "gmail-thread-1",
          cursor: "101"
        }
      ],
      checkpoint: "101",
      checkpointMetadata: {
        source: "gmail.pubsub",
        watchHistoryId: "95",
        notificationHistoryId: "101"
      },
      done: true
    }));
    const fetchGmailMessage = vi.fn(async () => ({
      id: "gmail-1",
      threadId: "gmail-thread-1",
      payload: {
        headers: [
          { name: "Message-ID", value: "<gmail-1@example.com>" },
          { name: "Subject", value: "Gmail pubsub message" },
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "assistant@example.com" }
        ]
      },
      textBody: "Pubsub body"
    }));
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      mailIoPlane: createStubMailIoPlane({
        fetchGmailNotificationBatch,
        fetchGmailMessage
      })
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
          topicName: "projects/example/topics/mailclaws",
          watch: {
            historyId: "90",
            expiration: "2026-03-24T00:00:00.000Z"
          }
        }
      }
    });

    const result = await runtime.ingestGmailNotification({
      accountId: "acct-gmail",
      notification: {
        message: {
          data: Buffer.from(
            JSON.stringify({
              emailAddress: "assistant@example.com",
              historyId: "101"
            })
          ).toString("base64url")
        }
      }
    });

    expect(result.checkpoint).toBe("101");
    expect(fetchGmailNotificationBatch).toHaveBeenCalledTimes(1);
    expect(fetchGmailMessage).toHaveBeenCalledTimes(1);
    expect(runtime.listRooms()).toHaveLength(1);

    handle.close();
  });

  it("routes watcher fetches through the configured command mail io plane", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-watchers-mail-io-command-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false",
      MAILCLAW_MAIL_IO_MODE: "command",
      MAILCLAW_MAIL_IO_COMMAND: "mail-io-sidecar"
    });
    const handle = initializeDatabase(config);
    const mailIoCommandRunner = vi.fn(async (_command: string, input: string) => {
      const payload = JSON.parse(input) as {
        operation: string;
        input: {
          accountId: string;
          mailboxAddress: string;
          checkpoint?: string;
        };
      };
      if (payload.operation === "handshake") {
        return {
          stdout: JSON.stringify({
            protocol: MAIL_IO_PROTOCOL_NAME,
            version: MAIL_IO_PROTOCOL_VERSION,
            operation: "handshake",
            ok: true,
            result: {
              protocol: MAIL_IO_PROTOCOL_NAME,
              version: MAIL_IO_PROTOCOL_VERSION,
              operation: "handshake",
              sidecar: "mailioctl",
              status: "ready",
              capabilities: ["fetch_imap_messages"]
            }
          }),
          stderr: "",
          exitCode: 0
        };
      }
      expect(payload.operation).toBe("fetch_imap_messages");
      expect(payload.input).toMatchObject({
        accountId: "acct-imap",
        mailboxAddress: "mailclaws@example.com",
        checkpoint: "1"
      });

      return {
        stdout: JSON.stringify({
          protocol: MAIL_IO_PROTOCOL_NAME,
          version: MAIL_IO_PROTOCOL_VERSION,
          operation: "fetch_imap_messages",
          ok: true,
          result: {
            messages: [
              {
                uid: 2,
                envelope: {
                  subject: "Watcher message",
                  from: [{ address: "sender@example.com" }],
                  to: [{ address: "mailclaws@example.com" }]
                },
                source: [
                  "Message-ID: <watcher-2@example.com>",
                  "Subject: Watcher message",
                  "From: sender@example.com",
                  "To: mailclaws@example.com",
                  "",
                  "Watcher body"
                ].join("\r\n")
              }
            ],
            checkpoint: "2",
            checkpointMetadata: {
              uidValidity: "7001"
            },
            done: true
          }
        }),
        stderr: "",
        exitCode: 0
      };
    });
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      mailIoCommandRunner
    });

    runtime.upsertAccount({
      accountId: "acct-imap",
      provider: "imap",
      emailAddress: "mailclaws@example.com",
      status: "active",
      settings: {
        host: "imap.example.com",
        port: 993,
        secure: true,
        username: "mailclaws@example.com",
        password: "secret",
        mailbox: "INBOX",
        watch: {
          checkpoint: "1",
          intervalMs: 1
        }
      }
    });

    const controllers = runtime.startWatchers({});

    await vi.waitFor(() => expect(runtime.listRooms()).toHaveLength(1));
    expect(mailIoCommandRunner).toHaveBeenCalledTimes(2);
    expect(controllers["acct-imap"]?.checkpoint()).toBe("2");

    await controllers["acct-imap"]?.stop();
    handle.close();
  });

  it("runs explicit full gmail mailbox recovery and persists full recovery metadata", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-gmail-recovery-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false"
    });
    const handle = initializeDatabase(config);
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
          topicName: "projects/example/topics/mailclaws"
        }
      }
    });

    const result = await runtime.recoverGmailMailbox({
      accountId: "acct-gmail",
      reason: "manual",
      clientFactory() {
        return {
          async watch() {
            return {
              historyId: "180",
              expiration: "2026-03-30T00:00:00.000Z"
            };
          },
          async listHistory() {
            throw new Error("not used in this test");
          },
          async listMessages(input) {
            if (!input.pageToken) {
              return {
                messages: [
                  {
                    id: "gmail-recovery-1",
                    threadId: "gmail-thread-1"
                  }
                ],
                nextPageToken: "page-2"
              };
            }

            return {
              messages: [
                {
                  id: "gmail-recovery-2",
                  threadId: "gmail-thread-2"
                }
              ]
            };
          },
          async getMessage(input) {
            return {
              id: input.messageId,
              threadId: input.messageId === "gmail-recovery-1" ? "gmail-thread-1" : "gmail-thread-2",
              payload: {
                headers: [
                  { name: "Message-ID", value: `<${input.messageId}@example.com>` },
                  { name: "Subject", value: input.messageId === "gmail-recovery-1" ? "First recovery" : "Second recovery" },
                  { name: "From", value: "sender@example.com" },
                  { name: "To", value: "assistant@example.com" }
                ]
              },
              textBody: "Recovery body"
            };
          }
        };
      }
    });

    expect(result.checkpoint).toBe("180");
    expect(result.checkpointMetadata).toMatchObject({
      source: "gmail.recovery",
      watchHistoryId: "180",
      fullMailboxRecovery: true,
      recoveryCompleted: true,
      recoveryCount: 2
    });
    expect(runtime.listRooms()).toHaveLength(2);

    const cursor = findProviderCursor(handle.db, {
      accountId: "acct-gmail",
      cursorKind: "watch"
    });
    expect(cursor).toMatchObject({
      cursorValue: "180",
      metadata: expect.objectContaining({
        source: "gmail.recovery",
        fullMailboxRecovery: true,
        recoveryReason: "manual"
      })
    });

    handle.close();
  });
});
