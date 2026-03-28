import type { DatabaseSync } from "node:sqlite";

export type RoomParticipantType = "human" | "agent";
export type RoomParticipantVisibility = "visible" | "bcc" | "internal";

export interface RoomParticipantRecord {
  participantKey: string;
  roomKey: string;
  emailAddress?: string;
  displayName?: string;
  participantType: RoomParticipantType;
  visibility: RoomParticipantVisibility;
  role?: string;
  source: string;
  joinedAt: string;
  lastSeenAt: string;
}

export interface UpsertRoomParticipantInput {
  roomKey: string;
  emailAddress?: string;
  displayName?: string;
  participantType: RoomParticipantType;
  visibility: RoomParticipantVisibility;
  role?: string;
  source: string;
  seenAt: string;
}

export function upsertRoomParticipant(
  db: DatabaseSync,
  input: UpsertRoomParticipantInput
): RoomParticipantRecord {
  const participantKey = buildParticipantKey(input);
  const existing = getRoomParticipantByKey(db, participantKey);
  const record: RoomParticipantRecord = {
    participantKey,
    roomKey: input.roomKey,
    emailAddress: normalizeEmail(input.emailAddress) || undefined,
    displayName: normalizeDisplayName(input.displayName),
    participantType: input.participantType,
    visibility: chooseVisibility(existing?.visibility, input.visibility),
    role: normalizeRole(input.role),
    source: input.source,
    joinedAt: existing?.joinedAt ?? input.seenAt,
    lastSeenAt: input.seenAt
  };

  db.prepare(
    `
      INSERT INTO room_participants (
        participant_key,
        room_key,
        email_address,
        display_name,
        participant_type,
        visibility,
        role,
        source,
        joined_at,
        last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(participant_key) DO UPDATE SET
        display_name = excluded.display_name,
        visibility = excluded.visibility,
        source = excluded.source,
        last_seen_at = excluded.last_seen_at;
    `
  ).run(
    record.participantKey,
    record.roomKey,
    record.emailAddress ?? null,
    record.displayName ?? null,
    record.participantType,
    record.visibility,
    record.role ?? null,
    record.source,
    record.joinedAt,
    record.lastSeenAt
  );

  return record;
}

export function listRoomParticipants(db: DatabaseSync, roomKey: string): RoomParticipantRecord[] {
  const rows = db
    .prepare(
      `
        SELECT
          participant_key,
          room_key,
          email_address,
          display_name,
          participant_type,
          visibility,
          role,
          source,
          joined_at,
          last_seen_at
        FROM room_participants
        WHERE room_key = ?
        ORDER BY
          CASE visibility
            WHEN 'visible' THEN 0
            WHEN 'bcc' THEN 1
            ELSE 2
          END ASC,
          participant_type ASC,
          COALESCE(email_address, role, participant_key) ASC;
      `
    )
    .all(roomKey) as unknown as RoomParticipantRow[];

  return rows.map(mapRoomParticipantRow);
}

function getRoomParticipantByKey(db: DatabaseSync, participantKey: string): RoomParticipantRecord | null {
  const row = db
    .prepare(
      `
        SELECT
          participant_key,
          room_key,
          email_address,
          display_name,
          participant_type,
          visibility,
          role,
          source,
          joined_at,
          last_seen_at
        FROM room_participants
        WHERE participant_key = ?
        LIMIT 1;
      `
    )
    .get(participantKey) as RoomParticipantRow | undefined;

  return row ? mapRoomParticipantRow(row) : null;
}

function mapRoomParticipantRow(row: RoomParticipantRow): RoomParticipantRecord {
  return {
    participantKey: row.participant_key,
    roomKey: row.room_key,
    emailAddress: row.email_address ?? undefined,
    displayName: row.display_name ?? undefined,
    participantType: row.participant_type,
    visibility: row.visibility,
    role: row.role ?? undefined,
    source: row.source,
    joinedAt: row.joined_at,
    lastSeenAt: row.last_seen_at
  };
}

function buildParticipantKey(input: {
  roomKey: string;
  emailAddress?: string;
  participantType: RoomParticipantType;
  role?: string;
}) {
  return [
    input.roomKey,
    input.participantType,
    normalizeEmail(input.emailAddress) || "-",
    normalizeRole(input.role) || "-"
  ].join("|");
}

function chooseVisibility(
  current: RoomParticipantVisibility | undefined,
  next: RoomParticipantVisibility
): RoomParticipantVisibility {
  const priorities: Record<RoomParticipantVisibility, number> = {
    visible: 3,
    bcc: 2,
    internal: 1
  };

  if (!current) {
    return next;
  }

  return priorities[next] >= priorities[current] ? next : current;
}

function normalizeEmail(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeDisplayName(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeRole(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

interface RoomParticipantRow {
  participant_key: string;
  room_key: string;
  email_address: string | null;
  display_name: string | null;
  participant_type: RoomParticipantType;
  visibility: RoomParticipantVisibility;
  role: string | null;
  source: string;
  joined_at: string;
  last_seen_at: string;
}
