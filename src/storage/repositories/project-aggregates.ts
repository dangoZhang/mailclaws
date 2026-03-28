import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { ProjectAggregate, RoomProjectLink } from "../../core/types.js";

export function listProjectAggregates(db: DatabaseSync, accountId?: string): ProjectAggregate[] {
  const rows = (accountId
    ? db
        .prepare(
          `
            SELECT project_id, account_id, project_key, title, status, room_count, active_room_count,
                   latest_summary, risk_summary, next_action, created_at, updated_at
            FROM project_aggregates
            WHERE account_id = ?
            ORDER BY updated_at DESC, created_at ASC;
          `
        )
        .all(accountId)
    : db
        .prepare(
          `
            SELECT project_id, account_id, project_key, title, status, room_count, active_room_count,
                   latest_summary, risk_summary, next_action, created_at, updated_at
            FROM project_aggregates
            ORDER BY updated_at DESC, created_at ASC;
          `
        )
        .all()) as unknown as ProjectAggregateRow[];

  return rows.map(mapProjectAggregateRow);
}

export function findProjectAggregateById(db: DatabaseSync, projectId: string): ProjectAggregate | null {
  const row = db
    .prepare(
      `
        SELECT project_id, account_id, project_key, title, status, room_count, active_room_count,
               latest_summary, risk_summary, next_action, created_at, updated_at
        FROM project_aggregates
        WHERE project_id = ?
        LIMIT 1;
      `
    )
    .get(projectId) as ProjectAggregateRow | undefined;

  return row ? mapProjectAggregateRow(row) : null;
}

export function findProjectAggregateByKey(
  db: DatabaseSync,
  input: { accountId: string; projectKey: string }
): ProjectAggregate | null {
  const row = db
    .prepare(
      `
        SELECT project_id, account_id, project_key, title, status, room_count, active_room_count,
               latest_summary, risk_summary, next_action, created_at, updated_at
        FROM project_aggregates
        WHERE account_id = ? AND project_key = ?
        LIMIT 1;
      `
    )
    .get(input.accountId, input.projectKey) as ProjectAggregateRow | undefined;

  return row ? mapProjectAggregateRow(row) : null;
}

export function upsertProjectAggregate(
  db: DatabaseSync,
  input: Omit<ProjectAggregate, "projectId" | "createdAt" | "updatedAt"> & {
    projectId?: string;
    createdAt?: string;
    updatedAt?: string;
  }
) {
  const existing = input.projectId
    ? findProjectAggregateById(db, input.projectId)
    : findProjectAggregateByKey(db, {
        accountId: input.accountId,
        projectKey: input.projectKey
      });
  const timestamp = input.updatedAt ?? new Date().toISOString();
  const record: ProjectAggregate = {
    projectId: existing?.projectId ?? input.projectId ?? randomUUID(),
    accountId: input.accountId,
    projectKey: input.projectKey,
    title: input.title,
    status: input.status,
    roomCount: input.roomCount,
    activeRoomCount: input.activeRoomCount,
    latestSummary: input.latestSummary,
    riskSummary: input.riskSummary,
    nextAction: input.nextAction,
    createdAt: existing?.createdAt ?? input.createdAt ?? timestamp,
    updatedAt: timestamp
  };

  db.prepare(
    `
      INSERT INTO project_aggregates (
        project_id, account_id, project_key, title, status, room_count, active_room_count,
        latest_summary, risk_summary, next_action, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        account_id = excluded.account_id,
        project_key = excluded.project_key,
        title = excluded.title,
        status = excluded.status,
        room_count = excluded.room_count,
        active_room_count = excluded.active_room_count,
        latest_summary = excluded.latest_summary,
        risk_summary = excluded.risk_summary,
        next_action = excluded.next_action,
        updated_at = excluded.updated_at;
    `
  ).run(
    record.projectId,
    record.accountId,
    record.projectKey,
    record.title,
    record.status,
    record.roomCount,
    record.activeRoomCount,
    record.latestSummary ?? null,
    record.riskSummary ?? null,
    record.nextAction ?? null,
    record.createdAt,
    record.updatedAt
  );

  return record;
}

export function listRoomProjectLinks(db: DatabaseSync, roomKey: string): RoomProjectLink[] {
  const rows = db
    .prepare(
      `
        SELECT project_id, room_key, latest_revision, created_at, updated_at
        FROM room_project_links
        WHERE room_key = ?
        ORDER BY updated_at DESC, created_at DESC;
      `
    )
    .all(roomKey) as unknown as RoomProjectLinkRow[];

  return rows.map(mapRoomProjectLinkRow);
}

export function listProjectRoomLinks(db: DatabaseSync, projectId: string): RoomProjectLink[] {
  const rows = db
    .prepare(
      `
        SELECT project_id, room_key, latest_revision, created_at, updated_at
        FROM room_project_links
        WHERE project_id = ?
        ORDER BY updated_at DESC, created_at DESC;
      `
    )
    .all(projectId) as unknown as RoomProjectLinkRow[];

  return rows.map(mapRoomProjectLinkRow);
}

export function upsertRoomProjectLink(
  db: DatabaseSync,
  input: RoomProjectLink
) {
  db.prepare(
    `
      INSERT INTO room_project_links (
        project_id, room_key, latest_revision, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id, room_key) DO UPDATE SET
        latest_revision = excluded.latest_revision,
        updated_at = excluded.updated_at;
    `
  ).run(input.projectId, input.roomKey, input.latestRevision, input.createdAt, input.updatedAt);

  return input;
}

export function listProjectsForRoom(db: DatabaseSync, roomKey: string): ProjectAggregate[] {
  const links = listRoomProjectLinks(db, roomKey);
  return links
    .map((link) => findProjectAggregateById(db, link.projectId))
    .filter((project): project is ProjectAggregate => project !== null);
}

export function refreshProjectAggregateStats(db: DatabaseSync, projectId: string) {
  const project = findProjectAggregateById(db, projectId);
  if (!project) {
    return null;
  }

  const row = db
    .prepare(
      `
        SELECT
          COUNT(*) AS room_count,
          SUM(CASE WHEN thread_rooms.state IN ('done', 'failed') THEN 0 ELSE 1 END) AS active_room_count
        FROM room_project_links
        INNER JOIN thread_rooms ON thread_rooms.room_key = room_project_links.room_key
        WHERE room_project_links.project_id = ?;
      `
    )
    .get(projectId) as { room_count: number; active_room_count: number | null };

  return upsertProjectAggregate(db, {
    ...project,
    roomCount: row.room_count,
    activeRoomCount: row.active_room_count ?? 0,
    updatedAt: new Date().toISOString()
  });
}

interface ProjectAggregateRow {
  project_id: string;
  account_id: string;
  project_key: string;
  title: string;
  status: ProjectAggregate["status"];
  room_count: number;
  active_room_count: number;
  latest_summary: string | null;
  risk_summary: string | null;
  next_action: string | null;
  created_at: string;
  updated_at: string;
}

interface RoomProjectLinkRow {
  project_id: string;
  room_key: string;
  latest_revision: number;
  created_at: string;
  updated_at: string;
}

function mapProjectAggregateRow(row: ProjectAggregateRow): ProjectAggregate {
  return {
    projectId: row.project_id,
    accountId: row.account_id,
    projectKey: row.project_key,
    title: row.title,
    status: row.status,
    roomCount: row.room_count,
    activeRoomCount: row.active_room_count,
    latestSummary: row.latest_summary ?? undefined,
    riskSummary: row.risk_summary ?? undefined,
    nextAction: row.next_action ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRoomProjectLinkRow(row: RoomProjectLinkRow): RoomProjectLink {
  return {
    projectId: row.project_id,
    roomKey: row.room_key,
    latestRevision: row.latest_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
