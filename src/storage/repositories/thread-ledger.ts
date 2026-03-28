import type { DatabaseSync } from "node:sqlite";

import type { ThreadLedgerEvent, ThreadLedgerEventType } from "../../core/types.js";

interface AppendThreadLedgerEventInput {
  roomKey: string;
  revision: number;
  type: ThreadLedgerEventType;
  payload: Record<string, unknown>;
}

export function appendThreadLedgerEvent(
  db: DatabaseSync,
  input: AppendThreadLedgerEventInput
): ThreadLedgerEvent {
  const current = db
    .prepare("SELECT COALESCE(MAX(seq), 0) AS seq FROM thread_ledger WHERE room_key = ?;")
    .get(input.roomKey) as { seq: number };

  const event: ThreadLedgerEvent = {
    seq: current.seq + 1,
    roomKey: input.roomKey,
    revision: input.revision,
    type: input.type,
    payload: input.payload,
    createdAt: new Date().toISOString()
  };

  db.prepare(
    `
      INSERT INTO thread_ledger (
        room_key,
        seq,
        revision,
        type,
        payload_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?);
    `
  ).run(
    event.roomKey,
    event.seq,
    event.revision,
    event.type,
    JSON.stringify(event.payload),
    event.createdAt
  );

  return event;
}

export function listThreadLedgerEvents(db: DatabaseSync, roomKey: string): ThreadLedgerEvent[] {
  const rows = db
    .prepare(
      `
        SELECT room_key, seq, revision, type, payload_json, created_at
        FROM thread_ledger
        WHERE room_key = ?
        ORDER BY seq ASC;
      `
    )
    .all(roomKey) as Array<{
      room_key: string;
      seq: number;
      revision: number;
      type: ThreadLedgerEventType;
      payload_json: string;
      created_at: string;
    }>;

  return rows.map((row) => ({
    seq: row.seq,
    roomKey: row.room_key,
    revision: row.revision,
    type: row.type,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAt: row.created_at
  }));
}
