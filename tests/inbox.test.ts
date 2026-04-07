import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import { ingestIncomingMail } from "../src/orchestration/service.js";
import { initializeDatabase } from "../src/storage/db.js";
import { upsertMailAccount } from "../src/storage/repositories/mail-accounts.js";
import { insertMailAttachment } from "../src/storage/repositories/mail-attachments.js";
import { insertMailMessage } from "../src/storage/repositories/mail-messages.js";
import { upsertMailThread } from "../src/storage/repositories/mail-threads.js";
import { saveThreadRoom } from "../src/storage/repositories/thread-rooms.js";
import { enqueueRoomJob } from "../src/queue/thread-queue.js";
import { buildRoomSessionKey } from "../src/threading/session-key.js";
import { createFixedClock } from "./helpers/fixed-clock.js";
import { createMailLab } from "./helpers/mail-lab.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createFixture(configOverrides: Record<string, string> = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-inbox-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
    MAILCLAW_FEATURE_MAIL_INGEST: "true",
    ...configOverrides
  });
  const handle = initializeDatabase(config);
  const runtime = createMailSidecarRuntime({
    db: handle.db,
    config
  });

  return {
    config,
    handle,
    runtime
  };
}

function seedRoom(input: {
  db: ReturnType<typeof initializeDatabase>["db"];
  accountId: string;
  stableThreadId: string;
  revision: number;
  frontAgentAddress: string;
  publicAgentAddresses?: string[];
  collaboratorAgentAddresses?: string[];
  state?: "idle" | "queued" | "running" | "waiting_workers" | "replying" | "handoff" | "done" | "failed";
  subject: string;
  textBody: string;
  receivedAt: string;
}) {
  const roomKey = buildRoomSessionKey(input.accountId, input.stableThreadId);
  saveThreadRoom(input.db, {
    roomKey,
    accountId: input.accountId,
    stableThreadId: input.stableThreadId,
    parentSessionKey: roomKey,
    frontAgentAddress: input.frontAgentAddress,
    publicAgentAddresses: input.publicAgentAddresses,
    collaboratorAgentAddresses: input.collaboratorAgentAddresses,
    state: input.state ?? "queued",
    revision: input.revision,
    lastInboundSeq: input.revision,
    lastOutboundSeq: 0
  });
  upsertMailThread(input.db, {
    stableThreadId: input.stableThreadId,
    accountId: input.accountId,
    normalizedSubject: input.subject.toLowerCase(),
    participantFingerprint: "sender@example.com|assistant@ai.example.com",
    createdAt: input.receivedAt,
    lastMessageAt: input.receivedAt
  });
  insertMailMessage(input.db, {
    dedupeKey: `${input.stableThreadId}-message-${input.revision}`,
    accountId: input.accountId,
    stableThreadId: input.stableThreadId,
    internetMessageId: `<${input.stableThreadId}-${input.revision}@example.com>`,
    references: [],
    normalizedSubject: input.subject.toLowerCase(),
    rawSubject: input.subject,
    participantFingerprint: "sender@example.com|assistant@ai.example.com",
    textBody: input.textBody,
    from: "sender@example.com",
    to: [input.frontAgentAddress],
    receivedAt: input.receivedAt,
    createdAt: input.receivedAt,
    mailboxAddress: input.frontAgentAddress
  });

  return roomKey;
}

describe("public agent inbox", () => {
  it("projects one inbox item per room rather than per message", () => {
    const fixture = createFixture();
    const roomKey = seedRoom({
      db: fixture.handle.db,
      accountId: "acct-1",
      stableThreadId: "thread-a",
      revision: 2,
      frontAgentAddress: "assistant@ai.example.com",
      subject: "Customer follow-up",
      textBody: "Please confirm the update.",
      receivedAt: "2026-03-26T04:00:00.000Z"
    });
    upsertMailThread(fixture.handle.db, {
      stableThreadId: "thread-a",
      accountId: "acct-1",
      normalizedSubject: "customer follow-up",
      participantFingerprint: "sender@example.com|assistant@ai.example.com",
      createdAt: "2026-03-26T04:00:00.000Z",
      lastMessageAt: "2026-03-26T04:01:00.000Z"
    });
    insertMailMessage(fixture.handle.db, {
      dedupeKey: "thread-a-message-extra",
      accountId: "acct-1",
    stableThreadId: "thread-a",
    internetMessageId: "<thread-a-extra@example.com>",
    inReplyTo: "<thread-a-2@example.com>",
    references: ["<thread-a-2@example.com>"],
      normalizedSubject: "customer follow-up",
      rawSubject: "Customer follow-up",
      participantFingerprint: "sender@example.com|assistant@ai.example.com",
      textBody: "Another follow-up in the same room.",
      from: "sender@example.com",
      to: ["assistant@ai.example.com"],
      receivedAt: "2026-03-26T04:01:00.000Z",
      createdAt: "2026-03-26T04:01:00.000Z",
      mailboxAddress: "assistant@ai.example.com"
    });

    const projected = fixture.runtime.projectPublicAgentInbox({
      accountId: "acct-1",
      agentId: "assistant@ai.example.com",
      activeRoomLimit: 2,
      ackSlaSeconds: 30,
      burstCoalesceSeconds: 60,
      now: "2026-03-26T04:01:10.000Z"
    });

    expect(projected.items).toHaveLength(1);
    expect(projected.items[0]).toMatchObject({
      roomKey,
      latestRevision: 2,
      unreadCount: 2,
      state: "new"
    });

    fixture.handle.close();
  });

  it("schedules only up to the inbox activeRoomLimit", () => {
    const fixture = createFixture();
    const urgentRoom = seedRoom({
      db: fixture.handle.db,
      accountId: "acct-1",
      stableThreadId: "thread-urgent",
      revision: 1,
      frontAgentAddress: "assistant@ai.example.com",
      subject: "URGENT: customer outage",
      textBody: "ASAP, we need a response.",
      receivedAt: "2026-03-26T04:10:00.000Z"
    });
    const normalRoom = seedRoom({
      db: fixture.handle.db,
      accountId: "acct-1",
      stableThreadId: "thread-normal",
      revision: 1,
      frontAgentAddress: "assistant@ai.example.com",
      subject: "Question about pricing",
      textBody: "Can you clarify the latest quote?",
      receivedAt: "2026-03-26T04:11:00.000Z"
    });
    enqueueRoomJob(fixture.handle.db, {
      jobId: "job-urgent",
      roomKey: urgentRoom,
      revision: 1,
      inboundSeq: 1,
      messageDedupeKey: "thread-urgent-message-1",
      priority: 100,
      createdAt: "2026-03-26T04:10:01.000Z"
    });
    enqueueRoomJob(fixture.handle.db, {
      jobId: "job-normal",
      roomKey: normalRoom,
      revision: 1,
      inboundSeq: 1,
      messageDedupeKey: "thread-normal-message-1",
      priority: 100,
      createdAt: "2026-03-26T04:11:01.000Z"
    });

    fixture.runtime.ensurePublicAgentInbox({
      accountId: "acct-1",
      agentId: "assistant@ai.example.com",
      activeRoomLimit: 1,
      ackSlaSeconds: 30,
      burstCoalesceSeconds: 60,
      now: "2026-03-26T04:12:00.000Z"
    });
    const scheduled = fixture.runtime.schedulePublicAgentInbox({
      accountId: "acct-1",
      agentId: "assistant@ai.example.com",
      now: "2026-03-26T04:12:00.000Z"
    });

    expect(scheduled.scheduled).toHaveLength(1);
    expect(scheduled.scheduled[0]?.roomKey).toBe(urgentRoom);
    expect(scheduled.deferred.some((item) => item.roomKey === normalRoom)).toBe(true);
    expect(scheduled.scheduled[0]?.state).toBe("active");
    expect(scheduled.deferred.find((item) => item.roomKey === normalRoom)?.state).toBe("triaged");

    fixture.handle.close();
  });

  it("refreshes the public inbox projection after ingest", async () => {
    const fixture = createFixture({
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false"
    });

    await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: "assistant@ai.example.com",
      processImmediately: false,
      envelope: {
        providerMessageId: "provider-1",
        messageId: "<inbox-ingest@example.com>",
        subject: "Please review this contract",
        from: {
          email: "sender@example.com"
        },
        to: [{ email: "assistant@ai.example.com" }],
        text: "Please review this contract and reply today.",
        headers: [
          {
            name: "Message-ID",
            value: "<inbox-ingest@example.com>"
          }
        ]
      }
    });

    const inboxes = fixture.runtime.listPublicAgentInboxes("acct-1");
    expect(inboxes).toHaveLength(1);
    const items = fixture.runtime.listInboxItems(inboxes[0]!.inboxId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      agentId: "assistant@ai.example.com",
      state: "new"
    });

    fixture.handle.close();
  });

  it("refreshes collaborator inbox projections after ingest when routing marks visible public collaborators", async () => {
    const fixture = createFixture({
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false"
    });
    upsertMailAccount(fixture.handle.db, {
      accountId: "acct-1",
      provider: "imap",
      emailAddress: "assistant@ai.example.com",
      status: "active",
      settings: {
        routing: {
          publicAliases: ["research@ai.example.com"]
        }
      },
      createdAt: "2026-03-26T04:00:00.000Z",
      updatedAt: "2026-03-26T04:00:00.000Z"
    });

    await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: "assistant@ai.example.com",
      processImmediately: false,
      envelope: {
        providerMessageId: "provider-collab-1",
        messageId: "<inbox-collab-ingest@example.com>",
        subject: "Please coordinate with research",
        from: {
          email: "sender@example.com"
        },
        to: [{ email: "assistant@ai.example.com" }],
        cc: [{ email: "research@ai.example.com" }],
        text: "Loop research in on this thread.",
        headers: [
          {
            name: "Message-ID",
            value: "<inbox-collab-ingest@example.com>"
          }
        ]
      }
    });

    const inboxes = fixture.runtime.listPublicAgentInboxes("acct-1");
    expect(inboxes.map((inbox) => inbox.agentId).sort()).toEqual([
      "assistant@ai.example.com",
      "research@ai.example.com"
    ]);

    const collaboratorInbox = inboxes.find((inbox) => inbox.agentId === "research@ai.example.com");
    expect(collaboratorInbox).toBeTruthy();
    expect(fixture.runtime.listInboxItems(collaboratorInbox!.inboxId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "research@ai.example.com",
          participantRole: "collaborator"
        })
      ])
    );

    fixture.handle.close();
  });

  it("projects collaborator-visible rooms into collaborator inboxes without changing front ownership", () => {
    const fixture = createFixture();
    const roomKey = seedRoom({
      db: fixture.handle.db,
      accountId: "acct-1",
      stableThreadId: "thread-collab",
      revision: 1,
      frontAgentAddress: "assistant@ai.example.com",
      publicAgentAddresses: ["assistant@ai.example.com", "research@ai.example.com"],
      collaboratorAgentAddresses: ["research@ai.example.com"],
      subject: "Collaborator visibility",
      textBody: "Research should see this room too.",
      receivedAt: "2026-03-26T04:05:00.000Z"
    });

    const frontInbox = fixture.runtime.projectPublicAgentInbox({
      accountId: "acct-1",
      agentId: "assistant@ai.example.com",
      activeRoomLimit: 2,
      ackSlaSeconds: 30,
      burstCoalesceSeconds: 60,
      now: "2026-03-26T04:05:10.000Z"
    });
    const collaboratorInbox = fixture.runtime.projectPublicAgentInbox({
      accountId: "acct-1",
      agentId: "research@ai.example.com",
      activeRoomLimit: 2,
      ackSlaSeconds: 30,
      burstCoalesceSeconds: 60,
      now: "2026-03-26T04:05:10.000Z"
    });

    expect(frontInbox.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey,
          participantRole: "front",
          agentId: "assistant@ai.example.com"
        })
      ])
    );
    expect(collaboratorInbox.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey,
          participantRole: "collaborator",
          agentId: "research@ai.example.com"
        })
      ])
    );

    fixture.handle.close();
  });

  it("defers non-critical rooms inside the burst coalescing window", () => {
    const fixture = createFixture();
    const roomKey = seedRoom({
      db: fixture.handle.db,
      accountId: "acct-1",
      stableThreadId: "thread-burst",
      revision: 2,
      frontAgentAddress: "assistant@ai.example.com",
      subject: "Follow-up on contract",
      textBody: "A second follow-up arrived quickly.",
      receivedAt: "2026-03-26T04:20:30.000Z"
    });
    fixture.runtime.ensurePublicAgentInbox({
      accountId: "acct-1",
      agentId: "assistant@ai.example.com",
      activeRoomLimit: 1,
      ackSlaSeconds: 30,
      burstCoalesceSeconds: 60,
      now: "2026-03-26T04:21:00.000Z"
    });

    const scheduled = fixture.runtime.schedulePublicAgentInbox({
      accountId: "acct-1",
      agentId: "assistant@ai.example.com",
      now: "2026-03-26T04:21:00.000Z"
    });

    expect(scheduled.scheduled).toHaveLength(0);
    expect(scheduled.deferred).toHaveLength(1);
    expect(scheduled.deferred[0]).toMatchObject({
      roomKey,
      state: "new",
      blockedReason: "coalescing"
    });

    fixture.handle.close();
  });

  it("keeps a three-message burst deferred until the coalescing window expires", async () => {
    const fixture = createFixture({
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "false"
    });
    const clock = createFixedClock("2026-03-26T04:20:00.000Z");
    const lab = createMailLab("burst-room");

    const firstEnvelope = lab.newMail({
      providerMessageId: "burst-provider-1",
      subject: "Contract follow-up",
      text: "First reply in the burst window.",
      date: clock.now()
    });
    ingestIncomingMail(
      {
        db: fixture.handle.db,
        config: fixture.config
      },
      {
        accountId: "acct-1",
        mailboxAddress: lab.addresses.assistant,
        envelope: firstEnvelope
      }
    );
    const secondEnvelope = lab.reply(firstEnvelope, {
      providerMessageId: "burst-provider-2",
      text: "Second reply before the coalescing window expires.",
      date: clock.advanceSeconds(20)
    });
    ingestIncomingMail(
      {
        db: fixture.handle.db,
        config: fixture.config
      },
      {
        accountId: "acct-1",
        mailboxAddress: lab.addresses.assistant,
        envelope: secondEnvelope
      }
    );
    const thirdEnvelope = lab.reply(secondEnvelope, {
      providerMessageId: "burst-provider-3",
      text: "Third and latest reply in the same burst.",
      date: clock.advanceSeconds(20)
    });
    ingestIncomingMail(
      {
        db: fixture.handle.db,
        config: fixture.config
      },
      {
        accountId: "acct-1",
        mailboxAddress: lab.addresses.assistant,
        envelope: thirdEnvelope
      }
    );

    const roomKey = fixture.runtime.listRooms()[0]?.roomKey;
    if (!roomKey) {
      throw new Error("expected a room to exist after burst ingest");
    }

    const scheduled = fixture.runtime.schedulePublicAgentInbox({
      accountId: "acct-1",
      agentId: lab.addresses.assistant,
      now: clock.peek()
    });
    const inboxItems = fixture.runtime.listInboxItems(scheduled.inbox!.inboxId);

    expect(scheduled.scheduled).toHaveLength(0);
    expect(scheduled.deferred).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey,
          latestRevision: 3,
          unreadCount: 3,
          blockedReason: "coalescing"
        })
      ])
    );
    expect(inboxItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey,
          latestRevision: 3,
          unreadCount: 3,
          state: "new"
        })
      ])
    );

    fixture.handle.close();
  });

  it("emits one replay-visible ACK from the inbox scheduler per room revision", () => {
    const fixture = createFixture();
    const roomKey = seedRoom({
      db: fixture.handle.db,
      accountId: "acct-1",
      stableThreadId: "thread-ack",
      revision: 1,
      frontAgentAddress: "assistant@ai.example.com",
      subject: "Need confirmation",
      textBody: "Please let me know when this is in progress.",
      receivedAt: "2026-03-26T04:00:00.000Z"
    });
    fixture.runtime.ensurePublicAgentInbox({
      accountId: "acct-1",
      agentId: "assistant@ai.example.com",
      activeRoomLimit: 1,
      ackSlaSeconds: 30,
      burstCoalesceSeconds: 0,
      now: "2026-03-26T04:01:00.000Z"
    });

    const firstSchedule = fixture.runtime.schedulePublicAgentInbox({
      accountId: "acct-1",
      agentId: "assistant@ai.example.com",
      now: "2026-03-26T04:01:00.000Z"
    });
    const firstReplay = fixture.runtime.replay(roomKey);

    expect(firstSchedule.needsAckNow).toHaveLength(0);
    expect(firstReplay.outbox).toHaveLength(1);
    expect(firstReplay.outboxIntents).toHaveLength(1);
    expect(firstReplay.outbox[0]).toMatchObject({
      outboxId: `ack:${roomKey}:1`,
      kind: "ack",
      status: "queued"
    });
    expect(firstReplay.ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          revision: 1,
          type: "mail.ack_sent",
          payload: expect.objectContaining({
            outboxId: `ack:${roomKey}:1`,
            source: "inbox_scheduler"
          })
        })
      ])
    );

    const secondSchedule = fixture.runtime.schedulePublicAgentInbox({
      accountId: "acct-1",
      agentId: "assistant@ai.example.com",
      now: "2026-03-26T04:02:00.000Z"
    });
    const secondReplay = fixture.runtime.replay(roomKey);

    expect(secondSchedule.needsAckNow).toHaveLength(0);
    expect(secondReplay.outbox).toHaveLength(1);

    fixture.handle.close();
  });

  it("keeps collaborator inbox items visible but non-owning during scheduling", () => {
    const fixture = createFixture();
    const roomKey = seedRoom({
      db: fixture.handle.db,
      accountId: "acct-1",
      stableThreadId: "thread-collab-schedule",
      revision: 1,
      frontAgentAddress: "assistant@ai.example.com",
      publicAgentAddresses: ["assistant@ai.example.com", "research@ai.example.com"],
      collaboratorAgentAddresses: ["research@ai.example.com"],
      subject: "Collaborator schedule",
      textBody: "Research can see this, but should not own it.",
      receivedAt: "2026-03-26T04:06:00.000Z"
    });
    fixture.runtime.ensurePublicAgentInbox({
      accountId: "acct-1",
      agentId: "research@ai.example.com",
      activeRoomLimit: 1,
      ackSlaSeconds: 30,
      burstCoalesceSeconds: 0,
      now: "2026-03-26T04:07:00.000Z"
    });

    const scheduled = fixture.runtime.schedulePublicAgentInbox({
      accountId: "acct-1",
      agentId: "research@ai.example.com",
      now: "2026-03-26T04:07:00.000Z"
    });
    const replay = fixture.runtime.replay(roomKey);

    expect(scheduled.scheduled).toHaveLength(0);
    expect(scheduled.deferred).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey,
          participantRole: "collaborator",
          state: "triaged"
        })
      ])
    );
    expect(replay.outbox).toHaveLength(0);

    fixture.handle.close();
  });

  it("lets delegated rooms release active-room slots for other inbox work", () => {
    const fixture = createFixture();
    const activeRoom = seedRoom({
      db: fixture.handle.db,
      accountId: "acct-1",
      stableThreadId: "thread-active",
      revision: 1,
      frontAgentAddress: "assistant@ai.example.com",
      subject: "URGENT: customer outage",
      textBody: "Need a direct reply ASAP.",
      receivedAt: "2026-03-26T04:10:00.000Z"
    });
    const delegatedRoom = seedRoom({
      db: fixture.handle.db,
      accountId: "acct-1",
      stableThreadId: "thread-delegated",
      revision: 1,
      frontAgentAddress: "assistant@ai.example.com",
      subject: "Please review the attached contract",
      textBody: "This needs attachment review before we respond.",
      receivedAt: "2026-03-26T04:10:30.000Z"
    });
    const deferredRoom = seedRoom({
      db: fixture.handle.db,
      accountId: "acct-1",
      stableThreadId: "thread-deferred",
      revision: 1,
      frontAgentAddress: "assistant@ai.example.com",
      subject: "Pricing question",
      textBody: "Can you clarify the quote?",
      receivedAt: "2026-03-26T04:11:00.000Z"
    });
    insertMailAttachment(fixture.handle.db, {
      roomKey: delegatedRoom,
      messageDedupeKey: "thread-delegated-message-1",
      filename: "contract.pdf",
      mimeType: "application/pdf",
      createdAt: "2026-03-26T04:10:31.000Z"
    });

    fixture.runtime.ensurePublicAgentInbox({
      accountId: "acct-1",
      agentId: "assistant@ai.example.com",
      activeRoomLimit: 1,
      ackSlaSeconds: 300,
      burstCoalesceSeconds: 0,
      now: "2026-03-26T04:12:00.000Z"
    });

    const scheduled = fixture.runtime.schedulePublicAgentInbox({
      accountId: "acct-1",
      agentId: "assistant@ai.example.com",
      now: "2026-03-26T04:12:00.000Z"
    });

    expect(scheduled.scheduled.filter((item) => item.state === "active")).toHaveLength(1);
    expect(scheduled.scheduled.find((item) => item.roomKey === activeRoom)?.state).toBe("active");
    expect(scheduled.scheduled.find((item) => item.roomKey === delegatedRoom)?.state).toBe("delegated");
    expect(scheduled.deferred.find((item) => item.roomKey === deferredRoom)?.state).toBe("triaged");

    fixture.handle.close();
  });
});
