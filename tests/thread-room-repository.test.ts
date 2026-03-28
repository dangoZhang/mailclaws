import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import type { ThreadRoom } from "../src/core/types.js";
import { initializeDatabase } from "../src/storage/db.js";
import {
  appendThreadLedgerEvent,
  listThreadLedgerEvents
} from "../src/storage/repositories/thread-ledger.js";
import { getThreadRoom, saveThreadRoom } from "../src/storage/repositories/thread-rooms.js";
import { buildRoomSessionKey } from "../src/threading/session-key.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("thread room persistence", () => {
  it("stores thread rooms and appends ordered ledger events", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-room-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
    });

    const handle = initializeDatabase(config);
    const roomKey = buildRoomSessionKey("acct-1", "thread-42");
    const room: ThreadRoom = {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-42",
      parentSessionKey: roomKey,
      frontAgentAddress: "ops@ai.example.com",
      publicAgentAddresses: [
        "ops@ai.example.com",
        "research@ai.example.com",
        "assistant@ai.example.com"
      ],
      collaboratorAgentAddresses: ["research@ai.example.com"],
      summonedRoles: ["mail-drafter", "mail-reviewer"],
      state: "queued",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 0
    };

    saveThreadRoom(handle.db, room);
    appendThreadLedgerEvent(handle.db, {
      roomKey,
      revision: 1,
      type: "mail.inbound_received",
      payload: {
        providerMessageId: "msg-1"
      }
    });
    appendThreadLedgerEvent(handle.db, {
      roomKey,
      revision: 1,
      type: "room.planned",
      payload: {
        planner: "mail-orchestrator"
      }
    });

    expect(getThreadRoom(handle.db, roomKey)).toEqual(room);
    expect(listThreadLedgerEvents(handle.db, roomKey)).toMatchObject([
      {
        seq: 1,
        type: "mail.inbound_received"
      },
      {
        seq: 2,
        type: "room.planned"
      }
    ]);

    handle.close();
  });
});
