import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import type { ExecuteMailTurnInput, MailAgentExecutor } from "../src/runtime/agent-executor.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import { initializeDatabase } from "../src/storage/db.js";
import { listArtifactChunksForRoom } from "../src/storage/repositories/artifact-chunks.js";
import { createMailLab, TEST_MAILBOXES } from "./helpers/mail-lab.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createScenarioFixture(options: {
  env?: Record<string, string>;
  responseForTurn?: (
    input: ExecuteMailTurnInput,
    turn: number
  ) => {
    responseText: string;
    startedAt?: string;
    completedAt?: string;
  };
} = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-scenarios-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
    MAILCLAW_FEATURE_MAIL_INGEST: "true",
    MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
    ...options.env
  });
  const handle = initializeDatabase(config);
  const requests: ExecuteMailTurnInput[] = [];
  const agentExecutor: MailAgentExecutor = {
    async executeMailTurn(input) {
      requests.push(input);
      const turn = requests.length;
      const normalized = input.inputText.toLowerCase();
      const response: {
        responseText: string;
        startedAt?: string;
        completedAt?: string;
      } =
        options.responseForTurn?.(input, turn) ??
        (() => {
          const responseText = normalized.includes("atlas")
            ? "Attachment-aware reply for Project Atlas."
            : "Simple dialog reply.";
          return {
            responseText
          };
        })();
      return {
        startedAt: response.startedAt ?? "2026-03-27T02:00:00.000Z",
        completedAt: response.completedAt ?? "2026-03-27T02:00:01.000Z",
        responseText: response.responseText,
        request: {
          url: "http://127.0.0.1:11437/v1/responses",
          method: "POST",
          headers: {},
          body: {}
        }
      };
    }
  };
  const runtime = createMailSidecarRuntime({
    db: handle.db,
    config,
    agentExecutor
  });
  const lab = createMailLab("mail-scenarios");

  return {
    handle,
    runtime,
    lab,
    requests
  };
}

describe("mail scenarios (testplan3 phase-1)", () => {
  it("simple_dialog: keeps reply continuity in one room and completes two turns", async () => {
    const fixture = createScenarioFixture();

    const firstMail = fixture.lab.newMail({
      subject: "Need timeline confirmation",
      from: { email: TEST_MAILBOXES.customerA },
      to: [{ email: TEST_MAILBOXES.assistant }],
      text: "Can you confirm the expected delivery timeline?"
    });
    const first = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: firstMail,
      processImmediately: true
    });
    expect(first.processed?.status).toBe("completed");

    const secondMail = fixture.lab.reply(firstMail, {
      text: "Thanks. Please also confirm whether a follow-up is needed."
    });
    const second = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: secondMail,
      processImmediately: true
    });
    expect(second.processed?.status).toBe("completed");
    expect(second.ingested.roomKey).toBe(first.ingested.roomKey);

    const replay = fixture.runtime.replay(first.ingested.roomKey);
    expect(replay.room?.revision).toBeGreaterThanOrEqual(2);
    expect(replay.ledger.map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["room.continued", "room.revision.bumped"])
    );
    expect(replay.outbox.every((item) => item.kind === "final")).toBe(true);
    expect(replay.subagentRuns).toHaveLength(0);
    expect(replay.outbox.some((item) => item.kind === "final")).toBe(true);
    expect(replay.outbox.some((item) => item.textBody.includes("Simple dialog reply."))).toBe(true);
    expect(fixture.requests.length).toBeGreaterThanOrEqual(2);

    fixture.handle.close();
  });

  it("attachment_task: persists attachment artifacts and reuses room context in follow-up", async () => {
    const fixture = createScenarioFixture();

    const firstMail = fixture.lab.newMail({
      subject: "Project Atlas handoff details",
      from: { email: TEST_MAILBOXES.customerA },
      to: [{ email: TEST_MAILBOXES.assistant }],
      text: "Please read the attachment and keep the owner information.",
      attachments: [
        {
          filename: "atlas.txt",
          mimeType: "text/plain",
          size: 54,
          data: "Project Atlas owner is Dana. Escalation contact is Lee."
        }
      ]
    });
    const first = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: firstMail,
      processImmediately: true
    });
    expect(first.processed?.status).toBe("completed");

    const followUp = fixture.lab.reply(firstMail, {
      text: "Who owns Project Atlas right now?"
    });
    const second = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: followUp,
      processImmediately: true
    });
    expect(second.processed?.status).toBe("completed");
    expect(second.ingested.roomKey).toBe(first.ingested.roomKey);

    const replay = fixture.runtime.replay(first.ingested.roomKey);
    expect(replay.attachments.length).toBeGreaterThanOrEqual(1);
    expect(replay.attachments[0]?.summaryText).toContain("Project Atlas owner is Dana");
    expect(fs.existsSync(replay.attachments[0]?.artifactPath ?? "")).toBe(true);
    expect(fixture.requests.some((request) => (request.attachments?.length ?? 0) > 0)).toBe(true);
    expect(replay.outbox.some((item) => item.textBody.includes("Attachment-aware reply for Project Atlas."))).toBe(
      true
    );

    fixture.handle.close();
  });

  it("long_reply_chain: emits ack/progress/final across multiple replies while keeping one room", async () => {
    const fixture = createScenarioFixture({
      env: {
        MAILCLAW_REPORTING_ACK_TIMEOUT_MS: "1000",
        MAILCLAW_REPORTING_PROGRESS_INTERVAL_MS: "1000"
      },
      responseForTurn: (_input, turn) => ({
        responseText: turn === 1 ? "Long task update one." : "Long task final follow-up.",
        startedAt: turn === 1 ? "2026-03-27T03:00:00.000Z" : "2026-03-27T03:05:00.000Z",
        completedAt: turn === 1 ? "2026-03-27T03:00:03.500Z" : "2026-03-27T03:05:04.000Z"
      })
    });

    const firstMail = fixture.lab.newMail({
      subject: "Quarterly migration plan",
      from: { email: TEST_MAILBOXES.customerA },
      to: [{ email: TEST_MAILBOXES.assistant }],
      text: "Please prepare a staged migration plan and keep me updated."
    });
    const first = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: firstMail,
      processImmediately: true
    });
    expect(first.processed?.status).toBe("completed");

    const followUp = fixture.lab.reply(firstMail, {
      text: "Any update? Please continue in the same thread."
    });
    const second = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: followUp,
      processImmediately: true
    });
    expect(second.processed?.status).toBe("completed");
    expect(second.ingested.roomKey).toBe(first.ingested.roomKey);

    const replay = fixture.runtime.replay(first.ingested.roomKey);
    const outboxKinds = replay.outbox.map((entry) => entry.kind);
    expect(replay.room?.revision).toBeGreaterThanOrEqual(2);
    expect(outboxKinds.filter((kind) => kind === "ack")).toHaveLength(2);
    expect(outboxKinds.filter((kind) => kind === "progress")).toHaveLength(2);
    expect(outboxKinds.filter((kind) => kind === "final")).toHaveLength(2);
    expect(replay.outbox.some((item) => item.textBody.includes("Long task update one."))).toBe(true);
    expect(replay.outbox.some((item) => item.textBody.includes("Long task final follow-up."))).toBe(true);

    fixture.handle.close();
  });

  it("forward_share_task: handoff suppresses auto-reply until the room is released", async () => {
    const fixture = createScenarioFixture();

    const firstMail = fixture.lab.newMail({
      subject: "Finance approval chain",
      from: { email: TEST_MAILBOXES.customerA },
      to: [{ email: TEST_MAILBOXES.assistant }],
      text: "Please coordinate this with the finance operator."
    });
    const first = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: firstMail,
      processImmediately: true
    });
    expect(first.processed?.status).toBe("completed");

    const handoff = fixture.runtime.requestHandoff(first.ingested.roomKey, {
      requestedBy: TEST_MAILBOXES.ops,
      reason: "finance-share"
    });
    expect(handoff.room?.state).toBe("handoff");
    const outboxCountBeforeBlockedReply = fixture.runtime.replay(first.ingested.roomKey).outbox.length;

    const blockedReply = fixture.lab.reply(firstMail, {
      text: "Reply while the room is under manual handoff."
    });
    const blocked = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: blockedReply,
      processImmediately: true
    });
    expect(blocked.ingested.reasons).toEqual(["handoff_active"]);
    expect(blocked.processed).toBeNull();

    const duringHandoffReplay = fixture.runtime.replay(first.ingested.roomKey);
    expect(duringHandoffReplay.room?.state).toBe("handoff");
    expect(duringHandoffReplay.ledger.map((entry) => entry.type)).toContain("handoff.requested");
    expect(duringHandoffReplay.outbox).toHaveLength(outboxCountBeforeBlockedReply);

    const released = fixture.runtime.releaseHandoff(first.ingested.roomKey, {
      releasedBy: TEST_MAILBOXES.ops,
      reason: "resume-automation"
    });
    expect(released.room?.state).toBe("queued");

    const resumedReply = fixture.lab.reply(firstMail, {
      text: "Manual review is done, continue the thread."
    });
    const resumed = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: resumedReply,
      processImmediately: true
    });
    expect(resumed.processed?.status).toBe("completed");
    expect(resumed.ingested.roomKey).toBe(first.ingested.roomKey);

    const replay = fixture.runtime.replay(first.ingested.roomKey);
    expect(replay.outbox.some((item) => item.kind === "final")).toBe(true);
    expect(replay.ledger.map((entry) => entry.type)).toEqual(
      expect.arrayContaining(["handoff.requested", "handoff.completed", "room.continued"])
    );
    expect(replay.outbox.length).toBeGreaterThan(outboxCountBeforeBlockedReply);

    fixture.handle.close();
  });

  it("large_attachment_task: chunks large attachments and keeps raw tail markers out of executor input", async () => {
    const fixture = createScenarioFixture();
    const body = Array.from({ length: 14 }, (_, index) =>
      `Section ${index + 1}: Atlas rollout status paragraph ${index + 1} with repeated migration detail.`
    ).join("\n\n");
    const secretTail = "TAIL-MARKER-DO-NOT-INLINE-987654321";
    const largeAttachment = `${body}\n\nAppendix:\n${secretTail}`;

    const mail = fixture.lab.newMail({
      subject: "Large attachment review",
      from: { email: TEST_MAILBOXES.customerA },
      to: [{ email: TEST_MAILBOXES.assistant }],
      text: "Review the attached export and summarize the rollout.",
      attachments: [
        {
          filename: "atlas-rollout.txt",
          mimeType: "text/plain",
          size: largeAttachment.length,
          data: largeAttachment
        }
      ]
    });

    const ingested = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: mail,
      processImmediately: true
    });
    expect(ingested.processed?.status).toBe("completed");

    const replay = fixture.runtime.replay(ingested.ingested.roomKey);
    const chunks = listArtifactChunksForRoom(fixture.handle.db, ingested.ingested.roomKey);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => fs.existsSync(chunk.chunkPath))).toBe(true);
    expect(chunks.some((chunk) => (chunk.summaryText ?? "").length > 0)).toBe(true);
    expect(fixture.requests[0]?.attachments?.[0]?.chunks.length).toBeGreaterThan(1);
    expect(fixture.requests[0]?.inputText).not.toContain(secretTail);
    expect(replay.attachments[0]?.artifactPath).toBeTruthy();
    expect(replay.sharedFacts?.attachments[0]?.summaryText).toBeTruthy();
    expect(replay.outbox.some((item) => item.kind === "final")).toBe(true);

    fixture.handle.close();
  });

});
