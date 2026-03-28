import type { DatabaseSync } from "node:sqlite";

export type RoomQueueJobStatus = "queued" | "leased" | "completed" | "failed" | "cancelled";

export interface RoomQueueJob {
  jobId: string;
  roomKey: string;
  revision: number;
  inboundSeq: number;
  messageDedupeKey?: string;
  priority: number;
  status: RoomQueueJobStatus;
  attempts: number;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface EnqueueRoomJobInput {
  jobId: string;
  roomKey: string;
  revision: number;
  inboundSeq: number;
  messageDedupeKey?: string;
  priority: number;
  availableAt?: string;
  createdAt?: string;
}

export interface LeaseNextRoomJobInput {
  leaseOwner: string;
  now: string;
  leaseDurationMs: number;
  priorityAgingMs?: number;
  priorityAgingStep?: number;
  roomFairnessPenaltyStep?: number;
  roomFairnessPenaltyCounts?: Record<string, number>;
  excludeRoomKeys?: string[];
}

export interface CompleteRoomJobInput {
  completedAt: string;
}

export interface FailRoomJobInput {
  failedAt: string;
}

export interface CancelRoomJobInput {
  cancelledAt: string;
}

export interface RecoverExpiredRoomJobsInput {
  now: string;
}

export interface ListRoomQueueJobsInput {
  statuses?: RoomQueueJobStatus[];
}

export interface RetryFailedRoomJobInput {
  now: string;
}

export interface CancelQueuedRoomJobsInput {
  roomKey: string;
  beforeInboundSeq: number;
  now: string;
}

export function enqueueRoomJob(db: DatabaseSync, input: EnqueueRoomJobInput): RoomQueueJob {
  const timestamp = input.createdAt ?? new Date().toISOString();
  const job: RoomQueueJob = {
    jobId: input.jobId,
    roomKey: input.roomKey,
    revision: input.revision,
    inboundSeq: input.inboundSeq,
    messageDedupeKey: input.messageDedupeKey,
    priority: input.priority,
    status: "queued",
    attempts: 0,
    availableAt: input.availableAt ?? timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  db.prepare(
    `
      INSERT INTO room_queue_jobs (
        job_id,
        room_key,
        revision,
        inbound_seq,
        message_dedupe_key,
        priority,
        status,
        attempts,
        available_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `
  ).run(
    job.jobId,
    job.roomKey,
    job.revision,
    job.inboundSeq,
    job.messageDedupeKey ?? null,
    job.priority,
    job.status,
    job.attempts,
    job.availableAt,
    job.createdAt,
    job.updatedAt
  );

  return job;
}

export function leaseNextRoomJob(
  db: DatabaseSync,
  input: LeaseNextRoomJobInput
): RoomQueueJob | null {
  recoverExpiredRoomJobs(db, { now: input.now });
  const priorityAgingMs = input.priorityAgingMs ?? 60_000;
  const priorityAgingStep = input.priorityAgingStep ?? 25;
  const roomFairnessPenaltyStep = input.roomFairnessPenaltyStep ?? 0;
  const excludeRoomKeys = [...new Set((input.excludeRoomKeys ?? []).filter((roomKey) => roomKey.trim().length > 0))];
  const roomFairnessPenaltyEntries = Object.entries(input.roomFairnessPenaltyCounts ?? {})
    .map(([roomKey, count]) => [roomKey.trim(), Math.max(0, Math.trunc(count))] as const)
    .filter(([roomKey, count]) => roomKey.length > 0 && count > 0);
  const excludeClause =
    excludeRoomKeys.length > 0
      ? `AND candidate.room_key NOT IN (${excludeRoomKeys.map(() => "?").join(", ")})`
      : "";
  const roomFairnessPenaltyClause =
    roomFairnessPenaltyStep > 0 && roomFairnessPenaltyEntries.length > 0
      ? `
        CASE candidate.room_key
          ${roomFairnessPenaltyEntries.map(() => "WHEN ? THEN ?").join("\n          ")}
          ELSE 0
        END
      `
      : "0";

  const query = `
    SELECT
      job_id,
      room_key,
      revision,
      inbound_seq,
      message_dedupe_key,
      priority,
      status,
      attempts,
      lease_owner,
      lease_expires_at,
      available_at,
      created_at,
      updated_at,
      completed_at,
      (
        candidate.priority +
        CASE
          WHEN ? > 0 AND ? > 0
            THEN CAST(
              MAX(
                0,
                ((julianday(?) - julianday(candidate.available_at)) * 86400000.0) / ?
              ) AS INTEGER
            ) * ?
          ELSE 0
        END
      ) - (${roomFairnessPenaltyClause}) AS effective_priority
    FROM room_queue_jobs AS candidate
    WHERE
      candidate.status = 'queued'
      AND candidate.available_at <= ?
      ${excludeClause}
      AND NOT EXISTS (
        SELECT 1
        FROM room_queue_jobs AS earlier
        WHERE
          earlier.room_key = candidate.room_key
          AND earlier.inbound_seq < candidate.inbound_seq
          AND earlier.status IN ('queued', 'leased')
      )
    ORDER BY effective_priority DESC, candidate.created_at ASC, candidate.inbound_seq ASC
    LIMIT 1;
  `;

  const params = [
    priorityAgingMs,
    priorityAgingStep,
    input.now,
    priorityAgingMs,
    priorityAgingStep,
    input.now,
    ...excludeRoomKeys
  ];
  const roomFairnessPenaltyParams = roomFairnessPenaltyEntries.flatMap(([roomKey, count]) => [
    roomKey,
    count * roomFairnessPenaltyStep
  ]);
  params.splice(5, 0, ...roomFairnessPenaltyParams);

  const candidate = db.prepare(query).get(...params) as RoomQueueRow | undefined;

  if (!candidate) {
    return null;
  }

  const leasedAt = input.now;
  const leaseExpiresAt = new Date(Date.parse(input.now) + input.leaseDurationMs).toISOString();
  const updatedAttempts = candidate.attempts + 1;

  db.prepare(
    `
      UPDATE room_queue_jobs
      SET
        status = 'leased',
        attempts = ?,
        lease_owner = ?,
        lease_expires_at = ?,
        updated_at = ?
      WHERE job_id = ?;
    `
  ).run(updatedAttempts, input.leaseOwner, leaseExpiresAt, leasedAt, candidate.job_id);

  return {
    jobId: candidate.job_id,
    roomKey: candidate.room_key,
    revision: candidate.revision,
    inboundSeq: candidate.inbound_seq,
    messageDedupeKey: candidate.message_dedupe_key ?? undefined,
    priority: candidate.priority,
    status: "leased",
    attempts: updatedAttempts,
    leaseOwner: input.leaseOwner,
    leaseExpiresAt,
    availableAt: candidate.available_at,
    createdAt: candidate.created_at,
    updatedAt: leasedAt,
    completedAt: candidate.completed_at ?? undefined
  };
}

export function completeRoomJob(db: DatabaseSync, jobId: string, input: CompleteRoomJobInput) {
  updateRoomJobTerminalStatus(db, jobId, "completed", input.completedAt);
}

export function failRoomJob(db: DatabaseSync, jobId: string, input: FailRoomJobInput) {
  updateRoomJobTerminalStatus(db, jobId, "failed", input.failedAt);
}

export function cancelRoomJob(db: DatabaseSync, jobId: string, input: CancelRoomJobInput) {
  updateRoomJobTerminalStatus(db, jobId, "cancelled", input.cancelledAt);
}

export function cancelQueuedRoomJobs(db: DatabaseSync, input: CancelQueuedRoomJobsInput) {
  const result = db.prepare(
    `
      UPDATE room_queue_jobs
      SET
        status = 'cancelled',
        completed_at = ?,
        updated_at = ?
      WHERE
        room_key = ?
        AND inbound_seq < ?
        AND status = 'queued';
    `
  ).run(input.now, input.now, input.roomKey, input.beforeInboundSeq);

  return Number(result.changes);
}

function updateRoomJobTerminalStatus(
  db: DatabaseSync,
  jobId: string,
  status: "completed" | "failed" | "cancelled",
  timestamp: string
) {
  db.prepare(
    `
      UPDATE room_queue_jobs
      SET
        status = ?,
        lease_owner = NULL,
        lease_expires_at = NULL,
        completed_at = ?,
        updated_at = ?
      WHERE job_id = ?;
    `
  ).run(status, timestamp, timestamp, jobId);
}

export function recoverExpiredRoomJobs(
  db: DatabaseSync,
  input: RecoverExpiredRoomJobsInput
): number {
  const result = db
    .prepare(
      `
        UPDATE room_queue_jobs
        SET
          status = 'queued',
          lease_owner = NULL,
          lease_expires_at = NULL,
          updated_at = ?
        WHERE status = 'leased' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?;
      `
    )
    .run(input.now, input.now);

  return Number(result.changes);
}

export function listRoomQueueJobs(
  db: DatabaseSync,
  input: ListRoomQueueJobsInput = {}
): RoomQueueJob[] {
  const statuses = input.statuses ?? [];
  const placeholders = statuses.map(() => "?").join(", ");
  const query =
    statuses.length > 0
      ? `
        SELECT
          job_id,
          room_key,
          revision,
          inbound_seq,
          message_dedupe_key,
          priority,
          status,
          attempts,
          lease_owner,
          lease_expires_at,
          available_at,
          created_at,
          updated_at,
          completed_at
        FROM room_queue_jobs
        WHERE status IN (${placeholders})
        ORDER BY created_at ASC;
      `
      : `
        SELECT
          job_id,
          room_key,
          revision,
          inbound_seq,
          message_dedupe_key,
          priority,
          status,
          attempts,
          lease_owner,
          lease_expires_at,
          available_at,
          created_at,
          updated_at,
          completed_at
        FROM room_queue_jobs
        ORDER BY created_at ASC;
      `;

  const rows = db.prepare(query).all(...statuses) as unknown as RoomQueueRow[];

  return rows.map(mapRoomQueueRow);
}

export function getRoomQueueJob(db: DatabaseSync, jobId: string): RoomQueueJob | null {
  const row = db
    .prepare(
      `
        SELECT
          job_id,
          room_key,
          revision,
          inbound_seq,
          message_dedupe_key,
          priority,
          status,
          attempts,
          lease_owner,
          lease_expires_at,
          available_at,
          created_at,
          updated_at,
          completed_at
        FROM room_queue_jobs
        WHERE job_id = ?;
      `
    )
    .get(jobId) as RoomQueueRow | undefined;

  return row ? mapRoomQueueRow(row) : null;
}

export function retryFailedRoomJob(
  db: DatabaseSync,
  jobId: string,
  input: RetryFailedRoomJobInput
): RoomQueueJob | null {
  const result = db
    .prepare(
      `
        UPDATE room_queue_jobs
        SET
          status = 'queued',
          lease_owner = NULL,
          lease_expires_at = NULL,
          available_at = ?,
          completed_at = NULL,
          updated_at = ?
        WHERE job_id = ? AND status = 'failed';
      `
    )
    .run(input.now, input.now, jobId);

  if (Number(result.changes) === 0) {
    return null;
  }

  return getRoomQueueJob(db, jobId);
}

interface RoomQueueRow {
  job_id: string;
  room_key: string;
  revision: number;
  inbound_seq: number;
  message_dedupe_key: string | null;
  priority: number;
  status: RoomQueueJobStatus;
  attempts: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  available_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function mapRoomQueueRow(row: RoomQueueRow): RoomQueueJob {
  return {
    jobId: row.job_id,
    roomKey: row.room_key,
    revision: row.revision,
    inboundSeq: row.inbound_seq,
    messageDedupeKey: row.message_dedupe_key ?? undefined,
    priority: row.priority,
    status: row.status,
    attempts: row.attempts,
    leaseOwner: row.lease_owner ?? undefined,
    leaseExpiresAt: row.lease_expires_at ?? undefined,
    availableAt: row.available_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined
  };
}
