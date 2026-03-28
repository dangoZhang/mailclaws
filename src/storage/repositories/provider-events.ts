import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface ProviderEventRecord {
  providerEventId: string;
  accountId: string;
  provider: string;
  roomKey?: string;
  dedupeKey?: string;
  eventType: string;
  cursorValue?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export function appendProviderEvent(
  db: DatabaseSync,
  input: Omit<ProviderEventRecord, "providerEventId" | "createdAt"> & {
    providerEventId?: string;
    createdAt?: string;
  }
): ProviderEventRecord {
  const record: ProviderEventRecord = {
    providerEventId: input.providerEventId ?? randomUUID(),
    accountId: input.accountId,
    provider: input.provider,
    roomKey: input.roomKey,
    dedupeKey: input.dedupeKey,
    eventType: input.eventType,
    cursorValue: input.cursorValue,
    payload: input.payload,
    createdAt: input.createdAt ?? new Date().toISOString()
  };

  db.prepare(
    `
      INSERT INTO provider_events (
        provider_event_id,
        account_id,
        provider,
        room_key,
        dedupe_key,
        event_type,
        cursor_value,
        payload_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `
  ).run(
    record.providerEventId,
    record.accountId,
    record.provider,
    record.roomKey ?? null,
    record.dedupeKey ?? null,
    record.eventType,
    record.cursorValue ?? null,
    JSON.stringify(record.payload),
    record.createdAt
  );

  return record;
}

export function listProviderEventsForRoom(db: DatabaseSync, roomKey: string): ProviderEventRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          provider_event_id,
          account_id,
          provider,
          room_key,
          dedupe_key,
          event_type,
          cursor_value,
          payload_json,
          created_at
        FROM provider_events
        WHERE room_key = ?
        ORDER BY created_at ASC, provider_event_id ASC;
      `
    )
    .all(roomKey) as unknown as ProviderEventRow[];

  return rows.map(mapProviderEventRow);
}

export function listProviderEventsForAccount(db: DatabaseSync, accountId: string): ProviderEventRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          provider_event_id,
          account_id,
          provider,
          room_key,
          dedupe_key,
          event_type,
          cursor_value,
          payload_json,
          created_at
        FROM provider_events
        WHERE account_id = ?
        ORDER BY created_at ASC, provider_event_id ASC;
      `
    )
    .all(accountId) as unknown as ProviderEventRow[];

  return rows.map(mapProviderEventRow);
}

interface ProviderEventRow {
  provider_event_id: string;
  account_id: string;
  provider: string;
  room_key: string | null;
  dedupe_key: string | null;
  event_type: string;
  cursor_value: string | null;
  payload_json: string;
  created_at: string;
}

function mapProviderEventRow(row: ProviderEventRow): ProviderEventRecord {
  return {
    providerEventId: row.provider_event_id,
    accountId: row.account_id,
    provider: row.provider,
    roomKey: row.room_key ?? undefined,
    dedupeKey: row.dedupe_key ?? undefined,
    eventType: row.event_type,
    cursorValue: row.cursor_value ?? undefined,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    createdAt: row.created_at
  };
}
