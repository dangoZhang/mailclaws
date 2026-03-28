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

function createFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-codex-thread-"));
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
  const roomKey = buildRoomSessionKey("acct-1", "thread-codex-history");

  saveThreadRoom(handle.db, {
    roomKey,
    accountId: "acct-1",
    stableThreadId: "thread-codex-history",
    parentSessionKey: "gateway-session-codex",
    frontAgentAddress: "assistant@acme.ai",
    state: "idle",
    revision: 4,
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

describe("codex thread history to mail", () => {
  it("imports codex-style thread history into virtual mail and makes shared context searchable", () => {
    const fixture = createFixture();

    const imported = fixture.runtime.importGatewayThreadHistory({
      roomKey: fixture.roomKey,
      sessionKey: "gateway-session-codex",
      sourceControlPlane: "openclaw",
      frontAgentId: "assistant",
      turns: [
        {
          sourceMessageId: "turn-1",
          fromPrincipalId: "principal:assistant",
          fromMailboxId: "public:assistant",
          toMailboxIds: ["internal:assistant:orchestrator"],
          kind: "question",
          visibility: "internal",
          subject: "Customer asks for release risk summary",
          bodyText: "Need a summary of release risk. Focus on the vendor dependency and the budget approval deadline for Phase Beta.",
          createdAt: "2026-03-27T09:00:00.000Z"
        },
        {
          sourceMessageId: "turn-2",
          fromPrincipalId: "principal:assistant",
          fromMailboxId: "internal:assistant:orchestrator",
          toMailboxIds: ["internal:assistant:researcher"],
          kind: "task",
          visibility: "internal",
          subject: "Research vendor and budget blockers",
          bodyText: "Investigate the vendor dependency risk and whether budget approval must land before Phase Beta can ship.",
          createdAt: "2026-03-27T09:01:00.000Z"
        },
        {
          sourceMessageId: "turn-3",
          fromPrincipalId: "principal:assistant",
          fromMailboxId: "internal:assistant:researcher",
          toMailboxIds: ["internal:assistant:orchestrator"],
          kind: "claim",
          visibility: "internal",
          subject: "Research findings",
          bodyText: "Shared context: the vendor dependency is still unresolved and budget approval is due by April 3 before Phase Beta can proceed.",
          createdAt: "2026-03-27T09:02:00.000Z"
        },
        {
          sourceMessageId: "turn-4",
          fromPrincipalId: "principal:assistant",
          fromMailboxId: "internal:assistant:orchestrator",
          toMailboxIds: ["public:assistant"],
          kind: "progress",
          visibility: "room",
          subject: "Progress update",
          bodyText: "We have enough shared context to answer: the critical blockers are the vendor dependency and the budget approval deadline.",
          createdAt: "2026-03-27T09:03:00.000Z"
        }
      ]
    });

    expect(imported).toHaveLength(4);
    expect(imported[1]?.message.parentMessageId).toBe(imported[0]?.message.messageId);
    expect(imported[2]?.message.parentMessageId).toBe(imported[1]?.message.messageId);
    expect(imported[3]?.message.parentMessageId).toBe(imported[2]?.message.messageId);

    const replay = fixture.runtime.replay(fixture.roomKey);
    expect(replay.gatewayProjectionTrace.messageIds).toHaveLength(4);
    expect(replay.virtualMessages.filter((message) => message.originKind === "gateway_chat")).toHaveLength(4);

    const hits = fixture.runtime.retrieveRoomContext(fixture.roomKey, "vendor dependency budget approval Phase Beta", 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((hit) => /vendor dependency/i.test(hit.excerpt))).toBe(true);
    expect(hits.some((hit) => /budget approval/i.test(hit.excerpt))).toBe(true);

    const mailboxView = fixture.runtime.projectMailboxView({
      roomKey: fixture.roomKey,
      mailboxId: "internal:assistant:orchestrator"
    });
    expect(mailboxView.length).toBeGreaterThanOrEqual(1);
    expect(mailboxView.some((entry) => entry.message.subject === "Research findings")).toBe(true);

    const publicMailboxView = fixture.runtime.projectMailboxView({
      roomKey: fixture.roomKey,
      mailboxId: "public:assistant"
    });
    expect(publicMailboxView.some((entry) => entry.message.subject === "Progress update")).toBe(true);

    fixture.handle.close();
  });
});
