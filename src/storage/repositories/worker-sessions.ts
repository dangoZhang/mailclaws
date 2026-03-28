import type { DatabaseSync } from "node:sqlite";

import type { WorkerSession } from "../../core/types.js";

export function saveWorkerSession(db: DatabaseSync, session: WorkerSession) {
  db.prepare(
    `
      INSERT INTO worker_sessions (
        session_key,
        room_key,
        role,
        revision,
        state
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_key) DO UPDATE SET
        room_key = excluded.room_key,
        role = excluded.role,
        revision = excluded.revision,
        state = excluded.state;
    `
  ).run(session.sessionKey, session.roomKey, session.role, session.revision, session.state);
}

export function getWorkerSession(db: DatabaseSync, sessionKey: string): WorkerSession | null {
  const row = db
    .prepare(
      `
        SELECT session_key, room_key, role, revision, state
        FROM worker_sessions
        WHERE session_key = ?;
      `
    )
    .get(sessionKey) as
    | {
        session_key: string;
        room_key: string;
        role: WorkerSession["role"];
        revision: number;
        state: WorkerSession["state"];
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    sessionKey: row.session_key,
    roomKey: row.room_key,
    role: row.role,
    revision: row.revision,
    state: row.state
  };
}

export function listWorkerSessionsForRoom(db: DatabaseSync, roomKey: string): WorkerSession[] {
  const rows = db
    .prepare(
      `
        SELECT session_key, room_key, role, revision, state
        FROM worker_sessions
        WHERE room_key = ?
        ORDER BY role ASC;
      `
    )
    .all(roomKey) as Array<{
    session_key: string;
    room_key: string;
    role: WorkerSession["role"];
    revision: number;
    state: WorkerSession["state"];
  }>;

  return rows.map((row) => ({
    sessionKey: row.session_key,
    roomKey: row.room_key,
    role: row.role,
    revision: row.revision,
    state: row.state
  }));
}
