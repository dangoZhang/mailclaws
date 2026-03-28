import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config.js";
import { createMailSidecarRuntime } from "../../src/orchestration/runtime.js";
import type { ProviderMailEnvelope } from "../../src/providers/types.js";
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

describe("stability: long-thread recovery", () => {
  it("keeps a 20-turn room monotonic across restart, replay, queue resume, and repeated delivery passes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-stability-long-thread-"));
    tempDirs.push(tempDir);

    const clock = createFixedClock("2026-03-28T03:00:00.000Z");
    const deliveries: Array<{ subject: string; messageId?: string }> = [];
    let runCount = 0;

    const agentExecutor: MailAgentExecutor = {
      async executeMailTurn(request) {
        runCount += 1;
        const startedAt = clock.now();
        const completedAt = clock.advanceSeconds(1);

        return {
          startedAt,
          completedAt,
          responseText: `Durable final ${runCount}`,
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {
              "x-openclaw-session-key": request.sessionKey
            },
            body: {
              sessionKey: request.sessionKey
            }
          }
        };
      }
    };

    const openRuntime = () => {
      const config = loadConfig({
        MAILCLAW_STATE_DIR: tempDir,
        MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
        MAILCLAW_FEATURE_MAIL_INGEST: "true",
        MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true"
      });
      const handle = initializeDatabase(config);
      const runtime = createMailSidecarRuntime({
        db: handle.db,
        config,
        agentExecutor,
        smtpSender: {
          send: async (message) => {
            deliveries.push({
              subject: message.subject,
              messageId: message.headers["Message-ID"]
            });

            return {
              providerMessageId: `<smtp-${deliveries.length}@example.test>`
            };
          }
        }
      });
      runtime.upsertAccount({
        accountId: "acct-stability",
        provider: "smtp",
        emailAddress: "assistant@acme.ai",
        status: "active",
        settings: {}
      });

      return {
        handle,
        runtime
      };
    };

    const lab = createMailLab("stability-long-thread");
    let previous: ProviderMailEnvelope | null = null;
    let roomKey = "";

    for (let turn = 1; turn <= 20; turn += 1) {
      const envelope =
        previous === null
          ? lab.newMail({
              providerMessageId: `turn-${turn}`,
              messageId: `<turn-${turn}@example.test>`,
              subject: "Long-running room",
              text: `Turn ${turn}`,
              date: clock.now()
            })
          : lab.reply(previous as Parameters<ReturnType<typeof createMailLab>["reply"]>[0], {
              providerMessageId: `turn-${turn}`,
              messageId: `<turn-${turn}@example.test>`,
              from: previous.from,
              to: previous.to,
              text: `Turn ${turn}`,
              date: clock.advanceMinutes(1)
            });
      previous = envelope;

      const mode = turn % 5 === 0 ? "deliver_restart" : turn % 4 === 0 ? "queued_restart" : "steady";
      const fixture = openRuntime();
      const ingested = await fixture.runtime.ingest({
        accountId: "acct-stability",
        mailboxAddress: "assistant@acme.ai",
        envelope,
        processImmediately: mode !== "queued_restart"
      });

      if (!roomKey) {
        roomKey = ingested.ingested.roomKey;
      }
      expect(ingested.ingested.roomKey).toBe(roomKey);
      expect(ingested.ingested.stableThreadId).toBeDefined();

      if (mode === "steady") {
        const firstPass = await fixture.runtime.deliverOutbox();
        const secondPass = await fixture.runtime.deliverOutbox();

        expect(firstPass.sent).toBeGreaterThan(0);
        expect(secondPass.sent).toBe(0);
        fixture.handle.close();
        continue;
      }

      fixture.handle.close();

      const restarted = openRuntime();
      if (mode === "queued_restart") {
        const recovered = restarted.runtime.recover(clock.advanceMinutes(5));
        expect(recovered.queuedJobs.some((job) => job.roomKey === roomKey)).toBe(true);

        const drained = await restarted.runtime.drainQueue({
          maxRuns: 1,
          now: clock.advanceSeconds(5)
        });
        expect(drained.processed).toHaveLength(1);
      } else {
        const recovered = restarted.runtime.recover(clock.advanceMinutes(5));
        expect(recovered.recoveredJobs).toBeGreaterThanOrEqual(0);
      }

      const firstPass = await restarted.runtime.deliverOutbox();
      const secondPass = await restarted.runtime.deliverOutbox();

      expect(firstPass.sent).toBeGreaterThan(0);
      expect(secondPass.sent).toBe(0);
      restarted.handle.close();
    }

    const firstSnapshotFixture = openRuntime();
    const firstSnapshot = collectRoomObservability(firstSnapshotFixture.runtime, roomKey);
    expect(firstSnapshot.room).not.toBeNull();
    expect(firstSnapshot.roomRevision).toBe(20);
    expect(firstSnapshot.room?.lastInboundSeq).toBe(20);
    expect(firstSnapshot.roomEvents.filter((event) => event.type === "room.revision.bumped")).toHaveLength(20);
    expect(firstSnapshot.outboxIntents.length).toBeGreaterThanOrEqual(20);
    expect(firstSnapshot.deliveryAttempts).toHaveLength(firstSnapshot.outboxIntents.length);
    expect(new Set(firstSnapshot.deliveryAttempts.map((attempt) => attempt.outboxId)).size).toBe(
      firstSnapshot.outboxIntents.length
    );
    expect(deliveries).toHaveLength(firstSnapshot.outboxIntents.length);

    const replayTimeline = summarizeTimeline(firstSnapshot);
    firstSnapshotFixture.handle.close();

    const secondSnapshotFixture = openRuntime();
    const secondSnapshot = collectRoomObservability(secondSnapshotFixture.runtime, roomKey);
    expect(summarizeTimeline(secondSnapshot)).toEqual(replayTimeline);

    const extraDeliveryPass = await secondSnapshotFixture.runtime.deliverOutbox();
    expect(extraDeliveryPass.sent).toBe(0);
    expect(deliveries).toHaveLength(secondSnapshot.outboxIntents.length);

    secondSnapshotFixture.handle.close();
  });
});

function summarizeTimeline(snapshot: ReturnType<typeof collectRoomObservability>) {
  return {
    roomKey: snapshot.room?.roomKey,
    stableThreadId: snapshot.room?.stableThreadId,
    revision: snapshot.roomRevision,
    lastInboundSeq: snapshot.room?.lastInboundSeq,
    lastOutboundSeq: snapshot.room?.lastOutboundSeq,
    ledgerTypes: snapshot.roomEvents.map((event) => event.type),
    outboxStatuses: snapshot.outboxIntents.map((intent) => ({
      intentId: intent.intentId,
      kind: intent.kind,
      status: intent.status
    })),
    attemptStatuses: snapshot.deliveryAttempts.map((attempt) => ({
      outboxId: attempt.outboxId,
      status: attempt.status
    }))
  };
}
