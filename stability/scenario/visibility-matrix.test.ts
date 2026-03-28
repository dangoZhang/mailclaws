import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../../src/config.js";
import type { VirtualMailbox } from "../../src/core/types.js";
import { createMailSidecarRuntime } from "../../src/orchestration/runtime.js";
import { initializeDatabase } from "../../src/storage/db.js";
import { saveThreadRoom } from "../../src/storage/repositories/thread-rooms.js";
import { buildRoomSessionKey } from "../../src/threading/session-key.js";
import { createMailLab } from "../../tests/helpers/mail-lab.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("stability: visibility matrix", () => {
  it("keeps public, internal, governance, and private projections isolated across replay and rebuild", () => {
    const fixture = createVirtualFixture();

    const progress = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "room",
      topic: "Public progress",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["public:assistant"],
      kind: "progress",
      visibility: "room",
      subject: "We are processing this",
      bodyRef: "body://room/progress-1",
      roomRevision: 5,
      inputsHash: "hash-progress-1",
      createdAt: "2026-03-29T01:00:00.000Z"
    });
    const internalTask = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadKind: "work",
      topic: "Internal work",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher"],
      kind: "task",
      visibility: "internal",
      subject: "Internal task",
      bodyRef: "body://internal/task-1",
      roomRevision: 5,
      inputsHash: "hash-task-1",
      createdAt: "2026-03-29T01:00:10.000Z"
    });
    const approval = fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadId: internalTask.thread.threadId,
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["governance:assistant:reviewer", "governance:assistant:guard", "human:ops"],
      kind: "approval",
      visibility: "governance",
      subject: "Approval pending",
      bodyRef: "body://governance/approval-1",
      roomRevision: 5,
      inputsHash: "hash-approval-1",
      createdAt: "2026-03-29T01:00:20.000Z"
    });
    fixture.runtime.submitVirtualMessage({
      roomKey: fixture.roomKey,
      threadId: approval.thread.threadId,
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "governance:assistant:reviewer",
      toMailboxIds: ["human:ops"],
      kind: "question",
      visibility: "private",
      subject: "Private escalation",
      bodyRef: "body://private/escalation-1",
      roomRevision: 5,
      inputsHash: "hash-private-1",
      createdAt: "2026-03-29T01:00:30.000Z"
    });

    fixture.runtime.bindGatewaySessionToRoom({
      sessionKey: "gateway-visibility",
      roomKey: fixture.roomKey,
      bindingKind: "room",
      sourceControlPlane: "openclaw",
      frontAgentId: "assistant",
      now: "2026-03-29T01:00:40.000Z"
    });

    expect(() =>
      fixture.runtime.projectGatewayTurnToVirtualMail({
        sessionKey: "gateway-visibility",
        sourceControlPlane: "openclaw",
        fromPrincipalId: "principal:assistant",
        fromMailboxId: "internal:assistant:researcher",
        toMailboxIds: ["public:assistant"],
        kind: "claim",
        visibility: "internal",
        subject: "Malicious public leak",
        bodyRef: "body://attack/public-leak",
        inputsHash: "hash-attack-public-leak",
        createdAt: "2026-03-29T01:00:41.000Z"
      })
    ).toThrow(/internal virtual messages cannot target public or human mailboxes/);

    expect(
      fixture.runtime.projectRoomOutcomeToGateway({
        roomKey: fixture.roomKey,
        messageId: progress.message.messageId,
        projectedAt: "2026-03-29T01:00:42.000Z"
      }).mode
    ).toBe("session_reply");
    expect(
      fixture.runtime.projectRoomOutcomeToGateway({
        roomKey: fixture.roomKey,
        messageId: approval.message.messageId,
        projectedAt: "2026-03-29T01:00:43.000Z"
      }).mode
    ).toBe("workbench_notice");
    expect(
      fixture.runtime.projectRoomOutcomeToGateway({
        roomKey: fixture.roomKey,
        messageId: internalTask.message.messageId,
        projectedAt: "2026-03-29T01:00:44.000Z"
      }).mode
    ).toBe("no_external_projection");

    const before = collectVisibilityViews(fixture.runtime, fixture.roomKey);
    expect(before.publicKinds).toEqual(["progress"]);
    expect(before.researcherKinds).toEqual(["task"]);
    expect(before.reviewerKinds).toEqual(["approval"]);
    expect(before.guardKinds).toEqual(["approval"]);
    expect(before.humanKinds).toEqual(["approval", "question"]);
    expect(before.gatewayProjectionMessageIds).toEqual([]);

    fixture.handle.db.prepare("DELETE FROM mailbox_deliveries WHERE room_key = ?;").run(fixture.roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_messages WHERE room_key = ?;").run(fixture.roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_threads WHERE room_key = ?;").run(fixture.roomKey);
    fixture.runtime.rebuildVirtualMailProjection(fixture.roomKey);

    const after = collectVisibilityViews(fixture.runtime, fixture.roomKey);
    expect(after).toEqual(before);

    fixture.handle.close();
  });

  it("keeps retrieval room-local so one room cannot read another room's indexed context", async () => {
    const fixture = createIngestFixture();
    const mailLab = createMailLab("stability-visibility");

    const atlas = await fixture.runtime.ingest({
      accountId: "acct-visibility",
      mailboxAddress: "assistant@acme.ai",
      envelope: mailLab.newMail({
        providerMessageId: "atlas-provider",
        messageId: "<atlas-provider@example.test>",
        subject: "Atlas room",
        text: "atlas-confidential-token appears only in Atlas room.",
        to: [{ email: "assistant@acme.ai" }],
        date: "2026-03-29T02:00:00.000Z"
      }),
      processImmediately: false
    });
    const phoenix = await fixture.runtime.ingest({
      accountId: "acct-visibility",
      mailboxAddress: "assistant@acme.ai",
      envelope: mailLab.newMail({
        providerMessageId: "phoenix-provider",
        messageId: "<phoenix-provider@example.test>",
        subject: "Phoenix room",
        text: "phoenix-confidential-token appears only in Phoenix room.",
        to: [{ email: "assistant@acme.ai" }],
        date: "2026-03-29T02:01:00.000Z"
      }),
      processImmediately: false
    });

    const atlasHits = fixture.runtime.retrieveRoomContext(atlas.ingested.roomKey, "atlas-confidential-token");
    const atlasLeak = fixture.runtime.retrieveRoomContext(atlas.ingested.roomKey, "phoenix-confidential-token");
    const phoenixHits = fixture.runtime.retrieveRoomContext(phoenix.ingested.roomKey, "phoenix-confidential-token");
    const phoenixLeak = fixture.runtime.retrieveRoomContext(phoenix.ingested.roomKey, "atlas-confidential-token");

    expect(atlasHits).not.toHaveLength(0);
    expect(phoenixHits).not.toHaveLength(0);
    expect(atlasLeak).toEqual([]);
    expect(phoenixLeak).toEqual([]);

    fixture.handle.close();
  });
});

function createVirtualFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-stability-visibility-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
  });
  const handle = initializeDatabase(config);
  const runtime = createMailSidecarRuntime({
    db: handle.db,
    config
  });
  const roomKey = buildRoomSessionKey("acct-visibility", "thread-visibility");

  saveThreadRoom(handle.db, {
    roomKey,
    accountId: "acct-visibility",
    stableThreadId: "thread-visibility",
    parentSessionKey: "gateway-parent-visibility",
    frontAgentAddress: "assistant@acme.ai",
    state: "idle",
    revision: 5,
    lastInboundSeq: 1,
    lastOutboundSeq: 0
  });
  for (const mailbox of buildVisibilityMailboxes("acct-visibility")) {
    runtime.upsertVirtualMailbox(mailbox);
  }

  return {
    handle,
    runtime,
    roomKey
  };
}

function createIngestFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-stability-retrieval-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
    MAILCLAW_FEATURE_MAIL_INGEST: "true"
  });
  const handle = initializeDatabase(config);
  const runtime = createMailSidecarRuntime({
    db: handle.db,
    config
  });
  runtime.upsertAccount({
    accountId: "acct-visibility",
    provider: "smtp",
    emailAddress: "assistant@acme.ai",
    status: "active",
    settings: {}
  });

  return {
    handle,
    runtime
  };
}

function buildVisibilityMailboxes(accountId: string): VirtualMailbox[] {
  const base = {
    accountId,
    principalId: "principal:assistant",
    active: true,
    createdAt: "2026-03-29T00:59:00.000Z",
    updatedAt: "2026-03-29T00:59:00.000Z"
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
    },
    {
      ...base,
      mailboxId: "human:ops",
      principalId: "principal:ops",
      kind: "human"
    }
  ] satisfies VirtualMailbox[];
}

function collectVisibilityViews(
  runtime: ReturnType<typeof createMailSidecarRuntime>,
  roomKey: string
) {
  return {
    publicKinds: runtime.projectMailboxView({
      roomKey,
      mailboxId: "public:assistant"
    }).map((entry) => entry.message.kind),
    researcherKinds: runtime.projectMailboxView({
      roomKey,
      mailboxId: "internal:assistant:researcher"
    }).map((entry) => entry.message.kind),
    reviewerKinds: runtime.projectMailboxView({
      roomKey,
      mailboxId: "governance:assistant:reviewer"
    }).map((entry) => entry.message.kind),
    guardKinds: runtime.projectMailboxView({
      roomKey,
      mailboxId: "governance:assistant:guard"
    }).map((entry) => entry.message.kind),
    humanKinds: runtime.projectMailboxView({
      roomKey,
      mailboxId: "human:ops"
    }).map((entry) => entry.message.kind),
    publicFeedKinds: runtime.projectMailboxFeed({
      accountId: "acct-visibility",
      mailboxId: "public:assistant"
    }).map((entry) => entry.message.kind),
    gatewayProjectionMessageIds: runtime.replay(roomKey).gatewayProjectionTrace.messageIds
  };
}
