import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import type { OpenClawSubAgentTransport } from "../src/subagent-bridge/openclaw.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import { initializeDatabase } from "../src/storage/db.js";
import { saveThreadRoom } from "../src/storage/repositories/thread-rooms.js";
import { buildRoomSessionKey, buildSubAgentSessionKey } from "../src/threading/session-key.js";
import { createFixedClock } from "./helpers/fixed-clock.js";
import { createDeterministicSubAgentTransport } from "./helpers/subagent-stubs.js";
import { collectRoomObservability } from "./helpers/runtime-observability.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createFixture(
  transport: OpenClawSubAgentTransport,
  options: {
    mode?: "burst" | "bound";
    boundSessionTtlSeconds?: number;
    allowExternalSend?: boolean;
  } = {}
) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-subagent-bridge-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
    MAILCLAW_OPENCLAW_BASE_URL: "http://127.0.0.1:11437",
    MAILCLAW_OPENCLAW_GATEWAY_TOKEN: "super-secret"
  });
  const handle = initializeDatabase(config);
  const runtime = createMailSidecarRuntime({
    db: handle.db,
    config,
    subAgentTransport: transport
  });
  const roomKey = buildRoomSessionKey("acct-1", "thread-subagent");

  saveThreadRoom(handle.db, {
    roomKey,
    accountId: "acct-1",
    stableThreadId: "thread-subagent",
    parentSessionKey: roomKey,
    frontAgentAddress: "assistant@ai.example.com",
    state: "running",
    revision: 3,
    lastInboundSeq: 1,
    lastOutboundSeq: 0
  });

  const baseMailbox = {
    accountId: "acct-1",
    active: true,
    createdAt: "2026-03-26T01:00:00.000Z",
    updatedAt: "2026-03-26T01:00:00.000Z"
  };
  runtime.upsertVirtualMailbox({
    ...baseMailbox,
    mailboxId: "internal:assistant:orchestrator",
    principalId: "principal:assistant",
    kind: "internal_role",
    role: "orchestrator"
  });
  runtime.upsertVirtualMailbox({
    ...baseMailbox,
    mailboxId: "subagent:research",
    principalId: "principal:subagent:research",
    kind: "system"
  });
  runtime.upsertSubAgentTarget({
    targetId: "research-target",
    accountId: "acct-1",
    mailboxId: "subagent:research",
    openClawAgentId: "research-agent",
    mode: options.mode ?? "burst",
    boundSessionTtlSeconds: options.boundSessionTtlSeconds,
    sandboxMode: "require",
    maxActivePerRoom: 1,
    maxQueuedPerInbox: 5,
    allowExternalSend: options.allowExternalSend ?? false,
    resultSchema: "research",
    enabled: true,
    createdAt: "2026-03-26T01:00:00.000Z",
    updatedAt: "2026-03-26T01:00:00.000Z"
  });

  return {
    config,
    handle,
    runtime,
    roomKey
  };
}

describe("subagent bridge", () => {
  it("spawns a burst subagent run and emits a single-parent internal reply", async () => {
    const calls: { spawnInput?: Parameters<OpenClawSubAgentTransport["spawnBurst"]>[0] } = {};
    const transport: OpenClawSubAgentTransport = {
      async spawnBurst(input) {
        calls.spawnInput = input;
        return {
          runId: "run-subagent-1",
          childSessionKey: "child-session-1",
          acceptedAt: "2026-03-26T01:05:00.000Z",
          request: {
            url: "http://127.0.0.1:11437/v1/sessions/spawn",
            method: "POST",
            headers: {},
            body: {
              agentId: input.targetAgentId
            }
          }
        };
      },
      async runBound() {
        throw new Error("bound mode should not run in burst test");
      },
      async watchBurst() {
        return {
          status: "completed",
          responseText: JSON.stringify({
            summary: "Verified the customer claim against the attached statement.",
            facts: [
              {
                claim: "The invoice total matches the ledger export.",
                evidenceRef: "artifact://ledger/chunk/1"
              }
            ],
            openQuestions: ["Confirm whether to cite the March export or the April correction."]
          }),
          completedAt: "2026-03-26T01:05:08.000Z",
          request: {
            url: "http://127.0.0.1:11437/v1/sessions/child-session-1/history?follow=1",
            method: "GET",
            headers: {}
          }
        };
      }
    };
    const fixture = createFixture(transport);

    const task = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Research escalation",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["subagent:research"],
      kind: "task",
      visibility: "internal",
      subject: "Verify the latest customer claims",
      bodyRef: "body://virtual/subagent-task",
      artifactRefs: ["artifact://ledger"],
      memoryRefs: ["room://digest"],
      roomRevision: 3,
      inputsHash: "hash-subagent-task",
      createdAt: "2026-03-26T01:04:00.000Z"
    });

    const dispatched = await fixture.runtime.dispatchSubAgentMailbox({
      mailboxId: "subagent:research",
      consumerId: "bridge-1",
      batchSize: 1,
      roomKey: fixture.roomKey,
      now: "2026-03-26T01:05:00.000Z"
    });

    expect(dispatched).toHaveLength(1);
    expect(calls.spawnInput?.targetAgentId).toBe("research-agent");
    expect(calls.spawnInput?.parentSessionKey).toBe(fixture.roomKey);
    expect(calls.spawnInput?.inputText).toContain("Never send external email");

    const runs = fixture.runtime.listSubAgentRuns(fixture.roomKey);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      runId: "run-subagent-1",
      status: "completed",
      targetId: "research-target",
      childSessionKey: "child-session-1"
    });
    expect(runs[0]?.resultMessageId).toBeTruthy();

    const orchestratorView = fixture.runtime.projectMailboxView({
      roomKey: fixture.roomKey,
      mailboxId: "internal:assistant:orchestrator"
    });
    expect(orchestratorView).toHaveLength(1);
    expect(orchestratorView[0]?.message.parentMessageId).toBe(task.message.messageId);
    expect(orchestratorView[0]?.message.inReplyTo).toEqual([task.message.messageIdHeader]);
    expect(orchestratorView[0]?.message.kind).toBe("claim");
    expect(orchestratorView[0]?.message.fromMailboxId).toBe("subagent:research");
    expect(orchestratorView[0]?.message.originKind).toBe("gateway_chat");
    expect(orchestratorView[0]?.message.projectionMetadata).toMatchObject({
      origin: {
        kind: "gateway_chat",
        controlPlane: "openclaw",
        sessionKey: "child-session-1",
        runId: "run-subagent-1",
        frontAgentId: "research-agent",
        sourceMessageId: task.message.messageId
      }
    });
    expect(orchestratorView[0]?.message.bodyRef).toContain("/subagents/run-subagent-1.json");

    const replay = fixture.runtime.replay(fixture.roomKey);
    expect(replay.subagentRuns).toHaveLength(1);
    expect(replay.gatewayProjectionTrace.messageIds).toEqual([runs[0]?.resultMessageId]);
    expect(replay.gatewayProjectionTrace.sessionKeys).toEqual(["child-session-1"]);
    expect(replay.ledger.map((event) => event.type)).toEqual(
      expect.arrayContaining(["subagent.run.accepted", "subagent.run.completed", "virtual_mail.message_replied"])
    );

    fixture.handle.close();
  });

  it("dedupes child transcript and announceSummary into one internal reply", async () => {
    const clock = createFixedClock("2026-03-26T01:40:00.000Z");
    const { transport, calls } = createDeterministicSubAgentTransport({
      clock,
      scenarioByAgentId: {
        "research-agent": "research-fast"
      },
      overrides: {
        "research-fast": {
          announceSummary: "Announce channel repeated the same result summary."
        }
      }
    });
    const fixture = createFixture(transport);

    const task = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Deduped research",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["subagent:research"],
      kind: "task",
      visibility: "internal",
      subject: "Verify the same result through both child channels",
      bodyRef: "body://virtual/subagent-dedupe",
      roomRevision: 3,
      inputsHash: "hash-subagent-dedupe",
      createdAt: clock.now()
    });

    const dispatched = await fixture.runtime.dispatchSubAgentMailbox({
      mailboxId: "subagent:research",
      consumerId: "bridge-dedupe",
      batchSize: 1,
      roomKey: fixture.roomKey,
      now: clock.advanceSeconds(1)
    });
    const snapshot = collectRoomObservability(fixture.runtime, fixture.roomKey, {
      mailboxId: "internal:assistant:orchestrator"
    });

    expect(dispatched).toHaveLength(1);
    expect(calls.spawns).toHaveLength(1);
    expect(calls.watches).toHaveLength(1);
    expect(snapshot.subagentRuns).toHaveLength(1);
    expect(snapshot.subagentRuns[0]).toMatchObject({
      announceSummary: "Announce channel repeated the same result summary.",
      resultMessageId: dispatched[0]?.resultMessageId
    });
    const replies = snapshot.mailboxView.filter((entry) => entry.message.parentMessageId === task.message.messageId);
    expect(replies).toHaveLength(1);
    expect(replies[0]?.message.kind).toBe("claim");
    expect(snapshot.roomEvents.filter((event) => event.type === "subagent.run.completed")).toHaveLength(1);
    expect(snapshot.roomEvents.filter((event) => event.type === "virtual_mail.message_replied")).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(replies[0]?.message.bodyRef ?? "", "utf8"))).toMatchObject({
      announceSummary: "Announce channel repeated the same result summary.",
      normalized: {
        summary: "Research found the relevant supporting evidence."
      }
    });

    fixture.handle.close();
  });

  it("marks late child results stale and keeps them as internal stale notices", async () => {
    let releaseWatch: (() => void) | undefined;
    let watchStartedResolve: (() => void) | undefined;
    const watchStarted = new Promise<void>((resolve) => {
      watchStartedResolve = resolve;
    });
    const transport: OpenClawSubAgentTransport = {
      async spawnBurst() {
        return {
          runId: "run-subagent-stale",
          childSessionKey: "child-session-stale",
          acceptedAt: "2026-03-26T01:10:00.000Z",
          request: {
            url: "http://127.0.0.1:11437/v1/sessions/spawn",
            method: "POST",
            headers: {},
            body: {}
          }
        };
      },
      async runBound() {
        throw new Error("bound mode should not run in stale burst test");
      },
      async watchBurst() {
        watchStartedResolve?.();
        await new Promise<void>((resolve) => {
          releaseWatch = resolve;
        });

        return {
          status: "completed",
          responseText: JSON.stringify({
            summary: "Finished after the room changed."
          }),
          completedAt: "2026-03-26T01:10:20.000Z",
          request: {
            url: "http://127.0.0.1:11437/v1/sessions/child-session-stale/history?follow=1",
            method: "GET",
            headers: {}
          }
        };
      }
    };
    const fixture = createFixture(transport);

    const task = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Research stale case",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["subagent:research"],
      kind: "task",
      visibility: "internal",
      subject: "Research with revision bump",
      bodyRef: "body://virtual/subagent-task-stale",
      roomRevision: 3,
      inputsHash: "hash-subagent-stale",
      createdAt: "2026-03-26T01:09:00.000Z"
    });

    const dispatchPromise = fixture.runtime.dispatchSubAgentMailbox({
      mailboxId: "subagent:research",
      consumerId: "bridge-2",
      batchSize: 1,
      roomKey: fixture.roomKey,
      now: "2026-03-26T01:10:00.000Z"
    });

    await watchStarted;
    const room = fixture.runtime.replay(fixture.roomKey).room;
    if (!room) {
      throw new Error("expected room");
    }
    saveThreadRoom(fixture.handle.db, {
      ...room,
      revision: 4,
      lastInboundSeq: 2,
      state: "queued"
    });
    releaseWatch?.();

    await dispatchPromise;

    const runs = fixture.runtime.listSubAgentRuns(fixture.roomKey);
    expect(runs[0]).toMatchObject({
      runId: "run-subagent-stale",
      status: "stale"
    });

    const orchestratorView = fixture.runtime.projectMailboxView({
      roomKey: fixture.roomKey,
      mailboxId: "internal:assistant:orchestrator"
    });
    expect(orchestratorView).toHaveLength(1);
    expect(orchestratorView[0]?.message.parentMessageId).toBe(task.message.messageId);
    expect(orchestratorView[0]?.message.kind).toBe("system_notice");
    expect(orchestratorView[0]?.message.roomRevision).toBe(4);

    const replay = fixture.runtime.replay(fixture.roomKey);
    expect(replay.ledger.map((event) => event.type)).toEqual(
      expect.arrayContaining(["subagent.run.accepted", "subagent.run.stale", "virtual_mail.message_stale"])
    );

    fixture.handle.close();
  });

  it("reuses a deterministic bound child session key and respawns after a failed run", async () => {
    const calls: Array<{ childSessionKey: string; inputText: string }> = [];
    let nextFailure = false;
    const transport: OpenClawSubAgentTransport = {
      async spawnBurst() {
        throw new Error("burst mode should not run in bound test");
      },
      async watchBurst() {
        throw new Error("burst watch should not run in bound test");
      },
      async runBound(input) {
        calls.push({
          childSessionKey: input.childSessionKey,
          inputText: input.inputText
        });
        if (nextFailure) {
          nextFailure = false;
          throw new Error("session archived");
        }

        return {
          status: "completed",
          responseText: JSON.stringify({
            summary: `Handled in ${input.childSessionKey}.`
          }),
          completedAt: "2026-03-26T01:20:08.000Z",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {
              sessionKey: input.childSessionKey
            }
          }
        };
      }
    };
    const fixture = createFixture(transport, {
      mode: "bound"
    });
    const firstTask = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Bound research",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["subagent:research"],
      kind: "task",
      visibility: "internal",
      subject: "Bound session first run",
      bodyRef: "body://virtual/subagent-bound-1",
      roomRevision: 3,
      inputsHash: "hash-bound-1",
      createdAt: "2026-03-26T01:20:00.000Z"
    });
    const expectedBaseSessionKey = buildSubAgentSessionKey(
      "acct-1",
      "thread-subagent",
      firstTask.message.threadId,
      "research-target",
      "hook:mail",
      "assistant@ai.example.com"
    );
    await fixture.runtime.dispatchSubAgentMailbox({
      mailboxId: "subagent:research",
      consumerId: "bridge-bound-1",
      batchSize: 1,
      roomKey: fixture.roomKey,
      now: "2026-03-26T01:20:00.000Z"
    });

    const secondTask = fixture.runtime.replyVirtualMessage(firstTask.message.messageId, {
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["subagent:research"],
      kind: "task",
      visibility: "internal",
      subject: "Bound session second run",
      bodyRef: "body://virtual/subagent-bound-2",
      roomRevision: 3,
      inputsHash: "hash-bound-2",
      createdAt: "2026-03-26T01:21:00.000Z"
    });
    await fixture.runtime.dispatchSubAgentMailbox({
      mailboxId: "subagent:research",
      consumerId: "bridge-bound-2",
      batchSize: 1,
      roomKey: fixture.roomKey,
      now: "2026-03-26T01:21:00.000Z"
    });

    nextFailure = true;
    const thirdTask = fixture.runtime.replyVirtualMessage(secondTask.message.messageId, {
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["subagent:research"],
      kind: "task",
      visibility: "internal",
      subject: "Bound session failing run",
      bodyRef: "body://virtual/subagent-bound-3",
      roomRevision: 3,
      inputsHash: "hash-bound-3",
      createdAt: "2026-03-26T01:22:00.000Z"
    });
    await fixture.runtime.dispatchSubAgentMailbox({
      mailboxId: "subagent:research",
      consumerId: "bridge-bound-3",
      batchSize: 1,
      roomKey: fixture.roomKey,
      now: "2026-03-26T01:22:00.000Z"
    });

    fixture.runtime.replyVirtualMessage(thirdTask.message.messageId, {
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["subagent:research"],
      kind: "task",
      visibility: "internal",
      subject: "Bound session respawn run",
      bodyRef: "body://virtual/subagent-bound-4",
      roomRevision: 3,
      inputsHash: "hash-bound-4",
      createdAt: "2026-03-26T01:23:00.000Z"
    });
    await fixture.runtime.dispatchSubAgentMailbox({
      mailboxId: "subagent:research",
      consumerId: "bridge-bound-4",
      batchSize: 1,
      roomKey: fixture.roomKey,
      now: "2026-03-26T01:23:00.000Z"
    });

    expect(calls.map((call) => call.childSessionKey)).toEqual([
      expectedBaseSessionKey,
      expectedBaseSessionKey,
      expectedBaseSessionKey,
      `${expectedBaseSessionKey}:respawn:1`
    ]);
    expect(calls[1]?.inputText).toContain(expectedBaseSessionKey);
    expect(calls[3]?.inputText).toContain(`${expectedBaseSessionKey}:respawn:1`);

    const runs = fixture.runtime.listSubAgentRuns(fixture.roomKey);
    expect(runs.map((run) => ({
      status: run.status,
      childSessionKey: run.childSessionKey
    }))).toEqual([
      {
        status: "completed",
        childSessionKey: expectedBaseSessionKey
      },
      {
        status: "completed",
        childSessionKey: expectedBaseSessionKey
      },
      {
        status: "failed",
        childSessionKey: expectedBaseSessionKey
      },
      {
        status: "completed",
        childSessionKey: `${expectedBaseSessionKey}:respawn:1`
      }
    ]);

    const replay = fixture.runtime.replay(fixture.roomKey);
    expect(replay.ledger.map((event) => event.type)).toEqual(
      expect.arrayContaining(["subagent.run.accepted", "subagent.run.completed", "subagent.run.failed"])
    );

    fixture.handle.close();
  });

  it("refreshes a bound child session after its configured TTL expires", async () => {
    const calls: string[] = [];
    const transport: OpenClawSubAgentTransport = {
      async spawnBurst() {
        throw new Error("burst mode should not run in bound ttl test");
      },
      async watchBurst() {
        throw new Error("burst watch should not run in bound ttl test");
      },
      async runBound(input) {
        calls.push(input.childSessionKey);
        return {
          status: "completed",
          responseText: JSON.stringify({
            summary: `Handled in ${input.childSessionKey}.`
          }),
          completedAt: "2026-03-26T01:30:10.000Z",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {
              sessionKey: input.childSessionKey
            }
          }
        };
      }
    };
    const fixture = createFixture(transport, {
      mode: "bound",
      boundSessionTtlSeconds: 60
    });

    const firstTask = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Bound TTL research",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["subagent:research"],
      kind: "task",
      visibility: "internal",
      subject: "Bound TTL first run",
      bodyRef: "body://virtual/subagent-bound-ttl-1",
      roomRevision: 3,
      inputsHash: "hash-bound-ttl-1",
      createdAt: "2026-03-26T01:30:00.000Z"
    });
    const expectedBaseSessionKey = buildSubAgentSessionKey(
      "acct-1",
      "thread-subagent",
      firstTask.message.threadId,
      "research-target",
      "hook:mail",
      "assistant@ai.example.com"
    );
    await fixture.runtime.dispatchSubAgentMailbox({
      mailboxId: "subagent:research",
      consumerId: "bridge-bound-ttl-1",
      batchSize: 1,
      roomKey: fixture.roomKey,
      now: "2026-03-26T01:30:00.000Z"
    });

    fixture.runtime.replyVirtualMessage(firstTask.message.messageId, {
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["subagent:research"],
      kind: "task",
      visibility: "internal",
      subject: "Bound TTL second run",
      bodyRef: "body://virtual/subagent-bound-ttl-2",
      roomRevision: 3,
      inputsHash: "hash-bound-ttl-2",
      createdAt: "2026-03-26T01:32:30.000Z"
    });
    await fixture.runtime.dispatchSubAgentMailbox({
      mailboxId: "subagent:research",
      consumerId: "bridge-bound-ttl-2",
      batchSize: 1,
      roomKey: fixture.roomKey,
      now: "2026-03-26T01:32:30.000Z"
    });

    expect(calls).toEqual([
      expectedBaseSessionKey,
      `${expectedBaseSessionKey}:respawn:1`
    ]);
    const runs = fixture.runtime.listSubAgentRuns(fixture.roomKey);
    expect(runs.map((run) => run.childSessionKey)).toEqual([
      expectedBaseSessionKey,
      `${expectedBaseSessionKey}:respawn:1`
    ]);

    fixture.handle.close();
  });

  it("keeps malicious subagent output behind internal replies with no outbox intents", async () => {
    const clock = createFixedClock("2026-03-26T01:50:00.000Z");
    const { transport } = createDeterministicSubAgentTransport({
      clock,
      scenarioByAgentId: {
        "research-agent": "malicious-worker"
      }
    });
    const fixture = createFixture(transport);

    const task = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Malicious subagent output",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["subagent:research"],
      kind: "task",
      visibility: "internal",
      subject: "Do not let this bypass the outbox",
      bodyRef: "body://virtual/subagent-malicious",
      roomRevision: 3,
      inputsHash: "hash-subagent-malicious",
      createdAt: clock.now()
    });

    await fixture.runtime.dispatchSubAgentMailbox({
      mailboxId: "subagent:research",
      consumerId: "bridge-malicious",
      batchSize: 1,
      roomKey: fixture.roomKey,
      now: clock.advanceSeconds(1)
    });
    const snapshot = collectRoomObservability(fixture.runtime, fixture.roomKey, {
      mailboxId: "internal:assistant:orchestrator"
    });
    const replies = snapshot.mailboxView.filter((entry) => entry.message.parentMessageId === task.message.messageId);

    expect(replies).toHaveLength(1);
    expect(replies[0]?.message.kind).toBe("claim");
    expect(snapshot.outbox).toHaveLength(0);
    expect(snapshot.outboxIntents).toHaveLength(0);
    expect(snapshot.deliveryAttempts).toHaveLength(0);
    expect(JSON.parse(fs.readFileSync(replies[0]?.message.bodyRef ?? "", "utf8"))).toMatchObject({
      rawResponseText: expect.stringContaining("attacker@example.com")
    });

    fixture.handle.close();
  });

  it("rejects subagent targets that allow external send", async () => {
    const clock = createFixedClock("2026-03-26T02:00:00.000Z");
    const { transport } = createDeterministicSubAgentTransport({
      clock,
      scenarioByAgentId: {
        "research-agent": "research-fast"
      }
    });
    const fixture = createFixture(transport, {
      allowExternalSend: true
    });

    fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Forbidden target",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["subagent:research"],
      kind: "task",
      visibility: "internal",
      subject: "This target configuration must be rejected",
      bodyRef: "body://virtual/subagent-disallowed-send",
      roomRevision: 3,
      inputsHash: "hash-subagent-disallowed-send",
      createdAt: clock.now()
    });

    await expect(
      fixture.runtime.dispatchSubAgentMailbox({
        mailboxId: "subagent:research",
        consumerId: "bridge-denied",
        batchSize: 1,
        roomKey: fixture.roomKey,
        now: clock.advanceSeconds(1)
      })
    ).rejects.toThrow("subagent target research-target cannot allow external send");

    const snapshot = collectRoomObservability(fixture.runtime, fixture.roomKey, {
      mailboxId: "internal:assistant:orchestrator"
    });
    expect(snapshot.subagentRuns).toHaveLength(0);
    expect(snapshot.mailboxView).toHaveLength(0);
    expect(snapshot.outbox).toHaveLength(0);
    expect(snapshot.outboxIntents).toHaveLength(0);

    fixture.handle.close();
  });
});
