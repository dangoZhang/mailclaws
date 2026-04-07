import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type {
  MailboxDelivery,
  ProjectionMetadata,
  ThreadLedgerEvent,
  ThreadLedgerEventType,
  VirtualMailbox,
  VirtualMailboxViewEntry,
  VirtualMessage,
  VirtualThread
} from "./types.js";
import {
  deleteMailboxDeliveriesForRoom,
  getMailboxDelivery,
  insertMailboxDelivery,
  listMailboxFeedEntries,
  listMailboxDeliveriesForMessage,
  listMailboxViewEntries
} from "../storage/repositories/mailbox-deliveries.js";
import { appendThreadLedgerEvent, listThreadLedgerEvents } from "../storage/repositories/thread-ledger.js";
import { getThreadRoom } from "../storage/repositories/thread-rooms.js";
import { getVirtualMailbox, saveVirtualMailbox } from "../storage/repositories/virtual-mailboxes.js";
import {
  deleteVirtualMessagesForRoom,
  getVirtualMessage,
  insertVirtualMessage,
  listVirtualMessagesForThread
} from "../storage/repositories/virtual-messages.js";
import {
  deleteVirtualThreadsForRoom,
  getVirtualThread,
  saveVirtualThread
} from "../storage/repositories/virtual-threads.js";

export interface SubmitVirtualMessageInput {
  roomKey: string;
  threadId?: string;
  threadKind?: VirtualThread["kind"];
  topic?: string;
  parentWorkThreadId?: string;
  fromPrincipalId: string;
  fromMailboxId: string;
  toMailboxIds: string[];
  ccMailboxIds?: string[];
  kind: VirtualMessage["kind"];
  visibility: VirtualMessage["visibility"];
  originKind?: VirtualMessage["originKind"];
  projectionMetadata?: ProjectionMetadata;
  subject: string;
  bodyRef: string;
  artifactRefs?: string[];
  memoryRefs?: string[];
  roomRevision: number;
  inputsHash: string;
  createdAt?: string;
}

export interface ReplyVirtualMessageInput {
  fromPrincipalId: string;
  fromMailboxId: string;
  toMailboxIds: string[];
  ccMailboxIds?: string[];
  kind: VirtualMessage["kind"];
  visibility: VirtualMessage["visibility"];
  originKind?: VirtualMessage["originKind"];
  projectionMetadata?: ProjectionMetadata;
  subject?: string;
  bodyRef: string;
  artifactRefs?: string[];
  memoryRefs?: string[];
  roomRevision: number;
  inputsHash: string;
  createdAt?: string;
}

export interface ConsumeMailboxInput {
  mailboxId: string;
  consumerId: string;
  batchSize: number;
  roomKey?: string;
  now?: string;
  leaseDurationMs?: number;
}

export interface ConsumeMailboxDeliveryInput {
  deliveryId: string;
  consumerId?: string;
  consumedAt?: string;
}

export interface MarkVirtualMessageStaleInput {
  messageId: string;
  staleAt?: string;
  supersededByRevision?: number;
}

export interface VetoVirtualMessageInput {
  messageId: string;
  reason: string;
  vetoedAt?: string;
}

export interface SupersedeVirtualThreadInput {
  threadId: string;
  supersededAt?: string;
  byRevision?: number;
}

export interface VirtualMailMutationResult {
  thread: VirtualThread;
  message: VirtualMessage;
  deliveries: MailboxDelivery[];
}

export interface VirtualMailThreadMutationResult {
  thread: VirtualThread;
  deliveries: MailboxDelivery[];
}

export interface RebuildVirtualMailResult {
  roomKey: string;
  threads: number;
  messages: number;
  deliveries: number;
}

type VirtualMailLedgerThreadPayload = {
  thread: VirtualThread;
};

type VirtualMailLedgerMessagePayload = {
  message: VirtualMessage;
};

type VirtualMailLedgerDeliveryPayload = {
  delivery: MailboxDelivery;
};

type VirtualMailLedgerMessageStatusPayload = {
  messageId: string;
  reason?: string;
  supersededByRevision?: number;
  deliveries: MailboxDelivery[];
};

type VirtualMailLedgerThreadStatusPayload = {
  thread: VirtualThread;
  byRevision?: number;
  deliveries: MailboxDelivery[];
};

export function upsertVirtualMailbox(db: DatabaseSync, mailbox: VirtualMailbox) {
  saveVirtualMailbox(db, mailbox);
  return getVirtualMailbox(db, mailbox.mailboxId);
}

export function submitVirtualMessage(
  db: DatabaseSync,
  input: SubmitVirtualMessageInput
): VirtualMailMutationResult {
  const room = requireCurrentRoom(db, input.roomKey, input.roomRevision);
  const createdAt = input.createdAt ?? new Date().toISOString();
  const fromMailbox = requireMailboxForRoom(db, room.accountId, input.fromMailboxId);
  const toMailboxIds = dedupeMailboxIds(input.toMailboxIds);
  const ccMailboxIds = dedupeMailboxIds(input.ccMailboxIds ?? []);

  if (toMailboxIds.length === 0) {
    throw new Error("virtual messages require at least one to mailbox");
  }

  const recipientMailboxes = [...toMailboxIds, ...ccMailboxIds].map((mailboxId) =>
    requireMailboxForRoom(db, room.accountId, mailboxId)
  );
  validateVirtualMessageVisibility({
    visibility: input.visibility,
    kind: input.kind,
    fromMailbox,
    toMailboxIds,
    ccMailboxIds,
    recipientMailboxes
  });
  validateVirtualMessageRefs({
    bodyRef: input.bodyRef,
    artifactRefs: input.artifactRefs ?? [],
    memoryRefs: input.memoryRefs ?? []
  });
  const { originKind, projectionMetadata } = resolveVirtualMessageOrigin(input.originKind, input.projectionMetadata);

  const messageId = randomUUID();
  const thread = resolveSubmissionThread(db, {
    roomKey: input.roomKey,
    threadId: input.threadId,
    threadKind: input.threadKind ?? "work",
    topic: input.topic ?? input.subject,
    parentWorkThreadId: input.parentWorkThreadId,
    createdByMessageId: messageId,
    createdAt
  });
  const message: VirtualMessage = {
    messageId,
    roomKey: room.roomKey,
    threadId: thread.threadId,
    messageIdHeader: buildVirtualMessageIdHeader(messageId),
    inReplyTo: [],
    references: [],
    fromPrincipalId: input.fromPrincipalId,
    fromMailboxId: fromMailbox.mailboxId,
    toMailboxIds,
    ccMailboxIds,
    kind: input.kind,
    visibility: input.visibility,
    originKind,
    projectionMetadata,
    subject: input.subject,
    bodyRef: input.bodyRef,
    artifactRefs: [...(input.artifactRefs ?? [])],
    memoryRefs: [...(input.memoryRefs ?? [])],
    roomRevision: input.roomRevision,
    inputsHash: input.inputsHash,
    createdAt
  };
  const deliveries = buildMailboxDeliveries({
    roomKey: room.roomKey,
    messageId,
    mailboxIds: [...toMailboxIds, ...ccMailboxIds],
    createdAt
  });

  if (!input.threadId) {
    appendAndApplyVirtualMailEvent(db, {
      roomKey: room.roomKey,
      revision: input.roomRevision,
      type: "virtual_mail.thread_created",
      payload: {
        thread
      } satisfies VirtualMailLedgerThreadPayload
    });
  }
  appendAndApplyVirtualMailEvent(db, {
    roomKey: room.roomKey,
    revision: input.roomRevision,
    type: "virtual_mail.message_submitted",
    payload: {
      message
    } satisfies VirtualMailLedgerMessagePayload
  });
  for (const delivery of deliveries) {
    appendAndApplyVirtualMailEvent(db, {
      roomKey: room.roomKey,
      revision: input.roomRevision,
      type: "virtual_mail.message_delivered",
      payload: {
        delivery
      } satisfies VirtualMailLedgerDeliveryPayload
    });
  }

  return {
    thread,
    message,
    deliveries
  };
}

export function replyVirtualMessage(
  db: DatabaseSync,
  parentMessageId: string,
  input: ReplyVirtualMessageInput
): VirtualMailMutationResult {
  const parentMessage = getVirtualMessage(db, parentMessageId);
  if (!parentMessage) {
    throw new Error(`virtual parent message not found: ${parentMessageId}`);
  }

  const room = requireCurrentRoom(db, parentMessage.roomKey, input.roomRevision);
  const thread = getVirtualThread(db, parentMessage.threadId);
  if (!thread) {
    throw new Error(`virtual thread not found: ${parentMessage.threadId}`);
  }

  const fromMailbox = requireMailboxForRoom(db, room.accountId, input.fromMailboxId);
  const toMailboxIds = dedupeMailboxIds(input.toMailboxIds);
  const ccMailboxIds = dedupeMailboxIds(input.ccMailboxIds ?? []);

  if (toMailboxIds.length === 0) {
    throw new Error("virtual replies require at least one to mailbox");
  }

  const recipientMailboxes = [...toMailboxIds, ...ccMailboxIds].map((mailboxId) =>
    requireMailboxForRoom(db, room.accountId, mailboxId)
  );
  validateVirtualMessageVisibility({
    visibility: input.visibility,
    kind: input.kind,
    fromMailbox,
    toMailboxIds,
    ccMailboxIds,
    recipientMailboxes
  });
  validateVirtualMessageRefs({
    bodyRef: input.bodyRef,
    artifactRefs: input.artifactRefs ?? [],
    memoryRefs: input.memoryRefs ?? []
  });
  const { originKind, projectionMetadata } = resolveVirtualMessageOrigin(input.originKind, input.projectionMetadata);

  const createdAt = input.createdAt ?? new Date().toISOString();
  const messageId = randomUUID();
  const message: VirtualMessage = {
    messageId,
    roomKey: room.roomKey,
    threadId: thread.threadId,
    parentMessageId: parentMessage.messageId,
    messageIdHeader: buildVirtualMessageIdHeader(messageId),
    inReplyTo: [parentMessage.messageIdHeader],
    references: appendReference(parentMessage.references, parentMessage.messageIdHeader),
    fromPrincipalId: input.fromPrincipalId,
    fromMailboxId: fromMailbox.mailboxId,
    toMailboxIds,
    ccMailboxIds,
    kind: input.kind,
    visibility: input.visibility,
    originKind,
    projectionMetadata,
    subject: input.subject?.trim() ? input.subject.trim() : parentMessage.subject,
    bodyRef: input.bodyRef,
    artifactRefs: [...(input.artifactRefs ?? [])],
    memoryRefs: [...(input.memoryRefs ?? [])],
    roomRevision: input.roomRevision,
    inputsHash: input.inputsHash,
    createdAt
  };
  const deliveries = buildMailboxDeliveries({
    roomKey: room.roomKey,
    messageId,
    mailboxIds: [...toMailboxIds, ...ccMailboxIds],
    createdAt
  });

  appendAndApplyVirtualMailEvent(db, {
    roomKey: room.roomKey,
    revision: input.roomRevision,
    type: "virtual_mail.message_submitted",
    payload: {
      message
    } satisfies VirtualMailLedgerMessagePayload
  });
  appendThreadLedgerEvent(db, {
    roomKey: room.roomKey,
    revision: input.roomRevision,
    type: "virtual_mail.message_replied",
    payload: {
      messageId: message.messageId,
      parentMessageId: parentMessage.messageId,
      threadId: thread.threadId
    }
  });
  for (const delivery of deliveries) {
    appendAndApplyVirtualMailEvent(db, {
      roomKey: room.roomKey,
      revision: input.roomRevision,
      type: "virtual_mail.message_delivered",
      payload: {
        delivery
      } satisfies VirtualMailLedgerDeliveryPayload
    });
  }

  return {
    thread,
    message,
    deliveries
  };
}

export function consumeMailbox(
  db: DatabaseSync,
  input: ConsumeMailboxInput
): MailboxDelivery[] {
  const mailbox = getVirtualMailbox(db, input.mailboxId);
  if (!mailbox || !mailbox.active) {
    throw new Error(`virtual mailbox is inactive or missing: ${input.mailboxId}`);
  }

  const now = input.now ?? new Date().toISOString();
  const leaseUntil = new Date(Date.parse(now) + (input.leaseDurationMs ?? 60_000)).toISOString();
  const candidates = listQueuedMailboxDeliveries(db, {
    mailboxId: input.mailboxId,
    roomKey: input.roomKey,
    batchSize: Math.max(1, input.batchSize)
  });

  const leased: MailboxDelivery[] = [];
  for (const candidate of candidates) {
    const message = getVirtualMessage(db, candidate.messageId);
    if (!message) {
      continue;
    }
    assertMailboxCanAccessMessage(mailbox, message);

    const delivery: MailboxDelivery = {
      ...candidate,
      status: "leased",
      leaseOwner: input.consumerId,
      leaseUntil,
      updatedAt: now
    };
    appendAndApplyVirtualMailEvent(db, {
      roomKey: delivery.roomKey,
      revision: lookupDeliveryRevision(db, delivery.messageId),
      type: "virtual_mail.delivery_leased",
      payload: {
        delivery
      } satisfies VirtualMailLedgerDeliveryPayload
    });
    leased.push(delivery);
  }

  return leased;
}

export function consumeMailboxDelivery(
  db: DatabaseSync,
  input: ConsumeMailboxDeliveryInput
): MailboxDelivery {
  const current = getMailboxDelivery(db, input.deliveryId);
  if (!current) {
    throw new Error(`virtual mailbox delivery not found: ${input.deliveryId}`);
  }
  if (current.status === "consumed") {
    return current;
  }
  if (
    current.status === "stale" ||
    current.status === "vetoed" ||
    current.status === "superseded"
  ) {
    throw new Error(
      `virtual mailbox delivery ${input.deliveryId} cannot be consumed from status ${current.status}`
    );
  }
  if (
    input.consumerId &&
    current.leaseOwner &&
    current.leaseOwner.trim().length > 0 &&
    current.leaseOwner !== input.consumerId
  ) {
    throw new Error(
      `virtual mailbox delivery ${input.deliveryId} is leased to ${current.leaseOwner}, not ${input.consumerId}`
    );
  }

  const consumedAt = input.consumedAt ?? new Date().toISOString();
  const delivery: MailboxDelivery = {
    ...current,
    status: "consumed",
    leaseOwner: undefined,
    leaseUntil: undefined,
    consumedAt,
    updatedAt: consumedAt
  };
  appendAndApplyVirtualMailEvent(db, {
    roomKey: delivery.roomKey,
    revision: lookupDeliveryRevision(db, delivery.messageId),
    type: "virtual_mail.delivery_consumed",
    payload: {
      delivery
    } satisfies VirtualMailLedgerDeliveryPayload
  });

  return delivery;
}

export function markVirtualMessageStale(
  db: DatabaseSync,
  input: MarkVirtualMessageStaleInput
): MailboxDelivery[] {
  const message = getVirtualMessage(db, input.messageId);
  if (!message) {
    throw new Error(`virtual message not found: ${input.messageId}`);
  }

  const staleAt = input.staleAt ?? new Date().toISOString();
  const deliveries = listMailboxDeliveriesForMessage(db, input.messageId)
    .filter((delivery) => canTransitionMailboxDelivery(delivery.status, "stale"))
    .map((delivery) => ({
      ...delivery,
      status: "stale" as const,
      leaseOwner: undefined,
      leaseUntil: undefined,
      updatedAt: staleAt
    }));
  appendAndApplyVirtualMailEvent(db, {
    roomKey: message.roomKey,
    revision: message.roomRevision,
    type: "virtual_mail.message_stale",
    payload: {
      messageId: message.messageId,
      supersededByRevision: input.supersededByRevision,
      deliveries
    } satisfies VirtualMailLedgerMessageStatusPayload
  });

  return deliveries;
}

export function vetoVirtualMessage(
  db: DatabaseSync,
  input: VetoVirtualMessageInput
): MailboxDelivery[] {
  const message = getVirtualMessage(db, input.messageId);
  if (!message) {
    throw new Error(`virtual message not found: ${input.messageId}`);
  }

  const vetoedAt = input.vetoedAt ?? new Date().toISOString();
  const deliveries = listMailboxDeliveriesForMessage(db, input.messageId)
    .filter((delivery) => canTransitionMailboxDelivery(delivery.status, "vetoed"))
    .map((delivery) => ({
      ...delivery,
      status: "vetoed" as const,
      leaseOwner: undefined,
      leaseUntil: undefined,
      updatedAt: vetoedAt
    }));
  appendAndApplyVirtualMailEvent(db, {
    roomKey: message.roomKey,
    revision: message.roomRevision,
    type: "virtual_mail.message_vetoed",
    payload: {
      messageId: message.messageId,
      reason: input.reason,
      deliveries
    } satisfies VirtualMailLedgerMessageStatusPayload
  });

  return deliveries;
}

export function supersedeVirtualThread(
  db: DatabaseSync,
  input: SupersedeVirtualThreadInput
): VirtualMailThreadMutationResult {
  const thread = getVirtualThread(db, input.threadId);
  if (!thread) {
    throw new Error(`virtual thread not found: ${input.threadId}`);
  }

  const supersededAt = input.supersededAt ?? new Date().toISOString();
  const nextThread: VirtualThread = {
    ...thread,
    status: "superseded"
  };
  const deliveries = listVirtualMessagesForThread(db, thread.threadId)
    .flatMap((message) => listMailboxDeliveriesForMessage(db, message.messageId))
    .filter((delivery) => canTransitionMailboxDelivery(delivery.status, "superseded"))
    .map((delivery) => ({
      ...delivery,
      status: "superseded" as const,
      leaseOwner: undefined,
      leaseUntil: undefined,
      updatedAt: supersededAt
    }));
  const revision =
    Math.max(...listVirtualMessagesForThread(db, thread.threadId).map((message) => message.roomRevision), 0) ||
    0;
  appendAndApplyVirtualMailEvent(db, {
    roomKey: thread.roomKey,
    revision,
    type: "virtual_mail.thread_superseded",
    payload: {
      thread: nextThread,
      byRevision: input.byRevision,
      deliveries
    } satisfies VirtualMailLedgerThreadStatusPayload
  });

  return {
    thread: nextThread,
    deliveries
  };
}

export function projectMailboxView(
  db: DatabaseSync,
  input: {
    roomKey: string;
    mailboxId: string;
    originKinds?: VirtualMessage["originKind"][];
  }
): VirtualMailboxViewEntry[] {
  const room = getThreadRoom(db, input.roomKey);
  if (!room) {
    throw new Error(`thread room not found: ${input.roomKey}`);
  }
  const mailbox = requireMailboxForRoom(db, room.accountId, input.mailboxId);

  return listMailboxViewEntries(db, {
    roomKey: input.roomKey,
    mailboxId: input.mailboxId,
    originKinds: input.originKinds
  }).filter((entry) => {
    assertMailboxCanAccessMessage(mailbox, entry.message);
    return true;
  });
}

export function projectMailboxFeed(
  db: DatabaseSync,
  input: {
    accountId: string;
    mailboxId: string;
    limit?: number;
    originKinds?: VirtualMessage["originKind"][];
  }
): VirtualMailboxViewEntry[] {
  const mailbox = requireMailboxForRoom(db, input.accountId, input.mailboxId);

  return listMailboxFeedEntries(db, {
    mailboxId: input.mailboxId,
    limit: input.limit,
    originKinds: input.originKinds
  }).filter((entry) => {
    assertMailboxCanAccessMessage(mailbox, entry.message);
    return true;
  });
}

export function rebuildVirtualMailProjectionFromLedger(
  db: DatabaseSync,
  roomKey: string
): RebuildVirtualMailResult {
  deleteMailboxDeliveriesForRoom(db, roomKey);
  deleteVirtualMessagesForRoom(db, roomKey);
  deleteVirtualThreadsForRoom(db, roomKey);

  for (const event of listThreadLedgerEvents(db, roomKey)) {
    applyVirtualMailLedgerEvent(db, event);
  }

  return {
    roomKey,
    threads: countVirtualMailRows(db, "virtual_threads", roomKey),
    messages: countVirtualMailRows(db, "virtual_messages", roomKey),
    deliveries: countVirtualMailRows(db, "mailbox_deliveries", roomKey)
  };
}

function appendAndApplyVirtualMailEvent(
  db: DatabaseSync,
  input: {
    roomKey: string;
    revision: number;
    type: ThreadLedgerEventType;
    payload: Record<string, unknown>;
  }
) {
  const event = appendThreadLedgerEvent(db, input);
  applyVirtualMailLedgerEvent(db, event);
  return event;
}

function applyVirtualMailLedgerEvent(db: DatabaseSync, event: ThreadLedgerEvent) {
  switch (event.type) {
    case "virtual_mail.thread_created": {
      const payload = event.payload as VirtualMailLedgerThreadPayload;
      saveVirtualThread(db, payload.thread);
      return;
    }
    case "virtual_mail.message_submitted": {
      const payload = event.payload as VirtualMailLedgerMessagePayload;
      insertVirtualMessage(db, payload.message);
      return;
    }
    case "virtual_mail.message_delivered":
    case "virtual_mail.delivery_leased":
    case "virtual_mail.delivery_consumed": {
      const payload = event.payload as VirtualMailLedgerDeliveryPayload;
      insertMailboxDelivery(db, payload.delivery);
      return;
    }
    case "virtual_mail.message_stale":
    case "virtual_mail.message_vetoed": {
      const payload = event.payload as VirtualMailLedgerMessageStatusPayload;
      for (const delivery of payload.deliveries) {
        insertMailboxDelivery(db, delivery);
      }
      return;
    }
    case "virtual_mail.thread_superseded": {
      const payload = event.payload as VirtualMailLedgerThreadStatusPayload;
      saveVirtualThread(db, payload.thread);
      for (const delivery of payload.deliveries) {
        insertMailboxDelivery(db, delivery);
      }
      return;
    }
    default:
      return;
  }
}

function resolveVirtualMessageOrigin(
  originKind?: VirtualMessage["originKind"],
  projectionMetadata?: ProjectionMetadata
) {
  const resolvedOriginKind = originKind ?? projectionMetadata?.origin.kind ?? "virtual_internal";

  return {
    originKind: resolvedOriginKind,
    projectionMetadata: {
      origin: {
        kind: resolvedOriginKind,
        ...(projectionMetadata?.origin.controlPlane
          ? { controlPlane: projectionMetadata.origin.controlPlane }
          : {}),
        ...(projectionMetadata?.origin.sessionKey
          ? { sessionKey: projectionMetadata.origin.sessionKey }
          : {}),
        ...(projectionMetadata?.origin.runId ? { runId: projectionMetadata.origin.runId } : {}),
        ...(projectionMetadata?.origin.frontAgentId
          ? { frontAgentId: projectionMetadata.origin.frontAgentId }
          : {}),
        ...(projectionMetadata?.origin.sourceMessageId
          ? { sourceMessageId: projectionMetadata.origin.sourceMessageId }
          : {})
      }
    } satisfies ProjectionMetadata
  };
}

function resolveSubmissionThread(
  db: DatabaseSync,
  input: {
    roomKey: string;
    threadId?: string;
    threadKind: VirtualThread["kind"];
    topic: string;
    parentWorkThreadId?: string;
    createdByMessageId: string;
    createdAt: string;
  }
): VirtualThread {
  if (input.threadId) {
    const existingThread = getVirtualThread(db, input.threadId);
    if (!existingThread) {
      throw new Error(`virtual thread not found: ${input.threadId}`);
    }
    if (existingThread.roomKey !== input.roomKey) {
      throw new Error(`virtual thread ${input.threadId} does not belong to room ${input.roomKey}`);
    }
    return existingThread;
  }

  if (input.parentWorkThreadId) {
    const parentThread = getVirtualThread(db, input.parentWorkThreadId);
    if (!parentThread) {
      throw new Error(`parent work thread not found: ${input.parentWorkThreadId}`);
    }
    if (parentThread.roomKey !== input.roomKey) {
      throw new Error(
        `parent work thread ${input.parentWorkThreadId} does not belong to room ${input.roomKey}`
      );
    }
  }

  return {
    threadId: randomUUID(),
    roomKey: input.roomKey,
    kind: input.threadKind,
    topic: input.topic,
    parentWorkThreadId: input.parentWorkThreadId,
    createdByMessageId: input.createdByMessageId,
    status: "open",
    createdAt: input.createdAt
  };
}

function requireCurrentRoom(db: DatabaseSync, roomKey: string, expectedRevision: number) {
  const room = getThreadRoom(db, roomKey);
  if (!room) {
    throw new Error(`thread room not found: ${roomKey}`);
  }
  if (room.revision !== expectedRevision) {
    throw new Error(
      `virtual mail room revision ${expectedRevision} is stale; current room revision is ${room.revision}`
    );
  }
  return room;
}

function requireMailboxForRoom(db: DatabaseSync, accountId: string, mailboxId: string) {
  const mailbox = getVirtualMailbox(db, mailboxId);
  if (!mailbox) {
    throw new Error(`virtual mailbox not found: ${mailboxId}`);
  }
  if (!mailbox.active) {
    throw new Error(`virtual mailbox is inactive: ${mailboxId}`);
  }
  if (mailbox.accountId !== accountId) {
    throw new Error(
      `virtual mailbox ${mailboxId} belongs to account ${mailbox.accountId}, expected ${accountId}`
    );
  }
  return mailbox;
}

function validateVirtualMessageVisibility(input: {
  visibility: VirtualMessage["visibility"];
  kind: VirtualMessage["kind"];
  fromMailbox: VirtualMailbox;
  toMailboxIds: string[];
  ccMailboxIds: string[];
  recipientMailboxes: VirtualMailbox[];
}) {
  switch (input.visibility) {
    case "private":
      if (input.ccMailboxIds.length > 0) {
        throw new Error("private virtual messages cannot include cc recipients");
      }
      if (input.recipientMailboxes.some((mailbox) => mailbox.kind === "public")) {
        throw new Error("private virtual messages cannot target public mailboxes");
      }
      return;
    case "governance":
      if (
        input.recipientMailboxes.some(
          (mailbox) => !canMailboxReceiveGovernance(mailbox)
        )
      ) {
        throw new Error(
          "governance virtual messages may only target governance, human, system, or orchestrator mailboxes"
        );
      }
      return;
    case "internal":
      if (input.recipientMailboxes.some((mailbox) => mailbox.kind === "public" || mailbox.kind === "human")) {
        throw new Error("internal virtual messages cannot target public or human mailboxes");
      }
      return;
    case "room":
      return;
  }
}

function canMailboxReceiveGovernance(mailbox: VirtualMailbox) {
  return (
    mailbox.kind === "governance" ||
    mailbox.kind === "human" ||
    mailbox.kind === "system" ||
    (mailbox.kind === "internal_role" && mailbox.role === "orchestrator")
  );
}

function assertMailboxCanAccessMessage(mailbox: VirtualMailbox, message: VirtualMessage) {
  switch (message.visibility) {
    case "governance":
      if (!canMailboxReceiveGovernance(mailbox)) {
        throw new Error(
          `mailbox ${mailbox.mailboxId} cannot access governance virtual message ${message.messageId}`
        );
      }
      return;
    case "private":
      if (!message.toMailboxIds.includes(mailbox.mailboxId)) {
        throw new Error(`mailbox ${mailbox.mailboxId} cannot access private virtual message ${message.messageId}`);
      }
      return;
    case "internal":
      if (mailbox.kind === "public" || mailbox.kind === "human") {
        throw new Error(
          `mailbox ${mailbox.mailboxId} cannot access internal virtual message ${message.messageId}`
        );
      }
      return;
    case "room":
      return;
  }
}

function buildMailboxDeliveries(input: {
  roomKey: string;
  messageId: string;
  mailboxIds: string[];
  createdAt: string;
}) {
  return dedupeMailboxIds(input.mailboxIds).map(
    (mailboxId): MailboxDelivery => ({
      deliveryId: randomUUID(),
      roomKey: input.roomKey,
      messageId: input.messageId,
      mailboxId,
      status: "queued",
      createdAt: input.createdAt,
      updatedAt: input.createdAt
    })
  );
}

function buildVirtualMessageIdHeader(messageId: string) {
  return `<virtual-mail.${messageId}@mailclaws.internal>`;
}

function appendReference(references: string[], messageIdHeader: string) {
  const ordered = [...references, messageIdHeader];
  return ordered.filter((entry, index) => entry.length > 0 && ordered.indexOf(entry) === index);
}

function validateVirtualMessageRefs(input: {
  bodyRef: string;
  artifactRefs: string[];
  memoryRefs: string[];
}) {
  validateReferenceLike(input.bodyRef, "bodyRef");
  for (const artifactRef of input.artifactRefs) {
    validateReferenceLike(artifactRef, "artifactRefs");
  }
  for (const memoryRef of input.memoryRefs) {
    validateReferenceLike(memoryRef, "memoryRefs");
  }
}

function validateReferenceLike(value: string, fieldName: string) {
  const ref = value.trim();
  if (ref.length === 0) {
    throw new Error(`${fieldName} must not be empty`);
  }
  if (/\s/.test(ref)) {
    throw new Error(`${fieldName} must be a reference, not inline payload`);
  }
  if (isAbsolutePath(ref) || ref.startsWith("./") || ref.startsWith("../")) {
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:(\/\/)?\S+$/i.test(ref)) {
    return;
  }

  throw new Error(`${fieldName} must be a reference, not inline payload`);
}

function isAbsolutePath(value: string) {
  return value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value);
}

function dedupeMailboxIds(mailboxIds: string[]) {
  return mailboxIds
    .map((mailboxId) => mailboxId.trim())
    .filter((mailboxId, index, values) => mailboxId.length > 0 && values.indexOf(mailboxId) === index);
}

function lookupDeliveryRevision(db: DatabaseSync, messageId: string) {
  return (getVirtualMessage(db, messageId)?.roomRevision ?? 0) as number;
}

function canTransitionMailboxDelivery(
  currentStatus: MailboxDelivery["status"],
  nextStatus: "stale" | "vetoed" | "superseded"
) {
  if (currentStatus === "consumed") {
    return false;
  }
  if (currentStatus === "stale" || currentStatus === "vetoed" || currentStatus === "superseded") {
    return false;
  }
  if (nextStatus === "stale" || nextStatus === "vetoed" || nextStatus === "superseded") {
    return (
      currentStatus === "queued" ||
      currentStatus === "leased" ||
      currentStatus === "delivered" ||
      currentStatus === "blocked"
    );
  }
  return false;
}

function listQueuedMailboxDeliveries(
  db: DatabaseSync,
  input: {
    mailboxId: string;
    roomKey?: string;
    batchSize: number;
  }
): MailboxDelivery[] {
  const statement = input.roomKey
    ? db.prepare(
        `
          SELECT
            delivery_id,
            room_key,
            message_id,
            mailbox_id,
            status,
            lease_owner,
            lease_until,
            consumed_at,
            created_at,
            updated_at
          FROM mailbox_deliveries
          WHERE mailbox_id = ?
            AND room_key = ?
            AND status = 'queued'
          ORDER BY created_at ASC, delivery_id ASC
          LIMIT ?;
        `
      )
    : db.prepare(
        `
          SELECT
            delivery_id,
            room_key,
            message_id,
            mailbox_id,
            status,
            lease_owner,
            lease_until,
            consumed_at,
            created_at,
            updated_at
          FROM mailbox_deliveries
          WHERE mailbox_id = ?
            AND status = 'queued'
          ORDER BY created_at ASC, delivery_id ASC
          LIMIT ?;
        `
      );
  const rows = (input.roomKey
    ? statement.all(input.mailboxId, input.roomKey, input.batchSize)
    : statement.all(input.mailboxId, input.batchSize)) as Array<{
    delivery_id: string;
    room_key: string;
    message_id: string;
    mailbox_id: string;
    status: MailboxDelivery["status"];
    lease_owner: string | null;
    lease_until: string | null;
    consumed_at: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    deliveryId: row.delivery_id,
    roomKey: row.room_key,
    messageId: row.message_id,
    mailboxId: row.mailbox_id,
    status: row.status,
    leaseOwner: row.lease_owner ?? undefined,
    leaseUntil: row.lease_until ?? undefined,
    consumedAt: row.consumed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

function countVirtualMailRows(
  db: DatabaseSync,
  tableName: "virtual_threads" | "virtual_messages" | "mailbox_deliveries",
  roomKey: string
) {
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE room_key = ?;`)
    .get(roomKey) as { count?: number } | undefined;

  return row?.count ?? 0;
}
