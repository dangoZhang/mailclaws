import type { DatabaseSync } from "node:sqlite";

import type { SubAgentRun } from "../../core/types.js";

export function insertSubAgentRun(db: DatabaseSync, run: SubAgentRun) {
  db.prepare(
    `
      INSERT INTO subagent_runs (
        run_id,
        room_key,
        work_thread_id,
        parent_message_id,
        target_id,
        child_session_key,
        child_session_id,
        room_revision,
        inputs_hash,
        status,
        result_message_id,
        error_text,
        request_json,
        announce_summary,
        started_at,
        completed_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `
  ).run(
    run.runId,
    run.roomKey,
    run.workThreadId,
    run.parentMessageId,
    run.targetId,
    run.childSessionKey,
    run.childSessionId ?? null,
    run.roomRevision,
    run.inputsHash,
    run.status,
    run.resultMessageId ?? null,
    run.errorText ?? null,
    run.request ? JSON.stringify(run.request) : null,
    run.announceSummary ?? null,
    run.startedAt,
    run.completedAt ?? null,
    run.createdAt,
    run.updatedAt
  );
}

export function updateSubAgentRun(
  db: DatabaseSync,
  runId: string,
  patch: {
    status: SubAgentRun["status"];
    childSessionKey?: string;
    childSessionId?: string;
    resultMessageId?: string;
    errorText?: string;
    announceSummary?: string;
    completedAt?: string;
    updatedAt: string;
  }
) {
  db.prepare(
    `
      UPDATE subagent_runs
      SET
        status = ?,
        child_session_key = COALESCE(?, child_session_key),
        child_session_id = COALESCE(?, child_session_id),
        result_message_id = COALESCE(?, result_message_id),
        error_text = COALESCE(?, error_text),
        announce_summary = COALESCE(?, announce_summary),
        completed_at = COALESCE(?, completed_at),
        updated_at = ?
      WHERE run_id = ?;
    `
  ).run(
    patch.status,
    patch.childSessionKey ?? null,
    patch.childSessionId ?? null,
    patch.resultMessageId ?? null,
    patch.errorText ?? null,
    patch.announceSummary ?? null,
    patch.completedAt ?? null,
    patch.updatedAt,
    runId
  );
}

export function getSubAgentRun(db: DatabaseSync, runId: string): SubAgentRun | null {
  const row = db
    .prepare(
      `
        SELECT
          run_id,
          room_key,
          work_thread_id,
          parent_message_id,
          target_id,
          child_session_key,
          child_session_id,
          room_revision,
          inputs_hash,
          status,
          result_message_id,
          error_text,
          request_json,
          announce_summary,
          started_at,
          completed_at,
          created_at,
          updated_at
        FROM subagent_runs
        WHERE run_id = ?;
      `
    )
    .get(runId) as SubAgentRunRow | undefined;

  return row ? mapSubAgentRunRow(row) : null;
}

export function listSubAgentRunsForRoom(db: DatabaseSync, roomKey: string): SubAgentRun[] {
  const rows = db
    .prepare(
      `
        SELECT
          run_id,
          room_key,
          work_thread_id,
          parent_message_id,
          target_id,
          child_session_key,
          child_session_id,
          room_revision,
          inputs_hash,
          status,
          result_message_id,
          error_text,
          request_json,
          announce_summary,
          started_at,
          completed_at,
          created_at,
          updated_at
        FROM subagent_runs
        WHERE room_key = ?
        ORDER BY created_at ASC, run_id ASC;
      `
    )
    .all(roomKey) as unknown as SubAgentRunRow[];

  return rows.map(mapSubAgentRunRow);
}

export function getSubAgentRunByChildSessionKey(
  db: DatabaseSync,
  childSessionKey: string
): SubAgentRun | null {
  const row = db
    .prepare(
      `
        SELECT
          run_id,
          room_key,
          work_thread_id,
          parent_message_id,
          target_id,
          child_session_key,
          child_session_id,
          room_revision,
          inputs_hash,
          status,
          result_message_id,
          error_text,
          request_json,
          announce_summary,
          started_at,
          completed_at,
          created_at,
          updated_at
        FROM subagent_runs
        WHERE child_session_key = ?
        ORDER BY created_at DESC, run_id DESC
        LIMIT 1;
      `
    )
    .get(childSessionKey) as SubAgentRunRow | undefined;

  return row ? mapSubAgentRunRow(row) : null;
}

export function findLatestSubAgentRunForThread(
  db: DatabaseSync,
  input: {
    roomKey: string;
    targetId: string;
    workThreadId: string;
  }
) {
  const row = db
    .prepare(
      `
        SELECT
          run_id,
          room_key,
          work_thread_id,
          parent_message_id,
          target_id,
          child_session_key,
          child_session_id,
          room_revision,
          inputs_hash,
          status,
          result_message_id,
          error_text,
          request_json,
          announce_summary,
          started_at,
          completed_at,
          created_at,
          updated_at
        FROM subagent_runs
        WHERE room_key = ?
          AND target_id = ?
          AND work_thread_id = ?
        ORDER BY created_at DESC, run_id DESC
        LIMIT 1;
      `
    )
    .get(input.roomKey, input.targetId, input.workThreadId) as SubAgentRunRow | undefined;

  return row ? mapSubAgentRunRow(row) : null;
}

function mapSubAgentRunRow(row: SubAgentRunRow): SubAgentRun {
  return {
    runId: row.run_id,
    roomKey: row.room_key,
    workThreadId: row.work_thread_id,
    parentMessageId: row.parent_message_id,
    targetId: row.target_id,
    childSessionKey: row.child_session_key,
    childSessionId: row.child_session_id ?? undefined,
    roomRevision: row.room_revision,
    inputsHash: row.inputs_hash,
    status: row.status,
    resultMessageId: row.result_message_id ?? undefined,
    errorText: row.error_text ?? undefined,
    request: row.request_json ? (JSON.parse(row.request_json) as Record<string, unknown>) : undefined,
    announceSummary: row.announce_summary ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

interface SubAgentRunRow {
  run_id: string;
  room_key: string;
  work_thread_id: string;
  parent_message_id: string;
  target_id: string;
  child_session_key: string;
  child_session_id: string | null;
  room_revision: number;
  inputs_hash: string;
  status: SubAgentRun["status"];
  result_message_id: string | null;
  error_text: string | null;
  request_json: string | null;
  announce_summary: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
