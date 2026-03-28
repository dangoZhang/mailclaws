import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { deliverQueuedOutbox, type SmtpSender } from "../src/providers/smtp.js";
import { loadConfig } from "../src/config.js";
import { initializeDatabase } from "../src/storage/db.js";
import {
  insertMailOutboxAttempt,
  listMailOutboxAttemptsForRoom
} from "../src/storage/repositories/mail-outbox-attempts.js";
import {
  insertMailOutboxRecord,
  listMailOutboxForRoom
} from "../src/storage/repositories/mail-outbox.js";
import {
  findOutboxIntentById,
  insertControlPlaneOutboxRecord
} from "../src/storage/repositories/outbox-intents.js";
import { saveThreadRoom } from "../src/storage/repositories/thread-rooms.js";
import { buildRoomSessionKey } from "../src/threading/session-key.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("deliverQueuedOutbox", () => {
  it("delivers queued mail, skips approval-gated mail, and marks failures", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-smtp-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
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
    insertMailOutboxRecord(handle.db, {
      outboxId: "outbox-2",
      roomKey,
      kind: "final",
      status: "pending_approval",
      subject: "Approval",
      textBody: "Approval body",
      to: ["b@example.com"],
      cc: [],
      bcc: [],
      headers: {},
      createdAt: "2026-03-25T04:00:01.000Z",
      updatedAt: "2026-03-25T04:00:01.000Z"
    });
    insertMailOutboxRecord(handle.db, {
      outboxId: "outbox-3",
      roomKey,
      kind: "final",
      status: "queued",
      subject: "Failure",
      textBody: "Failure body",
      to: ["c@example.com"],
      cc: [],
      bcc: [],
      headers: {},
      createdAt: "2026-03-25T04:00:02.000Z",
      updatedAt: "2026-03-25T04:00:02.000Z"
    });

    const sender: SmtpSender = {
      async send(message) {
        if (message.subject === "Failure") {
          throw new Error("smtp failed");
        }

        return {
          providerMessageId: `<${message.subject}@smtp.local>`
        };
      }
    };

    const result = await deliverQueuedOutbox(handle.db, sender, {
      now: () => "2026-03-25T04:00:03.000Z"
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);

    const records = listMailOutboxForRoom(handle.db, roomKey);
    const attempts = listMailOutboxAttemptsForRoom(handle.db, roomKey);
    expect(records.find((record) => record.outboxId === "outbox-1")?.status).toBe("sent");
    expect(records.find((record) => record.outboxId === "outbox-1")?.providerMessageId).toBe("<Queued@smtp.local>");
    expect(records.find((record) => record.outboxId === "outbox-2")?.status).toBe("pending_approval");
    expect(records.find((record) => record.outboxId === "outbox-3")?.status).toBe("failed");
    expect(findOutboxIntentById(handle.db, "outbox-1")).toMatchObject({
      intentId: "outbox-1",
      status: "sent",
      providerMessageId: "<Queued@smtp.local>"
    });
    expect(findOutboxIntentById(handle.db, "outbox-2")).toMatchObject({
      intentId: "outbox-2",
      status: "pending_approval"
    });
    expect(findOutboxIntentById(handle.db, "outbox-3")).toMatchObject({
      intentId: "outbox-3",
      status: "failed",
      errorText: "smtp failed"
    });
    expect(attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outboxId: "outbox-1",
          status: "sent",
          providerMessageId: "<Queued@smtp.local>"
        }),
        expect.objectContaining({
          outboxId: "outbox-3",
          status: "failed",
          errorText: "smtp failed"
        })
      ])
    );

    handle.close();
  });

  it("redacts credential material from failed delivery attempts", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-smtp-redact-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });
    const handle = initializeDatabase(config);
    const roomKey = buildRoomSessionKey("acct-1", "thread-redact");

    saveThreadRoom(handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-redact",
      parentSessionKey: roomKey,
      state: "done",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 1
    });

    insertMailOutboxRecord(handle.db, {
      outboxId: "outbox-redact-1",
      roomKey,
      kind: "final",
      status: "queued",
      subject: "Redact",
      textBody: "Queued body",
      to: ["a@example.com"],
      cc: [],
      bcc: [],
      headers: {},
      createdAt: "2026-03-25T04:30:00.000Z",
      updatedAt: "2026-03-25T04:30:00.000Z"
    });

    const sender: SmtpSender = {
      async send() {
        throw new Error(
          "smtp failed password=super-secret Bearer token-123 oauthRefreshToken=refresh-secret client_secret=client-secret"
        );
      }
    };

    const result = await deliverQueuedOutbox(handle.db, sender, {
      now: () => "2026-03-25T04:30:01.000Z"
    });

    expect(result.failed).toBe(1);
    const attempts = listMailOutboxAttemptsForRoom(handle.db, roomKey);
    const failure = attempts.find((entry) => entry.outboxId === "outbox-redact-1");
    expect(failure?.errorText).toContain("password=[redacted]");
    expect(failure?.errorText).toContain("Bearer=[redacted]");
    expect(failure?.errorText).toContain("oauthRefreshToken=[redacted]");
    expect(failure?.errorText).toContain("client_secret=[redacted]");
    expect(failure?.errorText).not.toContain("super-secret");
    expect(failure?.errorText).not.toContain("refresh-secret");
    expect(failure?.errorText).not.toContain("client-secret");

    handle.close();
  });

  it("redacts sensitive delivery failure text before it reaches attempts and outbox state", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-smtp-redact-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });
    const handle = initializeDatabase(config);
    const roomKey = buildRoomSessionKey("acct-1", "thread-redact");

    saveThreadRoom(handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-redact",
      parentSessionKey: roomKey,
      state: "done",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 1
    });

    insertMailOutboxRecord(handle.db, {
      outboxId: "outbox-redact-1",
      roomKey,
      kind: "final",
      status: "queued",
      subject: "Sensitive failure",
      textBody: "Queued body",
      to: ["a@example.com"],
      cc: [],
      bcc: [],
      headers: {},
      createdAt: "2026-03-25T05:00:00.000Z",
      updatedAt: "2026-03-25T05:00:00.000Z"
    });

    const sender: SmtpSender = {
      async send() {
        throw new Error(
          "smtp failed password=super-secret oauthRefreshToken=refresh-secret client_secret=client-secret"
        );
      }
    };

    const result = await deliverQueuedOutbox(handle.db, sender, {
      now: () => "2026-03-25T05:00:01.000Z"
    });

    expect(result).toMatchObject({
      sent: 0,
      failed: 1
    });

    const outbox = findOutboxIntentById(handle.db, "outbox-redact-1");
    const attempts = listMailOutboxAttemptsForRoom(handle.db, roomKey);
    expect(outbox?.errorText).toContain("password=[redacted]");
    expect(outbox?.errorText).toContain("oauthRefreshToken=[redacted]");
    expect(outbox?.errorText).toContain("client_secret=[redacted]");
    expect(outbox?.errorText).not.toContain("super-secret");
    expect(outbox?.errorText).not.toContain("refresh-secret");
    expect(outbox?.errorText).not.toContain("client-secret");
    expect(attempts[0]?.errorText).toBe(outbox?.errorText);

    handle.close();
  });

  it("claims queued outbox rows before send so repeated delivery passes do not double send", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-smtp-claim-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });
    const handle = initializeDatabase(config);
    const roomKey = buildRoomSessionKey("acct-1", "thread-claim");

    saveThreadRoom(handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-claim",
      parentSessionKey: roomKey,
      state: "done",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 1
    });
    insertMailOutboxRecord(handle.db, {
      outboxId: "outbox-claim-1",
      roomKey,
      kind: "final",
      status: "queued",
      subject: "Claimed",
      textBody: "Queued body",
      to: ["a@example.com"],
      cc: [],
      bcc: [],
      headers: {},
      createdAt: "2026-03-25T04:10:00.000Z",
      updatedAt: "2026-03-25T04:10:00.000Z"
    });

    let releaseSend: (() => void) | undefined;
    const sendGate = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    let sendCalls = 0;
    const sender: SmtpSender = {
      async send() {
        sendCalls += 1;
        await sendGate;

        return {
          providerMessageId: "<claimed@smtp.local>"
        };
      }
    };

    const firstPass = deliverQueuedOutbox(handle.db, sender, {
      now: () => "2026-03-25T04:10:01.000Z"
    });
    const secondPass = deliverQueuedOutbox(handle.db, sender, {
      now: () => "2026-03-25T04:10:02.000Z"
    });

    await Promise.resolve();
    releaseSend?.();

    const [firstResult, secondResult] = await Promise.all([firstPass, secondPass]);

    expect(firstResult.sent + secondResult.sent).toBe(1);
    expect(sendCalls).toBe(1);
    expect(listMailOutboxAttemptsForRoom(handle.db, roomKey)).toHaveLength(1);

    handle.close();
  });

  it("suppresses a repeated delivery pass once a prior attempt already reached the provider", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-smtp-repeat-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });
    const handle = initializeDatabase(config);
    const roomKey = buildRoomSessionKey("acct-1", "thread-repeat");

    saveThreadRoom(handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-repeat",
      parentSessionKey: roomKey,
      state: "done",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 1
    });
    insertMailOutboxRecord(handle.db, {
      outboxId: "outbox-repeat-1",
      roomKey,
      kind: "final",
      status: "queued",
      subject: "Already accepted",
      textBody: "Queued body",
      to: ["a@example.com"],
      cc: [],
      bcc: [],
      headers: {},
      providerMessageId: "<prior@smtp.local>",
      createdAt: "2026-03-25T04:20:00.000Z",
      updatedAt: "2026-03-25T04:20:00.000Z"
    });
    insertMailOutboxAttempt(handle.db, {
      attemptId: "attempt-repeat-1",
      outboxId: "outbox-repeat-1",
      roomKey,
      status: "sent",
      providerMessageId: "<prior@smtp.local>",
      startedAt: "2026-03-25T04:20:01.000Z",
      completedAt: "2026-03-25T04:20:02.000Z",
      createdAt: "2026-03-25T04:20:01.000Z"
    });

    const deliveries: string[] = [];
    const sender: SmtpSender = {
      async send(message) {
        deliveries.push(message.outboxId);

        return {
          providerMessageId: `<${message.outboxId}@smtp.local>`
        };
      }
    };

    const result = await deliverQueuedOutbox(handle.db, sender, {
      now: () => "2026-03-25T04:20:03.000Z"
    });

    expect(result).toEqual({
      sent: 0,
      failed: 0
    });
    expect(deliveries).toEqual([]);
    expect(listMailOutboxAttemptsForRoom(handle.db, roomKey)).toEqual([
      expect.objectContaining({
        attemptId: "attempt-repeat-1",
        outboxId: "outbox-repeat-1",
        status: "sent",
        providerMessageId: "<prior@smtp.local>"
      })
    ]);

    handle.close();
  });

  it("skips queued outbox delivery while the room is in handoff", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-smtp-handoff-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });
    const handle = initializeDatabase(config);
    const roomKey = buildRoomSessionKey("acct-1", "thread-handoff");

    saveThreadRoom(handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-handoff",
      parentSessionKey: roomKey,
      state: "handoff",
      revision: 2,
      lastInboundSeq: 2,
      lastOutboundSeq: 1
    });
    insertMailOutboxRecord(handle.db, {
      outboxId: "outbox-handoff-1",
      roomKey,
      kind: "final",
      status: "queued",
      subject: "Handoff",
      textBody: "This should not send while handoff is active.",
      to: ["a@example.com"],
      cc: [],
      bcc: [],
      headers: {},
      createdAt: "2026-03-26T02:00:00.000Z",
      updatedAt: "2026-03-26T02:00:00.000Z"
    });

    let sendCalls = 0;
    const sender: SmtpSender = {
      async send() {
        sendCalls += 1;
        return {
          providerMessageId: "<handoff@smtp.local>"
        };
      }
    };

    const result = await deliverQueuedOutbox(handle.db, sender, {
      now: () => "2026-03-26T02:00:01.000Z"
    });

    expect(result).toEqual({
      sent: 0,
      failed: 0
    });
    expect(sendCalls).toBe(0);
    expect(listMailOutboxForRoom(handle.db, roomKey)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          outboxId: "outbox-handoff-1",
          status: "queued"
        })
      ])
    );

    handle.close();
  });

  it("delivers queued control-plane outbox rows without requiring a legacy mirror table", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-smtp-intent-only-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });
    const handle = initializeDatabase(config);
    const roomKey = buildRoomSessionKey("acct-1", "thread-intent-only");

    saveThreadRoom(handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-intent-only",
      parentSessionKey: roomKey,
      state: "done",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 1
    });
    insertControlPlaneOutboxRecord(handle.db, {
      outboxId: "outbox-intent-only",
      roomKey,
      kind: "final",
      status: "queued",
      subject: "Intent Only",
      textBody: "Intent queued body",
      to: ["intent@example.com"],
      cc: [],
      bcc: [],
      headers: {},
      createdAt: "2026-03-25T04:20:00.000Z",
      updatedAt: "2026-03-25T04:20:00.000Z"
    });

    let sendCalls = 0;
    const sender: SmtpSender = {
      async send(message) {
        sendCalls += 1;
        expect(message.outboxId).toBe("outbox-intent-only");
        return {
          providerMessageId: "<intent-only@smtp.local>"
        };
      }
    };

    const result = await deliverQueuedOutbox(handle.db, sender, {
      now: () => "2026-03-25T04:20:01.000Z"
    });

    expect(result).toMatchObject({
      sent: 1,
      failed: 0
    });
    expect(sendCalls).toBe(1);
    expect(findOutboxIntentById(handle.db, "outbox-intent-only")).toMatchObject({
      intentId: "outbox-intent-only",
      status: "sent",
      providerMessageId: "<intent-only@smtp.local>"
    });
    expect(listMailOutboxForRoom(handle.db, roomKey).find((record) => record.outboxId === "outbox-intent-only")).toMatchObject({
      status: "sent",
      providerMessageId: "<intent-only@smtp.local>"
    });

    handle.close();
  });
});
