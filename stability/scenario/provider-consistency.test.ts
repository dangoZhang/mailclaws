import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config.js";
import { createMailSidecarRuntime } from "../../src/orchestration/runtime.js";
import {
  mapGmailMessageToEnvelope,
  type GmailMessage
} from "../../src/providers/gmail.js";
import {
  mapImapMessageToEnvelope,
  type ImapFetchedMessage
} from "../../src/providers/imap.js";
import { initializeDatabase } from "../../src/storage/db.js";
import { createMailLab, type MailLabEnvelope } from "../../tests/helpers/mail-lab.js";
import { collectRoomObservability } from "../../tests/helpers/runtime-observability.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("stability: cross-provider consistency", () => {
  it("keeps room continuity and attachment truth identical across Gmail, IMAP, and raw RFC822 ingress", async () => {
    const lab = createMailLab("stability-provider");
    const root = lab.newMail({
      providerMessageId: "provider-root",
      threadId: "provider-thread-1",
      messageId: "<provider-root@example.test>",
      subject: "Provider neutral continuity",
      text: "Root mail with one attachment.",
      date: "2026-03-28T00:00:00.000Z",
      attachments: [
        {
          filename: "brief.txt",
          mimeType: "text/plain",
          size: 18,
          data: "provider-brief-v1"
        }
      ]
    });
    const reply = lab.reply(root, {
      providerMessageId: "provider-reply",
      threadId: "provider-thread-1",
      messageId: "<provider-reply@example.test>",
      from: root.from,
      to: root.to,
      text: "Reply mail continuing the same room.",
      date: "2026-03-28T00:01:00.000Z"
    });

    const gmail = await runMappedFixture({
      provider: "gmail",
      mailboxAddress: lab.addresses.assistant,
      envelopes: [
        mapGmailMessageToEnvelope(toGmailMessage(root, lab.addresses.assistant)),
        mapGmailMessageToEnvelope(toGmailMessage(reply, lab.addresses.assistant))
      ]
    });
    const imap = await runMappedFixture({
      provider: "imap",
      mailboxAddress: lab.addresses.assistant,
      envelopes: [
        mapImapMessageToEnvelope(toImapMessage(root, 101)),
        mapImapMessageToEnvelope(toImapMessage(reply, 102))
      ]
    });
    const raw = await runRawFixture({
      provider: "forward",
      mailboxAddress: lab.addresses.assistant,
      messages: [root, reply]
    });

    const baseline = summarizeRoomShape(gmail.snapshot);

    expect(summarizeRoomShape(imap.snapshot)).toEqual(baseline);
    expect(summarizeRoomShape(raw.snapshot)).toEqual(baseline);

    expect(gmail.roomKey).toBe(imap.roomKey);
    expect(gmail.roomKey).toBe(raw.roomKey);
  });
});

async function runMappedFixture(input: {
  provider: string;
  mailboxAddress: string;
  envelopes: Array<Parameters<ReturnType<typeof createMailSidecarRuntime>["ingest"]>[0]["envelope"]>;
}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `mailclaw-stability-${input.provider}-`));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
    MAILCLAW_FEATURE_MAIL_INGEST: "true",
    MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false"
  });
  const handle = initializeDatabase(config);
  const runtime = createMailSidecarRuntime({
    db: handle.db,
    config
  });
  runtime.upsertAccount({
    accountId: "acct-stability",
    provider: input.provider,
    emailAddress: input.mailboxAddress,
    status: "active",
    settings: {}
  });

  let roomKey = "";
  for (const envelope of input.envelopes) {
    const ingested = await runtime.ingest({
      accountId: "acct-stability",
      mailboxAddress: input.mailboxAddress,
      envelope,
      processImmediately: false
    });
    roomKey = ingested.ingested.roomKey;
  }

  const snapshot = collectRoomObservability(runtime, roomKey);
  handle.close();
  return {
    roomKey,
    snapshot
  };
}

async function runRawFixture(input: {
  provider: string;
  mailboxAddress: string;
  messages: MailLabEnvelope[];
}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `mailclaw-stability-${input.provider}-`));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
    MAILCLAW_FEATURE_MAIL_INGEST: "true",
    MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false"
  });
  const handle = initializeDatabase(config);
  const runtime = createMailSidecarRuntime({
    db: handle.db,
    config
  });
  runtime.upsertAccount({
    accountId: "acct-stability",
    provider: input.provider,
    emailAddress: input.mailboxAddress,
    status: "active",
    settings: {}
  });

  let roomKey = "";
  for (const message of input.messages) {
    const ingested = await runtime.ingestRaw({
      accountId: "acct-stability",
      mailboxAddress: input.mailboxAddress,
      rawMime: message.rawMime,
      providerMessageId: message.providerMessageId,
      envelopeRecipients: message.envelopeRecipients,
      processImmediately: false
    });
    roomKey = ingested.ingested.roomKey;
  }

  const snapshot = collectRoomObservability(runtime, roomKey);
  handle.close();
  return {
    roomKey,
    snapshot
  };
}

function toGmailMessage(mail: MailLabEnvelope, mailboxAddress: string): GmailMessage {
  return {
    id: mail.providerMessageId,
    threadId: mail.threadId,
    internalDate: String(Date.parse(mail.date ?? "2026-03-28T00:00:00.000Z")),
    payload: {
      headers: ensureDeliveredToHeader(mail.headers, mailboxAddress)
    },
    textBody: mail.text,
    attachments: (mail.attachments ?? []).map((attachment) => ({
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      contentId: attachment.contentId,
      disposition: attachment.disposition,
      data: attachment.data
    })),
    raw: mail.rawMime
  };
}

function toImapMessage(mail: MailLabEnvelope, uid: number): ImapFetchedMessage {
  return {
    uid,
    threadId: mail.threadId,
    envelopeRecipients: mail.envelopeRecipients,
    subject: mail.subject,
    messageId: mail.messageId,
    from: mail.from ? [mail.from] : undefined,
    to: mail.to,
    cc: mail.cc,
    bcc: mail.bcc,
    replyTo: mail.replyTo,
    date: mail.date,
    headers: toImapHeaders(mail.headers),
    text: mail.text,
    html: mail.html,
    attachments: (mail.attachments ?? []).map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.mimeType,
      size: attachment.size,
      contentId: attachment.contentId,
      disposition: attachment.disposition,
      data: attachment.data
    })),
    raw: mail.rawMime
  };
}

function ensureDeliveredToHeader(
  headers: MailLabEnvelope["headers"],
  mailboxAddress: string
) {
  if (headers.some((header) => header.name.toLowerCase() === "delivered-to")) {
    return headers;
  }

  return [...headers, { name: "Delivered-To", value: mailboxAddress }];
}

function toImapHeaders(headers: MailLabEnvelope["headers"]) {
  const flattened = new Map<string, string | string[]>();

  for (const header of headers) {
    const existing = flattened.get(header.name);
    if (existing === undefined) {
      flattened.set(header.name, header.value);
      continue;
    }

    flattened.set(
      header.name,
      Array.isArray(existing) ? [...existing, header.value] : [existing, header.value]
    );
  }

  return Object.fromEntries(flattened);
}

function summarizeRoomShape(snapshot: ReturnType<typeof collectRoomObservability>) {
  return {
    roomKey: snapshot.room?.roomKey,
    stableThreadId: snapshot.room?.stableThreadId,
    revision: snapshot.roomRevision,
    lastInboundSeq: snapshot.room?.lastInboundSeq,
    lastOutboundSeq: snapshot.room?.lastOutboundSeq,
    ledgerTypes: snapshot.roomEvents.map((event) => event.type),
    attachmentShape: snapshot.attachments.map((attachment) => ({
      filename: attachment.filename ?? null,
      mimeType: attachment.mimeType ?? null,
      contentSha256: attachment.contentSha256 ?? null
    }))
  };
}
