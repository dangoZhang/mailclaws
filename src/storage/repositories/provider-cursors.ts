import type { DatabaseSync } from "node:sqlite";

export interface ProviderCursorRecord {
  accountId: string;
  provider: string;
  cursorKind: string;
  cursorValue: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export function upsertProviderCursor(db: DatabaseSync, record: ProviderCursorRecord) {
  db.prepare(
    `
      INSERT INTO provider_cursors (
        account_id,
        provider,
        cursor_kind,
        cursor_value,
        metadata_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id, cursor_kind) DO UPDATE SET
        provider = excluded.provider,
        cursor_value = excluded.cursor_value,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at;
    `
  ).run(
    record.accountId,
    record.provider,
    record.cursorKind,
    record.cursorValue,
    JSON.stringify(record.metadata),
    record.createdAt,
    record.updatedAt
  );
}

export function findProviderCursor(
  db: DatabaseSync,
  input: {
    accountId: string;
    cursorKind: string;
  }
): ProviderCursorRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          account_id,
          provider,
          cursor_kind,
          cursor_value,
          metadata_json,
          created_at,
          updated_at
        FROM provider_cursors
        WHERE account_id = ? AND cursor_kind = ?
        LIMIT 1;
      `
    )
    .get(input.accountId, input.cursorKind) as ProviderCursorRow | undefined;

  return row ? mapProviderCursorRow(row) : null;
}

export function listProviderCursors(db: DatabaseSync, accountId?: string) {
  const rows = (accountId
    ? db
        .prepare(
          `
            SELECT
              account_id,
              provider,
              cursor_kind,
              cursor_value,
              metadata_json,
              created_at,
              updated_at
            FROM provider_cursors
            WHERE account_id = ?
            ORDER BY updated_at DESC;
          `
        )
        .all(accountId)
    : db
        .prepare(
          `
            SELECT
              account_id,
              provider,
              cursor_kind,
              cursor_value,
              metadata_json,
              created_at,
              updated_at
            FROM provider_cursors
            ORDER BY updated_at DESC;
          `
        )
        .all()) as unknown as ProviderCursorRow[];

  return rows.map(mapProviderCursorRow);
}

interface ProviderCursorRow {
  account_id: string;
  provider: string;
  cursor_kind: string;
  cursor_value: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

function mapProviderCursorRow(row: ProviderCursorRow): ProviderCursorRecord {
  return {
    accountId: row.account_id,
    provider: row.provider,
    cursorKind: row.cursor_kind,
    cursorValue: row.cursor_value,
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
