import type { DatabaseSync } from "node:sqlite";

import type {
  MailTurnMemoryNamespaceDescriptor,
  MailTurnMemoryNamespaces
} from "../../core/types.js";

export interface MemoryNamespaceRecord extends MailTurnMemoryNamespaceDescriptor {
  createdAt: string;
  updatedAt: string;
}

export interface MemoryPromotionRecord {
  promotionId: string;
  roomKey: string;
  tenantId: string;
  agentId: string;
  title: string;
  status: "requested" | "reviewed" | "approved" | "rejected";
  sourceNamespaceKey?: string;
  targetNamespaceKey?: string;
  roomMemoryPath?: string;
  roomSnapshotPath?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  memoryPath?: string;
  createdAt: string;
  updatedAt: string;
}

export function syncRoomMemoryNamespaces(
  db: DatabaseSync,
  roomKey: string,
  namespaces: MailTurnMemoryNamespaces,
  now: string
) {
  for (const descriptor of [namespaces.room, namespaces.agent, namespaces.user, namespaces.scratch]) {
    if (!descriptor) {
      continue;
    }
    upsertMemoryNamespace(db, descriptor, now);
    bindMemoryNamespaceToRoom(db, roomKey, descriptor.namespaceKey, now);
  }
}

export function upsertMemoryNamespace(
  db: DatabaseSync,
  descriptor: MailTurnMemoryNamespaceDescriptor,
  now: string
) {
  db.prepare(
    `
      INSERT INTO memory_namespaces (
        namespace_key, scope, tenant_id, agent_id, room_key, user_id,
        root_dir, primary_path, metadata_path, capabilities_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(namespace_key) DO UPDATE SET
        scope = excluded.scope,
        tenant_id = excluded.tenant_id,
        agent_id = excluded.agent_id,
        room_key = excluded.room_key,
        user_id = excluded.user_id,
        root_dir = excluded.root_dir,
        primary_path = excluded.primary_path,
        metadata_path = excluded.metadata_path,
        capabilities_json = excluded.capabilities_json,
        updated_at = excluded.updated_at;
    `
  ).run(
    descriptor.namespaceKey,
    descriptor.scope,
    descriptor.tenantId,
    descriptor.agentId ?? null,
    descriptor.roomKey ?? null,
    descriptor.userId ?? null,
    descriptor.rootDir,
    descriptor.primaryPath,
    descriptor.metadataPath ?? null,
    JSON.stringify(descriptor.capabilities),
    now,
    now
  );
}

export function listMemoryNamespacesForRoom(db: DatabaseSync, roomKey: string): MemoryNamespaceRecord[] {
  const rows = db.prepare(
    `
      SELECT
        ns.namespace_key, ns.scope, ns.tenant_id, ns.agent_id, ns.room_key, ns.user_id,
        ns.root_dir, ns.primary_path, ns.metadata_path, ns.capabilities_json, ns.created_at, ns.updated_at
      FROM room_memory_namespaces AS binding
      JOIN memory_namespaces AS ns ON ns.namespace_key = binding.namespace_key
      WHERE binding.room_key = ?
      ORDER BY binding.first_seen_at ASC, ns.namespace_key ASC;
    `
  ).all(roomKey) as Array<Record<string, string | null>>;

  return rows.map(mapMemoryNamespaceRow);
}

export function upsertMemoryPromotion(
  db: DatabaseSync,
  record: MemoryPromotionRecord
) {
  db.prepare(
    `
      INSERT INTO memory_promotions (
        promotion_id, room_key, tenant_id, agent_id, title, status,
        source_namespace_key, target_namespace_key, room_memory_path, room_snapshot_path,
        reviewed_by, reviewed_at, approved_at, rejected_at, memory_path, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(promotion_id) DO UPDATE SET
        status = excluded.status,
        source_namespace_key = excluded.source_namespace_key,
        target_namespace_key = excluded.target_namespace_key,
        room_memory_path = excluded.room_memory_path,
        room_snapshot_path = excluded.room_snapshot_path,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = excluded.reviewed_at,
        approved_at = excluded.approved_at,
        rejected_at = excluded.rejected_at,
        memory_path = excluded.memory_path,
        updated_at = excluded.updated_at;
    `
  ).run(
    record.promotionId,
    record.roomKey,
    record.tenantId,
    record.agentId,
    record.title,
    record.status,
    record.sourceNamespaceKey ?? null,
    record.targetNamespaceKey ?? null,
    record.roomMemoryPath ?? null,
    record.roomSnapshotPath ?? null,
    record.reviewedBy ?? null,
    record.reviewedAt ?? null,
    record.approvedAt ?? null,
    record.rejectedAt ?? null,
    record.memoryPath ?? null,
    record.createdAt,
    record.updatedAt
  );
}

export function listMemoryPromotionsForRoom(db: DatabaseSync, roomKey: string): MemoryPromotionRecord[] {
  const rows = db.prepare(
    `
      SELECT
        promotion_id, room_key, tenant_id, agent_id, title, status,
        source_namespace_key, target_namespace_key, room_memory_path, room_snapshot_path,
        reviewed_by, reviewed_at, approved_at, rejected_at, memory_path, created_at, updated_at
      FROM memory_promotions
      WHERE room_key = ?
      ORDER BY created_at ASC;
    `
  ).all(roomKey) as Array<Record<string, string | null>>;

  return rows.map((row) => ({
    promotionId: row.promotion_id as string,
    roomKey: row.room_key as string,
    tenantId: row.tenant_id as string,
    agentId: row.agent_id as string,
    title: row.title as string,
    status: row.status as MemoryPromotionRecord["status"],
    sourceNamespaceKey: row.source_namespace_key ?? undefined,
    targetNamespaceKey: row.target_namespace_key ?? undefined,
    roomMemoryPath: row.room_memory_path ?? undefined,
    roomSnapshotPath: row.room_snapshot_path ?? undefined,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
    memoryPath: row.memory_path ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }));
}

export function bindMemoryNamespaceToRoom(
  db: DatabaseSync,
  roomKey: string,
  namespaceKey: string,
  now: string
) {
  db.prepare(
    `
      INSERT INTO room_memory_namespaces (room_key, namespace_key, first_seen_at, last_seen_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(room_key, namespace_key) DO UPDATE SET
        last_seen_at = excluded.last_seen_at;
    `
  ).run(roomKey, namespaceKey, now, now);
}

function mapMemoryNamespaceRow(row: Record<string, string | null>): MemoryNamespaceRecord {
  return {
    scope: row.scope as MemoryNamespaceRecord["scope"],
    tenantId: row.tenant_id as string,
    namespaceKey: row.namespace_key as string,
    agentId: row.agent_id ?? undefined,
    roomKey: row.room_key ?? undefined,
    userId: row.user_id ?? undefined,
    rootDir: row.root_dir as string,
    primaryPath: row.primary_path as string,
    metadataPath: row.metadata_path ?? undefined,
    capabilities: JSON.parse(row.capabilities_json as string) as MemoryNamespaceRecord["capabilities"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  };
}
