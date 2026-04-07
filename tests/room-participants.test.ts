import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { initializeDatabase } from "../src/storage/db.js";
import { listRoomParticipants, upsertRoomParticipant } from "../src/storage/repositories/room-participants.js";
import { saveThreadRoom } from "../src/storage/repositories/thread-rooms.js";
import { buildRoomSessionKey } from "../src/threading/session-key.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("room participants repository", () => {
  it("upserts participants and preserves the strongest visibility", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-room-participants-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite")
    });
    const handle = initializeDatabase(config);
    const roomKey = buildRoomSessionKey("acct-1", "thread-1");

    saveThreadRoom(handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-1",
      parentSessionKey: roomKey,
      state: "queued",
      revision: 1,
      lastInboundSeq: 0,
      lastOutboundSeq: 0
    });

    upsertRoomParticipant(handle.db, {
      roomKey,
      emailAddress: "hidden@example.com",
      participantType: "human",
      visibility: "bcc",
      source: "bcc",
      seenAt: "2026-03-25T00:00:00.000Z"
    });
    upsertRoomParticipant(handle.db, {
      roomKey,
      emailAddress: "hidden@example.com",
      participantType: "human",
      visibility: "visible",
      source: "to",
      seenAt: "2026-03-25T00:01:00.000Z"
    });

    const participants = listRoomParticipants(handle.db, roomKey);

    expect(participants).toEqual([
      expect.objectContaining({
        emailAddress: "hidden@example.com",
        visibility: "visible",
        source: "to"
      })
    ]);

    handle.close();
  });
});
