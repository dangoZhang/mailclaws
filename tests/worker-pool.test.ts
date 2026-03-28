import { describe, expect, it } from "vitest";

import { createWorkerPool } from "../src/queue/worker-pool.js";

describe("worker pool", () => {
  it("enforces per-room and global concurrency limits", () => {
    const pool = createWorkerPool({
      maxGlobalWorkers: 3,
      maxWorkersPerRoom: 2
    });

    expect(pool.tryAcquire("room-a")).toBe(true);
    expect(pool.tryAcquire("room-a")).toBe(true);
    expect(pool.tryAcquire("room-a")).toBe(false);
    expect(pool.tryAcquire("room-b")).toBe(true);
    expect(pool.tryAcquire("room-c")).toBe(false);

    pool.release("room-a");

    expect(pool.tryAcquire("room-c")).toBe(true);
  });
});
