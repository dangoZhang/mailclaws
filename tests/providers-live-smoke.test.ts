import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ImapFlow } from "imapflow";
import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { resolveMailboxProfilePreset } from "../src/auth/mailbox-autoconfig.js";
import {
  fetchConfiguredGmailMessage,
  mapGmailMessageToEnvelope,
  recoverConfiguredGmailMailbox
} from "../src/providers/gmail.js";
import { fetchConfiguredImapMessages, mapImapMessageToEnvelope, type ImapFetchedMessage } from "../src/providers/imap.js";
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

interface LiveImapSmtpEnv {
  providerId: string;
  providerLabel: string;
  imapHost: string;
  imapPort: string;
  imapSecure: string;
  imapUsername: string;
  imapPassword: string;
  imapMailbox: string;
  imapAddress: string;
  imapCheckpoint?: string;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: string;
  smtpUsername: string;
  smtpPassword: string;
  smtpFrom: string;
  echoText: string;
  expectedFrom?: string;
}

interface LiveMailboxSnapshot {
  uidNext?: number;
  uidValidity?: string;
}

interface LivePresetSpec {
  providerId: string;
  providerLabel: string;
  envPrefix: string;
  preset: string;
}

function readEnvValue(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readFirstEnvValue(env: NodeJS.ProcessEnv, keys: string[], fallback?: string) {
  for (const key of keys) {
    const value = readEnvValue(env, key);
    if (value) {
      return value;
    }
  }

  return fallback;
}

const LIVE_PRESET_SPECS: LivePresetSpec[] = [
  {
    providerId: "qq",
    providerLabel: "QQ Mail",
    envPrefix: "MAILCLAW_LIVE_QQ",
    preset: "qq"
  },
  {
    providerId: "163",
    providerLabel: "NetEase 163 Mail",
    envPrefix: "MAILCLAW_LIVE_163",
    preset: "163"
  },
  {
    providerId: "126",
    providerLabel: "NetEase 126 Mail",
    envPrefix: "MAILCLAW_LIVE_126",
    preset: "126"
  },
  {
    providerId: "icloud",
    providerLabel: "iCloud Mail",
    envPrefix: "MAILCLAW_LIVE_ICLOUD",
    preset: "icloud"
  },
  {
    providerId: "yahoo",
    providerLabel: "Yahoo Mail",
    envPrefix: "MAILCLAW_LIVE_YAHOO",
    preset: "yahoo"
  }
];

function resolvePresetLiveImapSmtpEnv(spec: LivePresetSpec, env: NodeJS.ProcessEnv = process.env): LiveImapSmtpEnv | null {
  const address = readEnvValue(env, `${spec.envPrefix}_ADDRESS`);
  const secret = readFirstEnvValue(env, [`${spec.envPrefix}_AUTH_CODE`, `${spec.envPrefix}_PASSWORD`]);
  if (!address || !secret) {
    return null;
  }

  const preset = resolveMailboxProfilePreset(spec.preset);
  if (!preset) {
    throw new Error(`missing mailbox preset for live smoke: ${spec.preset}`);
  }

  return {
    providerId: spec.providerId,
    providerLabel: spec.providerLabel,
    imapHost: readFirstEnvValue(env, [`${spec.envPrefix}_IMAP_HOST`], preset.imapHost)!,
    imapPort: readFirstEnvValue(env, [`${spec.envPrefix}_IMAP_PORT`], String(preset.imapPort))!,
    imapSecure: readFirstEnvValue(env, [`${spec.envPrefix}_IMAP_SECURE`], String(preset.imapSecure))!,
    imapUsername: readFirstEnvValue(env, [`${spec.envPrefix}_IMAP_USERNAME`], address)!,
    imapPassword: secret,
    imapMailbox: readFirstEnvValue(env, [`${spec.envPrefix}_IMAP_MAILBOX`], preset.imapMailbox ?? "INBOX")!,
    imapAddress: address,
    imapCheckpoint: readFirstEnvValue(env, [`${spec.envPrefix}_IMAP_CHECKPOINT`]),
    smtpHost: readFirstEnvValue(env, [`${spec.envPrefix}_SMTP_HOST`], preset.smtpHost)!,
    smtpPort: readFirstEnvValue(env, [`${spec.envPrefix}_SMTP_PORT`], String(preset.smtpPort))!,
    smtpSecure: readFirstEnvValue(env, [`${spec.envPrefix}_SMTP_SECURE`], String(preset.smtpSecure))!,
    smtpUsername: readFirstEnvValue(env, [`${spec.envPrefix}_SMTP_USERNAME`], address)!,
    smtpPassword: readFirstEnvValue(
      env,
      [`${spec.envPrefix}_SMTP_PASSWORD`, `${spec.envPrefix}_AUTH_CODE`, `${spec.envPrefix}_PASSWORD`],
      secret
    )!,
    smtpFrom: readFirstEnvValue(env, [`${spec.envPrefix}_SMTP_FROM`], address)!,
    echoText: readFirstEnvValue(env, [`${spec.envPrefix}_ECHO_TEXT`, "MAILCLAW_LIVE_IMAP_ECHO_TEXT", "MAILCLAW_LIVE_ECHO_TEXT"], "hello world")!,
    expectedFrom: readFirstEnvValue(env, [`${spec.envPrefix}_EXPECTED_FROM`, "MAILCLAW_LIVE_IMAP_EXPECTED_FROM"])
  };
}

function resolveGenericLiveImapSmtpEnv(env: NodeJS.ProcessEnv = process.env): LiveImapSmtpEnv | null {
  const generic: LiveImapSmtpEnv = {
    providerId: "imap",
    providerLabel: "IMAP/SMTP",
    imapHost: readEnvValue(env, "MAILCLAW_LIVE_IMAP_HOST") ?? "",
    imapPort: readEnvValue(env, "MAILCLAW_LIVE_IMAP_PORT") ?? "",
    imapSecure: readEnvValue(env, "MAILCLAW_LIVE_IMAP_SECURE") ?? "",
    imapUsername: readEnvValue(env, "MAILCLAW_LIVE_IMAP_USERNAME") ?? "",
    imapPassword: readEnvValue(env, "MAILCLAW_LIVE_IMAP_PASSWORD") ?? "",
    imapMailbox: readEnvValue(env, "MAILCLAW_LIVE_IMAP_MAILBOX") ?? "",
    imapAddress: readEnvValue(env, "MAILCLAW_LIVE_IMAP_ADDRESS") ?? "",
    imapCheckpoint: readEnvValue(env, "MAILCLAW_LIVE_IMAP_CHECKPOINT"),
    smtpHost: readEnvValue(env, "MAILCLAW_LIVE_SMTP_HOST") ?? "",
    smtpPort: readEnvValue(env, "MAILCLAW_LIVE_SMTP_PORT") ?? "",
    smtpSecure: readEnvValue(env, "MAILCLAW_LIVE_SMTP_SECURE") ?? "",
    smtpUsername: readEnvValue(env, "MAILCLAW_LIVE_SMTP_USERNAME") ?? "",
    smtpPassword: readEnvValue(env, "MAILCLAW_LIVE_SMTP_PASSWORD") ?? "",
    smtpFrom: readEnvValue(env, "MAILCLAW_LIVE_SMTP_FROM") ?? "",
    echoText: readFirstEnvValue(env, ["MAILCLAW_LIVE_IMAP_ECHO_TEXT", "MAILCLAW_LIVE_ECHO_TEXT"], "hello world")!,
    expectedFrom: readEnvValue(env, "MAILCLAW_LIVE_IMAP_EXPECTED_FROM")
  };

  return [
    generic.imapHost,
    generic.imapPort,
    generic.imapSecure,
    generic.imapUsername,
    generic.imapPassword,
    generic.imapMailbox,
    generic.imapAddress,
    generic.smtpHost,
    generic.smtpPort,
    generic.smtpSecure,
    generic.smtpUsername,
    generic.smtpPassword,
    generic.smtpFrom
  ].every((value) => value.length > 0)
    ? generic
    : null;
}

function resolveLiveImapSmtpEnvs(env: NodeJS.ProcessEnv = process.env) {
  const resolved = LIVE_PRESET_SPECS.map((spec) => resolvePresetLiveImapSmtpEnv(spec, env)).filter(
    (value): value is LiveImapSmtpEnv => Boolean(value)
  );
  const generic = resolveGenericLiveImapSmtpEnv(env);
  if (generic) {
    resolved.push(generic);
  }
  return resolved;
}

function normalizeMailboxAddress(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeEchoText(value?: string) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function pickLatestEchoCandidate(
  messages: ImapFetchedMessage[],
  input: {
    mailboxAddress: string;
    echoText: string;
    expectedFrom?: string;
  }
) {
  const mailboxAddress = normalizeMailboxAddress(input.mailboxAddress);
  const expectedText = normalizeEchoText(input.echoText);
  const expectedFrom = normalizeMailboxAddress(input.expectedFrom);

  return [...messages].reverse().find((message) => {
    const sender = normalizeMailboxAddress(message.from?.[0]?.email);
    if (expectedFrom && sender !== expectedFrom) {
      return false;
    }

    const recipients = new Set([
      ...((message.to ?? []).map((entry) => normalizeMailboxAddress(entry.email))),
      ...((message.cc ?? []).map((entry) => normalizeMailboxAddress(entry.email))),
      ...((message.bcc ?? []).map((entry) => normalizeMailboxAddress(entry.email))),
      ...((message.envelopeRecipients ?? []).map((entry) => normalizeMailboxAddress(entry)))
    ]);
    if (mailboxAddress && !recipients.has(mailboxAddress)) {
      return false;
    }

    return normalizeEchoText(message.text) === expectedText;
  }) ?? null;
}

async function readLiveMailboxSnapshot(env: LiveImapSmtpEnv) {
  const client = new ImapFlow({
    host: env.imapHost,
    port: Number.parseInt(env.imapPort, 10),
    secure: env.imapSecure === "true",
    auth: {
      user: env.imapUsername,
      pass: env.imapPassword
    }
  });

  await client.connect();
  try {
    const mailbox = await client.mailboxOpen(env.imapMailbox);
    return {
      uidNext:
        typeof (mailbox as { uidNext?: unknown }).uidNext === "number"
          ? (mailbox as { uidNext: number }).uidNext
          : undefined,
      uidValidity:
        typeof (mailbox as { uidValidity?: unknown }).uidValidity === "bigint"
          ? (mailbox as { uidValidity: bigint }).uidValidity.toString()
          : typeof (mailbox as { uidValidity?: unknown }).uidValidity === "number"
            ? String((mailbox as { uidValidity: number }).uidValidity)
            : typeof (mailbox as { uidValidity?: unknown }).uidValidity === "string"
              ? (mailbox as { uidValidity: string }).uidValidity
              : undefined
    } satisfies LiveMailboxSnapshot;
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function fetchLiveImapBatch(
  env: LiveImapSmtpEnv,
  checkpoint: string | undefined
) {
  return fetchConfiguredImapMessages({
    accountId: "acct-live-imap",
    mailboxAddress: env.imapAddress,
    checkpoint,
    settings: {
      imap: {
        host: env.imapHost,
        port: Number.parseInt(env.imapPort, 10),
        secure: env.imapSecure === "true",
        username: env.imapUsername,
        password: env.imapPassword,
        mailbox: env.imapMailbox
      }
    },
    signal: new AbortController().signal
  });
}

const liveImapSmtpEnvs = resolveLiveImapSmtpEnvs();

const liveGmailEnv = {
  accessToken: process.env.MAILCLAW_LIVE_GMAIL_ACCESS_TOKEN,
  topicName: process.env.MAILCLAW_LIVE_GMAIL_TOPIC_NAME,
  userId: process.env.MAILCLAW_LIVE_GMAIL_USER_ID,
  labelIds: process.env.MAILCLAW_LIVE_GMAIL_LABEL_IDS,
  from: process.env.MAILCLAW_LIVE_GMAIL_FROM,
  to: process.env.MAILCLAW_LIVE_GMAIL_TO
};

const hasLiveImapSmtpEnv = liveImapSmtpEnvs.length > 0;
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
  it("resolves minimal QQ live smoke aliases to a full IMAP/SMTP config", () => {
    const resolved = resolvePresetLiveImapSmtpEnv(
      {
        providerId: "qq",
        providerLabel: "QQ Mail",
        envPrefix: "MAILCLAW_LIVE_QQ",
        preset: "qq"
      },
      {
      MAILCLAW_LIVE_QQ_ADDRESS: "robot@qq.com",
      MAILCLAW_LIVE_QQ_AUTH_CODE: "qq-auth-code"
      }
    );

    expect(resolved).toEqual({
      providerId: "qq",
      providerLabel: "QQ Mail",
      imapHost: "imap.qq.com",
      imapPort: "993",
      imapSecure: "true",
      imapUsername: "robot@qq.com",
      imapPassword: "qq-auth-code",
      imapMailbox: "INBOX",
      imapAddress: "robot@qq.com",
      imapCheckpoint: undefined,
      smtpHost: "smtp.qq.com",
      smtpPort: "465",
      smtpSecure: "true",
      smtpUsername: "robot@qq.com",
      smtpPassword: "qq-auth-code",
      smtpFrom: "robot@qq.com",
      echoText: "hello world",
      expectedFrom: undefined
    });
  });

  it("resolves minimal 163 live smoke aliases to a full IMAP/SMTP config", () => {
    const resolved = resolvePresetLiveImapSmtpEnv(
      {
        providerId: "163",
        providerLabel: "NetEase 163 Mail",
        envPrefix: "MAILCLAW_LIVE_163",
        preset: "163"
      },
      {
        MAILCLAW_LIVE_163_ADDRESS: "robot@163.com",
        MAILCLAW_LIVE_163_AUTH_CODE: "163-auth-code"
      }
    );

    expect(resolved).toEqual({
      providerId: "163",
      providerLabel: "NetEase 163 Mail",
      imapHost: "imap.163.com",
      imapPort: "993",
      imapSecure: "true",
      imapUsername: "robot@163.com",
      imapPassword: "163-auth-code",
      imapMailbox: "INBOX",
      imapAddress: "robot@163.com",
      imapCheckpoint: undefined,
      smtpHost: "smtp.163.com",
      smtpPort: "465",
      smtpSecure: "true",
      smtpUsername: "robot@163.com",
      smtpPassword: "163-auth-code",
      smtpFrom: "robot@163.com",
      echoText: "hello world",
      expectedFrom: undefined
    });
  });

  it("picks the latest real inbound candidate by body text and optional sender", () => {
    const selected = pickLatestEchoCandidate(
      [
        {
          uid: "1",
          from: [{ email: "older@example.com" }],
          to: [{ email: "robot@qq.com" }],
          text: "hello world"
        },
        {
          uid: "2",
          from: [{ email: "sender@example.com" }],
          to: [{ email: "robot@qq.com" }],
          text: "hello   world"
        }
      ],
      {
        mailboxAddress: "robot@qq.com",
        echoText: "hello world",
        expectedFrom: "sender@example.com"
      }
    );

    expect(selected?.uid).toBe("2");
  });

  (hasLiveImapSmtpEnv ? it.each(liveImapSmtpEnvs) : it.skip.each([] as LiveImapSmtpEnv[]))(
    "T23: fetches a real inbound IMAP message and echoes it back through real SMTP for $providerLabel",
    async (env) => {
      const mailboxSnapshot = await readLiveMailboxSnapshot(env);
      const recentCheckpoint =
        typeof mailboxSnapshot.uidNext === "number" && Number.isFinite(mailboxSnapshot.uidNext)
          ? String(Math.max(0, mailboxSnapshot.uidNext - 25))
          : undefined;
      let imapBatch = await fetchLiveImapBatch(env, env.imapCheckpoint ?? recentCheckpoint);
      if (
        !env.imapCheckpoint &&
        recentCheckpoint &&
        imapBatch.messages.length === 0
      ) {
        imapBatch = await fetchLiveImapBatch(env, undefined);
      }

      expect(imapBatch.done).toBe(true);
      expect(Array.isArray(imapBatch.messages)).toBe(true);
      expect(imapBatch.checkpointMetadata?.uidValidity ?? mailboxSnapshot.uidValidity).toBeTruthy();

      const inbound = pickLatestEchoCandidate(imapBatch.messages, {
        mailboxAddress: env.imapAddress,
        echoText: env.echoText,
        expectedFrom: env.expectedFrom
      });
      if (!inbound) {
        throw new Error(
          `live ${env.providerLabel} smoke requires a fresh inbound message to ${env.imapAddress} with body exactly "${env.echoText}"${
            env.expectedFrom ? ` from ${env.expectedFrom}` : ""
          }`
        );
      }

      const senderAddress = inbound.from?.[0]?.email?.trim();
      if (!senderAddress) {
        throw new Error("live IMAP echo smoke requires the matched inbound message to have a sender address");
      }

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-live-provider-"));
      tempDirs.push(tempDir);
      const config = loadConfig({
        MAILCLAW_STATE_DIR: tempDir,
        MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
        MAILCLAW_FEATURE_MAIL_INGEST: "true",
        MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true"
      });
      const handle = initializeDatabase(config);
      const runtime = createMailSidecarRuntime({
        db: handle.db,
        config
      });

      upsertMailAccount(handle.db, {
        accountId: "acct-live-imap",
        provider: "imap",
        emailAddress: env.imapAddress,
        status: "active",
        settings: {
          imap: {
            host: env.imapHost,
            port: Number.parseInt(env.imapPort, 10),
            secure: env.imapSecure === "true",
            username: env.imapUsername,
            password: env.imapPassword,
            mailbox: env.imapMailbox
          },
          smtp: {
            host: env.smtpHost,
            port: Number.parseInt(env.smtpPort, 10),
            secure: env.smtpSecure === "true",
            username: env.smtpUsername,
            password: env.smtpPassword,
            from: env.smtpFrom
          },
          ...(env.imapCheckpoint
            ? {
                watch: {
                  checkpoint: env.imapCheckpoint
                }
              }
            : {})
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      const ingested = await runtime.ingest({
        accountId: "acct-live-imap",
        mailboxAddress: env.imapAddress,
        envelope: mapImapMessageToEnvelope(inbound),
        processImmediately: true
      });
      expect(ingested.processed?.status).toBe("completed");
      expect(ingested.processed?.outbox).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "final",
            to: [senderAddress],
            headers: expect.objectContaining({
              "In-Reply-To": inbound.messageId,
              References: inbound.messageId
            })
          })
        ])
      );

      const replayBeforeDelivery = runtime.replay(ingested.ingested.roomKey);
      const finalBeforeDelivery = replayBeforeDelivery.outbox.find((entry) => entry.kind === "final");
      expect(finalBeforeDelivery).toBeTruthy();
      expect(normalizeEchoText(finalBeforeDelivery?.textBody)).toBe(normalizeEchoText(env.echoText));

      const delivered = await runtime.deliverOutbox();
      const replay = runtime.replay(ingested.ingested.roomKey);
      const finalOutbox = replay.outbox.find((entry) => entry.kind === "final");

      expect(delivered).toEqual({
        sent: 1,
        failed: 0
      });
      expect(finalOutbox).toMatchObject({
        kind: "final",
        status: "sent",
        to: [senderAddress]
      });
      expect(normalizeEchoText(finalOutbox?.textBody)).toBe(normalizeEchoText(env.echoText));
      expect(replay.outboxAttempts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: "sent",
            providerMessageId: expect.any(String)
          })
        ])
      );

      handle.close();
    },
    60_000
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
