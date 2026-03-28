import type { DatabaseSync } from "node:sqlite";

export type MailAccountStatus = "active" | "disabled";

export interface MailAccountRecord {
  accountId: string;
  provider: string;
  emailAddress: string;
  displayName?: string;
  status: MailAccountStatus;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function upsertMailAccount(db: DatabaseSync, account: MailAccountRecord) {
  db.prepare(
    `
      INSERT INTO mail_accounts (
        account_id,
        provider,
        email_address,
        display_name,
        status,
        settings_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        provider = excluded.provider,
        email_address = excluded.email_address,
        display_name = excluded.display_name,
        status = excluded.status,
        settings_json = excluded.settings_json,
        updated_at = excluded.updated_at;
    `
  ).run(
    account.accountId,
    account.provider,
    account.emailAddress,
    account.displayName ?? null,
    account.status,
    JSON.stringify(account.settings),
    account.createdAt,
    account.updatedAt
  );
}

export function getMailAccount(db: DatabaseSync, accountId: string): MailAccountRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          account_id,
          provider,
          email_address,
          display_name,
          status,
          settings_json,
          created_at,
          updated_at
        FROM mail_accounts
        WHERE account_id = ?
        LIMIT 1;
      `
    )
    .get(accountId) as MailAccountRow | undefined;

  return row ? mapMailAccountRow(row) : null;
}

export function listMailAccounts(db: DatabaseSync): MailAccountRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          account_id,
          provider,
          email_address,
          display_name,
          status,
          settings_json,
          created_at,
          updated_at
        FROM mail_accounts
        ORDER BY account_id ASC;
      `
    )
    .all() as unknown as MailAccountRow[];

  return rows.map(mapMailAccountRow);
}

function mapMailAccountRow(row: MailAccountRow): MailAccountRecord {
  return {
    accountId: row.account_id,
    provider: row.provider,
    emailAddress: row.email_address,
    displayName: row.display_name ?? undefined,
    status: row.status,
    settings: JSON.parse(row.settings_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

interface MailAccountRow {
  account_id: string;
  provider: string;
  email_address: string;
  display_name: string | null;
  status: MailAccountStatus;
  settings_json: string;
  created_at: string;
  updated_at: string;
}
