import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import type { VirtualMailbox } from "../src/core/types.js";
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

async function waitFor(assertion: () => void, timeoutMs = 1_000) {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("timed out waiting for assertion");
}

function createFixture(options: {
  gatewayOutcomeDispatcher?: NonNullable<Parameters<typeof createMailSidecarRuntime>[0]["gatewayOutcomeDispatcher"]>;
} = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-gateway-projection-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite")
  });
  const handle = initializeDatabase(config);
  const runtime = createMailSidecarRuntime({
    db: handle.db,
    config,
    gatewayOutcomeDispatcher: options.gatewayOutcomeDispatcher
  });
  const roomKey = buildRoomSessionKey("acct-1", "thread-gateway-adapter");

  saveThreadRoom(handle.db, {
    roomKey,
    accountId: "acct-1",
    stableThreadId: "thread-gateway-adapter",
    parentSessionKey: "gateway-session-parent",
    frontAgentAddress: "assistant@ai.example.com",
    state: "idle",
    revision: 3,
    lastInboundSeq: 1,
    lastOutboundSeq: 0
  });

  const baseMailbox = {
    accountId: "acct-1",
    active: true,
    createdAt: "2026-03-27T00:00:00.000Z",
    updatedAt: "2026-03-27T00:00:00.000Z"
  };
  const mailboxes: VirtualMailbox[] = [
    {
      ...baseMailbox,
      mailboxId: "public:assistant",
      principalId: "principal:assistant",
      kind: "public"
    },
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
    }
  ];
  for (const mailbox of mailboxes) {
    runtime.upsertVirtualMailbox(mailbox);
  }

  return {
    handle,
    runtime,
    roomKey
  };
}

describe("gateway projection adapter", () => {
  it("binds a gateway session to a room and projects a gateway turn into virtual mail", () => {
    const fixture = createFixture();

    const binding = fixture.runtime.bindGatewaySessionToRoom({
      sessionKey: "gateway-session-public",
      roomKey: fixture.roomKey,
      bindingKind: "room",
      sourceControlPlane: "openclaw",
      frontAgentId: "assistant"
    });

    expect(binding).toMatchObject({
      sessionKey: "gateway-session-public",
      roomKey: fixture.roomKey,
      bindingKind: "room"
    });

    const projected = fixture.runtime.projectGatewayTurnToVirtualMail({
      sessionKey: "gateway-session-public",
      sourceControlPlane: "openclaw",
      sourceMessageId: "gateway-turn-1",
      sourceRunId: "gateway-run-1",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "public:assistant",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "question",
      visibility: "internal",
      subject: "Gateway question",
      bodyRef: "body://gateway/question-1",
      inputsHash: "hash-gateway-question-1",
      createdAt: "2026-03-27T00:01:00.000Z"
    });

    expect(projected.message.originKind).toBe("gateway_chat");
    expect(projected.message.projectionMetadata).toMatchObject({
      origin: {
        controlPlane: "openclaw",
        sessionKey: "gateway-session-public",
        runId: "gateway-run-1",
        sourceMessageId: "gateway-turn-1",
        frontAgentId: "assistant"
      }
    });

    const replay = fixture.runtime.replay(fixture.roomKey);
    expect(replay.gatewaySessionBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sessionKey: "gateway-session-public",
          bindingKind: "room"
        })
      ])
    );
    expect(replay.gatewayProjectionTrace.messageIds).toEqual([projected.message.messageId]);
    expect(replay.ledger.map((event) => event.type)).toEqual(
      expect.arrayContaining(["gateway.session.bound", "gateway.turn.projected"])
    );

    fixture.handle.close();
  });

  it("projects a single-parent gateway reply through a work-thread binding and auto-projects Gateway outcomes idempotently", () => {
    const fixture = createFixture();

    const task = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Gateway work",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher"],
      kind: "task",
      visibility: "internal",
      subject: "Research this",
      bodyRef: "body://virtual/gateway-work-task",
      roomRevision: 3,
      inputsHash: "hash-gateway-work-task",
      createdAt: "2026-03-27T00:02:00.000Z"
    });

    fixture.runtime.bindGatewaySessionToRoom({
      sessionKey: "gateway-session-worker",
      roomKey: fixture.roomKey,
      bindingKind: "work_thread",
      sourceControlPlane: "openclaw",
      workThreadId: task.thread.threadId,
      parentMessageId: task.message.messageId,
      frontAgentId: "research-agent"
    });

    const projected = fixture.runtime.projectGatewayTurnToVirtualMail({
      sessionKey: "gateway-session-worker",
      sourceControlPlane: "openclaw",
      sourceMessageId: "gateway-turn-2",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:researcher",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "claim",
      visibility: "internal",
      subject: "Research result",
      bodyRef: "body://gateway/claim-1",
      inputsHash: "hash-gateway-claim-1",
      createdAt: "2026-03-27T00:03:00.000Z"
    });

    expect(projected.message.parentMessageId).toBe(task.message.messageId);
    expect(projected.message.inReplyTo).toEqual([task.message.messageIdHeader]);

    const finalReady = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Reducer final ready",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "final_ready",
      visibility: "internal",
      subject: "Final ready",
      bodyRef: "body://virtual/final-ready",
      roomRevision: 3,
      inputsHash: "hash-final-ready",
      createdAt: "2026-03-27T00:04:00.000Z"
    });

    const replayAfterAutoProjection = fixture.runtime.replay(fixture.roomKey);
    expect(replayAfterAutoProjection.gatewayProjectionTrace.outcomeProjections).toEqual([
      expect.objectContaining({
        messageId: finalReady.message.messageId,
        sessionKey: "gateway-session-parent",
        mode: "session_reply",
        dispatchStatus: "pending"
      })
    ]);

    const outcome = fixture.runtime.projectRoomOutcomeToGateway({
      roomKey: fixture.roomKey,
      messageId: finalReady.message.messageId
    });

    expect(outcome.mode).toBe("session_reply");
    expect(outcome.sessionKey).toBe("gateway-session-parent");
    expect(fixture.runtime.replay(fixture.roomKey).gatewayProjectionTrace.outcomeProjections).toHaveLength(1);

    fixture.handle.close();
  });

  it("auto-dispatches projected gateway outcomes when a dispatcher is configured", async () => {
    let dispatchCount = 0;
    const fixture = createFixture({
      gatewayOutcomeDispatcher: async () => {
        dispatchCount += 1;
        if (dispatchCount === 2) {
          throw new Error("dispatch exploded token=projection-secret Bearer projection-token");
        }

        return {
          dispatchTarget: "openclaw://gateway-session-parent"
        };
      }
    });

    const success = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Reducer success",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "final_ready",
      visibility: "internal",
      subject: "Final ready success",
      bodyRef: "body://virtual/final-ready-success",
      roomRevision: 3,
      inputsHash: "hash-final-ready-success",
      createdAt: "2026-03-27T00:06:00.000Z"
    });
    const failed = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Reducer failure",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "final_ready",
      visibility: "internal",
      subject: "Final ready failure",
      bodyRef: "body://virtual/final-ready-failure",
      roomRevision: 3,
      inputsHash: "hash-final-ready-failure",
      createdAt: "2026-03-27T00:07:00.000Z"
    });

    fixture.runtime.projectRoomOutcomeToGateway({
      roomKey: fixture.roomKey,
      messageId: success.message.messageId
    });
    fixture.runtime.projectRoomOutcomeToGateway({
      roomKey: fixture.roomKey,
      messageId: failed.message.messageId
    });

    await waitFor(() => {
      const projections = fixture.runtime.replay(fixture.roomKey).gatewayProjectionTrace.outcomeProjections;
      expect(projections).toHaveLength(2);
      expect(
        projections.filter((projection) => projection.dispatchStatus === "dispatched" && projection.dispatchTarget === "openclaw://gateway-session-parent")
      ).toHaveLength(1);
      expect(
        projections.filter((projection) => projection.dispatchStatus === "failed" && projection.dispatchError === "dispatch exploded token=[redacted] Bearer=[redacted]")
      ).toHaveLength(1);
    });

    const drain = await fixture.runtime.dispatchPendingGatewayOutcomes({
      roomKey: fixture.roomKey,
    });

    expect(drain).toMatchObject({
      attempted: 0,
      dispatched: 0,
      failed: 0
    });

    fixture.handle.close();
  });

  it("auto-dispatches direct room outcome projection when a dispatcher is configured", async () => {
    const fixture = createFixture({
      gatewayOutcomeDispatcher: async ({ message }) => ({
        dispatchTarget: `openclaw://project/${message.messageId}`
      })
    });
    fixture.runtime.bindGatewaySessionToRoom({
      sessionKey: "gateway-session-direct-project",
      roomKey: fixture.roomKey,
      bindingKind: "room",
      sourceControlPlane: "openclaw",
      frontAgentId: "assistant"
    });

    const finalReady = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Reducer direct project",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "final_ready",
      visibility: "internal",
      subject: "Final ready direct project",
      bodyRef: "body://virtual/final-ready-direct-project",
      roomRevision: 3,
      inputsHash: "hash-final-ready-direct-project",
      createdAt: "2026-03-27T00:09:00.000Z"
    });

    fixture.runtime.projectRoomOutcomeToGateway({
      roomKey: fixture.roomKey,
      messageId: finalReady.message.messageId
    });

    await waitFor(() => {
      expect(fixture.runtime.replay(fixture.roomKey).gatewayProjectionTrace.outcomeProjections).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            messageId: finalReady.message.messageId,
            dispatchStatus: "dispatched",
            dispatchTarget: `openclaw://project/${finalReady.message.messageId}`
          })
        ])
      );
    });

    fixture.handle.close();
  });
});
