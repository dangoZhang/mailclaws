import type { DatabaseSync } from "node:sqlite";

import type { InboxItem } from "../../core/types.js";

export function saveInboxItem(db: DatabaseSync, item: InboxItem) {
  db.prepare(
    `
      INSERT INTO inbox_items (
        inbox_item_id,
        inbox_id,
        account_id,
        agent_id,
        participant_role,
        room_key,
        latest_revision,
        unread_count,
        newest_message_at,
        state,
        priority,
        urgency,
        estimated_effort,
        blocked_reason,
        active_worker_count,
        latest_summary_ref,
        needs_ack_by,
        last_triaged_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(inbox_item_id) DO UPDATE SET
        inbox_id = excluded.inbox_id,
        account_id = excluded.account_id,
        agent_id = excluded.agent_id,
        participant_role = excluded.participant_role,
        room_key = excluded.room_key,
        latest_revision = excluded.latest_revision,
        unread_count = excluded.unread_count,
        newest_message_at = excluded.newest_message_at,
        state = excluded.state,
        priority = excluded.priority,
        urgency = excluded.urgency,
        estimated_effort = excluded.estimated_effort,
        blocked_reason = excluded.blocked_reason,
        active_worker_count = excluded.active_worker_count,
        latest_summary_ref = excluded.latest_summary_ref,
        needs_ack_by = excluded.needs_ack_by,
        last_triaged_at = excluded.last_triaged_at,
        updated_at = excluded.updated_at;
    `
  ).run(
    item.inboxItemId,
    item.inboxId,
    item.accountId,
    item.agentId,
    item.participantRole,
    item.roomKey,
    item.latestRevision,
    item.unreadCount,
    item.newestMessageAt,
    item.state,
    item.priority,
    item.urgency,
    item.estimatedEffort,
    item.blockedReason ?? null,
    item.activeWorkerCount,
    item.latestSummaryRef ?? null,
    item.needsAckBy ?? null,
    item.lastTriagedAt ?? null,
    item.createdAt,
    item.updatedAt
  );
}

export function getInboxItem(db: DatabaseSync, inboxItemId: string): InboxItem | null {
  const row = db
    .prepare(
      `
        SELECT
          inbox_item_id,
          inbox_id,
          account_id,
          agent_id,
          participant_role,
          room_key,
          latest_revision,
          unread_count,
          newest_message_at,
          state,
          priority,
          urgency,
          estimated_effort,
          blocked_reason,
          active_worker_count,
          latest_summary_ref,
          needs_ack_by,
          last_triaged_at,
          created_at,
          updated_at
        FROM inbox_items
        WHERE inbox_item_id = ?;
      `
    )
    .get(inboxItemId) as InboxItemRow | undefined;

  return row ? mapRow(row) : null;
}

export function getInboxItemForRoom(
  db: DatabaseSync,
  input: {
    inboxId: string;
    roomKey: string;
  }
): InboxItem | null {
  const row = db
    .prepare(
      `
        SELECT
          inbox_item_id,
          inbox_id,
          account_id,
          agent_id,
          participant_role,
          room_key,
          latest_revision,
          unread_count,
          newest_message_at,
          state,
          priority,
          urgency,
          estimated_effort,
          blocked_reason,
          active_worker_count,
          latest_summary_ref,
          needs_ack_by,
          last_triaged_at,
          created_at,
          updated_at
        FROM inbox_items
        WHERE inbox_id = ? AND room_key = ?;
      `
    )
    .get(input.inboxId, input.roomKey) as InboxItemRow | undefined;

  return row ? mapRow(row) : null;
}

export function listInboxItemsForInbox(db: DatabaseSync, inboxId: string): InboxItem[] {
  const rows = db
    .prepare(
      `
        SELECT
          inbox_item_id,
          inbox_id,
          account_id,
          agent_id,
          participant_role,
          room_key,
          latest_revision,
          unread_count,
          newest_message_at,
          state,
          priority,
          urgency,
          estimated_effort,
          blocked_reason,
          active_worker_count,
          latest_summary_ref,
          needs_ack_by,
          last_triaged_at,
          created_at,
          updated_at
        FROM inbox_items
        WHERE inbox_id = ?
        ORDER BY priority DESC, newest_message_at DESC, room_key ASC;
      `
    )
    .all(inboxId) as unknown as InboxItemRow[];

  return rows.map(mapRow);
}

interface InboxItemRow {
  inbox_item_id: string;
  inbox_id: string;
  account_id: string;
  agent_id: string;
  participant_role: InboxItem["participantRole"];
  room_key: string;
  latest_revision: number;
  unread_count: number;
  newest_message_at: string;
  state: InboxItem["state"];
  priority: number;
  urgency: InboxItem["urgency"];
  estimated_effort: InboxItem["estimatedEffort"];
  blocked_reason: string | null;
  active_worker_count: number;
  latest_summary_ref: string | null;
  needs_ack_by: string | null;
  last_triaged_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: InboxItemRow): InboxItem {
  return {
    inboxItemId: row.inbox_item_id,
    inboxId: row.inbox_id,
    accountId: row.account_id,
    agentId: row.agent_id,
    participantRole: row.participant_role,
    roomKey: row.room_key,
    latestRevision: row.latest_revision,
    unreadCount: row.unread_count,
    newestMessageAt: row.newest_message_at,
    state: row.state,
    priority: row.priority,
    urgency: row.urgency,
    estimatedEffort: row.estimated_effort,
    blockedReason: row.blocked_reason ?? undefined,
    activeWorkerCount: row.active_worker_count,
    latestSummaryRef: row.latest_summary_ref ?? undefined,
    needsAckBy: row.needs_ack_by ?? undefined,
    lastTriagedAt: row.last_triaged_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
