import type { DatabaseSync } from "node:sqlite";

import type { GatewaySessionBinding } from "../../core/types.js";

export function saveGatewaySessionBinding(db: DatabaseSync, binding: GatewaySessionBinding) {
  db.prepare(
    `
      INSERT INTO gateway_session_bindings (
        session_key,
        room_key,
        binding_kind,
        work_thread_id,
        parent_message_id,
        source_control_plane,
        front_agent_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_key) DO UPDATE SET
        room_key = excluded.room_key,
        binding_kind = excluded.binding_kind,
        work_thread_id = excluded.work_thread_id,
        parent_message_id = excluded.parent_message_id,
        source_control_plane = excluded.source_control_plane,
        front_agent_id = excluded.front_agent_id,
        updated_at = excluded.updated_at;
    `
  ).run(
    binding.sessionKey,
    binding.roomKey,
    binding.bindingKind,
    binding.workThreadId ?? null,
    binding.parentMessageId ?? null,
    binding.sourceControlPlane,
    binding.frontAgentId ?? null,
    binding.createdAt,
    binding.updatedAt
  );
}

export function getGatewaySessionBinding(db: DatabaseSync, sessionKey: string): GatewaySessionBinding | null {
  const row = db
    .prepare(
      `
        SELECT
          session_key,
          room_key,
          binding_kind,
          work_thread_id,
          parent_message_id,
          source_control_plane,
          front_agent_id,
          created_at,
          updated_at
        FROM gateway_session_bindings
        WHERE session_key = ?;
      `
    )
    .get(sessionKey) as GatewaySessionBindingRow | undefined;

  return row ? mapGatewaySessionBindingRow(row) : null;
}

export function listGatewaySessionBindingsForRoom(db: DatabaseSync, roomKey: string): GatewaySessionBinding[] {
  const rows = db
    .prepare(
      `
        SELECT
          session_key,
          room_key,
          binding_kind,
          work_thread_id,
          parent_message_id,
          source_control_plane,
          front_agent_id,
          created_at,
          updated_at
        FROM gateway_session_bindings
        WHERE room_key = ?
        ORDER BY updated_at ASC, session_key ASC;
      `
    )
    .all(roomKey) as unknown as GatewaySessionBindingRow[];

  return rows.map(mapGatewaySessionBindingRow);
}

interface GatewaySessionBindingRow {
  session_key: string;
  room_key: string;
  binding_kind: GatewaySessionBinding["bindingKind"];
  work_thread_id: string | null;
  parent_message_id: string | null;
  source_control_plane: string;
  front_agent_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapGatewaySessionBindingRow(row: GatewaySessionBindingRow): GatewaySessionBinding {
  return {
    sessionKey: row.session_key,
    roomKey: row.room_key,
    bindingKind: row.binding_kind,
    workThreadId: row.work_thread_id ?? undefined,
    parentMessageId: row.parent_message_id ?? undefined,
    sourceControlPlane: row.source_control_plane,
    frontAgentId: row.front_agent_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
