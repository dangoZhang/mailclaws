import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import type { VirtualMailbox } from "../src/core/types.js";
import {
  consumeMailboxDelivery,
  markVirtualMessageStale,
  supersedeVirtualThread,
  vetoVirtualMessage
} from "../src/core/virtual-mail.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import { initializeDatabase } from "../src/storage/db.js";
import { saveThreadRoom } from "../src/storage/repositories/thread-rooms.js";
import { buildRoomSessionKey } from "../src/threading/session-key.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-virtual-mail-"));
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
  const roomKey = buildRoomSessionKey("acct-1", "thread-virtual");

  saveThreadRoom(handle.db, {
    roomKey,
    accountId: "acct-1",
    stableThreadId: "thread-virtual",
    parentSessionKey: roomKey,
    state: "idle",
    revision: 3,
    lastInboundSeq: 1,
    lastOutboundSeq: 0
  });

  const baseMailbox = {
    accountId: "acct-1",
    active: true,
    createdAt: "2026-03-25T10:00:00.000Z",
    updatedAt: "2026-03-25T10:00:00.000Z"
  };
  const mailboxes: VirtualMailbox[] = [
    {
      ...baseMailbox,
      mailboxId: "internal:assistant:orchestrator",
      principalId: "principal:assistant",
      kind: "internal_role",
      role: "orchestrator"
    },
    {
      ...baseMailbox,
      mailboxId: "internal:assistant:researcher",
      principalId: "principal:assistant",
      kind: "internal_role",
      role: "researcher"
    },
    {
      ...baseMailbox,
      mailboxId: "internal:assistant:reviewer",
      principalId: "principal:assistant",
      kind: "governance",
      role: "reviewer"
    },
    {
      ...baseMailbox,
      mailboxId: "human:ops",
      principalId: "principal:ops",
      kind: "human"
    }
  ];
  for (const mailbox of mailboxes) {
    runtime.upsertVirtualMailbox(mailbox);
  }

  return {
    config,
    handle,
    runtime,
    roomKey
  };
}

describe("virtual mail plane", () => {
  it("submits and replies through single-parent virtual work threads", () => {
    const fixture = createFixture();

    const task = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Attachment research",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher"],
      ccMailboxIds: ["internal:assistant:reviewer"],
      kind: "task",
      visibility: "internal",
      subject: "Review the attachment evidence",
      bodyRef: "body://virtual/task-1",
      artifactRefs: ["artifact:att-1"],
      roomRevision: 3,
      inputsHash: "hash-task-1",
      createdAt: "2026-03-25T10:01:00.000Z"
    });

    expect(task.thread.kind).toBe("work");
    expect(task.message.parentMessageId).toBeUndefined();
    expect(task.message.inReplyTo).toEqual([]);
    expect(task.message.references).toEqual([]);
    expect(task.deliveries.map((delivery) => delivery.mailboxId)).toEqual([
      "internal:assistant:researcher",
      "internal:assistant:reviewer"
    ]);

    const claim = fixture.runtime.replyVirtualMessage(task.message.messageId, {
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:researcher",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "claim",
      visibility: "internal",
      bodyRef: "body://virtual/claim-1",
      artifactRefs: ["artifact:att-1"],
      roomRevision: 3,
      inputsHash: "hash-claim-1",
      createdAt: "2026-03-25T10:02:00.000Z"
    });

    expect(claim.thread.threadId).toBe(task.thread.threadId);
    expect(claim.message.parentMessageId).toBe(task.message.messageId);
    expect(claim.message.inReplyTo).toEqual([task.message.messageIdHeader]);
    expect(claim.message.references).toEqual([task.message.messageIdHeader]);

    const researcherView = fixture.runtime.projectMailboxView({
      roomKey: fixture.roomKey,
      mailboxId: "internal:assistant:researcher"
    });
    expect(researcherView).toHaveLength(1);
    expect(researcherView[0]?.message.kind).toBe("task");

    const orchestratorView = fixture.runtime.projectMailboxView({
      roomKey: fixture.roomKey,
      mailboxId: "internal:assistant:orchestrator"
    });
    expect(orchestratorView).toHaveLength(1);
    expect(orchestratorView[0]?.message.kind).toBe("claim");
    expect(orchestratorView[0]?.thread.threadId).toBe(task.thread.threadId);

    const replay = fixture.runtime.replay(fixture.roomKey);
    expect(replay.virtualThreads).toHaveLength(1);
    expect(replay.virtualMessages).toHaveLength(2);
    expect(replay.mailboxDeliveries).toHaveLength(3);
    expect(replay.ledger.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "virtual_mail.thread_created",
        "virtual_mail.message_submitted",
        "virtual_mail.message_delivered",
        "virtual_mail.message_replied"
      ])
    );

    fixture.handle.close();
  });

  it("leases mailbox deliveries and rebuilds projection state from the ledger", () => {
    const fixture = createFixture();

    const task = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Research queue",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher"],
      kind: "task",
      visibility: "internal",
      subject: "Find supporting evidence",
      bodyRef: "body://virtual/task-2",
      roomRevision: 3,
      inputsHash: "hash-task-2",
      createdAt: "2026-03-25T10:03:00.000Z"
    });

    const leased = fixture.runtime.consumeMailbox({
      mailboxId: "internal:assistant:researcher",
      consumerId: "research-worker-1",
      batchSize: 1,
      roomKey: fixture.roomKey,
      now: "2026-03-25T10:03:30.000Z",
      leaseDurationMs: 30_000
    });

    expect(leased).toHaveLength(1);
    expect(leased[0]?.status).toBe("leased");
    expect(leased[0]?.messageId).toBe(task.message.messageId);

    fixture.handle.db.prepare("DELETE FROM mailbox_deliveries WHERE room_key = ?;").run(fixture.roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_messages WHERE room_key = ?;").run(fixture.roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_threads WHERE room_key = ?;").run(fixture.roomKey);

    expect(fixture.runtime.replay(fixture.roomKey).virtualMessages).toHaveLength(0);

    const rebuilt = fixture.runtime.rebuildVirtualMailProjection(fixture.roomKey);
    expect(rebuilt).toMatchObject({
      roomKey: fixture.roomKey,
      threads: 1,
      messages: 1,
      deliveries: 1
    });

    const replay = fixture.runtime.replay(fixture.roomKey);
    expect(replay.virtualMessages).toHaveLength(1);
    expect(replay.mailboxDeliveries).toHaveLength(1);
    expect(replay.mailboxDeliveries[0]?.status).toBe("leased");
    expect(replay.mailboxDeliveries[0]?.leaseOwner).toBe("research-worker-1");
    expect(replay.ledger.map((event) => event.type)).toContain("virtual_mail.delivery_leased");

    fixture.handle.close();
  });

  it("preserves projection metadata and filters mailbox projections by origin kind", () => {
    const fixture = createFixture();

    const task = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Gateway projection",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher"],
      kind: "task",
      visibility: "internal",
      subject: "Project this task",
      bodyRef: "body://virtual/task-projection",
      roomRevision: 3,
      inputsHash: "hash-task-projection",
      createdAt: "2026-03-25T10:03:00.000Z"
    });

    fixture.runtime.replyVirtualMessage(task.message.messageId, {
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:researcher",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "claim",
      visibility: "internal",
      originKind: "gateway_chat",
      projectionMetadata: {
        origin: {
          kind: "gateway_chat",
          controlPlane: "openclaw",
          sessionKey: "session-worker-1",
          runId: "run-worker-1",
          frontAgentId: "research-agent",
          sourceMessageId: task.message.messageId
        }
      },
      bodyRef: "body://virtual/claim-projection",
      roomRevision: 3,
      inputsHash: "hash-claim-projection",
      createdAt: "2026-03-25T10:04:00.000Z"
    });

    const orchestratorGatewayView = fixture.runtime.projectMailboxView({
      roomKey: fixture.roomKey,
      mailboxId: "internal:assistant:orchestrator",
      originKinds: ["gateway_chat"]
    });
    expect(orchestratorGatewayView).toHaveLength(1);
    expect(orchestratorGatewayView[0]?.message.originKind).toBe("gateway_chat");
    expect(orchestratorGatewayView[0]?.message.projectionMetadata).toMatchObject({
      origin: {
        controlPlane: "openclaw",
        sessionKey: "session-worker-1",
        runId: "run-worker-1",
        frontAgentId: "research-agent"
      }
    });

    const orchestratorFeed = fixture.runtime.projectMailboxFeed({
      accountId: "acct-1",
      mailboxId: "internal:assistant:orchestrator",
      originKinds: ["gateway_chat"]
    });
    expect(orchestratorFeed).toHaveLength(1);
    expect(orchestratorFeed[0]?.message.originKind).toBe("gateway_chat");

    fixture.handle.db.prepare("DELETE FROM mailbox_deliveries WHERE room_key = ?;").run(fixture.roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_messages WHERE room_key = ?;").run(fixture.roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_threads WHERE room_key = ?;").run(fixture.roomKey);

    fixture.runtime.rebuildVirtualMailProjection(fixture.roomKey);

    const replay = fixture.runtime.replay(fixture.roomKey);
    expect(replay.gatewayProjectionTrace.messageIds).toHaveLength(1);
    expect(replay.gatewayProjectionTrace.sessionKeys).toEqual(["session-worker-1"]);
    expect(replay.gatewayProjectionTrace.runIds).toEqual(["run-worker-1"]);
    expect(replay.virtualMessages.find((message) => message.originKind === "gateway_chat")).toMatchObject({
      projectionMetadata: {
        origin: {
          controlPlane: "openclaw",
          sessionKey: "session-worker-1"
        }
      }
    });

    fixture.handle.close();
  });

  it("marks leased deliveries consumed and preserves status through ledger rebuild", () => {
    const fixture = createFixture();

    const task = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Consume queue",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher"],
      kind: "task",
      visibility: "internal",
      subject: "Consume this task",
      bodyRef: "body://virtual/task-consume",
      roomRevision: 3,
      inputsHash: "hash-task-consume",
      createdAt: "2026-03-25T10:04:00.000Z"
    });
    const leased = fixture.runtime.consumeMailbox({
      mailboxId: "internal:assistant:researcher",
      consumerId: "research-worker-2",
      batchSize: 1,
      roomKey: fixture.roomKey,
      now: "2026-03-25T10:04:30.000Z"
    });
    const lease = leased[0];
    if (!lease) {
      throw new Error("expected a leased delivery");
    }

    const consumed = consumeMailboxDelivery(fixture.handle.db, {
      deliveryId: lease.deliveryId,
      consumerId: "research-worker-2",
      consumedAt: "2026-03-25T10:04:45.000Z"
    });
    expect(consumed.status).toBe("consumed");
    expect(consumed.consumedAt).toBe("2026-03-25T10:04:45.000Z");
    expect(consumed.messageId).toBe(task.message.messageId);

    fixture.handle.db.prepare("DELETE FROM mailbox_deliveries WHERE room_key = ?;").run(fixture.roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_messages WHERE room_key = ?;").run(fixture.roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_threads WHERE room_key = ?;").run(fixture.roomKey);

    const rebuilt = fixture.runtime.rebuildVirtualMailProjection(fixture.roomKey);
    expect(rebuilt).toMatchObject({
      roomKey: fixture.roomKey,
      threads: 1,
      messages: 1,
      deliveries: 1
    });

    const replay = fixture.runtime.replay(fixture.roomKey);
    expect(replay.mailboxDeliveries[0]?.status).toBe("consumed");
    expect(replay.mailboxDeliveries[0]?.consumedAt).toBe("2026-03-25T10:04:45.000Z");
    expect(replay.ledger.map((event) => event.type)).toContain("virtual_mail.delivery_consumed");

    fixture.handle.close();
  });

  it("rejects invalid governance and private visibility routing", () => {
    const fixture = createFixture();

    expect(() =>
      fixture.runtime.submitVirtualMessage({
        roomKey: fixture.roomKey,
        threadKind: "work",
        topic: "Invalid governance route",
        fromPrincipalId: "principal:assistant",
        fromMailboxId: "internal:assistant:orchestrator",
        toMailboxIds: ["internal:assistant:researcher"],
        kind: "review",
        visibility: "governance",
        subject: "Governance review",
        bodyRef: "body://virtual/invalid-governance",
        roomRevision: 3,
        inputsHash: "hash-invalid-governance",
        createdAt: "2026-03-25T10:05:00.000Z"
      })
    ).toThrow(/governance virtual messages/);

    expect(() =>
      fixture.runtime.submitVirtualMessage({
        roomKey: fixture.roomKey,
        threadKind: "work",
        topic: "Invalid private route",
        fromPrincipalId: "principal:assistant",
        fromMailboxId: "internal:assistant:orchestrator",
        toMailboxIds: ["internal:assistant:researcher"],
        ccMailboxIds: ["human:ops"],
        kind: "question",
        visibility: "private",
        subject: "Private note",
        bodyRef: "body://virtual/invalid-private",
        roomRevision: 3,
        inputsHash: "hash-invalid-private",
        createdAt: "2026-03-25T10:05:01.000Z"
      })
    ).toThrow(/private virtual messages cannot include cc/);

    fixture.handle.close();
  });

  it("restricts governance and private visibility to authorized mailbox views and consumers", () => {
    const fixture = createFixture();

    const governance = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Governance queue",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:reviewer", "human:ops"],
      kind: "approval",
      visibility: "governance",
      subject: "Approval needed",
      bodyRef: "body://virtual/governance-1",
      roomRevision: 3,
      inputsHash: "hash-governance-1",
      createdAt: "2026-03-25T10:06:00.000Z"
    });

    const privateMessage = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadId: governance.thread.threadId,
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:reviewer",
      toMailboxIds: ["human:ops"],
      kind: "question",
      visibility: "private",
      subject: "Private ops follow-up",
      bodyRef: "body://virtual/private-1",
      roomRevision: 3,
      inputsHash: "hash-private-1",
      createdAt: "2026-03-25T10:06:30.000Z"
    });

    expect(
      fixture.runtime.projectMailboxView({
        roomKey: fixture.roomKey,
        mailboxId: "internal:assistant:reviewer"
      }).map((entry) => entry.message.kind)
    ).toEqual(["approval"]);

    expect(
      fixture.runtime.projectMailboxView({
        roomKey: fixture.roomKey,
        mailboxId: "human:ops"
      }).map((entry) => entry.message.kind)
    ).toEqual(["approval", "question"]);

    expect(
      fixture.runtime.consumeMailbox({
        mailboxId: "internal:assistant:researcher",
        consumerId: "research-worker-1",
        batchSize: 10,
        roomKey: fixture.roomKey,
        now: "2026-03-25T10:07:00.000Z"
      })
    ).toEqual([]);

    const reviewerLeased = fixture.runtime.consumeMailbox({
      mailboxId: "internal:assistant:reviewer",
      consumerId: "reviewer-worker-1",
      batchSize: 10,
      roomKey: fixture.roomKey,
      now: "2026-03-25T10:07:00.000Z"
    });
    expect(reviewerLeased.map((delivery) => delivery.messageId)).toEqual([governance.message.messageId]);

    expect(() =>
      fixture.runtime.projectMailboxView({
        roomKey: fixture.roomKey,
        mailboxId: "missing:mailbox"
      })
    ).toThrow(/virtual mailbox not found/);

    expect(privateMessage.message.visibility).toBe("private");

    fixture.handle.close();
  });

  it("marks message deliveries stale and vetoed with durable projection replay", () => {
    const fixture = createFixture();

    const staleTask = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Stale queue",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher", "internal:assistant:reviewer"],
      kind: "task",
      visibility: "internal",
      subject: "Stale this task",
      bodyRef: "body://virtual/task-stale",
      roomRevision: 3,
      inputsHash: "hash-task-stale",
      createdAt: "2026-03-25T10:05:00.000Z"
    });

    const staleDeliveries = markVirtualMessageStale(fixture.handle.db, {
      messageId: staleTask.message.messageId,
      staleAt: "2026-03-25T10:05:30.000Z",
      supersededByRevision: 4
    });
    expect(staleDeliveries).toHaveLength(2);
    expect(staleDeliveries.every((delivery) => delivery.status === "stale")).toBe(true);

    const vetoTask = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Veto queue",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:reviewer"],
      kind: "review",
      visibility: "governance",
      subject: "Veto this draft",
      bodyRef: "body://virtual/task-veto",
      roomRevision: 3,
      inputsHash: "hash-task-veto",
      createdAt: "2026-03-25T10:06:00.000Z"
    });

    const vetoedDeliveries = vetoVirtualMessage(fixture.handle.db, {
      messageId: vetoTask.message.messageId,
      reason: "Policy veto",
      vetoedAt: "2026-03-25T10:06:20.000Z"
    });
    expect(vetoedDeliveries).toHaveLength(1);
    expect(vetoedDeliveries[0]?.status).toBe("vetoed");

    fixture.handle.db.prepare("DELETE FROM mailbox_deliveries WHERE room_key = ?;").run(fixture.roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_messages WHERE room_key = ?;").run(fixture.roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_threads WHERE room_key = ?;").run(fixture.roomKey);

    fixture.runtime.rebuildVirtualMailProjection(fixture.roomKey);
    const replay = fixture.runtime.replay(fixture.roomKey);
    const staleStatuses = replay.mailboxDeliveries
      .filter((delivery) => delivery.messageId === staleTask.message.messageId)
      .map((delivery) => delivery.status);
    const vetoStatuses = replay.mailboxDeliveries
      .filter((delivery) => delivery.messageId === vetoTask.message.messageId)
      .map((delivery) => delivery.status);
    expect(staleStatuses).toEqual(["stale", "stale"]);
    expect(vetoStatuses).toEqual(["vetoed"]);
    expect(replay.ledger.map((event) => event.type)).toEqual(
      expect.arrayContaining(["virtual_mail.message_stale", "virtual_mail.message_vetoed"])
    );

    fixture.handle.close();
  });

  it("supersedes work threads and supersedes active deliveries durably", () => {
    const fixture = createFixture();

    const task = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Supersede queue",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher"],
      ccMailboxIds: ["internal:assistant:reviewer"],
      kind: "task",
      visibility: "internal",
      subject: "Supersede this work thread",
      bodyRef: "body://virtual/task-supersede",
      roomRevision: 3,
      inputsHash: "hash-task-supersede",
      createdAt: "2026-03-25T10:07:00.000Z"
    });

    const superseded = supersedeVirtualThread(fixture.handle.db, {
      threadId: task.thread.threadId,
      supersededAt: "2026-03-25T10:07:30.000Z",
      byRevision: 4
    });
    expect(superseded.thread.status).toBe("superseded");
    expect(superseded.deliveries).toHaveLength(2);
    expect(superseded.deliveries.every((delivery) => delivery.status === "superseded")).toBe(true);

    fixture.handle.db.prepare("DELETE FROM mailbox_deliveries WHERE room_key = ?;").run(fixture.roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_messages WHERE room_key = ?;").run(fixture.roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_threads WHERE room_key = ?;").run(fixture.roomKey);

    fixture.runtime.rebuildVirtualMailProjection(fixture.roomKey);
    const replay = fixture.runtime.replay(fixture.roomKey);
    expect(replay.virtualThreads[0]?.status).toBe("superseded");
    expect(replay.mailboxDeliveries.every((delivery) => delivery.status === "superseded")).toBe(true);
    expect(replay.ledger.map((event) => event.type)).toContain("virtual_mail.thread_superseded");

    fixture.handle.close();
  });

  it("rejects inline payloads instead of reference-shaped body and ref fields", () => {
    const fixture = createFixture();

    expect(() =>
      fixture.runtime.submitVirtualMessage({
        roomKey: fixture.roomKey,
        threadKind: "work",
        topic: "Invalid refs",
        fromPrincipalId: "principal:assistant",
        fromMailboxId: "internal:assistant:orchestrator",
        toMailboxIds: ["internal:assistant:researcher"],
        kind: "task",
        visibility: "internal",
        subject: "Inline payload should fail",
        bodyRef: "This is a pasted inline payload that should not be stored as a ref",
        roomRevision: 3,
        inputsHash: "hash-inline-body",
        createdAt: "2026-03-25T10:08:00.000Z"
      })
    ).toThrow(/bodyRef must be a reference/i);

    const task = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Valid refs",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher"],
      kind: "task",
      visibility: "internal",
      subject: "Valid reference payload",
      bodyRef: "body://virtual/task-ref-check",
      artifactRefs: ["artifact://chunk/1"],
      memoryRefs: ["room://digest"],
      roomRevision: 3,
      inputsHash: "hash-valid-ref",
      createdAt: "2026-03-25T10:08:10.000Z"
    });

    expect(() =>
      fixture.runtime.replyVirtualMessage(task.message.messageId, {
        fromPrincipalId: "principal:assistant",
        fromMailboxId: "internal:assistant:researcher",
        toMailboxIds: ["internal:assistant:orchestrator"],
        kind: "claim",
        visibility: "internal",
        bodyRef: "body://virtual/reply-ref-check",
        artifactRefs: ["artifact://chunk/2", "inline evidence text should fail"],
        memoryRefs: ["room://digest"],
        roomRevision: 3,
        inputsHash: "hash-invalid-artifact-ref",
        createdAt: "2026-03-25T10:08:20.000Z"
      })
    ).toThrow(/artifactRefs must be a reference/i);

    fixture.handle.close();
  });
});
