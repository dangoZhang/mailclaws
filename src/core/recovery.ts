import type { DatabaseSync } from "node:sqlite";

import { listRoomQueueJobs, recoverExpiredRoomJobs } from "../queue/thread-queue.js";

export function recoverRoomQueue(db: DatabaseSync, now: string) {
  const recoveredJobs = recoverExpiredRoomJobs(db, { now });

  return {
    recoveredJobs,
    queuedJobs: listRoomQueueJobs(db, {
      statuses: ["queued"]
    }),
    leasedJobs: listRoomQueueJobs(db, {
      statuses: ["leased"]
    })
  };
}
