import type { DatabaseSync } from "node:sqlite";

export type MailRunStatus = "running" | "completed" | "failed";

export interface MailRunRecord {
  runId: string;
  roomKey: string;
  jobId: string;
  revision: number;
  status: MailRunStatus;
  request?: Record<string, unknown>;
  responseText?: string;
  errorText?: string;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function insertMailRun(db: DatabaseSync, run: MailRunRecord) {
  db.prepare(
    `
      INSERT INTO mail_runs (
        run_id,
        room_key,
        job_id,
        revision,
        status,
        request_json,
        response_text,
        error_text,
        started_at,
        completed_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `
  ).run(
    run.runId,
    run.roomKey,
    run.jobId,
    run.revision,
    run.status,
    run.request ? JSON.stringify(run.request) : null,
    run.responseText ?? null,
    run.errorText ?? null,
    run.startedAt,
    run.completedAt ?? null,
    run.createdAt,
    run.updatedAt
  );
}

export function updateMailRunCompleted(
  db: DatabaseSync,
  runId: string,
  input: {
    responseText: string;
    completedAt: string;
  }
) {
  db.prepare(
    `
      UPDATE mail_runs
      SET
        status = 'completed',
        response_text = ?,
        completed_at = ?,
        updated_at = ?
      WHERE run_id = ?;
    `
  ).run(input.responseText, input.completedAt, input.completedAt, runId);
}

export function updateMailRunFailed(
  db: DatabaseSync,
  runId: string,
  input: {
    errorText: string;
    completedAt: string;
  }
) {
  db.prepare(
    `
      UPDATE mail_runs
      SET
        status = 'failed',
        error_text = ?,
        completed_at = ?,
        updated_at = ?
      WHERE run_id = ?;
    `
  ).run(input.errorText, input.completedAt, input.completedAt, runId);
}

export function listMailRunsForRoom(db: DatabaseSync, roomKey: string): MailRunRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          run_id,
          room_key,
          job_id,
          revision,
          status,
          request_json,
          response_text,
          error_text,
          started_at,
          completed_at,
          created_at,
          updated_at
        FROM mail_runs
        WHERE room_key = ?
        ORDER BY created_at ASC;
      `
    )
    .all(roomKey) as unknown as MailRunRow[];

  return rows.map((row) => ({
    runId: row.run_id,
    roomKey: row.room_key,
    jobId: row.job_id,
    revision: row.revision,
    status: row.status,
    request: row.request_json ? (JSON.parse(row.request_json) as Record<string, unknown>) : undefined,
    responseText: row.response_text ?? undefined,
    errorText: row.error_text ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

interface MailRunRow {
  run_id: string;
  room_key: string;
  job_id: string;
  revision: number;
  status: MailRunStatus;
  request_json: string | null;
  response_text: string | null;
  error_text: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
