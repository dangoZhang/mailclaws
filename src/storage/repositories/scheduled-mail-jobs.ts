import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { ScheduledMailJob, ScheduledMailJobStatus } from "../../core/types.js";

export function insertScheduledMailJob(db: DatabaseSync, job: ScheduledMailJob) {
  db.prepare(
    `
      INSERT INTO scheduled_mail_jobs (
        job_id, room_key, account_id, source_message_dedupe_key, kind, status, schedule_ref, cron_like,
        next_run_at, last_run_at, follow_up_subject, follow_up_body, last_outbox_id, cancellation_reason,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `
  ).run(
    job.jobId,
    job.roomKey,
    job.accountId,
    job.sourceMessageDedupeKey,
    job.kind,
    job.status,
    job.scheduleRef,
    job.cronLike ?? null,
    job.nextRunAt ?? null,
    job.lastRunAt ?? null,
    job.followUpSubject,
    job.followUpBody,
    job.lastOutboxId ?? null,
    job.cancellationReason ?? null,
    job.createdAt,
    job.updatedAt
  );

  return job;
}

export function findScheduledMailJob(db: DatabaseSync, jobId: string): ScheduledMailJob | null {
  const row = db
    .prepare(
      `
        SELECT job_id, room_key, account_id, source_message_dedupe_key, kind, status, schedule_ref, cron_like,
               next_run_at, last_run_at, follow_up_subject, follow_up_body, last_outbox_id, cancellation_reason,
               created_at, updated_at
        FROM scheduled_mail_jobs
        WHERE job_id = ?
        LIMIT 1;
      `
    )
    .get(jobId) as ScheduledMailJobRow | undefined;

  return row ? mapScheduledMailJobRow(row) : null;
}

export function listScheduledMailJobs(
  db: DatabaseSync,
  input: {
    roomKey?: string;
    accountId?: string;
    statuses?: ScheduledMailJobStatus[];
    dueBefore?: string;
  } = {}
) {
  const clauses: string[] = [];
  const params: Array<string> = [];

  if (input.roomKey) {
    clauses.push("room_key = ?");
    params.push(input.roomKey);
  }
  if (input.accountId) {
    clauses.push("account_id = ?");
    params.push(input.accountId);
  }
  if ((input.statuses?.length ?? 0) > 0) {
    clauses.push(`status IN (${input.statuses!.map(() => "?").join(", ")})`);
    params.push(...input.statuses!);
  }
  if (input.dueBefore) {
    clauses.push("next_run_at IS NOT NULL AND next_run_at <= ?");
    params.push(input.dueBefore);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `
        SELECT job_id, room_key, account_id, source_message_dedupe_key, kind, status, schedule_ref, cron_like,
               next_run_at, last_run_at, follow_up_subject, follow_up_body, last_outbox_id, cancellation_reason,
               created_at, updated_at
        FROM scheduled_mail_jobs
        ${where}
        ORDER BY created_at ASC, job_id ASC;
      `
    )
    .all(...params) as unknown as ScheduledMailJobRow[];

  return rows.map(mapScheduledMailJobRow);
}

export function findScheduledMailJobById(db: DatabaseSync, jobId: string) {
  return findScheduledMailJob(db, jobId);
}

export function listScheduledMailJobsForRoom(
  db: DatabaseSync,
  roomKey: string,
  statuses?: ScheduledMailJobStatus[]
) {
  return listScheduledMailJobs(db, { roomKey, statuses });
}

export function listDueScheduledMailJobs(db: DatabaseSync, now: string, limit?: number) {
  const rows = db
    .prepare(
      `
        SELECT job_id, room_key, account_id, source_message_dedupe_key, kind, status, schedule_ref, cron_like,
               next_run_at, last_run_at, follow_up_subject, follow_up_body, last_outbox_id, cancellation_reason,
               created_at, updated_at
        FROM scheduled_mail_jobs
        WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= ?
        ORDER BY next_run_at ASC, created_at ASC
        ${typeof limit === "number" ? `LIMIT ${Math.max(1, Math.trunc(limit))}` : ""};
      `
    )
    .all(now) as unknown as ScheduledMailJobRow[];

  return rows.map(mapScheduledMailJobRow);
}

export function upsertScheduledMailJob(
  db: DatabaseSync,
  job: Omit<ScheduledMailJob, "jobId" | "createdAt"> & {
    jobId?: string;
    createdAt?: string;
  }
) {
  const nextJobId = job.jobId ?? randomUUID();
  const existing = findScheduledMailJob(db, nextJobId);
  if (existing) {
    return updateScheduledMailJob(db, nextJobId, {
      kind: job.kind,
      status: job.status,
      scheduleRef: job.scheduleRef,
      cronLike: job.cronLike,
      nextRunAt: job.nextRunAt,
      lastRunAt: job.lastRunAt,
      followUpSubject: job.followUpSubject,
      followUpBody: job.followUpBody,
      lastOutboxId: job.lastOutboxId,
      cancellationReason: job.cancellationReason,
      updatedAt: job.updatedAt
    });
  }

  return insertScheduledMailJob(db, {
    ...job,
    jobId: nextJobId,
    createdAt: job.createdAt ?? job.updatedAt
  });
}

export function updateScheduledMailJob(
  db: DatabaseSync,
  jobId: string,
  input: Partial<Omit<ScheduledMailJob, "jobId" | "roomKey" | "accountId" | "sourceMessageDedupeKey" | "createdAt">> & {
    updatedAt: string;
  }
) {
  const current = findScheduledMailJob(db, jobId);
  if (!current) {
    return null;
  }

  const updated: ScheduledMailJob = {
    ...current,
    ...input,
    updatedAt: input.updatedAt
  };

  db.prepare(
    `
      UPDATE scheduled_mail_jobs
      SET
        kind = ?,
        status = ?,
        schedule_ref = ?,
        cron_like = ?,
        next_run_at = ?,
        last_run_at = ?,
        follow_up_subject = ?,
        follow_up_body = ?,
        last_outbox_id = ?,
        cancellation_reason = ?,
        updated_at = ?
      WHERE job_id = ?;
    `
  ).run(
    updated.kind,
    updated.status,
    updated.scheduleRef,
    updated.cronLike ?? null,
    updated.nextRunAt ?? null,
    updated.lastRunAt ?? null,
    updated.followUpSubject,
    updated.followUpBody,
    updated.lastOutboxId ?? null,
    updated.cancellationReason ?? null,
    updated.updatedAt,
    jobId
  );

  return updated;
}

export function cancelScheduledMailJobsForRoom(
  db: DatabaseSync,
  input: {
    roomKey: string;
    reason: string;
    now: string;
    statuses?: ScheduledMailJobStatus[];
  }
) {
  const jobs = listScheduledMailJobs(db, {
    roomKey: input.roomKey,
    statuses: input.statuses ?? ["active", "paused"]
  });

  return jobs.map((job) =>
    updateScheduledMailJob(db, job.jobId, {
      status: "cancelled",
      cancellationReason: input.reason,
      updatedAt: input.now
    })
  ).filter((job): job is ScheduledMailJob => job !== null);
}

interface ScheduledMailJobRow {
  job_id: string;
  room_key: string;
  account_id: string;
  source_message_dedupe_key: string;
  kind: ScheduledMailJob["kind"];
  status: ScheduledMailJob["status"];
  schedule_ref: string;
  cron_like: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  follow_up_subject: string;
  follow_up_body: string;
  last_outbox_id: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

function mapScheduledMailJobRow(row: ScheduledMailJobRow): ScheduledMailJob {
  return {
    jobId: row.job_id,
    roomKey: row.room_key,
    accountId: row.account_id,
    sourceMessageDedupeKey: row.source_message_dedupe_key,
    kind: row.kind,
    status: row.status,
    scheduleRef: row.schedule_ref,
    cronLike: row.cron_like ?? undefined,
    nextRunAt: row.next_run_at ?? undefined,
    lastRunAt: row.last_run_at ?? undefined,
    followUpSubject: row.follow_up_subject,
    followUpBody: row.follow_up_body,
    lastOutboxId: row.last_outbox_id ?? undefined,
    cancellationReason: row.cancellation_reason ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
