import type { DatabaseSync } from "node:sqlite";

import {
  claimOutboxIntentForDelivery,
  findControlPlaneOutboxByReferenceId,
  insertControlPlaneOutboxRecord,
  listControlPlaneOutboxByStatus,
  listControlPlaneOutboxForRoom,
  mapOutboxIntentToMailOutboxRecord,
  updateOutboxIntentStatus
} from "./outbox-intents.js";

export type MailOutboxKind = "ack" | "progress" | "final";
export type MailOutboxStatus = "queued" | "sending" | "pending_approval" | "sent" | "failed" | "rejected";

export interface MailOutboxRecord {
  outboxId: string;
  roomKey: string;
  runId?: string;
  kind: MailOutboxKind;
  status: MailOutboxStatus;
  subject: string;
  textBody: string;
  htmlBody?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  headers: Record<string, string>;
  providerMessageId?: string;
  errorText?: string;
  createdAt: string;
  updatedAt: string;
}

export function insertMailOutboxRecord(db: DatabaseSync, record: MailOutboxRecord) {
  insertControlPlaneOutboxRecord(db, record);
}

export function listMailOutboxForRoom(db: DatabaseSync, roomKey: string): MailOutboxRecord[] {
  return listControlPlaneOutboxForRoom(db, roomKey).map(mapOutboxIntentToMailOutboxRecord);
}

export function findMailOutboxById(db: DatabaseSync, outboxId: string): MailOutboxRecord | null {
  const intent = findControlPlaneOutboxByReferenceId(db, outboxId);
  return intent ? mapOutboxIntentToMailOutboxRecord(intent) : null;
}

export function listMailOutboxByStatus(
  db: DatabaseSync,
  statuses: MailOutboxStatus[],
  limit?: number
): MailOutboxRecord[] {
  return listControlPlaneOutboxByStatus(db, statuses, limit).map(mapOutboxIntentToMailOutboxRecord);
}

export function updateMailOutboxStatus(
  db: DatabaseSync,
  outboxId: string,
  input: {
    status: MailOutboxStatus;
    updatedAt: string;
    providerMessageId?: string;
    errorText?: string;
  }
) {
  const intent = findControlPlaneOutboxByReferenceId(db, outboxId);
  if (!intent) {
    return;
  }

  updateOutboxIntentStatus(db, intent.intentId, input);
}

export function claimMailOutboxForDelivery(
  db: DatabaseSync,
  outboxId: string,
  input: {
    updatedAt: string;
  }
) {
  const intent = findControlPlaneOutboxByReferenceId(db, outboxId);
  if (!intent) {
    return false;
  }

  return claimOutboxIntentForDelivery(db, intent.intentId, input);
}
