import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import type { MailAgentExecutor } from "../src/runtime/agent-executor.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import { initializeDatabase } from "../src/storage/db.js";
import { createMailLab, TEST_MAILBOXES } from "./helpers/mail-lab.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createFixture(options: {
  env?: Record<string, string>;
} = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-scheduling-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
    MAILCLAW_FEATURE_MAIL_INGEST: "true",
    MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
    ...options.env
  });
  const handle = initializeDatabase(config);
  const agentExecutor: MailAgentExecutor = {
    async executeMailTurn() {
      return {
        startedAt: "2026-03-27T12:00:00.000Z",
        completedAt: "2026-03-27T12:00:01.000Z",
        responseText: "Initial scheduled-mail turn processed.",
        request: {
          url: "http://127.0.0.1:11437/v1/responses",
          method: "POST",
          headers: {},
          body: {}
        }
      };
    }
  };

  return {
    handle,
    runtime: createMailSidecarRuntime({
      db: handle.db,
      config,
      agentExecutor
    }),
    lab: createMailLab("mail-scheduling")
  };
}

describe("mail scheduling", () => {
  it("scheduled_mail_task: creates run-at reminders that execute through outbox and respect approval gating", async () => {
    const fixture = createFixture({
      env: {
        MAILCLAW_FEATURE_APPROVAL_GATE: "true"
      }
    });

    const firstMail = fixture.lab.newMail({
      subject: "Atlas reminder tomorrow",
      from: { email: TEST_MAILBOXES.customerA },
      to: [{ email: TEST_MAILBOXES.assistant }],
      text: "Please remind me tomorrow if there is no update."
    });
    const ingested = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: firstMail,
      processImmediately: false
    });
    const replayBeforeRun = fixture.runtime.replay(ingested.ingested.roomKey);

    expect(replayBeforeRun.scheduledMailJobs).toHaveLength(1);
    expect(replayBeforeRun.scheduledMailJobs[0]).toMatchObject({
      kind: "run_at",
      status: "active",
      scheduleRef: "tomorrow"
    });

    const runResult = fixture.runtime.runScheduledMailJobs("2026-03-28T12:00:00.000Z");
    const replayAfterRun = fixture.runtime.replay(ingested.ingested.roomKey);

    expect(runResult.attempted).toBe(1);
    expect(replayAfterRun.scheduledMailJobs[0]).toMatchObject({
      status: "completed"
    });
    expect(replayAfterRun.outbox).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "pending_approval",
          kind: "final",
          textBody: expect.stringContaining("Scheduled follow-up")
        })
      ])
    );

    fixture.handle.close();
  });

  it("scheduled_mail_task: supports pause/resume/run-now/cancel and cancels future reminders when a reply arrives", async () => {
    const fixture = createFixture();

    const recurringMail = fixture.lab.newMail({
      subject: "Weekly Atlas reminder",
      from: { email: TEST_MAILBOXES.customerA },
      to: [{ email: TEST_MAILBOXES.assistant }],
      text: "Please send a weekly reminder every week until this is answered."
    });
    const ingested = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: recurringMail,
      processImmediately: false
    });
    const jobId = fixture.runtime.replay(ingested.ingested.roomKey).scheduledMailJobs[0]?.jobId;
    if (!jobId) {
      throw new Error("expected scheduled mail job");
    }

    const paused = fixture.runtime.pauseScheduledMailJob(jobId, "2026-03-27T13:00:00.000Z");
    expect(paused?.status).toBe("paused");
    const resumed = fixture.runtime.resumeScheduledMailJob(jobId, "2026-03-27T13:05:00.000Z");
    expect(resumed?.status).toBe("active");
    const runNow = fixture.runtime.runScheduledMailJobNow(jobId, "2026-03-27T13:06:00.000Z");
    expect(runNow?.status).toBe("active");
    expect(runNow?.lastOutboxId).toBeTruthy();
    expect(runNow?.nextRunAt).toBeTruthy();

    const followUpMail = fixture.lab.reply(recurringMail, {
      text: "I replied manually, please stop the recurring reminder."
    });
    await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: followUpMail,
      processImmediately: false
    });

    const cancelledByReply = fixture.runtime.replay(ingested.ingested.roomKey).scheduledMailJobs[0];
    expect(cancelledByReply).toMatchObject({
      status: "cancelled",
      cancellationReason: "external_reply_received"
    });

    const anotherMail = fixture.lab.newMail({
      subject: "Weekly Atlas reminder (operator cancel)",
      from: { email: TEST_MAILBOXES.customerB },
      to: [{ email: TEST_MAILBOXES.assistant }],
      text: "Send a weekly reminder every week."
    });
    const another = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: anotherMail,
      processImmediately: false
    });
    const anotherJobId = fixture.runtime.replay(another.ingested.roomKey).scheduledMailJobs[0]?.jobId;
    if (!anotherJobId) {
      throw new Error("expected second scheduled mail job");
    }
    const cancelledByOperator = fixture.runtime.cancelScheduledMailJob(
      anotherJobId,
      "operator_cancelled",
      "2026-03-27T14:00:00.000Z"
    );
    expect(cancelledByOperator).toMatchObject({
      status: "cancelled",
      cancellationReason: "operator_cancelled"
    });

    fixture.handle.close();
  });
});
