import type { DatabaseSync } from "node:sqlite";

import type { VirtualThread } from "../../core/types.js";

export function saveVirtualThread(db: DatabaseSync, thread: VirtualThread) {
  db.prepare(
    `
      INSERT INTO virtual_threads (
        thread_id,
        room_key,
        kind,
        topic,
        parent_work_thread_id,
        created_by_message_id,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(thread_id) DO UPDATE SET
        room_key = excluded.room_key,
        kind = excluded.kind,
        topic = excluded.topic,
        parent_work_thread_id = excluded.parent_work_thread_id,
        created_by_message_id = excluded.created_by_message_id,
        status = excluded.status,
        created_at = excluded.created_at;
    `
  ).run(
    thread.threadId,
    thread.roomKey,
    thread.kind,
    thread.topic,
    thread.parentWorkThreadId ?? null,
    thread.createdByMessageId,
    thread.status,
    thread.createdAt
  );
}

export function getVirtualThread(db: DatabaseSync, threadId: string): VirtualThread | null {
  const row = db
    .prepare(
      `
        SELECT
          thread_id,
          room_key,
          kind,
          topic,
          parent_work_thread_id,
          created_by_message_id,
          status,
          created_at
        FROM virtual_threads
        WHERE thread_id = ?;
      `
    )
    .get(threadId) as VirtualThreadRow | undefined;

  return row ? mapVirtualThreadRow(row) : null;
}

export function listVirtualThreadsForRoom(db: DatabaseSync, roomKey: string): VirtualThread[] {
  const rows = db
    .prepare(
      `
        SELECT
          thread_id,
          room_key,
          kind,
          topic,
          parent_work_thread_id,
          created_by_message_id,
          status,
          created_at
        FROM virtual_threads
        WHERE room_key = ?
        ORDER BY created_at ASC, thread_id ASC;
      `
    )
    .all(roomKey) as unknown as VirtualThreadRow[];

  return rows.map(mapVirtualThreadRow);
}

export function deleteVirtualThreadsForRoom(db: DatabaseSync, roomKey: string) {
  db.prepare("DELETE FROM virtual_threads WHERE room_key = ?;").run(roomKey);
}

interface VirtualThreadRow {
  thread_id: string;
  room_key: string;
  kind: VirtualThread["kind"];
  topic: string;
  parent_work_thread_id: string | null;
  created_by_message_id: string;
  status: VirtualThread["status"];
  created_at: string;
}

function mapVirtualThreadRow(row: VirtualThreadRow): VirtualThread {
  return {
    threadId: row.thread_id,
    roomKey: row.room_key,
    kind: row.kind,
    topic: row.topic,
    parentWorkThreadId: row.parent_work_thread_id ?? undefined,
    createdByMessageId: row.created_by_message_id,
    status: row.status,
    createdAt: row.created_at
  };
}
