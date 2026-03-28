import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { initializeDatabase } from "../src/storage/db.js";
import {
  cancelQueuedRoomJobs,
  completeRoomJob,
  enqueueRoomJob,
  failRoomJob,
  getRoomQueueJob,
  leaseNextRoomJob,
  recoverExpiredRoomJobs,
  retryFailedRoomJob
} from "../src/queue/thread-queue.js";
import { saveThreadRoom } from "../src/storage/repositories/thread-rooms.js";
import { buildRoomSessionKey } from "../src/threading/session-key.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-queue-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite")
  });

  const handle = initializeDatabase(config);
  const roomKeyA = buildRoomSessionKey("acct-1", "thread-1");
  const roomKeyB = buildRoomSessionKey("acct-1", "thread-2");

  saveThreadRoom(handle.db, {
    roomKey: roomKeyA,
    accountId: "acct-1",
    stableThreadId: "thread-1",
    parentSessionKey: roomKeyA,
    state: "queued",
    revision: 1,
    lastInboundSeq: 0,
    lastOutboundSeq: 0
  });
  saveThreadRoom(handle.db, {
    roomKey: roomKeyB,
    accountId: "acct-1",
    stableThreadId: "thread-2",
    parentSessionKey: roomKeyB,
    state: "queued",
    revision: 1,
    lastInboundSeq: 0,
    lastOutboundSeq: 0
  });

  return { handle, roomKeyA, roomKeyB };
}

describe("thread queue", () => {
  it("serializes jobs within the same room and allows different rooms to lease", () => {
    const { handle, roomKeyA, roomKeyB } = createDb();

    enqueueRoomJob(handle.db, {
      jobId: "job-a1",
      roomKey: roomKeyA,
      revision: 1,
      inboundSeq: 1,
      priority: 100,
      createdAt: "2026-03-25T00:00:00.000Z"
    });
    enqueueRoomJob(handle.db, {
      jobId: "job-a2",
      roomKey: roomKeyA,
      revision: 2,
      inboundSeq: 2,
      priority: 100,
      createdAt: "2026-03-25T00:00:00.100Z"
    });
    enqueueRoomJob(handle.db, {
      jobId: "job-b1",
      roomKey: roomKeyB,
      revision: 1,
      inboundSeq: 1,
      priority: 50,
      createdAt: "2026-03-25T00:00:00.200Z"
    });

    const first = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-1",
      now: "2026-03-25T00:00:00.000Z",
      leaseDurationMs: 30_000
    });
    const second = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-2",
      now: "2026-03-25T00:00:01.000Z",
      leaseDurationMs: 30_000
    });

    expect(first?.jobId).toBe("job-a1");
    expect(second?.jobId).toBe("job-b1");

    completeRoomJob(handle.db, "job-a1", {
      completedAt: "2026-03-25T00:00:02.000Z"
    });

    const third = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-3",
      now: "2026-03-25T00:00:03.000Z",
      leaseDurationMs: 30_000
    });

    expect(third?.jobId).toBe("job-a2");

    handle.close();
  });

  it("requeues expired leases for recovery", () => {
    const { handle, roomKeyA } = createDb();

    enqueueRoomJob(handle.db, {
      jobId: "job-a1",
      roomKey: roomKeyA,
      revision: 1,
      inboundSeq: 1,
      priority: 100,
      createdAt: "2026-03-25T00:00:00.000Z"
    });

    const leased = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-1",
      now: "2026-03-25T00:00:00.000Z",
      leaseDurationMs: 1_000
    });

    expect(leased?.status).toBe("leased");

    const recovered = recoverExpiredRoomJobs(handle.db, {
      now: "2026-03-25T00:00:02.000Z"
    });

    expect(recovered).toBe(1);

    const released = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-2",
      now: "2026-03-25T00:00:03.000Z",
      leaseDurationMs: 1_000
    });

    expect(released?.jobId).toBe("job-a1");
    expect(released?.attempts).toBe(2);

    handle.close();
  });

  it("retries failed jobs by moving them back to queued state", () => {
    const { handle, roomKeyA } = createDb();

    enqueueRoomJob(handle.db, {
      jobId: "job-a1",
      roomKey: roomKeyA,
      revision: 1,
      inboundSeq: 1,
      priority: 100,
      createdAt: "2026-03-25T00:00:00.000Z"
    });

    const leased = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-1",
      now: "2026-03-25T00:00:01.000Z",
      leaseDurationMs: 30_000
    });

    expect(leased?.status).toBe("leased");
    failRoomJob(handle.db, "job-a1", {
      failedAt: "2026-03-25T00:00:02.000Z"
    });

    const failed = getRoomQueueJob(handle.db, "job-a1");
    expect(failed).toMatchObject({
      jobId: "job-a1",
      status: "failed",
      attempts: 1,
      completedAt: "2026-03-25T00:00:02.000Z"
    });

    const retried = retryFailedRoomJob(handle.db, "job-a1", {
      now: "2026-03-25T00:00:03.000Z"
    });

    expect(retried).toMatchObject({
      jobId: "job-a1",
      status: "queued",
      attempts: 1,
      availableAt: "2026-03-25T00:00:03.000Z",
      updatedAt: "2026-03-25T00:00:03.000Z"
    });
    expect(retried?.completedAt).toBeUndefined();

    const leasedAgain = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-2",
      now: "2026-03-25T00:00:04.000Z",
      leaseDurationMs: 30_000
    });

    expect(leasedAgain).toMatchObject({
      jobId: "job-a1",
      status: "leased",
      attempts: 2
    });

    handle.close();
  });

  it("cancels older queued jobs when a newer inbound supersedes them", () => {
    const { handle, roomKeyA } = createDb();

    enqueueRoomJob(handle.db, {
      jobId: "job-a1",
      roomKey: roomKeyA,
      revision: 1,
      inboundSeq: 1,
      priority: 100,
      createdAt: "2026-03-25T00:00:00.000Z"
    });
    enqueueRoomJob(handle.db, {
      jobId: "job-a2",
      roomKey: roomKeyA,
      revision: 2,
      inboundSeq: 2,
      priority: 100,
      createdAt: "2026-03-25T00:00:00.100Z"
    });

    const cancelled = cancelQueuedRoomJobs(handle.db, {
      roomKey: roomKeyA,
      beforeInboundSeq: 2,
      now: "2026-03-25T00:00:02.000Z"
    });

    expect(cancelled).toBe(1);

    const leased = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-1",
      now: "2026-03-25T00:00:03.000Z",
      leaseDurationMs: 30_000
    });

    expect(leased?.jobId).toBe("job-a2");

    handle.close();
  });

  it("cancels older queued burst revisions so only the newest room job can lease", () => {
    const { handle, roomKeyA } = createDb();

    enqueueRoomJob(handle.db, {
      jobId: "job-burst-1",
      roomKey: roomKeyA,
      revision: 1,
      inboundSeq: 1,
      priority: 100,
      createdAt: "2026-03-25T00:10:00.000Z"
    });
    enqueueRoomJob(handle.db, {
      jobId: "job-burst-2",
      roomKey: roomKeyA,
      revision: 2,
      inboundSeq: 2,
      priority: 100,
      createdAt: "2026-03-25T00:10:00.100Z"
    });
    enqueueRoomJob(handle.db, {
      jobId: "job-burst-3",
      roomKey: roomKeyA,
      revision: 3,
      inboundSeq: 3,
      priority: 100,
      createdAt: "2026-03-25T00:10:00.200Z"
    });

    const cancelled = cancelQueuedRoomJobs(handle.db, {
      roomKey: roomKeyA,
      beforeInboundSeq: 3,
      now: "2026-03-25T00:10:02.000Z"
    });

    expect(cancelled).toBe(2);
    expect(getRoomQueueJob(handle.db, "job-burst-1")?.status).toBe("cancelled");
    expect(getRoomQueueJob(handle.db, "job-burst-2")?.status).toBe("cancelled");
    expect(getRoomQueueJob(handle.db, "job-burst-3")?.status).toBe("queued");

    const leased = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-burst",
      now: "2026-03-25T00:10:03.000Z",
      leaseDurationMs: 30_000
    });

    expect(leased).toMatchObject({
      jobId: "job-burst-3",
      revision: 3,
      inboundSeq: 3
    });

    handle.close();
  });

  it("ages long-waiting jobs so newer high-priority rooms do not starve them forever", () => {
    const { handle, roomKeyA, roomKeyB } = createDb();

    enqueueRoomJob(handle.db, {
      jobId: "job-a1",
      roomKey: roomKeyA,
      revision: 1,
      inboundSeq: 1,
      priority: 20,
      createdAt: "2026-03-25T00:00:00.000Z",
      availableAt: "2026-03-25T00:00:00.000Z"
    });
    enqueueRoomJob(handle.db, {
      jobId: "job-b1",
      roomKey: roomKeyB,
      revision: 1,
      inboundSeq: 1,
      priority: 100,
      createdAt: "2026-03-25T00:04:30.000Z",
      availableAt: "2026-03-25T00:04:30.000Z"
    });

    const leased = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-1",
      now: "2026-03-25T00:05:00.000Z",
      leaseDurationMs: 30_000,
      priorityAgingMs: 60_000,
      priorityAgingStep: 25
    });

    expect(leased?.jobId).toBe("job-a1");

    handle.close();
  });

  it("applies weighted room penalties without excluding the only queued room", () => {
    const { handle, roomKeyA, roomKeyB } = createDb();

    enqueueRoomJob(handle.db, {
      jobId: "job-a1",
      roomKey: roomKeyA,
      revision: 1,
      inboundSeq: 1,
      priority: 100,
      createdAt: "2026-03-25T00:00:00.000Z"
    });
    enqueueRoomJob(handle.db, {
      jobId: "job-b1",
      roomKey: roomKeyB,
      revision: 1,
      inboundSeq: 1,
      priority: 80,
      createdAt: "2026-03-25T00:00:00.100Z"
    });

    const penalized = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-1",
      now: "2026-03-25T00:00:01.000Z",
      leaseDurationMs: 30_000,
      roomFairnessPenaltyStep: 30,
      roomFairnessPenaltyCounts: {
        [roomKeyA]: 1
      }
    });
    expect(penalized?.roomKey).toBe(roomKeyB);

    completeRoomJob(handle.db, "job-b1", {
      completedAt: "2026-03-25T00:00:02.000Z"
    });

    const onlyQueued = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-2",
      now: "2026-03-25T00:00:03.000Z",
      leaseDurationMs: 30_000,
      roomFairnessPenaltyStep: 30,
      roomFairnessPenaltyCounts: {
        [roomKeyA]: 2
      }
    });
    expect(onlyQueued?.roomKey).toBe(roomKeyA);

    handle.close();
  });

  it("skips recently served rooms when exclusions are provided and falls back when all are excluded", () => {
    const { handle, roomKeyA, roomKeyB } = createDb();

    enqueueRoomJob(handle.db, {
      jobId: "job-a1",
      roomKey: roomKeyA,
      revision: 1,
      inboundSeq: 1,
      priority: 100,
      createdAt: "2026-03-25T00:00:00.000Z"
    });
    enqueueRoomJob(handle.db, {
      jobId: "job-b1",
      roomKey: roomKeyB,
      revision: 1,
      inboundSeq: 1,
      priority: 100,
      createdAt: "2026-03-25T00:00:00.100Z"
    });

    const skipped = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-1",
      now: "2026-03-25T00:00:01.000Z",
      leaseDurationMs: 30_000,
      excludeRoomKeys: [roomKeyB]
    });
    expect(skipped?.roomKey).toBe(roomKeyA);

    const fallback = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-2",
      now: "2026-03-25T00:00:02.000Z",
      leaseDurationMs: 30_000,
      excludeRoomKeys: [roomKeyA, roomKeyB]
    });
    expect(fallback).toBeNull();

    const normal = leaseNextRoomJob(handle.db, {
      leaseOwner: "orch-3",
      now: "2026-03-25T00:00:03.000Z",
      leaseDurationMs: 30_000
    });
    expect(normal?.roomKey).toBe(roomKeyB);

    handle.close();
  });
});
