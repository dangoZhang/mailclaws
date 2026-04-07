import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import {
  fetchConfiguredGmailMessage,
  mapGmailMessageToEnvelope,
  recoverConfiguredGmailMailbox
} from "../src/providers/gmail.js";
import { fetchConfiguredImapMessages } from "../src/providers/imap.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import { initializeDatabase } from "../src/storage/db.js";
import { upsertMailAccount } from "../src/storage/repositories/mail-accounts.js";
import { insertControlPlaneOutboxRecord } from "../src/storage/repositories/outbox-intents.js";
import { upsertMailThread } from "../src/storage/repositories/mail-threads.js";
import { saveThreadRoom } from "../src/storage/repositories/thread-rooms.js";
import { buildRoomSessionKey } from "../src/threading/session-key.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

const liveImapSmtpEnv = {
  imapHost: process.env.MAILCLAW_LIVE_IMAP_HOST,
  imapPort: process.env.MAILCLAW_LIVE_IMAP_PORT,
  imapSecure: process.env.MAILCLAW_LIVE_IMAP_SECURE,
  imapUsername: process.env.MAILCLAW_LIVE_IMAP_USERNAME,
  imapPassword: process.env.MAILCLAW_LIVE_IMAP_PASSWORD,
  imapMailbox: process.env.MAILCLAW_LIVE_IMAP_MAILBOX,
  imapAddress: process.env.MAILCLAW_LIVE_IMAP_ADDRESS,
  imapCheckpoint: process.env.MAILCLAW_LIVE_IMAP_CHECKPOINT,
  smtpHost: process.env.MAILCLAW_LIVE_SMTP_HOST,
  smtpPort: process.env.MAILCLAW_LIVE_SMTP_PORT,
  smtpSecure: process.env.MAILCLAW_LIVE_SMTP_SECURE,
  smtpUsername: process.env.MAILCLAW_LIVE_SMTP_USERNAME,
  smtpPassword: process.env.MAILCLAW_LIVE_SMTP_PASSWORD,
  smtpFrom: process.env.MAILCLAW_LIVE_SMTP_FROM,
  smtpTo: process.env.MAILCLAW_LIVE_SMTP_TO
};

const liveGmailEnv = {
  accessToken: process.env.MAILCLAW_LIVE_GMAIL_ACCESS_TOKEN,
  topicName: process.env.MAILCLAW_LIVE_GMAIL_TOPIC_NAME,
  userId: process.env.MAILCLAW_LIVE_GMAIL_USER_ID,
  labelIds: process.env.MAILCLAW_LIVE_GMAIL_LABEL_IDS,
  from: process.env.MAILCLAW_LIVE_GMAIL_FROM,
  to: process.env.MAILCLAW_LIVE_GMAIL_TO
};

const hasLiveImapSmtpEnv = Object.values(liveImapSmtpEnv).every((value, index) => {
  if (index === 7) {
    return true;
  }
  return typeof value === "string" && value.trim().length > 0;
});
const hasLiveGmailEnv =
  typeof liveGmailEnv.accessToken === "string" &&
  liveGmailEnv.accessToken.trim().length > 0 &&
  typeof liveGmailEnv.topicName === "string" &&
  liveGmailEnv.topicName.trim().length > 0 &&
  typeof liveGmailEnv.from === "string" &&
  liveGmailEnv.from.trim().length > 0 &&
  typeof liveGmailEnv.to === "string" &&
  liveGmailEnv.to.trim().length > 0;

describe("live provider smoke", () => {
  (hasLiveImapSmtpEnv ? it : it.skip)(
    "T23: connects to real IMAP and delivers one real SMTP outbox message",
    async () => {
      const imapBatch = await fetchConfiguredImapMessages({
        accountId: "acct-live-imap",
        mailboxAddress: liveImapSmtpEnv.imapAddress!,
        checkpoint: liveImapSmtpEnv.imapCheckpoint,
        settings: {
          host: liveImapSmtpEnv.imapHost,
          port: Number.parseInt(liveImapSmtpEnv.imapPort!, 10),
          secure: liveImapSmtpEnv.imapSecure === "true",
          username: liveImapSmtpEnv.imapUsername,
          password: liveImapSmtpEnv.imapPassword,
          mailbox: liveImapSmtpEnv.imapMailbox
        },
        signal: new AbortController().signal
      });

      expect(imapBatch.done).toBe(true);
      expect(Array.isArray(imapBatch.messages)).toBe(true);
      expect(imapBatch.checkpointMetadata?.uidValidity).toBeTruthy();

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-live-provider-"));
      tempDirs.push(tempDir);
      const config = loadConfig({
        MAILCLAW_STATE_DIR: tempDir,
        MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
        MAILCLAW_SMTP_HOST: liveImapSmtpEnv.smtpHost,
        MAILCLAW_SMTP_PORT: liveImapSmtpEnv.smtpPort,
        MAILCLAW_SMTP_SECURE: liveImapSmtpEnv.smtpSecure,
        MAILCLAW_SMTP_USERNAME: liveImapSmtpEnv.smtpUsername,
        MAILCLAW_SMTP_PASSWORD: liveImapSmtpEnv.smtpPassword,
        MAILCLAW_SMTP_FROM: liveImapSmtpEnv.smtpFrom
      });
      const handle = initializeDatabase(config);
      const runtime = createMailSidecarRuntime({
        db: handle.db,
        config
      });
      const roomKey = buildRoomSessionKey("acct-live-imap", "thread-live-smtp");

      saveThreadRoom(handle.db, {
        roomKey,
        accountId: "acct-live-imap",
        stableThreadId: "thread-live-smtp",
        parentSessionKey: roomKey,
        frontAgentAddress: liveImapSmtpEnv.smtpFrom!,
        state: "done",
        revision: 1,
        lastInboundSeq: 1,
        lastOutboundSeq: 1
      });
      insertControlPlaneOutboxRecord(handle.db, {
        outboxId: "live-smtp-outbox-1",
        roomKey,
        kind: "final",
        status: "queued",
        subject: `MailClaws live SMTP smoke ${Date.now()}`,
        textBody: "MailClaws live SMTP smoke message.",
        to: [liveImapSmtpEnv.smtpTo!],
        cc: [],
        bcc: [],
        headers: {
          "Message-ID": `<mailclaws-live-smtp-${Date.now()}@local>`
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const delivered = await runtime.deliverOutbox();
      const replay = runtime.replay(roomKey);

      expect(delivered).toEqual({
        sent: 1,
        failed: 0
      });
      expect(replay.outboxAttempts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            outboxId: "live-smtp-outbox-1",
            status: "sent"
          })
        ])
      );

      handle.close();
    }
  );

  (hasLiveGmailEnv ? it : it.skip)(
    "T24: performs a real Gmail recovery/fetch/send smoke for inbound/watch plumbing and reply threading",
    async () => {
      const batch = await recoverConfiguredGmailMailbox({
        accountId: "acct-live-gmail",
        settings: {
          gmail: {
            accessToken: liveGmailEnv.accessToken,
            topicName: liveGmailEnv.topicName,
            userId: liveGmailEnv.userId,
            labelIds: liveGmailEnv.labelIds
              ?.split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            watch: {
              backfillMaxMessages: 5
            }
          }
        },
        signal: new AbortController().signal,
        reason: "live-smoke"
      });

      expect(batch.done).toBe(true);
      expect(batch.checkpointMetadata).toMatchObject({
        fullMailboxRecovery: true,
        recoveryCompleted: true
      });

      if (!batch.notifications[0]) {
        throw new Error("live Gmail smoke requires at least one recoverable message to seed a reply thread");
      }

      const message = await fetchConfiguredGmailMessage({
        accountId: "acct-live-gmail",
        settings: {
          gmail: {
            accessToken: liveGmailEnv.accessToken,
            topicName: liveGmailEnv.topicName,
            userId: liveGmailEnv.userId,
            labelIds: liveGmailEnv.labelIds
              ?.split(",")
              .map((value) => value.trim())
              .filter(Boolean)
          }
        },
        notification: batch.notifications[0],
        signal: new AbortController().signal
      });

      expect(message).not.toBeNull();
      const envelope = mapGmailMessageToEnvelope(message!);
      expect(envelope.providerMessageId).toBeTruthy();
      expect(envelope.threadId).toBeTruthy();
      expect(envelope.messageId).toBeTruthy();

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-live-gmail-provider-"));
      tempDirs.push(tempDir);
      const config = loadConfig({
        MAILCLAW_STATE_DIR: tempDir,
        MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite")
      });
      const handle = initializeDatabase(config);
      const runtime = createMailSidecarRuntime({
        db: handle.db,
        config
      });
      const roomKey = buildRoomSessionKey("acct-live-gmail", "thread-live-gmail");

      upsertMailAccount(handle.db, {
        accountId: "acct-live-gmail",
        provider: "gmail",
        emailAddress: liveGmailEnv.from!,
        status: "active",
        settings: {
          gmail: {
            accessToken: liveGmailEnv.accessToken,
            topicName: liveGmailEnv.topicName,
            userId: liveGmailEnv.userId,
            labelIds: liveGmailEnv.labelIds
              ?.split(",")
              .map((value) => value.trim())
              .filter(Boolean)
          }
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      upsertMailThread(handle.db, {
        stableThreadId: "thread-live-gmail",
        accountId: "acct-live-gmail",
        providerThreadId: envelope.threadId,
        normalizedSubject: envelope.subject.toLowerCase(),
        participantFingerprint: `${liveGmailEnv.from}|${liveGmailEnv.to}`,
        createdAt: new Date().toISOString(),
        lastMessageAt: new Date().toISOString()
      });
      saveThreadRoom(handle.db, {
        roomKey,
        accountId: "acct-live-gmail",
        stableThreadId: "thread-live-gmail",
        parentSessionKey: roomKey,
        frontAgentAddress: liveGmailEnv.from!,
        state: "done",
        revision: 1,
        lastInboundSeq: 1,
        lastOutboundSeq: 1
      });
      insertControlPlaneOutboxRecord(handle.db, {
        outboxId: "live-gmail-outbox-1",
        roomKey,
        kind: "final",
        status: "queued",
        subject: envelope.subject,
        textBody: "MailClaws live Gmail reply smoke message.",
        to: [liveGmailEnv.to!],
        cc: [],
        bcc: [],
        headers: {
          From: liveGmailEnv.from!,
          To: liveGmailEnv.to!,
          Subject: envelope.subject,
          "Message-ID": `<mailclaws-live-gmail-${Date.now()}@local>`,
          "In-Reply-To": envelope.messageId!,
          References: envelope.messageId!
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const delivered = await runtime.deliverOutbox();
      const replay = runtime.replay(roomKey);

      expect(delivered).toEqual({
        sent: 1,
        failed: 0
      });
      expect(replay.outboxAttempts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            outboxId: "live-gmail-outbox-1",
            status: "sent",
            providerMessageId: expect.any(String)
          })
        ])
      );

      handle.close();
    }
  );
});
