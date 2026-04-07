import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import { MAIL_IO_PROTOCOL_NAME, MAIL_IO_PROTOCOL_VERSION } from "../src/providers/mail-io-command.js";
import type { MailIoPlane } from "../src/providers/mail-io-plane.js";
import { initializeDatabase } from "../src/storage/db.js";
import { insertControlPlaneOutboxRecord } from "../src/storage/repositories/outbox-intents.js";
import { upsertMailAccount } from "../src/storage/repositories/mail-accounts.js";
import { insertMailOutboxRecord } from "../src/storage/repositories/mail-outbox.js";
import { upsertMailThread } from "../src/storage/repositories/mail-threads.js";
import { saveThreadRoom } from "../src/storage/repositories/thread-rooms.js";
import { buildRoomSessionKey } from "../src/threading/session-key.js";

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

describe("runtime smtp configuration", () => {
  it("uses a configured smtp transport when no sender is injected", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-smtp-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_SMTP_HOST: "smtp.example.com",
      MAILCLAW_SMTP_PORT: "465",
      MAILCLAW_SMTP_SECURE: "true",
      MAILCLAW_SMTP_FROM: "mailclaws@example.com"
    });
    const handle = initializeDatabase(config);
    const roomKey = buildRoomSessionKey("acct-1", "thread-1");

    saveThreadRoom(handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-1",
      parentSessionKey: roomKey,
      state: "done",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 1
    });
    insertMailOutboxRecord(handle.db, {
      outboxId: "outbox-1",
      roomKey,
      kind: "final",
      status: "queued",
      subject: "Queued",
      textBody: "Queued body",
      to: ["a@example.com"],
      cc: [],
      bcc: [],
      headers: {},
      createdAt: "2026-03-25T04:00:00.000Z",
      updatedAt: "2026-03-25T04:00:00.000Z"
    });

    const sendMail = vi.fn(async () => ({
      messageId: "<smtp-3@example.com>"
    }));
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      smtpTransportFactory: () => ({
        sendMail
      })
    });

    const result = await runtime.deliverOutbox();
    const replay = runtime.replay(roomKey);

    expect(result).toEqual({
      sent: 1,
      failed: 0
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(replay.outboxAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outboxId: "outbox-1",
          status: "sent",
          providerMessageId: "<smtp-3@example.com>"
        })
      ])
    );

    handle.close();
  });

  it("delegates outbox delivery through an injected mail io plane", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-mail-io-plane-outbox-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite")
    });
    const handle = initializeDatabase(config);
    const deliverQueuedOutbox = vi.fn(async () => ({
      sent: 9,
      failed: 1
    }));
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      mailIoPlane: createStubMailIoPlane({
        deliverQueuedOutbox
      })
    });

    const result = await runtime.deliverOutbox();

    expect(result).toEqual({
      sent: 9,
      failed: 1
    });
    expect(deliverQueuedOutbox).toHaveBeenCalledTimes(1);

    handle.close();
  });

  it("routes outbox delivery through the configured command mail io plane", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-mail-io-command-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_MAIL_IO_MODE: "command",
      MAILCLAW_MAIL_IO_COMMAND: "mail-io-sidecar",
      MAILCLAW_SMTP_HOST: "smtp.example.com",
      MAILCLAW_SMTP_PORT: "465",
      MAILCLAW_SMTP_SECURE: "true",
      MAILCLAW_SMTP_FROM: "mailclaws@example.com"
    });
    const handle = initializeDatabase(config);
    const roomKey = buildRoomSessionKey("acct-1", "thread-command");

    saveThreadRoom(handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-command",
      parentSessionKey: roomKey,
      state: "done",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 1
    });
    insertMailOutboxRecord(handle.db, {
      outboxId: "outbox-command-1",
      roomKey,
      kind: "final",
      status: "queued",
      subject: "Queued",
      textBody: "Queued body",
      to: ["a@example.com"],
      cc: [],
      bcc: [],
      headers: {},
      createdAt: "2026-03-25T04:00:00.000Z",
      updatedAt: "2026-03-25T04:00:00.000Z"
    });

    const mailIoCommandRunner = vi.fn(async (_command: string, input: string) => {
      const payload = JSON.parse(input) as {
        operation: string;
        input: {
          deliveryContext: {
            provider: string;
            transport?: {
              host: string;
              from: string;
            };
          };
          message: {
            outboxId: string;
            subject: string;
          };
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
              capabilities: ["deliver_outbox_message"]
            }
          }),
          stderr: "",
          exitCode: 0
        };
      }
      expect(payload.operation).toBe("deliver_outbox_message");
      expect(payload.input.deliveryContext.provider).toBe("smtp");
      expect(payload.input.deliveryContext.transport).toMatchObject({
        host: "smtp.example.com",
        from: "mailclaws@example.com"
      });
      expect(payload.input.message).toMatchObject({
        outboxId: "outbox-command-1",
        subject: "Queued"
      });

      return {
        stdout: JSON.stringify({
          protocol: MAIL_IO_PROTOCOL_NAME,
          version: MAIL_IO_PROTOCOL_VERSION,
          operation: "deliver_outbox_message",
          ok: true,
          result: {
            providerMessageId: "<sidecar-1@example.com>"
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

    const result = await runtime.deliverOutbox();
    const replay = runtime.replay(roomKey);

    expect(result).toEqual({
      sent: 1,
      failed: 0
    });
    expect(mailIoCommandRunner).toHaveBeenCalledTimes(2);
    expect(replay.outboxAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outboxId: "outbox-command-1",
          status: "sent",
          providerMessageId: "<sidecar-1@example.com>"
        })
      ])
    );

    handle.close();
  });

  it("uses a configured Gmail sender for gmail-backed room delivery and forwards the provider thread id", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-gmail-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite")
    });
    const handle = initializeDatabase(config);
    const roomKey = buildRoomSessionKey("acct-gmail", "thread-gmail");

    upsertMailAccount(handle.db, {
      accountId: "acct-gmail",
      provider: "gmail",
      emailAddress: "assistant@gmail.example",
      status: "active",
      settings: {
        gmail: {
          accessToken: "token",
          userId: "me"
        }
      },
      createdAt: "2026-03-26T03:00:00.000Z",
      updatedAt: "2026-03-26T03:00:00.000Z"
    });
    upsertMailThread(handle.db, {
      stableThreadId: "thread-gmail",
      accountId: "acct-gmail",
      providerThreadId: "gmail-thread-42",
      normalizedSubject: "gmail runtime test",
      participantFingerprint: "sender@example.com|assistant@gmail.example",
      createdAt: "2026-03-26T03:00:00.000Z",
      lastMessageAt: "2026-03-26T03:00:00.000Z"
    });
    saveThreadRoom(handle.db, {
      roomKey,
      accountId: "acct-gmail",
      stableThreadId: "thread-gmail",
      parentSessionKey: roomKey,
      frontAgentAddress: "assistant@gmail.example",
      state: "done",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 1
    });
    insertControlPlaneOutboxRecord(handle.db, {
      outboxId: "gmail-outbox-1",
      roomKey,
      kind: "final",
      status: "queued",
      subject: "Runtime Gmail",
      textBody: "Queued Gmail body",
      to: ["user@example.com"],
      cc: [],
      bcc: [],
      headers: {
        From: "assistant@gmail.example",
        To: "user@example.com",
        Subject: "Runtime Gmail",
        "Message-ID": "<runtime-gmail-1@example.com>",
        "In-Reply-To": "<parent@example.com>",
        References: "<root@example.com> <parent@example.com>"
      },
      createdAt: "2026-03-26T03:00:00.000Z",
      updatedAt: "2026-03-26T03:00:00.000Z"
    });

    const sendMessage = vi.fn(async () => ({
      id: "gmail-sent-42",
      threadId: "gmail-thread-42"
    }));
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      gmailSendClientFactory: () => ({
        sendMessage
      })
    });

    const result = await runtime.deliverOutbox();
    const replay = runtime.replay(roomKey);

    expect(result).toEqual({
      sent: 1,
      failed: 0
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "me",
        threadId: "gmail-thread-42"
      })
    );
    expect(replay.outboxAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outboxId: "gmail-outbox-1",
          status: "sent",
          providerMessageId: "gmail-sent-42"
        })
      ])
    );

    handle.close();
  });

  it("uses account-scoped smtp settings for forward-style provider delivery", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-forward-smtp-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite")
    });
    const handle = initializeDatabase(config);
    const roomKey = buildRoomSessionKey("acct-forward", "thread-forward");

    upsertMailAccount(handle.db, {
      accountId: "acct-forward",
      provider: "forward",
      emailAddress: "assistant@forward.example",
      status: "active",
      settings: {
        smtp: {
          host: "smtp.forward.example",
          port: 2525,
          secure: false,
          username: "assistant",
          password: "secret"
        }
      },
      createdAt: "2026-03-26T03:30:00.000Z",
      updatedAt: "2026-03-26T03:30:00.000Z"
    });
    saveThreadRoom(handle.db, {
      roomKey,
      accountId: "acct-forward",
      stableThreadId: "thread-forward",
      parentSessionKey: roomKey,
      frontAgentAddress: "assistant@forward.example",
      state: "done",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 1
    });
    insertControlPlaneOutboxRecord(handle.db, {
      outboxId: "forward-outbox-1",
      roomKey,
      kind: "final",
      status: "queued",
      subject: "Forward SMTP",
      textBody: "Queued forward body",
      to: ["user@example.com"],
      cc: [],
      bcc: [],
      headers: {
        From: "assistant@forward.example",
        To: "user@example.com",
        Subject: "Forward SMTP",
        "Message-ID": "<forward-smtp-1@example.com>"
      },
      createdAt: "2026-03-26T03:30:00.000Z",
      updatedAt: "2026-03-26T03:30:00.000Z"
    });

    const sendMail = vi.fn(async () => ({
      messageId: "<forward-smtp@example.com>"
    }));
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      smtpTransportFactory: (transportConfig) => {
        expect(transportConfig).toMatchObject({
          host: "smtp.forward.example",
          port: 2525,
          secure: false,
          auth: {
            user: "assistant",
            pass: "secret"
          }
        });

        return {
          sendMail
        };
      }
    });

    const result = await runtime.deliverOutbox();
    const replay = runtime.replay(roomKey);

    expect(result).toEqual({
      sent: 1,
      failed: 0
    });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "assistant@forward.example",
        subject: "Forward SMTP"
      })
    );
    expect(replay.outboxAttempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outboxId: "forward-outbox-1",
          status: "sent",
          providerMessageId: "<forward-smtp@example.com>"
        })
      ])
    );

    handle.close();
  });

  it("invalidates the cached Gmail sender when account settings change", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-runtime-gmail-cache-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite")
    });
    const handle = initializeDatabase(config);
    const roomKey = buildRoomSessionKey("acct-gmail", "thread-gmail-cache");

    upsertMailAccount(handle.db, {
      accountId: "acct-gmail",
      provider: "gmail",
      emailAddress: "assistant@gmail.example",
      status: "active",
      settings: {
        gmail: {
          accessToken: "token-1",
          userId: "me"
        }
      },
      createdAt: "2026-03-26T03:00:00.000Z",
      updatedAt: "2026-03-26T03:00:00.000Z"
    });
    upsertMailThread(handle.db, {
      stableThreadId: "thread-gmail-cache",
      accountId: "acct-gmail",
      providerThreadId: "gmail-thread-cache",
      normalizedSubject: "gmail runtime cache test",
      participantFingerprint: "sender@example.com|assistant@gmail.example",
      createdAt: "2026-03-26T03:00:00.000Z",
      lastMessageAt: "2026-03-26T03:00:00.000Z"
    });
    saveThreadRoom(handle.db, {
      roomKey,
      accountId: "acct-gmail",
      stableThreadId: "thread-gmail-cache",
      parentSessionKey: roomKey,
      frontAgentAddress: "assistant@gmail.example",
      state: "done",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 1
    });

    const factoryCalls: string[] = [];
    const sendMessage = vi.fn(async () => ({
      id: "gmail-sent-cache",
      threadId: "gmail-thread-cache"
    }));
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      gmailSendClientFactory: ({ accessToken }) => {
        factoryCalls.push(accessToken);
        return {
          sendMessage
        };
      }
    });

    insertControlPlaneOutboxRecord(handle.db, {
      outboxId: "gmail-outbox-cache-1",
      roomKey,
      kind: "final",
      status: "queued",
      subject: "Runtime Gmail 1",
      textBody: "Queued Gmail body 1",
      to: ["user@example.com"],
      cc: [],
      bcc: [],
      headers: {
        From: "assistant@gmail.example",
        To: "user@example.com",
        Subject: "Runtime Gmail 1",
        "Message-ID": "<runtime-gmail-cache-1@example.com>"
      },
      createdAt: "2026-03-26T03:00:00.000Z",
      updatedAt: "2026-03-26T03:00:00.000Z"
    });

    await runtime.deliverOutbox();
    expect(factoryCalls).toEqual(["token-1"]);
    expect(sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: "me"
      })
    );

    runtime.upsertAccount({
      accountId: "acct-gmail",
      provider: "gmail",
      emailAddress: "assistant@gmail.example",
      status: "active",
      settings: {
        gmail: {
          accessToken: "token-2",
          userId: "delegated-user@example.com"
        }
      }
    });

    insertControlPlaneOutboxRecord(handle.db, {
      outboxId: "gmail-outbox-cache-2",
      roomKey,
      kind: "final",
      status: "queued",
      subject: "Runtime Gmail 2",
      textBody: "Queued Gmail body 2",
      to: ["user@example.com"],
      cc: [],
      bcc: [],
      headers: {
        From: "assistant@gmail.example",
        To: "user@example.com",
        Subject: "Runtime Gmail 2",
        "Message-ID": "<runtime-gmail-cache-2@example.com>"
      },
      createdAt: "2026-03-26T03:01:00.000Z",
      updatedAt: "2026-03-26T03:01:00.000Z"
    });

    await runtime.deliverOutbox();
    expect(factoryCalls).toEqual(["token-1", "token-2"]);
    expect(sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        userId: "delegated-user@example.com"
      })
    );

    handle.close();
  });
});
