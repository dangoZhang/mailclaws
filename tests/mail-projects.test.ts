import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import type { ExecuteMailTurnInput, MailAgentExecutor } from "../src/runtime/agent-executor.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import { initializeDatabase } from "../src/storage/db.js";
import { createMailLab, TEST_MAILBOXES } from "./helpers/mail-lab.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-projects-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
    MAILCLAW_FEATURE_MAIL_INGEST: "true",
    MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true"
  });
  const handle = initializeDatabase(config);
  const requests: ExecuteMailTurnInput[] = [];
  const agentExecutor: MailAgentExecutor = {
    async executeMailTurn(input) {
      requests.push(input);
      const normalized = input.inputText.toLowerCase();
      const responseText = normalized.includes("blocker")
        ? "Project Atlas blocker noted. Risk: vendor dependency."
        : normalized.includes("weekly")
          ? "Project Atlas weekly report drafted with next actions."
          : "Project Atlas kickoff summary prepared.";

      return {
        startedAt: "2026-03-27T10:00:00.000Z",
        completedAt: "2026-03-27T10:00:02.000Z",
        responseText,
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
    lab: createMailLab("mail-projects"),
    requests
  };
}

describe("mail projects", () => {
  it("multi_mail_project: groups multiple independent rooms into one durable project aggregate", async () => {
    const fixture = createFixture();

    const kickoff = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: fixture.lab.newMail({
        subject: "Project Atlas: kickoff timeline",
        from: { email: TEST_MAILBOXES.customerA },
        to: [{ email: TEST_MAILBOXES.assistant }],
        text: "Project Atlas kickoff. Please prepare the timeline and owner summary.",
        date: "2026-03-27T10:00:00.000Z"
      }),
      processImmediately: true
    });
    const weekly = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: fixture.lab.newMail({
        subject: "Project Atlas: weekly report",
        from: { email: TEST_MAILBOXES.customerB },
        to: [{ email: TEST_MAILBOXES.assistant }],
        text: "Weekly report for Project Atlas. Include owners, risks, and next action.",
        date: "2026-03-27T11:00:00.000Z"
      }),
      processImmediately: true
    });
    const blocker = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: TEST_MAILBOXES.assistant,
      envelope: fixture.lab.newMail({
        subject: "Project Atlas: blocker update",
        from: { email: TEST_MAILBOXES.customerA },
        to: [{ email: TEST_MAILBOXES.assistant }],
        text: "Project Atlas blocker. Dependency owner is late and needs escalation.",
        date: "2026-03-27T12:00:00.000Z"
      }),
      processImmediately: true
    });

    expect(new Set([kickoff.ingested.roomKey, weekly.ingested.roomKey, blocker.ingested.roomKey]).size).toBe(3);

    const projects = fixture.runtime.listProjects("acct-1");
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      title: "Atlas",
      roomCount: 3,
      activeRoomCount: 0,
      status: "done"
    });
    expect(projects[0]?.latestSummary).toBeTruthy();
    expect(projects[0]?.nextAction).toBeTruthy();

    const kickoffReplay = fixture.runtime.replay(kickoff.ingested.roomKey);
    const weeklyReplay = fixture.runtime.replay(weekly.ingested.roomKey);
    const blockerReplay = fixture.runtime.replay(blocker.ingested.roomKey);

    expect(kickoffReplay.project?.projectId).toBe(projects[0]?.projectId);
    expect(weeklyReplay.project?.projectId).toBe(projects[0]?.projectId);
    expect(blockerReplay.project?.projectId).toBe(projects[0]?.projectId);
    expect(kickoffReplay.roomProjectLinks).toHaveLength(1);
    expect(weeklyReplay.roomProjectLinks).toHaveLength(1);
    expect(blockerReplay.roomProjectLinks).toHaveLength(1);
    expect(blockerReplay.project?.riskSummary).toBeTruthy();
    expect(blockerReplay.outbox.some((item) => item.kind === "final")).toBe(true);
    expect(fixture.requests).toHaveLength(3);

    fixture.handle.close();
  });
});
