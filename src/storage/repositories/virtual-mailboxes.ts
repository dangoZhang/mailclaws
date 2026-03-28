import type { DatabaseSync } from "node:sqlite";

import type { VirtualMailbox } from "../../core/types.js";

export function saveVirtualMailbox(db: DatabaseSync, mailbox: VirtualMailbox) {
  db.prepare(
    `
      INSERT INTO virtual_mailboxes (
        mailbox_id,
        account_id,
        kind,
        principal_id,
        role,
        visibility_policy_ref,
        capability_policy_ref,
        active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(mailbox_id) DO UPDATE SET
        account_id = excluded.account_id,
        kind = excluded.kind,
        principal_id = excluded.principal_id,
        role = excluded.role,
        visibility_policy_ref = excluded.visibility_policy_ref,
        capability_policy_ref = excluded.capability_policy_ref,
        active = excluded.active,
        updated_at = excluded.updated_at;
    `
  ).run(
    mailbox.mailboxId,
    mailbox.accountId,
    mailbox.kind,
    mailbox.principalId ?? null,
    mailbox.role ?? null,
    mailbox.visibilityPolicyRef ?? null,
    mailbox.capabilityPolicyRef ?? null,
    mailbox.active ? 1 : 0,
    mailbox.createdAt,
    mailbox.updatedAt
  );
}

export function getVirtualMailbox(db: DatabaseSync, mailboxId: string): VirtualMailbox | null {
  const row = db
    .prepare(
      `
        SELECT
          mailbox_id,
          account_id,
          kind,
          principal_id,
          role,
          visibility_policy_ref,
          capability_policy_ref,
          active,
          created_at,
          updated_at
        FROM virtual_mailboxes
        WHERE mailbox_id = ?;
      `
    )
    .get(mailboxId) as VirtualMailboxRow | undefined;

  return row ? mapVirtualMailboxRow(row) : null;
}

export function listVirtualMailboxesForRoom(db: DatabaseSync, roomKey: string): VirtualMailbox[] {
  const rows = db
    .prepare(
      `
        SELECT DISTINCT
          mailbox.mailbox_id,
          mailbox.account_id,
          mailbox.kind,
          mailbox.principal_id,
          mailbox.role,
          mailbox.visibility_policy_ref,
          mailbox.capability_policy_ref,
          mailbox.active,
          mailbox.created_at,
          mailbox.updated_at
        FROM virtual_mailboxes AS mailbox
        JOIN mailbox_deliveries AS delivery
          ON delivery.mailbox_id = mailbox.mailbox_id
        WHERE delivery.room_key = ?
        UNION
        SELECT DISTINCT
          mailbox.mailbox_id,
          mailbox.account_id,
          mailbox.kind,
          mailbox.principal_id,
          mailbox.role,
          mailbox.visibility_policy_ref,
          mailbox.capability_policy_ref,
          mailbox.active,
          mailbox.created_at,
          mailbox.updated_at
        FROM virtual_mailboxes AS mailbox
        JOIN virtual_messages AS message
          ON message.from_mailbox_id = mailbox.mailbox_id
        WHERE message.room_key = ?
        ORDER BY mailbox_id ASC;
      `
    )
    .all(roomKey, roomKey) as unknown as VirtualMailboxRow[];

  return rows.map(mapVirtualMailboxRow);
}

export function listVirtualMailboxesForAccount(db: DatabaseSync, accountId: string): VirtualMailbox[] {
  const rows = db
    .prepare(
      `
        SELECT
          mailbox_id,
          account_id,
          kind,
          principal_id,
          role,
          visibility_policy_ref,
          capability_policy_ref,
          active,
          created_at,
          updated_at
        FROM virtual_mailboxes
        WHERE account_id = ?
        ORDER BY kind ASC, mailbox_id ASC;
      `
    )
    .all(accountId) as unknown as VirtualMailboxRow[];

  return rows.map(mapVirtualMailboxRow);
}

interface VirtualMailboxRow {
  mailbox_id: string;
  account_id: string;
  kind: VirtualMailbox["kind"];
  principal_id: string | null;
  role: string | null;
  visibility_policy_ref: string | null;
  capability_policy_ref: string | null;
  active: number;
  created_at: string;
  updated_at: string;
}

function mapVirtualMailboxRow(row: VirtualMailboxRow): VirtualMailbox {
  return {
    mailboxId: row.mailbox_id,
    accountId: row.account_id,
    kind: row.kind,
    principalId: row.principal_id ?? undefined,
    role: row.role ?? undefined,
    visibilityPolicyRef: row.visibility_policy_ref ?? undefined,
    capabilityPolicyRef: row.capability_policy_ref ?? undefined,
    active: row.active !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
