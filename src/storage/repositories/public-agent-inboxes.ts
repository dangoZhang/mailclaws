import type { DatabaseSync } from "node:sqlite";

import type { PublicAgentInbox } from "../../core/types.js";

export function savePublicAgentInbox(db: DatabaseSync, inbox: PublicAgentInbox) {
  db.prepare(
    `
      INSERT INTO public_agent_inboxes (
        inbox_id,
        account_id,
        agent_id,
        active_room_limit,
        ack_sla_seconds,
        burst_coalesce_seconds,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(inbox_id) DO UPDATE SET
        account_id = excluded.account_id,
        agent_id = excluded.agent_id,
        active_room_limit = excluded.active_room_limit,
        ack_sla_seconds = excluded.ack_sla_seconds,
        burst_coalesce_seconds = excluded.burst_coalesce_seconds,
        updated_at = excluded.updated_at;
    `
  ).run(
    inbox.inboxId,
    inbox.accountId,
    inbox.agentId,
    inbox.activeRoomLimit,
    inbox.ackSlaSeconds,
    inbox.burstCoalesceSeconds,
    inbox.createdAt,
    inbox.updatedAt
  );
}

export function getPublicAgentInbox(
  db: DatabaseSync,
  input: {
    inboxId?: string;
    accountId?: string;
    agentId?: string;
  }
): PublicAgentInbox | null {
  let row: PublicAgentInboxRow | undefined;
  if (input.inboxId) {
    row = db
      .prepare(
        `
          SELECT
            inbox_id,
            account_id,
            agent_id,
            active_room_limit,
            ack_sla_seconds,
            burst_coalesce_seconds,
            created_at,
            updated_at
          FROM public_agent_inboxes
          WHERE inbox_id = ?;
        `
      )
      .get(input.inboxId) as PublicAgentInboxRow | undefined;
  } else if (input.accountId && input.agentId) {
    row = db
      .prepare(
        `
          SELECT
            inbox_id,
            account_id,
            agent_id,
            active_room_limit,
            ack_sla_seconds,
            burst_coalesce_seconds,
            created_at,
            updated_at
          FROM public_agent_inboxes
          WHERE account_id = ? AND agent_id = ?;
        `
      )
      .get(input.accountId, input.agentId) as PublicAgentInboxRow | undefined;
  }

  return row ? mapRow(row) : null;
}

export function listPublicAgentInboxesForAccount(db: DatabaseSync, accountId: string): PublicAgentInbox[] {
  const rows = db
    .prepare(
      `
        SELECT
          inbox_id,
          account_id,
          agent_id,
          active_room_limit,
          ack_sla_seconds,
          burst_coalesce_seconds,
          created_at,
          updated_at
        FROM public_agent_inboxes
        WHERE account_id = ?
        ORDER BY agent_id ASC;
      `
    )
    .all(accountId) as unknown as PublicAgentInboxRow[];

  return rows.map(mapRow);
}

interface PublicAgentInboxRow {
  inbox_id: string;
  account_id: string;
  agent_id: string;
  active_room_limit: number;
  ack_sla_seconds: number;
  burst_coalesce_seconds: number;
  created_at: string;
  updated_at: string;
}

function mapRow(row: PublicAgentInboxRow): PublicAgentInbox {
  return {
    inboxId: row.inbox_id,
    accountId: row.account_id,
    agentId: row.agent_id,
    activeRoomLimit: row.active_room_limit,
    ackSlaSeconds: row.ack_sla_seconds,
    burstCoalesceSeconds: row.burst_coalesce_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
