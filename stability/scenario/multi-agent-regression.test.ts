import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config.js";
import { replayRoom } from "../../src/core/replay.js";
import { createMailSidecarRuntime } from "../../src/orchestration/runtime.js";
import { ingestIncomingMail, processNextRoomJob } from "../../src/orchestration/service.js";
import type { ProviderMailEnvelope } from "../../src/providers/types.js";
import type { MailAgentExecutor } from "../../src/runtime/agent-executor.js";
import { initializeDatabase } from "../../src/storage/db.js";
import { saveThreadRoom } from "../../src/storage/repositories/thread-rooms.js";
import { createFixedClock } from "../../tests/helpers/fixed-clock.js";
import { createDeterministicSubAgentTransport } from "../../tests/helpers/subagent-stubs.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("stability: multi-agent regression", () => {
  it("keeps subagent evidence inside internal reply mail and converges to one public final", async () => {
    const { config, handle } = createDb();
    const clock = createFixedClock("2026-03-30T00:00:00.000Z");
    const sentOutboxIds: string[] = [];
    const { transport, calls } = createDeterministicSubAgentTransport({
      clock,
      scenarioByAgentId: {
        "research-agent": "research-fast"
      }
    });
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      subAgentTransport: transport,
      smtpSender: {
        async send(message) {
          sentOutboxIds.push(message.outboxId);
          return {
            providerMessageId: `<sent-${sentOutboxIds.length}@example.test>`
          };
        }
      },
      agentExecutor: {
        async executeMailTurn(request) {
          const sawInternalEvidence = request.inputText.includes(
            "mail-researcher: Research found the relevant supporting evidence."
          );

          return {
            startedAt: clock.now(),
            completedAt: clock.advanceSeconds(2),
            responseText: sawInternalEvidence
              ? "Final answer grounded in subagent evidence."
              : "Final answer missing subagent evidence.",
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
      }
    });
    runtime.upsertAccount({
      accountId: "acct-1",
      provider: "smtp",
      emailAddress: "assistant@acme.ai",
      status: "active",
      settings: {}
    });
    runtime.upsertVirtualMailbox({
      mailboxId: "subagent:research",
      accountId: "acct-1",
      principalId: "principal:subagent:research",
      kind: "system",
      active: true,
      createdAt: clock.now(),
      updatedAt: clock.now()
    });
    runtime.upsertSubAgentTarget({
      targetId: "research-target",
      accountId: "acct-1",
      mailboxId: "subagent:research",
      openClawAgentId: "research-agent",
      mode: "burst",
      sandboxMode: "require",
      maxActivePerRoom: 1,
      maxQueuedPerInbox: 5,
      allowExternalSend: false,
      resultSchema: "research",
      enabled: true,
      createdAt: clock.now(),
      updatedAt: clock.now()
    });

    const ingested = await runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: "assistant@acme.ai",
      processImmediately: true,
      envelope: buildEnvelope({
        providerMessageId: "multi-agent-subagent-root",
        messageId: "<multi-agent-subagent-root@example.test>",
        subject: "Please verify the attached export",
        to: [{ email: "assistant@acme.ai" }]
      })
    });

    const delivered = await runtime.deliverOutbox();
    const replay = runtime.replay(ingested.ingested.roomKey);
    const orchestratorMailboxId = `internal:${encodeURIComponent("assistant@acme.ai")}:orchestrator`;
    const orchestratorView = runtime.projectMailboxView({
      roomKey: ingested.ingested.roomKey,
      mailboxId: orchestratorMailboxId
    });

    expect(calls.spawns).toHaveLength(1);
    expect(delivered.sent).toBe(1);
    expect(sentOutboxIds).toHaveLength(1);
    expect(replay.outbox).toHaveLength(1);
    expect(
      orchestratorView.some(
        (entry) =>
          entry.message.fromMailboxId === "subagent:research" &&
          entry.message.kind === "claim" &&
          entry.message.parentMessageId !== null
      )
    ).toBe(true);
    expect(replay.ledger.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "subagent.run.accepted",
        "subagent.run.completed",
        "virtual_mail.message_replied",
        "mail.final_sent"
      ])
    );

    handle.close();
  });

  it("keeps parallel worker fan-out deterministic and forces approval before delivery", async () => {
    const { config, handle } = createDb({
      swarmWorkers: true
    });
    const sentOutboxIds: string[] = [];
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      smtpSender: {
        async send(message) {
          sentOutboxIds.push(message.outboxId);
          return {
            providerMessageId: `<sent-${sentOutboxIds.length}@example.test>`
          };
        }
      }
    });
    let activeSiblingWorkers = 0;
    let maxSiblingWorkers = 0;

    const executor: MailAgentExecutor = {
      async executeMailTurn(request) {
        if (
          request.sessionKey.endsWith(":agent:mail-attachment-reader") ||
          request.sessionKey.endsWith(":agent:mail-researcher")
        ) {
          activeSiblingWorkers += 1;
          maxSiblingWorkers = Math.max(maxSiblingWorkers, activeSiblingWorkers);
          await delay(20);
          activeSiblingWorkers -= 1;

          return {
            startedAt: "2026-03-30T01:00:00.000Z",
            completedAt: "2026-03-30T01:00:01.000Z",
            responseText: request.sessionKey.endsWith(":agent:mail-attachment-reader")
              ? JSON.stringify({
                  summary: "Attachment evidence says Dana owns Atlas."
                })
              : JSON.stringify({
                  summary: "Research confirms Dana is the named owner."
                }),
            request: {
              url: "http://127.0.0.1:11437/v1/responses",
              method: "POST",
              headers: {},
              body: {}
            }
          };
        }

        if (request.sessionKey.endsWith(":agent:mail-reviewer")) {
          return {
            startedAt: "2026-03-30T01:00:02.000Z",
            completedAt: "2026-03-30T01:00:03.000Z",
            responseText: JSON.stringify({
              summary: "Reviewer found no factual issues."
            }),
            request: {
              url: "http://127.0.0.1:11437/v1/responses",
              method: "POST",
              headers: {},
              body: {}
            }
          };
        }

        if (request.sessionKey.endsWith(":agent:mail-guard")) {
          return {
            startedAt: "2026-03-30T01:00:04.000Z",
            completedAt: "2026-03-30T01:00:05.000Z",
            responseText: JSON.stringify({
              summary: "Guard requires approval before sending.",
              approvalRequired: true
            }),
            request: {
              url: "http://127.0.0.1:11437/v1/responses",
              method: "POST",
              headers: {},
              body: {}
            }
          };
        }

        return {
          startedAt: "2026-03-30T01:00:06.000Z",
          completedAt: "2026-03-30T01:00:07.000Z",
          responseText: "Final answer that should remain pending approval.",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {}
          }
        };
      }
    };

    const ingested = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaw@example.com",
        envelope: buildEnvelope({
          attachments: [
            {
              filename: "atlas.txt",
              mimeType: "text/plain",
              size: 64,
              data: "Atlas owner is Dana. Escalation path is Lee."
            }
          ]
        })
      }
    );
    const processed = await processNextRoomJob({
      db: handle.db,
      config,
      agentExecutor: executor
    });
    const pendingOutboxIds = processed?.outbox.map((record) => record.outboxId) ?? [];
    for (const outboxId of pendingOutboxIds) {
      runtime.approveOutbox(outboxId, "2026-03-30T01:00:08.000Z");
    }
    const delivered = await runtime.deliverOutbox();
    const replay = replayRoom(handle.db, ingested.roomKey);

    expect(processed?.status).toBe("completed");
    expect(maxSiblingWorkers).toBe(2);
    expect(pendingOutboxIds.length).toBeGreaterThan(0);
    expect(delivered.sent).toBe(pendingOutboxIds.length);
    expect(sentOutboxIds).toEqual(pendingOutboxIds);
    expect(replay.virtualMailboxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "attachment-reader", kind: "internal_role" }),
        expect.objectContaining({ role: "researcher", kind: "internal_role" }),
        expect.objectContaining({ role: "reviewer", kind: "governance" }),
        expect.objectContaining({ role: "guard", kind: "governance" })
      ])
    );
    expect(replay.taskNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "mail-attachment-reader", status: "done" }),
        expect.objectContaining({ role: "mail-researcher", status: "done" }),
        expect.objectContaining({ role: "mail-reviewer", status: "done" }),
        expect.objectContaining({ role: "mail-guard", status: "done" })
      ])
    );

    handle.close();
  });

  it("suppresses stale replies when a newer inbound supersedes an in-flight run", async () => {
    const { config, handle } = createDb();
    let callCount = 0;
    let releaseFirstRun: (() => void) | undefined;
    let firstRunStarted: (() => void) | undefined;

    const firstRunReady = new Promise<void>((resolve) => {
      firstRunStarted = resolve;
    });
    const firstRunCompleted = new Promise<void>((resolve) => {
      releaseFirstRun = resolve;
    });

    const executor: MailAgentExecutor = {
      async executeMailTurn() {
        callCount += 1;

        if (callCount === 1) {
          firstRunStarted?.();
          await firstRunCompleted;

          return {
            startedAt: "2026-03-30T02:00:00.000Z",
            completedAt: "2026-03-30T02:00:05.000Z",
            responseText: "Stale summary that should not be mailed.",
            request: {
              url: "http://127.0.0.1:11437/v1/responses",
              method: "POST",
              headers: {},
              body: {}
            }
          };
        }

        return {
          startedAt: "2026-03-30T02:00:06.000Z",
          completedAt: "2026-03-30T02:00:07.000Z",
          responseText: "Fresh answer for the latest message.",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {}
          }
        };
      }
    };

    const firstIngest = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaw@example.com",
        envelope: buildEnvelope()
      }
    );
    const firstRunPromise = processNextRoomJob({
      db: handle.db,
      config,
      agentExecutor: executor
    });
    await firstRunReady;

    const secondIngest = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaw@example.com",
        envelope: buildEnvelope({
          providerMessageId: "provider-2",
          messageId: "<msg-2@example.com>",
          headers: [
            {
              name: "Message-ID",
              value: "<msg-2@example.com>"
            },
            {
              name: "In-Reply-To",
              value: "<msg-1@example.com>"
            },
            {
              name: "References",
              value: "<msg-1@example.com>"
            }
          ],
          text: "Actually, answer the new question instead."
        })
      }
    );

    expect(secondIngest.roomKey).toBe(firstIngest.roomKey);

    releaseFirstRun?.();
    const firstProcessed = await firstRunPromise;
    const secondProcessed = await processNextRoomJob({
      db: handle.db,
      config,
      agentExecutor: executor
    });
    const replay = replayRoom(handle.db, firstIngest.roomKey);

    expect(firstProcessed?.outbox).toHaveLength(0);
    expect(secondProcessed?.outbox.map((item) => item.kind)).toEqual(["final"]);
    expect(replay.outbox).toHaveLength(1);
    expect(replay.outbox[0]?.textBody).toBe("Fresh answer for the latest message.");
    expect(replay.ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "worker.result",
          payload: expect.objectContaining({
            stale: true,
            supersededByRevision: 2
          })
        })
      ])
    );

    handle.close();
  });

  it("suppresses in-flight auto replies after a room enters handoff", async () => {
    const { config, handle } = createDb();
    let releaseRun: (() => void) | undefined;
    let runStarted: (() => void) | undefined;

    const started = new Promise<void>((resolve) => {
      runStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseRun = resolve;
    });

    const executor: MailAgentExecutor = {
      async executeMailTurn() {
        runStarted?.();
        await released;

        return {
          startedAt: "2026-03-30T03:00:00.000Z",
          completedAt: "2026-03-30T03:00:05.000Z",
          responseText: "This reply should stay internal because handoff is active.",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {}
          }
        };
      }
    };

    const ingested = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaw@example.com",
        envelope: buildEnvelope()
      }
    );

    const processing = processNextRoomJob({
      db: handle.db,
      config,
      agentExecutor: executor
    });
    await started;

    const room = replayRoom(handle.db, ingested.roomKey).room;
    if (!room) {
      throw new Error("expected room");
    }
    saveThreadRoom(handle.db, {
      ...room,
      state: "handoff"
    });

    releaseRun?.();
    const processed = await processing;
    const replay = replayRoom(handle.db, ingested.roomKey);

    expect(processed?.outbox).toHaveLength(0);
    expect(replay.room?.state).toBe("handoff");
    expect(replay.outbox).toHaveLength(0);
    expect(replay.ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "room.closed",
          payload: expect.objectContaining({
            handoffActive: true,
            autoReplySuppressed: true
          })
        })
      ])
    );

    handle.close();
  });
});

function createDb(options: {
  swarmWorkers?: boolean;
} = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-stability-multi-agent-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
    MAILCLAW_FEATURE_MAIL_INGEST: "true",
    MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
    MAILCLAW_FEATURE_SWARM_WORKERS: options.swarmWorkers ? "true" : "false",
    MAILCLAW_OPENCLAW_GATEWAY_TOKEN: "super-secret-token"
  });
  const handle = initializeDatabase(config);

  return {
    config,
    handle
  };
}

function buildEnvelope(overrides: Partial<ProviderMailEnvelope> = {}): ProviderMailEnvelope {
  return {
    providerMessageId: "provider-1",
    messageId: "<msg-1@example.com>",
    subject: "Quarterly review",
    from: {
      email: "sender@example.com",
      name: "Sender"
    },
    to: [
      {
        email: "mailclaw@example.com"
      }
    ],
    headers: [
      {
        name: "Message-ID",
        value: "<msg-1@example.com>"
      }
    ],
    text: "Please summarize the latest attachment.",
    attachments: [
      {
        filename: "notes.pdf",
        mimeType: "application/pdf",
        size: 2048
      }
    ],
    ...overrides
  };
}
