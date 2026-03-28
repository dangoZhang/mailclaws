import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config.js";
import type { VirtualMailbox } from "../../src/core/types.js";
import { createMailSidecarRuntime } from "../../src/orchestration/runtime.js";
import type { MailAgentExecutor } from "../../src/runtime/agent-executor.js";
import { initializeDatabase } from "../../src/storage/db.js";
import { createMailLab } from "../../tests/helpers/mail-lab.js";
import { createFixedClock } from "../../tests/helpers/fixed-clock.js";
import { collectRoomObservability } from "../../tests/helpers/runtime-observability.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("stability: projection replay", () => {
  it("rebuilds provider, gateway, and internal projection chains without replaying side effects", async () => {
    const fixture = createFixture();
    const mailLab = createMailLab("stability-projection");
    const inbound = await fixture.runtime.ingest({
      accountId: "acct-projection",
      mailboxAddress: "assistant@acme.ai",
      processImmediately: true,
      envelope: mailLab.newMail({
        providerMessageId: "provider-projection-root",
        messageId: "<provider-projection-root@example.test>",
        subject: "Projection replay proof",
        text: "Please produce a final answer that will need approval.",
        to: [{ email: "assistant@acme.ai" }],
        date: fixture.clock.now()
      })
    });
    const roomKey = inbound.ingested.roomKey;
    const initial = collectRoomObservability(fixture.runtime, roomKey);
    const room = initial.room;
    if (!room) {
      throw new Error("expected room");
    }
    const outboxId = initial.outboxIntents[0]?.intentId;
    if (!outboxId) {
      throw new Error("expected outbox intent");
    }

    fixture.runtime.approveOutbox(outboxId, fixture.clock.advanceSeconds(1));
    const firstDelivery = await fixture.runtime.deliverOutbox();

    expect(firstDelivery).toEqual({
      sent: 1,
      failed: 0
    });
    expect(fixture.sentOutboxIds).toEqual([outboxId]);

    fixture.runtime.bindGatewaySessionToRoom({
      sessionKey: room.parentSessionKey,
      roomKey,
      bindingKind: "room",
      sourceControlPlane: "openclaw",
      frontAgentId: "assistant",
      now: fixture.clock.advanceSeconds(1)
    });
    const gatewayMessage = fixture.runtime.projectGatewayTurnToVirtualMail({
      sessionKey: room.parentSessionKey,
      sourceControlPlane: "openclaw",
      sourceMessageId: "gateway-turn-1",
      sourceRunId: "gateway-run-1",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "public:assistant",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "question",
      visibility: "internal",
      subject: "Clarify the draft",
      bodyRef: "body://gateway/question-1",
      inputsHash: "hash-gateway-question-1",
      createdAt: fixture.clock.advanceSeconds(1)
    });
    const task = fixture.runtime.submitVirtualMessage({
      roomKey,
      threadKind: "work",
      topic: "Reducer chain",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher"],
      kind: "task",
      visibility: "internal",
      subject: "Check supporting facts",
      bodyRef: "body://virtual/task-1",
      roomRevision: room.revision,
      inputsHash: "hash-task-1",
      createdAt: fixture.clock.advanceSeconds(1)
    });
    const claim = fixture.runtime.replyVirtualMessage(task.message.messageId, {
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:researcher",
      toMailboxIds: ["governance:assistant:reviewer"],
      kind: "claim",
      visibility: "internal",
      bodyRef: "body://virtual/claim-1",
      roomRevision: room.revision,
      inputsHash: "hash-claim-1",
      createdAt: fixture.clock.advanceSeconds(1)
    });
    const review = fixture.runtime.replyVirtualMessage(claim.message.messageId, {
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "governance:assistant:reviewer",
      toMailboxIds: ["governance:assistant:guard"],
      kind: "review",
      visibility: "governance",
      bodyRef: "body://virtual/review-1",
      roomRevision: room.revision,
      inputsHash: "hash-review-1",
      createdAt: fixture.clock.advanceSeconds(1)
    });
    const finalReady = fixture.runtime.replyVirtualMessage(review.message.messageId, {
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "governance:assistant:guard",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "final_ready",
      visibility: "governance",
      bodyRef: "body://virtual/final-ready-1",
      roomRevision: room.revision,
      inputsHash: "hash-final-ready-1",
      createdAt: fixture.clock.advanceSeconds(1)
    });
    const projectedOutcome = fixture.runtime.projectRoomOutcomeToGateway({
      roomKey,
      messageId: finalReady.message.messageId,
      projectedAt: fixture.clock.advanceSeconds(1)
    });

    expect(projectedOutcome.mode).toBe("session_reply");

    const beforeRebuild = collectRoomObservability(fixture.runtime, roomKey);
    assertProjectionClosure(beforeRebuild, {
      gatewaySessionKey: room.parentSessionKey,
      gatewayMessageId: gatewayMessage.message.messageId,
      projectedOutcomeMessageId: finalReady.message.messageId
    });
    const beforeSummary = summarizeProjection(beforeRebuild);

    fixture.runtime.replay(roomKey);
    fixture.runtime.replay(roomKey);
    const repeatedReplaySummary = summarizeProjection(collectRoomObservability(fixture.runtime, roomKey));
    expect(repeatedReplaySummary).toEqual(beforeSummary);
    expect(fixture.sentOutboxIds).toEqual([outboxId]);

    fixture.handle.db.prepare("DELETE FROM mailbox_deliveries WHERE room_key = ?;").run(roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_messages WHERE room_key = ?;").run(roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_threads WHERE room_key = ?;").run(roomKey);

    const rebuilt = fixture.runtime.rebuildVirtualMailProjection(roomKey);
    expect(rebuilt).toMatchObject({
      roomKey,
      messages: beforeRebuild.virtualMessages.length,
      deliveries: beforeRebuild.mailboxDeliveries.length
    });

    const afterRebuild = collectRoomObservability(fixture.runtime, roomKey);
    assertProjectionClosure(afterRebuild, {
      gatewaySessionKey: room.parentSessionKey,
      gatewayMessageId: gatewayMessage.message.messageId,
      projectedOutcomeMessageId: finalReady.message.messageId
    });
    expect(summarizeProjection(afterRebuild)).toEqual(beforeSummary);
    expect(afterRebuild.approvalRequests).toHaveLength(beforeRebuild.approvalRequests.length);
    expect(afterRebuild.deliveryAttempts).toHaveLength(beforeRebuild.deliveryAttempts.length);

    const postReplayDelivery = await fixture.runtime.deliverOutbox();
    expect(postReplayDelivery).toEqual({
      sent: 0,
      failed: 0
    });
    expect(fixture.sentOutboxIds).toEqual([outboxId]);

    fixture.handle.close();
  });
});

function createFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-stability-projection-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
    MAILCLAW_FEATURE_MAIL_INGEST: "true",
    MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
    MAILCLAW_FEATURE_APPROVAL_GATE: "true"
  });
  const handle = initializeDatabase(config);
  const clock = createFixedClock("2026-03-29T00:00:00.000Z");
  const sentOutboxIds: string[] = [];
  const runtime = createMailSidecarRuntime({
    db: handle.db,
    config,
    agentExecutor: createDeterministicExecutor(clock),
    smtpSender: {
      async send(message) {
        sentOutboxIds.push(message.outboxId);
        return {
          providerMessageId: `<sent-${sentOutboxIds.length}@example.test>`
        };
      }
    }
  });

  runtime.upsertAccount({
    accountId: "acct-projection",
    provider: "smtp",
    emailAddress: "assistant@acme.ai",
    status: "active",
    settings: {}
  });
  for (const mailbox of buildProjectionMailboxes()) {
    runtime.upsertVirtualMailbox(mailbox);
  }

  return {
    handle,
    runtime,
    clock,
    sentOutboxIds
  };
}

function createDeterministicExecutor(clock: ReturnType<typeof createFixedClock>): MailAgentExecutor {
  return {
    async executeMailTurn(request) {
      return {
        startedAt: clock.now(),
        completedAt: clock.advanceSeconds(2),
        responseText: `Projected answer for ${request.sessionKey}`,
        request: {
          url: "http://127.0.0.1:11437/v1/responses",
          method: "POST",
          headers: {},
          body: {
            sessionKey: request.sessionKey
          }
        }
      };
    }
  };
}

function buildProjectionMailboxes(): VirtualMailbox[] {
  const base = {
    accountId: "acct-projection",
    principalId: "principal:assistant",
    active: true,
    createdAt: "2026-03-29T00:00:00.000Z",
    updatedAt: "2026-03-29T00:00:00.000Z"
  };

  return [
    {
      ...base,
      mailboxId: "public:assistant",
      kind: "public"
    },
    {
      ...base,
      mailboxId: "internal:assistant:orchestrator",
      kind: "internal_role",
      role: "orchestrator"
    },
    {
      ...base,
      mailboxId: "internal:assistant:researcher",
      kind: "internal_role",
      role: "researcher"
    },
    {
      ...base,
      mailboxId: "governance:assistant:reviewer",
      kind: "governance",
      role: "reviewer"
    },
    {
      ...base,
      mailboxId: "governance:assistant:guard",
      kind: "governance",
      role: "guard"
    }
  ] satisfies VirtualMailbox[];
}

function assertProjectionClosure(
  snapshot: ReturnType<typeof collectRoomObservability>,
  input: {
    gatewaySessionKey: string;
    gatewayMessageId: string;
    projectedOutcomeMessageId: string;
  }
) {
  const messageIds = new Set(snapshot.virtualMessages.map((message) => message.messageId));

  expect(messageIds.has(input.gatewayMessageId)).toBe(true);
  expect(messageIds.has(input.projectedOutcomeMessageId)).toBe(true);
  expect(snapshot.mailboxDeliveries.every((delivery) => messageIds.has(delivery.messageId))).toBe(true);
  expect(snapshot.gatewayProjectionTrace.messageIds.every((messageId) => messageIds.has(messageId))).toBe(true);
  expect(snapshot.gatewayProjectionTrace.sessionKeys).toContain(input.gatewaySessionKey);
  expect(
    snapshot.gatewayProjectionTrace.deliveryEntries.every((entry) =>
      entry.deliveries.every((delivery) => delivery.messageId === entry.message.messageId)
    )
  ).toBe(true);
  expect(snapshot.roomEvents.map((event) => event.type)).toEqual(
    expect.arrayContaining(["gateway.turn.projected", "gateway.outcome.projected"])
  );
}

function summarizeProjection(snapshot: ReturnType<typeof collectRoomObservability>) {
  return {
    roomKey: snapshot.room?.roomKey ?? null,
    revision: snapshot.roomRevision,
    virtualMessages: snapshot.virtualMessages.map((message) => ({
      messageId: message.messageId,
      parentMessageId: message.parentMessageId ?? null,
      threadId: message.threadId,
      kind: message.kind,
      visibility: message.visibility,
      originKind: message.originKind
    })),
    mailboxDeliveries: snapshot.mailboxDeliveries.map((delivery) => ({
      deliveryId: delivery.deliveryId,
      messageId: delivery.messageId,
      mailboxId: delivery.mailboxId,
      status: delivery.status
    })),
    gatewayTrace: {
      messageIds: snapshot.gatewayProjectionTrace.messageIds,
      sessionKeys: snapshot.gatewayProjectionTrace.sessionKeys,
      runIds: snapshot.gatewayProjectionTrace.runIds
    },
    approvalRequests: snapshot.approvalRequests.map((request) => ({
      requestId: request.requestId,
      status: request.status,
      referenceId: request.referenceId
    })),
    outboxAttempts: snapshot.deliveryAttempts.map((attempt) => ({
      outboxId: attempt.outboxId,
      status: attempt.status,
      providerMessageId: attempt.providerMessageId ?? null
    })),
    ledgerTypes: snapshot.roomEvents.map((event) => event.type)
  };
}
