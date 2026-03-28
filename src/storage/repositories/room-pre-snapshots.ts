import type { DatabaseSync } from "node:sqlite";

import type { PrePacket, RoomPreSnapshot } from "../../core/types.js";

export function insertRoomPreSnapshot(
  db: DatabaseSync,
  snapshot: RoomPreSnapshot
) {
  db.prepare(
    `
      INSERT INTO room_pre_snapshots (
        snapshot_id,
        room_key,
        room_revision,
        kind,
        audience,
        summary,
        facts_json,
        open_questions_json,
        decisions_json,
        commitments_json,
        requested_actions_json,
        draft_body,
        inputs_hash,
        created_by_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(snapshot_id) DO UPDATE SET
        room_key = excluded.room_key,
        room_revision = excluded.room_revision,
        kind = excluded.kind,
        audience = excluded.audience,
        summary = excluded.summary,
        facts_json = excluded.facts_json,
        open_questions_json = excluded.open_questions_json,
        decisions_json = excluded.decisions_json,
        commitments_json = excluded.commitments_json,
        requested_actions_json = excluded.requested_actions_json,
        draft_body = excluded.draft_body,
        inputs_hash = excluded.inputs_hash,
        created_by_json = excluded.created_by_json,
        created_at = excluded.created_at;
    `
  ).run(
    snapshot.snapshotId,
    snapshot.roomKey,
    snapshot.roomRevision,
    snapshot.kind,
    snapshot.audience,
    snapshot.summary,
    JSON.stringify(snapshot.facts),
    JSON.stringify(snapshot.openQuestions),
    JSON.stringify(snapshot.decisions),
    JSON.stringify(snapshot.commitments),
    JSON.stringify(snapshot.requestedActions),
    snapshot.draftBody ?? null,
    snapshot.inputsHash,
    JSON.stringify(snapshot.createdBy),
    snapshot.createdAt
  );
}

export function listRoomPreSnapshots(db: DatabaseSync, roomKey: string): RoomPreSnapshot[] {
  const rows = db
    .prepare(
      `
        SELECT
          snapshot_id,
          room_key,
          room_revision,
          kind,
          audience,
          summary,
          facts_json,
          open_questions_json,
          decisions_json,
          commitments_json,
          requested_actions_json,
          draft_body,
          inputs_hash,
          created_by_json,
          created_at
        FROM room_pre_snapshots
        WHERE room_key = ?
        ORDER BY created_at ASC, snapshot_id ASC;
      `
    )
    .all(roomKey) as unknown as RoomPreSnapshotRow[];

  return rows.map(mapRoomPreSnapshotRow);
}

export function getLatestRoomPreSnapshot(db: DatabaseSync, roomKey: string): RoomPreSnapshot | null {
  const row = db
    .prepare(
      `
        SELECT
          snapshot_id,
          room_key,
          room_revision,
          kind,
          audience,
          summary,
          facts_json,
          open_questions_json,
          decisions_json,
          commitments_json,
          requested_actions_json,
          draft_body,
          inputs_hash,
          created_by_json,
          created_at
        FROM room_pre_snapshots
        WHERE room_key = ?
        ORDER BY room_revision DESC, created_at DESC, snapshot_id DESC
        LIMIT 1;
      `
    )
    .get(roomKey) as RoomPreSnapshotRow | undefined;

  return row ? mapRoomPreSnapshotRow(row) : null;
}

interface RoomPreSnapshotRow {
  snapshot_id: string;
  room_key: string;
  room_revision: number;
  kind: RoomPreSnapshot["kind"];
  audience: RoomPreSnapshot["audience"];
  summary: string;
  facts_json: string;
  open_questions_json: string;
  decisions_json: string;
  commitments_json: string;
  requested_actions_json: string;
  draft_body: string | null;
  inputs_hash: string;
  created_by_json: string;
  created_at: string;
}

function mapRoomPreSnapshotRow(row: RoomPreSnapshotRow): RoomPreSnapshot {
  return {
    snapshotId: row.snapshot_id,
    roomKey: row.room_key,
    roomRevision: row.room_revision,
    kind: row.kind,
    audience: row.audience,
    summary: row.summary,
    facts: parseJsonArray<PrePacket["facts"][number]>(row.facts_json),
    openQuestions: parseJsonArray<string>(row.open_questions_json),
    decisions: parseJsonArray<string>(row.decisions_json),
    commitments: parseJsonArray<PrePacket["commitments"][number]>(row.commitments_json),
    requestedActions: parseJsonArray<string>(row.requested_actions_json),
    draftBody: row.draft_body ?? undefined,
    inputsHash: row.inputs_hash,
    createdBy: parseCreatedBy(row.created_by_json),
    createdAt: row.created_at
  };
}

function parseJsonArray<T>(value: string): T[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function parseCreatedBy(value: string): PrePacket["createdBy"] {
  const parsed = JSON.parse(value) as unknown;
  return typeof parsed === "object" && parsed !== null && typeof (parsed as { mailboxId?: unknown }).mailboxId === "string"
    ? (parsed as PrePacket["createdBy"])
    : { mailboxId: "unknown" };
}
