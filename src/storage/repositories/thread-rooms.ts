import type { DatabaseSync } from "node:sqlite";

import type { ThreadRoom, WorkerRole } from "../../core/types.js";

export function saveThreadRoom(db: DatabaseSync, room: ThreadRoom) {
  db.prepare(
    `
      INSERT INTO thread_rooms (
        room_key,
        account_id,
        stable_thread_id,
        parent_session_key,
        front_agent_address,
        front_agent_id,
        public_agent_addresses_json,
        public_agent_ids_json,
        collaborator_agent_addresses_json,
        collaborator_agent_ids_json,
        summoned_roles_json,
        state,
        revision,
        last_inbound_seq,
        last_outbound_seq,
        summary_ref,
        shared_facts_ref
      ) VALUES (
        $roomKey,
        $accountId,
        $stableThreadId,
        $parentSessionKey,
        $frontAgentAddress,
        $frontAgentId,
        $publicAgentAddressesJson,
        $publicAgentIdsJson,
        $collaboratorAgentAddressesJson,
        $collaboratorAgentIdsJson,
        $summonedRolesJson,
        $state,
        $revision,
        $lastInboundSeq,
        $lastOutboundSeq,
        $summaryRef,
        $sharedFactsRef
      )
      ON CONFLICT(room_key) DO UPDATE SET
        account_id = excluded.account_id,
        stable_thread_id = excluded.stable_thread_id,
        parent_session_key = excluded.parent_session_key,
        front_agent_address = excluded.front_agent_address,
        front_agent_id = excluded.front_agent_id,
        public_agent_addresses_json = excluded.public_agent_addresses_json,
        public_agent_ids_json = excluded.public_agent_ids_json,
        collaborator_agent_addresses_json = excluded.collaborator_agent_addresses_json,
        collaborator_agent_ids_json = excluded.collaborator_agent_ids_json,
        summoned_roles_json = excluded.summoned_roles_json,
        state = excluded.state,
        revision = excluded.revision,
        last_inbound_seq = excluded.last_inbound_seq,
        last_outbound_seq = excluded.last_outbound_seq,
        summary_ref = excluded.summary_ref,
        shared_facts_ref = excluded.shared_facts_ref;
    `
  ).run({
    $roomKey: room.roomKey,
    $accountId: room.accountId,
    $stableThreadId: room.stableThreadId,
    $parentSessionKey: room.parentSessionKey,
    $frontAgentAddress: room.frontAgentAddress ?? null,
    $frontAgentId: room.frontAgentId ?? null,
    $publicAgentAddressesJson: JSON.stringify(room.publicAgentAddresses ?? []),
    $publicAgentIdsJson: JSON.stringify(room.publicAgentIds ?? []),
    $collaboratorAgentAddressesJson: JSON.stringify(room.collaboratorAgentAddresses ?? []),
    $collaboratorAgentIdsJson: JSON.stringify(room.collaboratorAgentIds ?? []),
    $summonedRolesJson: JSON.stringify(room.summonedRoles ?? []),
    $state: room.state,
    $revision: room.revision,
    $lastInboundSeq: room.lastInboundSeq,
    $lastOutboundSeq: room.lastOutboundSeq,
    $summaryRef: room.summaryRef ?? null,
    $sharedFactsRef: room.sharedFactsRef ?? null
  });
}

export function getThreadRoom(db: DatabaseSync, roomKey: string): ThreadRoom | null {
  const row = db
    .prepare(
      `
        SELECT
          room_key,
          account_id,
          stable_thread_id,
          parent_session_key,
          front_agent_address,
          front_agent_id,
          public_agent_addresses_json,
          public_agent_ids_json,
          collaborator_agent_addresses_json,
          collaborator_agent_ids_json,
          summoned_roles_json,
          state,
          revision,
          last_inbound_seq,
          last_outbound_seq,
          summary_ref,
          shared_facts_ref
        FROM thread_rooms
        WHERE room_key = ?;
      `
    )
    .get(roomKey) as
    | {
        room_key: string;
        account_id: string;
        stable_thread_id: string;
        parent_session_key: string;
        front_agent_address: string | null;
        front_agent_id: string | null;
        public_agent_addresses_json: string;
        public_agent_ids_json: string;
        collaborator_agent_addresses_json: string;
        collaborator_agent_ids_json: string;
        summoned_roles_json: string;
        state: ThreadRoom["state"];
        revision: number;
        last_inbound_seq: number;
        last_outbound_seq: number;
        summary_ref: string | null;
        shared_facts_ref: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return mapThreadRoomRow(row);
}

export function getThreadRoomByParentSessionKey(db: DatabaseSync, parentSessionKey: string): ThreadRoom | null {
  const row = db
    .prepare(
      `
        SELECT
          room_key,
          account_id,
          stable_thread_id,
          parent_session_key,
          front_agent_address,
          front_agent_id,
          public_agent_addresses_json,
          public_agent_ids_json,
          collaborator_agent_addresses_json,
          collaborator_agent_ids_json,
          summoned_roles_json,
          state,
          revision,
          last_inbound_seq,
          last_outbound_seq,
          summary_ref,
          shared_facts_ref
        FROM thread_rooms
        WHERE parent_session_key = ?
        LIMIT 1;
      `
    )
    .get(parentSessionKey) as
    | {
        room_key: string;
        account_id: string;
        stable_thread_id: string;
        parent_session_key: string;
        front_agent_address: string | null;
        front_agent_id: string | null;
        public_agent_addresses_json: string;
        public_agent_ids_json: string;
        collaborator_agent_addresses_json: string;
        collaborator_agent_ids_json: string;
        summoned_roles_json: string;
        state: ThreadRoom["state"];
        revision: number;
        last_inbound_seq: number;
        last_outbound_seq: number;
        summary_ref: string | null;
        shared_facts_ref: string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return mapThreadRoomRow(row);
}

export function listThreadRooms(db: DatabaseSync): ThreadRoom[] {
  const rows = db
    .prepare(
      `
        SELECT
          room_key,
          account_id,
          stable_thread_id,
          parent_session_key,
          front_agent_address,
          front_agent_id,
          public_agent_addresses_json,
          public_agent_ids_json,
          collaborator_agent_addresses_json,
          collaborator_agent_ids_json,
          summoned_roles_json,
          state,
          revision,
          last_inbound_seq,
          last_outbound_seq,
          summary_ref,
          shared_facts_ref
        FROM thread_rooms
        ORDER BY account_id ASC, stable_thread_id ASC;
      `
    )
    .all() as Array<{
    room_key: string;
    account_id: string;
    stable_thread_id: string;
    parent_session_key: string;
    front_agent_address: string | null;
    front_agent_id: string | null;
    public_agent_addresses_json: string;
    public_agent_ids_json: string;
    collaborator_agent_addresses_json: string;
    collaborator_agent_ids_json: string;
    summoned_roles_json: string;
    state: ThreadRoom["state"];
    revision: number;
    last_inbound_seq: number;
    last_outbound_seq: number;
    summary_ref: string | null;
    shared_facts_ref: string | null;
  }>;

  return rows.map((row) => mapThreadRoomRow(row));
}

function mapThreadRoomRow(row: {
  room_key: string;
  account_id: string;
  stable_thread_id: string;
  parent_session_key: string;
  front_agent_address: string | null;
  front_agent_id: string | null;
  public_agent_addresses_json: string;
  public_agent_ids_json: string;
  collaborator_agent_addresses_json: string;
  collaborator_agent_ids_json: string;
  summoned_roles_json: string;
  state: ThreadRoom["state"];
  revision: number;
  last_inbound_seq: number;
  last_outbound_seq: number;
  summary_ref: string | null;
  shared_facts_ref: string | null;
}): ThreadRoom {
  const publicAgentAddresses = parseAddressList(row.public_agent_addresses_json);
  const publicAgentIds = parseAddressList(row.public_agent_ids_json);
  const collaboratorAgentAddresses = parseAddressList(row.collaborator_agent_addresses_json);
  const collaboratorAgentIds = parseAddressList(row.collaborator_agent_ids_json);
  const summonedRoles = parseRoleList(row.summoned_roles_json);

  return {
    roomKey: row.room_key,
    accountId: row.account_id,
    stableThreadId: row.stable_thread_id,
    parentSessionKey: row.parent_session_key,
    ...(row.front_agent_address ? { frontAgentAddress: row.front_agent_address } : {}),
    ...(row.front_agent_id ? { frontAgentId: row.front_agent_id } : {}),
    ...(publicAgentAddresses.length > 0 ? { publicAgentAddresses } : {}),
    ...(publicAgentIds.length > 0 ? { publicAgentIds } : {}),
    ...(collaboratorAgentAddresses.length > 0 ? { collaboratorAgentAddresses } : {}),
    ...(collaboratorAgentIds.length > 0 ? { collaboratorAgentIds } : {}),
    ...(summonedRoles.length > 0 ? { summonedRoles } : {}),
    state: row.state,
    revision: row.revision,
    lastInboundSeq: row.last_inbound_seq,
    lastOutboundSeq: row.last_outbound_seq,
    ...(row.summary_ref ? { summaryRef: row.summary_ref } : {}),
    ...(row.shared_facts_ref ? { sharedFactsRef: row.shared_facts_ref } : {})
  };
}

function parseAddressList(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function parseRoleList(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is WorkerRole => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}
