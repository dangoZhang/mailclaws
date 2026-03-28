import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { recoverRoomQueue } from "../src/core/recovery.js";
import { loadConfig } from "../src/config.js";
import { enqueueRoomJob, leaseNextRoomJob } from "../src/queue/thread-queue.js";
import { initializeDatabase } from "../src/storage/db.js";
import { saveThreadRoom } from "../src/storage/repositories/thread-rooms.js";
import { buildRoomSessionKey } from "../src/threading/session-key.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("recoverRoomQueue", () => {
  it("requeues expired leased jobs and reports queue state", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-recovery-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
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
      lastInboundSeq: 1,
      lastOutboundSeq: 0
    });
    enqueueRoomJob(handle.db, {
      jobId: "job-1",
      roomKey,
      revision: 1,
      inboundSeq: 1,
      priority: 100,
      createdAt: "2026-03-25T02:00:00.000Z"
    });

    leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-1",
      now: "2026-03-25T02:00:00.000Z",
      leaseDurationMs: 1000
    });

    const recovered = recoverRoomQueue(handle.db, "2026-03-25T02:00:02.000Z");

    expect(recovered.recoveredJobs).toBe(1);
    expect(recovered.queuedJobs).toHaveLength(1);
    expect(recovered.leasedJobs).toHaveLength(0);
    expect(recovered.queuedJobs[0]?.jobId).toBe("job-1");

    handle.close();
  });
});
