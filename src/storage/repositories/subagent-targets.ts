import type { DatabaseSync } from "node:sqlite";

import type { SubAgentTarget } from "../../core/types.js";

export function saveSubAgentTarget(db: DatabaseSync, target: SubAgentTarget) {
  db.prepare(
    `
      INSERT INTO subagent_targets (
        target_id,
        account_id,
        mailbox_id,
        openclaw_agent_id,
        mode,
        model,
        thinking,
        run_timeout_seconds,
        bound_session_ttl_seconds,
        sandbox_mode,
        max_active_per_room,
        max_queued_per_inbox,
        allow_external_send,
        result_schema,
        enabled,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(target_id) DO UPDATE SET
        account_id = excluded.account_id,
        mailbox_id = excluded.mailbox_id,
        openclaw_agent_id = excluded.openclaw_agent_id,
        mode = excluded.mode,
        model = excluded.model,
        thinking = excluded.thinking,
        run_timeout_seconds = excluded.run_timeout_seconds,
        bound_session_ttl_seconds = excluded.bound_session_ttl_seconds,
        sandbox_mode = excluded.sandbox_mode,
        max_active_per_room = excluded.max_active_per_room,
        max_queued_per_inbox = excluded.max_queued_per_inbox,
        allow_external_send = excluded.allow_external_send,
        result_schema = excluded.result_schema,
        enabled = excluded.enabled,
        updated_at = excluded.updated_at;
    `
  ).run(
    target.targetId,
    target.accountId,
    target.mailboxId,
    target.openClawAgentId,
    target.mode,
    target.model ?? null,
    target.thinking ?? null,
    target.runTimeoutSeconds ?? null,
    target.boundSessionTtlSeconds ?? null,
    target.sandboxMode,
    target.maxActivePerRoom,
    target.maxQueuedPerInbox,
    target.allowExternalSend ? 1 : 0,
    target.resultSchema,
    target.enabled ? 1 : 0,
    target.createdAt,
    target.updatedAt
  );
}

export function getSubAgentTargetByMailboxId(db: DatabaseSync, mailboxId: string): SubAgentTarget | null {
  const row = db
    .prepare(
      `
        SELECT
          target_id,
          account_id,
          mailbox_id,
          openclaw_agent_id,
          mode,
          model,
          thinking,
          run_timeout_seconds,
          bound_session_ttl_seconds,
          sandbox_mode,
          max_active_per_room,
          max_queued_per_inbox,
          allow_external_send,
          result_schema,
          enabled,
          created_at,
          updated_at
        FROM subagent_targets
        WHERE mailbox_id = ?;
      `
    )
    .get(mailboxId) as SubAgentTargetRow | undefined;

  return row ? mapSubAgentTargetRow(row) : null;
}

export function getSubAgentTarget(db: DatabaseSync, targetId: string): SubAgentTarget | null {
  const row = db
    .prepare(
      `
        SELECT
          target_id,
          account_id,
          mailbox_id,
          openclaw_agent_id,
          mode,
          model,
          thinking,
          run_timeout_seconds,
          bound_session_ttl_seconds,
          sandbox_mode,
          max_active_per_room,
          max_queued_per_inbox,
          allow_external_send,
          result_schema,
          enabled,
          created_at,
          updated_at
        FROM subagent_targets
        WHERE target_id = ?;
      `
    )
    .get(targetId) as SubAgentTargetRow | undefined;

  return row ? mapSubAgentTargetRow(row) : null;
}

export function listSubAgentTargetsForAccount(db: DatabaseSync, accountId: string): SubAgentTarget[] {
  const rows = db
    .prepare(
      `
        SELECT
          target_id,
          account_id,
          mailbox_id,
          openclaw_agent_id,
          mode,
          model,
          thinking,
          run_timeout_seconds,
          bound_session_ttl_seconds,
          sandbox_mode,
          max_active_per_room,
          max_queued_per_inbox,
          allow_external_send,
          result_schema,
          enabled,
          created_at,
          updated_at
        FROM subagent_targets
        WHERE account_id = ?
        ORDER BY mailbox_id ASC;
      `
    )
    .all(accountId) as unknown as SubAgentTargetRow[];

  return rows.map(mapSubAgentTargetRow);
}

interface SubAgentTargetRow {
  target_id: string;
  account_id: string;
  mailbox_id: string;
  openclaw_agent_id: string;
  mode: SubAgentTarget["mode"];
  model: string | null;
  thinking: string | null;
  run_timeout_seconds: number | null;
  bound_session_ttl_seconds: number | null;
  sandbox_mode: SubAgentTarget["sandboxMode"];
  max_active_per_room: number;
  max_queued_per_inbox: number;
  allow_external_send: number;
  result_schema: SubAgentTarget["resultSchema"];
  enabled: number;
  created_at: string;
  updated_at: string;
}

function mapSubAgentTargetRow(row: SubAgentTargetRow): SubAgentTarget {
  return {
    targetId: row.target_id,
    accountId: row.account_id,
    mailboxId: row.mailbox_id,
    openClawAgentId: row.openclaw_agent_id,
    mode: row.mode,
    model: row.model ?? undefined,
    thinking: row.thinking ?? undefined,
    runTimeoutSeconds: row.run_timeout_seconds ?? undefined,
    boundSessionTtlSeconds: row.bound_session_ttl_seconds ?? undefined,
    sandboxMode: row.sandbox_mode,
    maxActivePerRoom: row.max_active_per_room,
    maxQueuedPerInbox: row.max_queued_per_inbox,
    allowExternalSend: row.allow_external_send !== 0,
    resultSchema: row.result_schema,
    enabled: row.enabled !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
