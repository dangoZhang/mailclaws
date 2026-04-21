import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import type { AppConfig } from "../config.js";
import { buildRoomFinalPrePacket, buildRoomPreSnapshotId, createRoomPreSnapshot } from "../core/pre.js";
import { readSharedFactsState } from "../core/shared-facts.js";
import { buildEmailSemanticPacket, formatEmailSemanticPacket } from "../email/schema-policy.js";
import {
  consumeMailbox,
  consumeMailboxDelivery,
  markVirtualMessageStale,
  projectMailboxView,
  replyVirtualMessage,
  submitVirtualMessage,
  upsertVirtualMailbox
} from "../core/virtual-mail.js";
import type {
  MailTurnAttachmentDescriptor,
  RoomSharedFactConflict,
  RoomSharedFactRecord,
  RoomSharedFactsArtifact,
  VirtualMailbox,
  VirtualMessage,
  VirtualMailboxViewEntry,
  VirtualMessageVisibility,
  WorkerRole
} from "../core/types.js";
import { meetsMinimumTrustLevel, resolveMailIdentity, type MailIdentity } from "../identity/trust.js";
import { renderPreToMail } from "../reporting/compose.js";
import { searchRoomContext, type RoomSearchHit } from "../retrieval/room-search.js";
import { triageInboxRoom } from "../inbox/triage.js";
import {
  persistAttachmentArtifact,
  readAttachmentArtifactMetadata,
  persistRoomDigestArtifact,
  persistRoomFactsArtifact,
  persistInboundArtifact,
  persistInboundMimeArtifact,
  persistOutboxArtifact,
  persistRunArtifact
} from "../storage/artifacts.js";
import { normalizeMailEnvelope, stripHtml } from "../providers/normalize.js";
import type { ProviderAttachment, ProviderMailEnvelope } from "../providers/types.js";
import {
  cancelQueuedRoomJobs,
  cancelRoomJob,
  completeRoomJob,
  enqueueRoomJob,
  failRoomJob,
  leaseNextRoomJob
} from "../queue/thread-queue.js";
import { evaluateAttachmentPolicy, type AttachmentPolicyConfig } from "../security/attachment-policy.js";
import { evaluateLoopGuard } from "../security/loop-guard.js";
import { evaluateSenderPolicy, type SenderPolicyConfig } from "../security/sender-policy.js";
import { captureRoomMemorySnapshot, readRoomNotesFromStateDir } from "../memory/room-memory.js";
import { maybeBindRoomToProject, refreshProjectAggregate } from "./project-runtime.js";
import {
  cancelScheduledMailJobsForRoom,
  maybeCreateScheduledMailJob
} from "./scheduled-mail.js";
import {
  resolveOrchestratorTurnMemoryNamespaces,
  resolveWorkerTurnMemoryNamespaces
} from "../memory/namespaces.js";
import {
  findReusableMailAttachmentByHash,
  insertMailAttachment,
  listMailAttachmentsForRoom
} from "../storage/repositories/mail-attachments.js";
import { replaceArtifactChunksForAttachment } from "../storage/repositories/artifact-chunks.js";
import {
  replaceRoomSearchDocumentForMessage,
  replaceRoomSearchDocumentsForAttachment,
  replaceRoomSearchDocumentsForRoomNotes
} from "../storage/repositories/room-search-index.js";
import {
  findLatestMailMessageForThread,
  findMailMessageByDedupeKey,
  insertMailMessage,
  updateMailMessageContent
} from "../storage/repositories/mail-messages.js";
import { type MailOutboxRecord } from "../storage/repositories/mail-outbox.js";
import { insertControlPlaneOutboxRecord } from "../storage/repositories/outbox-intents.js";
import { syncRoomMemoryNamespaces } from "../storage/repositories/memory-registry.js";
import { getMailAccount, type MailAccountRecord } from "../storage/repositories/mail-accounts.js";
import { appendProviderEvent } from "../storage/repositories/provider-events.js";
import { upsertRoomParticipant } from "../storage/repositories/room-participants.js";
import {
  insertMailRun,
  type MailRunRecord,
  updateMailRunCompleted,
  updateMailRunFailed
} from "../storage/repositories/mail-runs.js";
import { insertRoomPreSnapshot } from "../storage/repositories/room-pre-snapshots.js";
import { getLatestRoomPreSnapshot } from "../storage/repositories/room-pre-snapshots.js";
import { saveTaskNode } from "../storage/repositories/task-nodes.js";
import {
  appendThreadLedgerEvent,
  listThreadLedgerEvents
} from "../storage/repositories/thread-ledger.js";
import { getThreadRoom, saveThreadRoom } from "../storage/repositories/thread-rooms.js";
import { saveWorkerSession } from "../storage/repositories/worker-sessions.js";
import {
  filterInternalAliasRecipients,
  resolveMailboxRoute
} from "../threading/mailbox-routing.js";
import { buildParticipantFingerprint, normalizeSubject } from "../threading/dedupe.js";
import { buildRoomSessionKey, buildWorkerSessionKey } from "../threading/session-key.js";
import { resolveThreadForMail } from "../threading/thread-resolver.js";
import { type MailAgentExecutor } from "../runtime/agent-executor.js";
import { createDefaultMailAgentExecutor } from "../runtime/default-executor.js";
import { resolveMailTurnExecutionPolicy } from "../runtime/execution-policy.js";
import { dispatchSubAgentMailbox } from "../subagent-bridge/bridge.js";
import type { OpenClawSubAgentTransport } from "../subagent-bridge/openclaw.js";
import { getSubAgentTargetByMailboxId } from "../storage/repositories/subagent-targets.js";
import {
  bindGatewaySessionToRoom,
  maybeAutoProjectRoomOutcomeToGateway
} from "../gateway/projection-adapter.js";
import {
  createRoomMailTaskNode,
  describeNextActionForStage,
  resolveMailTaskStageForOutbox,
  updateRoomMailTaskNode
} from "./mail-task-protocol.js";

export interface IngestIncomingMailDeps {
  db: DatabaseSync;
  config: AppConfig;
  now?: () => string;
}

export interface IngestIncomingMailInput {
  accountId: string;
  mailboxAddress: string;
  envelope: ProviderMailEnvelope;
  senderPolicy?: SenderPolicyConfig;
  attachmentPolicy?: AttachmentPolicyConfig;
}

export interface IngestIncomingMailResult {
  status: "queued" | "blocked" | "duplicate";
  roomKey: string;
  stableThreadId: string;
  dedupeKey: string;
  reasons?: string[];
}

export interface ProcessNextRoomJobDeps {
  db: DatabaseSync;
  config: AppConfig;
  agentExecutor?: MailAgentExecutor;
  subAgentTransport?: OpenClawSubAgentTransport;
  now?: () => string;
}

export interface ProcessedRoomJobResult {
  status: "completed";
  roomKey: string;
  run: MailRunRecord;
  outbox: MailOutboxRecord[];
}

export type LeasedRoomJob = NonNullable<ReturnType<typeof leaseNextRoomJob>> & {
  messageDedupeKey: string;
};

export function ingestIncomingMail(
  deps: IngestIncomingMailDeps,
  input: IngestIncomingMailInput
): IngestIncomingMailResult {
  const now = deps.now ?? (() => new Date().toISOString());
  const normalized = normalizeMailEnvelope(input.envelope);
  const account = getMailAccount(deps.db, input.accountId);
  const provider = account?.provider ?? "unknown";
  const mailboxRoute = resolveMailboxRoute({
    account,
    fallbackMailboxAddress: input.mailboxAddress,
    envelope: normalized
  });
  const senderHeader = getHeader(normalized.headers, "sender");
  const identity = resolveMailIdentity({
    from: normalized.from.email,
    replyTo: normalized.replyTo.map((entry) => entry.email),
    sender: senderHeader,
    headers: normalized.headers,
    allowDomains: input.senderPolicy?.allowDomains
  });
  const participants = collectParticipants(normalized, mailboxRoute);
  const receivedAt = normalized.date ?? now();
  const resolution = resolveThreadForMail(deps.db, {
    accountId: input.accountId,
    providerMessageId: normalized.providerMessageId,
    providerThreadId: normalized.threadId,
    messageId: normalized.messageId,
    inReplyTo: getHeader(normalized.headers, "in-reply-to"),
    references: parseReferences(getHeader(normalized.headers, "references")),
    subject: normalized.subject,
    normalizedText: normalized.text,
    participants,
    receivedAt
  });
  const roomKey = buildRoomSessionKey(
    input.accountId,
    resolution.stableThreadId,
    deps.config.openClaw.sessionPrefix
  );

  const existingRoom = getThreadRoom(deps.db, roomKey);
  const roomRouting = resolveRoomAgentRouting(existingRoom, mailboxRoute, account);
  const handoffActive = existingRoom?.state === "handoff";
  const revision = resolution.isDuplicate ? existingRoom?.revision ?? 1 : (existingRoom?.revision ?? 0) + 1;
  const lastInboundSeq = resolution.isDuplicate
    ? existingRoom?.lastInboundSeq ?? 1
    : (existingRoom?.lastInboundSeq ?? 0) + 1;
  let room = {
    roomKey,
    accountId: input.accountId,
    stableThreadId: resolution.stableThreadId,
    parentSessionKey: buildRoomSessionKey(
      input.accountId,
      resolution.stableThreadId,
      deps.config.openClaw.sessionPrefix,
      roomRouting.frontAgentAddress
    ),
    frontAgentAddress: roomRouting.frontAgentAddress,
    frontAgentId: roomRouting.frontAgentId,
    publicAgentAddresses: roomRouting.publicAgentAddresses,
    publicAgentIds: roomRouting.publicAgentIds,
    collaboratorAgentAddresses: roomRouting.collaboratorAgentAddresses,
    collaboratorAgentIds: roomRouting.collaboratorAgentIds,
    summonedRoles: roomRouting.summonedRoles,
    state: handoffActive ? ("handoff" as const) : ("queued" as const),
    revision,
    lastInboundSeq,
    lastOutboundSeq: existingRoom?.lastOutboundSeq ?? 0,
    summaryRef: existingRoom?.summaryRef,
    sharedFactsRef: existingRoom?.sharedFactsRef
  };

  saveThreadRoom(deps.db, room);
  if (!existingRoom) {
    appendThreadLedgerEvent(deps.db, {
      roomKey,
      revision,
      type: "room.created",
      payload: {
        stableThreadId: resolution.stableThreadId,
        internetMessageId: normalized.messageId,
        providerThreadId: normalized.threadId ?? null
      }
    });
  } else if (!resolution.isDuplicate) {
    appendThreadLedgerEvent(deps.db, {
      roomKey,
      revision,
      type: "room.continued",
      payload: {
        stableThreadId: resolution.stableThreadId,
        bindingSource: resolution.source,
        matchedMessageId: resolution.matchedMessageId ?? null,
        internetMessageId: normalized.messageId
      }
    });
  }
  if (!resolution.isDuplicate) {
    appendThreadLedgerEvent(deps.db, {
      roomKey,
      revision,
      type: "room.revision.bumped",
      payload: {
        fromRevision: existingRoom?.revision ?? 0,
        toRevision: revision,
        messageDedupeKey: resolution.dedupeKey
      }
    });
  }
  appendThreadLedgerEvent(deps.db, {
    roomKey,
    revision,
    type: "message.bound_to_room",
    payload: {
      messageDedupeKey: resolution.dedupeKey,
      stableThreadId: resolution.stableThreadId,
      bindingSource: resolution.source,
      matchedMessageId: resolution.matchedMessageId ?? null,
      providerThreadId: normalized.threadId ?? null,
      internetMessageId: normalized.messageId,
      isDuplicate: resolution.isDuplicate
    }
  });
  const rawMimePath =
    normalized.rawMime && normalized.rawMime.trim().length > 0
      ? persistInboundMimeArtifact(deps.config, {
          accountId: input.accountId,
          stableThreadId: resolution.stableThreadId,
          dedupeKey: resolution.dedupeKey,
          rawMime: normalized.rawMime
        })
      : null;
  const inboundArtifactPath = persistInboundArtifact(deps.config, {
    accountId: input.accountId,
    stableThreadId: resolution.stableThreadId,
    dedupeKey: resolution.dedupeKey,
    payload: {
      normalized,
      receivedAt,
      mailboxAddress: input.mailboxAddress,
      identity,
      route: {
        ...mailboxRoute,
        frontAgentAddress: roomRouting.frontAgentAddress,
        publicAgentAddresses: roomRouting.publicAgentAddresses,
        collaboratorAgentAddresses: roomRouting.collaboratorAgentAddresses,
        summonedRoles: roomRouting.summonedRoles
      },
      rawMimePath
    }
  });
  persistRoomParticipants(deps.db, {
    roomKey,
    seenAt: receivedAt,
    mailboxAddress: roomRouting.frontAgentAddress,
    mailboxRoute: {
      ...mailboxRoute,
      canonicalMailboxAddress: roomRouting.frontAgentAddress,
      frontAgentAddress: roomRouting.frontAgentAddress,
      publicAgentAddresses: roomRouting.publicAgentAddresses,
      collaboratorAgentAddresses: roomRouting.collaboratorAgentAddresses,
      summonedRoles: roomRouting.summonedRoles
    },
    normalized
  });
  appendThreadLedgerEvent(deps.db, {
    roomKey,
    revision,
    type: "mail.inbound_received",
    payload: {
      providerMessageId: normalized.providerMessageId,
      internetMessageId: normalized.messageId,
      artifactPath: inboundArtifactPath
    }
  });
  appendProviderEvent(deps.db, {
    accountId: input.accountId,
    provider,
    roomKey,
    dedupeKey: resolution.dedupeKey,
    eventType: "provider.event.received",
    cursorValue: normalized.providerMessageId,
    payload: {
      providerMessageId: normalized.providerMessageId,
      providerThreadId: normalized.threadId,
      internetMessageId: normalized.messageId,
      mailboxAddress: input.mailboxAddress
    }
  });
  appendThreadLedgerEvent(deps.db, {
    roomKey,
    revision,
    type: "mail.inbound_normalized",
    payload: {
      subject: normalized.subject,
      attachmentCount: normalized.attachments.length,
      trustLevel: identity.trustLevel,
      canonicalUserId: identity.canonicalUserId,
      identityRisks: identity.risks
    }
  });

  if (resolution.isDuplicate) {
    appendProviderEvent(deps.db, {
      accountId: input.accountId,
      provider,
      roomKey,
      dedupeKey: resolution.dedupeKey,
      eventType: "provider.event.duplicated",
      cursorValue: normalized.providerMessageId,
      payload: {
        providerMessageId: normalized.providerMessageId,
        internetMessageId: normalized.messageId
      }
    });
    return {
      status: "duplicate",
      roomKey,
      stableThreadId: resolution.stableThreadId,
      dedupeKey: resolution.dedupeKey
    };
  }

  updateMailMessageContent(deps.db, resolution.dedupeKey, {
    mailboxAddress: roomRouting.frontAgentAddress,
    rawSubject: normalized.subject,
    textBody: normalized.text,
    htmlBody: normalized.html,
    from: normalized.from.email,
    to: normalized.to.map((entry) => entry.email),
    cc: normalized.cc.map((entry) => entry.email),
    bcc: normalized.bcc.map((entry) => entry.email),
    replyTo: normalized.replyTo.map((entry) => entry.email),
    canonicalUserId: identity.canonicalUserId,
    trustLevel: identity.trustLevel,
    identity
  });
  appendProviderEvent(deps.db, {
    accountId: input.accountId,
    provider,
    roomKey,
    dedupeKey: resolution.dedupeKey,
    eventType: "provider.event.canonicalized",
    cursorValue: normalized.providerMessageId,
    payload: {
      canonicalMailboxAddress: mailboxRoute.canonicalMailboxAddress,
      routedFrontAgentAddress: mailboxRoute.frontAgentAddress,
      frontAgentAddress: roomRouting.frontAgentAddress,
      frontAgentId: roomRouting.frontAgentId ?? null,
      publicAgentIds: roomRouting.publicAgentIds,
      collaboratorAgentAddresses: roomRouting.collaboratorAgentAddresses,
      collaboratorAgentIds: roomRouting.collaboratorAgentIds,
      summonedRoles: roomRouting.summonedRoles,
      bindingSource: resolution.source,
      matchedMessageId: resolution.matchedMessageId ?? null,
      trustLevel: identity.trustLevel,
      canonicalUserId: identity.canonicalUserId,
      identityRisks: identity.risks
    }
  });
  const updatedMessage = findMailMessageByDedupeKey(deps.db, resolution.dedupeKey);
  if (updatedMessage) {
    replaceRoomSearchDocumentForMessage(deps.db, {
      roomKey,
      message: updatedMessage
    });
  }

  for (const [index, attachment] of normalized.attachments.entries()) {
    const attachmentId = randomUUID();
    const rawAttachment = input.envelope.attachments?.[index];
    const rawAttachmentData = resolveProviderAttachmentData(rawAttachment);
    const contentSha256 = hashAttachmentContent(rawAttachmentData);
    const reusableAttachment = contentSha256
      ? findReusableMailAttachmentByHash(deps.db, {
          roomKey,
          contentSha256
        })
      : null;
    const extractedText = extractAttachmentText(rawAttachmentData, attachment.mimeType, attachment.filename);
    const summaryText = summarizeAttachment(
      attachment.filename,
      attachment.mimeType,
      attachment.size,
      extractedText
    );
    const attachmentArtifactPath =
      reusableAttachment?.artifactPath ??
      persistAttachmentArtifact(deps.config, {
        accountId: input.accountId,
        stableThreadId: resolution.stableThreadId,
        attachmentId,
        payload: {
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.size,
          contentSha256,
          contentId: attachment.contentId,
          disposition: attachment.disposition,
          summaryText,
          extractedText,
          rawData: rawAttachmentData
        }
      });
    const storedAttachment = insertMailAttachment(deps.db, {
      attachmentId,
      roomKey,
      messageDedupeKey: resolution.dedupeKey,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.size,
      contentSha256,
      contentId: attachment.contentId,
      disposition: attachment.disposition,
      summaryText,
      artifactPath: attachmentArtifactPath,
      createdAt: now()
    });
    const attachmentMetadata = readAttachmentArtifactMetadata(attachmentArtifactPath);
    replaceArtifactChunksForAttachment(deps.db, {
      attachmentId,
      roomKey,
      filename: attachment.filename,
      createdAt: now(),
      metadata: attachmentMetadata
    });
    replaceRoomSearchDocumentsForAttachment(deps.db, {
      attachment: storedAttachment,
      metadata: attachmentMetadata
    });
  }

  const storedMessage = findMailMessageByDedupeKey(deps.db, resolution.dedupeKey);
  if (storedMessage) {
    const sharedFactsRef = persistRoomFactsArtifact(deps.config, {
      accountId: room.accountId,
      stableThreadId: room.stableThreadId,
      snapshotId: `r${room.revision}-ingest`,
      payload: buildRoomSharedFacts({
        roomKey: room.roomKey,
        message: storedMessage,
        attachments: listMailAttachmentsForRoom(deps.db, room.roomKey),
        existingFacts: readRoomSharedFactsArtifact(existingRoom?.sharedFactsRef)
      })
    });
    room = {
      ...room,
      sharedFactsRef
    };
    saveThreadRoom(deps.db, room);
  }

  const reasons = evaluateInboundPolicies(normalized, {
    config: deps.config,
    identity,
    senderPolicy: input.senderPolicy,
    attachmentPolicy: input.attachmentPolicy
  });

  const roomMailTask = (() => {
    const taskNode = createRoomMailTaskNode({
      room,
      revision,
      messageDedupeKey: resolution.dedupeKey,
      attachmentIds: listMailAttachmentsForRoom(deps.db, room.roomKey).map((attachment) => attachment.attachmentId),
      priority: 100,
      subject: normalized.subject,
      body: normalized.text,
      handoffActive,
      status: handoffActive ? "cancelled" : reasons.length > 0 ? "failed" : "queued"
    });

    if (reasons.length > 0) {
      return updateRoomMailTaskNode(taskNode, {
        status: "failed",
        stage: "failed",
        summary: `Inbound mail task blocked by policy: ${reasons.join(", ")}`,
        nextAction: describeNextActionForStage("failed", taskNode.mailTaskKind ?? "reply_now")
      });
    }

    if (handoffActive) {
      return updateRoomMailTaskNode(taskNode, {
        status: "cancelled",
        stage: "handoff",
        summary: "Inbound mail task entered a room with active human handoff.",
        nextAction: describeNextActionForStage("handoff", taskNode.mailTaskKind ?? "share_forward")
      });
    }

    return taskNode;
  })();
  saveTaskNode(deps.db, roomMailTask);
  appendThreadLedgerEvent(deps.db, {
    roomKey,
    revision,
    type: "task.mail_classified",
    payload: {
      nodeId: roomMailTask.nodeId,
      taskClass: roomMailTask.taskClass,
      taskKind: roomMailTask.mailTaskKind,
      stage: roomMailTask.mailTaskStage,
      status: roomMailTask.status,
      title: roomMailTask.title,
      summary: roomMailTask.summary,
      nextAction: roomMailTask.nextAction
    }
  });

  if (existingRoom && !resolution.isDuplicate) {
    cancelScheduledMailJobsForRoom({
      db: deps.db,
      roomKey,
      reason: "external_reply_received",
      updatedAt: now()
    });
  }

  if (roomMailTask.mailTaskKind === "project_work") {
    maybeBindRoomToProject({
      db: deps.db,
      room,
      subject: normalized.subject,
      body: normalized.text,
      createdAt: now()
    });
  }

  if (roomMailTask.mailTaskKind === "scheduled_mail" && !existingRoom) {
    maybeCreateScheduledMailJob({
      db: deps.db,
      config: deps.config,
      roomKey,
      accountId: room.accountId,
      sourceMessageDedupeKey: resolution.dedupeKey,
      subject: normalized.subject,
      body: normalized.text,
      createdAt: receivedAt
    });
  }

  if (reasons.length > 0) {
    saveThreadRoom(deps.db, {
      ...room,
      state: "failed"
    });
    appendThreadLedgerEvent(deps.db, {
      roomKey,
      revision,
      type: "room.failed",
      payload: {
        reasons
      }
    });
    return {
      status: "blocked",
      roomKey,
      stableThreadId: resolution.stableThreadId,
      dedupeKey: resolution.dedupeKey,
      reasons
    };
  }

  appendThreadLedgerEvent(deps.db, {
    roomKey,
    revision,
    type: "room.planned",
    payload: {
      inboundSeq: lastInboundSeq,
      messageDedupeKey: resolution.dedupeKey,
      frontAgentAddress: roomRouting.frontAgentAddress,
      frontAgentId: roomRouting.frontAgentId ?? null,
      collaboratorAgentAddresses: roomRouting.collaboratorAgentAddresses,
      collaboratorAgentIds: roomRouting.collaboratorAgentIds,
      summonedRoles: roomRouting.summonedRoles,
      autoReplySuppressed: handoffActive
    }
  });

  if (!handoffActive) {
    enqueueRoomJob(deps.db, {
      jobId: randomUUID(),
      roomKey,
      revision,
      inboundSeq: lastInboundSeq,
      messageDedupeKey: resolution.dedupeKey,
      priority: 100,
      createdAt: now()
    });
    cancelQueuedRoomJobs(deps.db, {
      roomKey,
      beforeInboundSeq: lastInboundSeq,
      now: now()
    });
  }

  return {
    status: handoffActive ? "blocked" : "queued",
    roomKey,
    stableThreadId: resolution.stableThreadId,
    dedupeKey: resolution.dedupeKey,
    ...(handoffActive ? { reasons: ["handoff_active"] } : {})
  };
}

function resolveProviderAttachmentData(attachment: ProviderAttachment | undefined) {
  if (!attachment) {
    return undefined;
  }
  if (typeof attachment.data !== "undefined") {
    return attachment.data;
  }
  if (typeof attachment.contentBase64 === "string" && attachment.contentBase64.trim().length > 0) {
    return Buffer.from(attachment.contentBase64.trim(), "base64");
  }
  return undefined;
}

export async function processNextRoomJob(
  deps: ProcessNextRoomJobDeps
): Promise<ProcessedRoomJobResult | null> {
  const now = deps.now ?? (() => new Date().toISOString());
  const leased = leaseNextRoomJob(deps.db, {
    leaseOwner: "mail-orchestrator",
    now: now(),
    leaseDurationMs: 60_000,
    priorityAgingMs: deps.config.queue.priorityAgingMs,
    priorityAgingStep: deps.config.queue.priorityAgingStep
  });

  if (!leased?.messageDedupeKey) {
    return null;
  }

  return processLeasedRoomJob(deps, leased as LeasedRoomJob);
}

export async function processLeasedRoomJob(
  deps: ProcessNextRoomJobDeps,
  leased: LeasedRoomJob
): Promise<ProcessedRoomJobResult> {
  const now = deps.now ?? (() => new Date().toISOString());

  const message = findMailMessageByDedupeKey(deps.db, leased.messageDedupeKey);
  const room = getThreadRoom(deps.db, leased.roomKey);
  if (!message || !room) {
    throw new Error(`leased room job ${leased.jobId} is missing room or message state`);
  }

  const agentExecutor = deps.agentExecutor ?? createDefaultMailAgentExecutor(deps.config);
  const roomAttachments = listMailAttachmentsForRoom(deps.db, room.roomKey);
  let roomMailTask = updateRoomMailTaskNode(
    createRoomMailTaskNode({
      room,
      revision: leased.revision,
      messageDedupeKey: leased.messageDedupeKey,
      attachmentIds: roomAttachments.map((attachment) => attachment.attachmentId),
      priority: leased.priority,
      subject: message.rawSubject ?? message.normalizedSubject,
      body: message.textBody
    }),
    {
      status: "running",
      stage: "in_progress",
      summary: "Mail task is running through the orchestrator pipeline.",
      nextAction: describeNextActionForStage("in_progress", "reply_now")
    }
  );
  saveTaskNode(deps.db, roomMailTask);
  appendThreadLedgerEvent(deps.db, {
    roomKey: room.roomKey,
    revision: leased.revision,
    type: "task.mail_stage_changed",
    payload: {
      nodeId: roomMailTask.nodeId,
      stage: roomMailTask.mailTaskStage,
      status: roomMailTask.status
    }
  });
  const retrievedContext = searchRoomContext(deps.db, {
    roomKey: room.roomKey,
    query: buildRoomContextQuery(message),
    limit: 4
  });
  const existingSharedFacts = readRoomSharedFactsArtifact(room.sharedFactsRef);
  const shouldRunPreludeWorkers = deps.config.features.swarmWorkers || roomUsesDurableAgentRoster(room);
  const preludeWorkerSummaries = shouldRunPreludeWorkers
    ? await executePreludeWorkers({
        db: deps.db,
        config: deps.config,
        room,
        revision: leased.revision,
        message,
        attachments: roomAttachments,
        retrievedContext,
        agentExecutor
      })
    : [];
  const subAgentWorkerSummaries = deps.subAgentTransport
    ? await executePreludeSubAgentTurns({
        db: deps.db,
        config: deps.config,
        room,
        revision: leased.revision,
        message,
        attachments: roomAttachments,
        retrievedContext,
        existingWorkerSummaries: preludeWorkerSummaries,
        subAgentTransport: deps.subAgentTransport,
        now: now()
      })
    : [];
  const allPreludeWorkerSummaries = [...preludeWorkerSummaries, ...subAgentWorkerSummaries];
  if (subAgentWorkerSummaries.length > 0) {
    persistWorkerSharedFacts({
      db: deps.db,
      config: deps.config,
      room,
      revision: leased.revision,
      message,
      attachments: roomAttachments,
      workerSummaries: allPreludeWorkerSummaries
    });
  }
  const latestPreSnapshot = getLatestRoomPreSnapshot(deps.db, room.roomKey);
  const inputText = buildOpenClawInput(message, retrievedContext, {
    attachments: roomAttachments,
    preSnapshot: latestPreSnapshot,
    additionalContext: [
      formatRoutingContext(room),
      formatRoomPreContext(latestPreSnapshot),
      formatSharedFactsContext(existingSharedFacts),
      formatWorkerContext(allPreludeWorkerSummaries)
    ]
      .filter((value) => value.length > 0)
      .join("\n\n")
  });
  const orchestratorAgentId = resolveExecutionAgentId(deps.config, "mail-orchestrator");
  const orchestratorRuntimeAgentId = orchestratorAgentId ?? deps.config.openClaw.agentId;
  const memoryNamespaces = resolveOrchestratorTurnMemoryNamespaces(deps.config, {
    tenantId: room.accountId,
    roomKey: room.roomKey,
    agentId: orchestratorRuntimeAgentId,
    userId: message.canonicalUserId
  });
  syncRoomMemoryNamespaces(deps.db, room.roomKey, memoryNamespaces, now());
  const executionPolicy = resolveMailTurnExecutionPolicy(deps.config, {
    role: "mail-orchestrator",
    tenantId: room.accountId,
    roomKey: room.roomKey,
    runtimeAgentId: orchestratorRuntimeAgentId,
    userId: message.canonicalUserId,
    trustLevel: message.trustLevel
  });
  const runRequest = {
    sessionKey: room.parentSessionKey,
    inputText,
    tenantId: room.accountId,
    ...(room.frontAgentId ? { ownerAgentId: room.frontAgentId } : {}),
    ...(roomAttachments.length > 0 ? { attachments: buildTurnAttachmentDescriptors(roomAttachments) } : {}),
    ...(orchestratorAgentId ? { agentId: orchestratorAgentId } : {}),
    memoryNamespaces,
    executionPolicy
  };

  const requestStartedAt = now();
  const runId = randomUUID();
  const run: MailRunRecord = {
    runId,
    roomKey: room.roomKey,
    jobId: leased.jobId,
    revision: leased.revision,
    status: "running",
    request: runRequest,
    startedAt: requestStartedAt,
    createdAt: requestStartedAt,
    updatedAt: requestStartedAt
  };
  insertMailRun(deps.db, run);
  bindGatewaySessionToRoom(deps.db, {
    sessionKey: room.parentSessionKey,
    roomKey: room.roomKey,
    bindingKind: "room",
    sourceControlPlane: resolveRuntimeControlPlane(deps.config),
    frontAgentId: room.frontAgentAddress,
    now: requestStartedAt
  });

  saveThreadRoom(deps.db, {
    ...room,
    state: "running"
  });

  try {
    const execution = await agentExecutor.executeMailTurn(runRequest);
    const responseText = execution.responseText;
    const postRunWorkerSummaries = deps.config.features.swarmWorkers
      ? await executePostRunWorkers({
          db: deps.db,
          config: deps.config,
          room,
          revision: leased.revision,
          message,
          attachments: roomAttachments,
          responseText,
          workerSummaries: allPreludeWorkerSummaries,
          agentExecutor
        })
      : [];
    const allWorkerSummaries = [...allPreludeWorkerSummaries, ...postRunWorkerSummaries];
    const runArtifactPath = persistRunArtifact(deps.config, {
      accountId: room.accountId,
      stableThreadId: room.stableThreadId,
      runId,
      payload: {
        request: execution.request,
        responseText,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt
      }
    });

    const latestRoom = getThreadRoom(deps.db, room.roomKey);
    const staleRevision = (latestRoom?.revision ?? room.revision) > leased.revision;

    if (staleRevision) {
      roomMailTask = updateRoomMailTaskNode(roomMailTask, {
        status: "cancelled",
        stage: "stale",
        summary: `Mail task was superseded by room revision ${latestRoom?.revision ?? leased.revision}.`,
        nextAction: describeNextActionForStage("stale", roomMailTask.mailTaskKind ?? "reply_now")
      });
      saveTaskNode(deps.db, roomMailTask);
      appendThreadLedgerEvent(deps.db, {
        roomKey: room.roomKey,
        revision: leased.revision,
        type: "task.mail_stage_changed",
        payload: {
          nodeId: roomMailTask.nodeId,
          stage: roomMailTask.mailTaskStage,
          status: roomMailTask.status,
          supersededByRevision: latestRoom?.revision
        }
      });
      appendThreadLedgerEvent(deps.db, {
        roomKey: room.roomKey,
        revision: leased.revision,
        type: "worker.result",
        payload: {
          role: "mail-orchestrator",
          summary: responseText,
          artifactPath: runArtifactPath,
          stale: true,
          supersededByRevision: latestRoom?.revision
        }
      });
      appendThreadLedgerEvent(deps.db, {
        roomKey: room.roomKey,
        revision: leased.revision,
        type: "room.closed",
        payload: {
          runId,
          stale: true,
          supersededByRevision: latestRoom?.revision
        }
      });
      updateMailRunCompleted(deps.db, runId, {
        responseText,
        completedAt: execution.completedAt
      });
      cancelRoomJob(deps.db, leased.jobId, {
        cancelledAt: execution.completedAt
      });

      return {
        status: "completed",
        roomKey: room.roomKey,
        run: {
          ...run,
          status: "completed",
          responseText,
          completedAt: execution.completedAt,
          updatedAt: execution.completedAt
        },
        outbox: []
      };
    }

    const reducerMessageId = emitReducerFinalReady({
      db: deps.db,
      room,
      revision: leased.revision,
      responseText,
      workerSummaries: allWorkerSummaries,
      createdAt: execution.completedAt
    });
    const currentRoom = getThreadRoom(deps.db, room.roomKey);
    const handoffActive = currentRoom?.state === "handoff";
    if (handoffActive) {
      roomMailTask = updateRoomMailTaskNode(roomMailTask, {
        status: "cancelled",
        stage: "handoff",
        summary: "Human handoff suppressed the automatic reply path for this mail task.",
        nextAction: describeNextActionForStage("handoff", roomMailTask.mailTaskKind ?? "share_forward")
      });
      saveTaskNode(deps.db, roomMailTask);
      appendThreadLedgerEvent(deps.db, {
        roomKey: room.roomKey,
        revision: leased.revision,
        type: "task.mail_stage_changed",
        payload: {
          nodeId: roomMailTask.nodeId,
          stage: roomMailTask.mailTaskStage,
          status: roomMailTask.status,
          autoReplySuppressed: true
        }
      });
      appendThreadLedgerEvent(deps.db, {
        roomKey: room.roomKey,
        revision: leased.revision,
        type: "worker.result",
        payload: {
          role: "mail-orchestrator",
          summary: responseText,
          artifactPath: runArtifactPath,
          reducerMessageId,
          autoReplySuppressed: true
        }
      });
      appendThreadLedgerEvent(deps.db, {
        roomKey: room.roomKey,
        revision: leased.revision,
        type: "room.closed",
        payload: {
          runId,
          handoffActive: true,
          autoReplySuppressed: true
        }
      });

      updateMailRunCompleted(deps.db, runId, {
        responseText,
        completedAt: execution.completedAt
      });
      completeRoomJob(deps.db, leased.jobId, {
        completedAt: execution.completedAt
      });

      return {
        status: "completed",
        roomKey: room.roomKey,
        run: {
          ...run,
          status: "completed",
          responseText,
          completedAt: execution.completedAt,
          updatedAt: execution.completedAt
        },
        outbox: []
      };
    }
    const outbox = buildOutboxReplies({
      roomKey: room.roomKey,
      revision: leased.revision,
      runId,
      message,
      mailboxAddress: room.frontAgentAddress ?? message.mailboxAddress ?? "mailclaws@example.com",
      ackNeeded:
        Date.parse(execution.completedAt) - Date.parse(execution.startedAt) >=
        deps.config.reporting.ackTimeoutMs,
      progressNeeded:
        Date.parse(execution.completedAt) - Date.parse(execution.startedAt) >=
        deps.config.reporting.progressIntervalMs,
      finalBody: responseText,
      createdAt: execution.completedAt,
      approvalGate:
        deps.config.features.approvalGate ||
        allWorkerSummaries.some((summary) => summary.approvalRequired || summary.blocked)
    });

    for (const record of outbox) {
      const outboxArtifactPath = persistOutboxArtifact(deps.config, {
        accountId: room.accountId,
        stableThreadId: room.stableThreadId,
        outboxId: record.outboxId,
        payload: record
      });
      insertControlPlaneOutboxRecord(deps.db, record);
      persistOutboundMessageIndex(deps.db, {
        accountId: room.accountId,
        stableThreadId: room.stableThreadId,
        mailboxAddress: room.frontAgentAddress ?? message.mailboxAddress ?? "mailclaws@example.com",
        record
      });
      if (record.status === "pending_approval") {
        appendThreadLedgerEvent(deps.db, {
          roomKey: room.roomKey,
          revision: leased.revision,
          type: "approval.requested",
          payload: {
            outboxId: record.outboxId,
            runId,
            kind: record.kind,
            subject: record.subject,
            to: record.to,
            cc: record.cc,
            bcc: record.bcc,
            status: record.status,
            artifactPath: outboxArtifactPath
          }
        });
      }
      appendThreadLedgerEvent(deps.db, {
        roomKey: room.roomKey,
        revision: leased.revision,
        type:
          record.kind === "ack"
            ? "mail.ack_sent"
            : record.kind === "progress"
              ? "mail.progress_sent"
              : "mail.final_sent",
        payload: {
          outboxId: record.outboxId,
          subject: record.subject,
          artifactPath: outboxArtifactPath
        }
      });
      roomMailTask = updateRoomMailTaskNode(roomMailTask, {
        status: record.status === "pending_approval" ? "done" : "running",
        stage: resolveMailTaskStageForOutbox(record),
        summary: `Mail task emitted ${record.kind} (${record.status}).`,
        nextAction: describeNextActionForStage(
          resolveMailTaskStageForOutbox(record),
          roomMailTask.mailTaskKind ?? "reply_now"
        )
      });
      saveTaskNode(deps.db, roomMailTask);
      appendThreadLedgerEvent(deps.db, {
        roomKey: room.roomKey,
        revision: leased.revision,
        type: "task.mail_stage_changed",
        payload: {
          nodeId: roomMailTask.nodeId,
          stage: roomMailTask.mailTaskStage,
          status: roomMailTask.status,
          outboxId: record.outboxId,
          outboxKind: record.kind,
          outboxStatus: record.status
        }
      });
    }

    const updatedSharedFacts = buildRoomSharedFacts({
      roomKey: room.roomKey,
      message,
      attachments: roomAttachments,
      existingFacts: readRoomSharedFactsArtifact(room.sharedFactsRef),
      responseText,
      workerSummaries: allWorkerSummaries
    });
    const updatedSharedFactsRef = persistRoomFactsArtifact(deps.config, {
      accountId: room.accountId,
      stableThreadId: room.stableThreadId,
      snapshotId: `r${leased.revision}-final`,
      payload: updatedSharedFacts
    });
    const summaryRef = persistRoomDigestArtifact(deps.config, {
      accountId: room.accountId,
      stableThreadId: room.stableThreadId,
      content: buildRoomDigest({
        message,
        responseText,
        attachments: roomAttachments
      })
    });
    const roomMemorySnapshot = captureRoomMemorySnapshot(deps.config, {
      tenantId: room.accountId,
      roomKey: room.roomKey,
      title: message.rawSubject ?? message.normalizedSubject,
      summary: responseText,
      decisions: updatedSharedFacts.recommendedActions.map(
        (action) => `${action.role}: ${action.action}`
      ),
      facts: updatedSharedFacts.facts.map((fact) => fact.claim),
      openQuestions: updatedSharedFacts.openQuestions,
      createdAt: execution.completedAt,
      snapshotId: `r${leased.revision}-final`
    });
    const preVirtualMailboxes = ensureRoomVirtualMailboxes(
      deps.db,
      room,
      ["mail-orchestrator"],
      execution.completedAt
    );
    const roomPrePacket = buildRoomFinalPrePacket({
      roomKey: room.roomKey,
      roomRevision: leased.revision,
      mailboxId: preVirtualMailboxes.mailboxIds["mail-orchestrator"],
      agentId: "mail-orchestrator",
      summary: responseText,
      sharedFacts: updatedSharedFacts,
      draftBody: responseText
    });
    const roomPreSnapshot = createRoomPreSnapshot({
      snapshotId: buildRoomPreSnapshotId({
        roomKey: room.roomKey,
        roomRevision: leased.revision,
        kind: roomPrePacket.kind
      }),
      roomKey: room.roomKey,
      createdAt: execution.completedAt,
      packet: roomPrePacket
    });
    insertRoomPreSnapshot(deps.db, roomPreSnapshot);
    const roomNotes = readRoomNotesFromStateDir(
      deps.config.storage.stateDir,
      room.accountId,
      room.roomKey
    );
    replaceRoomSearchDocumentsForRoomNotes(deps.db, {
      roomKey: room.roomKey,
      createdAt: execution.completedAt,
      documents:
        roomNotes?.documents.map((document) => ({
          noteId: document.noteId,
          title: document.title,
          path: document.path,
          content: document.content
        })) ?? []
    });

    appendThreadLedgerEvent(deps.db, {
      roomKey: room.roomKey,
      revision: leased.revision,
      type: "room.memory_snapshotted",
      payload: {
        snapshotId: roomMemorySnapshot.snapshot.snapshotId,
        snapshotPath: roomMemorySnapshot.snapshotPath,
        roomMemoryPath: roomMemorySnapshot.workspace.roomMemoryPath
      }
    });
    appendThreadLedgerEvent(deps.db, {
      roomKey: room.roomKey,
      revision: leased.revision,
      type: "room.pre_snapshot.created",
      payload: {
        snapshotId: roomPreSnapshot.snapshotId,
        kind: roomPreSnapshot.kind,
        audience: roomPreSnapshot.audience,
        createdBy: roomPreSnapshot.createdBy,
        inputsHash: roomPreSnapshot.inputsHash
      }
    });

    appendThreadLedgerEvent(deps.db, {
      roomKey: room.roomKey,
      revision: leased.revision,
      type: "worker.result",
      payload: {
        role: "mail-orchestrator",
        summary: responseText,
        artifactPath: runArtifactPath,
        reducerMessageId
      }
    });
    appendThreadLedgerEvent(deps.db, {
      roomKey: room.roomKey,
      revision: leased.revision,
      type: "room.closed",
      payload: {
        runId
      }
    });

    updateMailRunCompleted(deps.db, runId, {
      responseText,
      completedAt: execution.completedAt
    });
    completeRoomJob(deps.db, leased.jobId, {
      completedAt: execution.completedAt
    });
    roomMailTask = updateRoomMailTaskNode(roomMailTask, {
      status: "done"
    });
    saveTaskNode(deps.db, roomMailTask);
    saveThreadRoom(deps.db, {
      ...room,
      state: "done",
      lastOutboundSeq: room.lastOutboundSeq + outbox.length,
      summaryRef,
      sharedFactsRef: updatedSharedFactsRef
    });
    const projectLink = maybeBindRoomToProject({
      db: deps.db,
      room: {
        ...room,
        state: "done",
        lastOutboundSeq: room.lastOutboundSeq + outbox.length,
        summaryRef,
        sharedFactsRef: updatedSharedFactsRef
      },
      subject: message.rawSubject ?? message.normalizedSubject,
      body: message.textBody,
      createdAt: execution.completedAt
    });
    if (projectLink) {
      refreshProjectAggregate(deps.db, projectLink.projectId, execution.completedAt);
    }

    return {
      status: "completed",
      roomKey: room.roomKey,
      run: {
        ...run,
        status: "completed",
        responseText,
        completedAt: execution.completedAt,
        updatedAt: execution.completedAt
      },
      outbox
    };
  } catch (error) {
    const completedAt = now();
    const messageText = error instanceof Error ? error.message : String(error);
    const latestRoom = getThreadRoom(deps.db, room.roomKey);
    const staleRevision = (latestRoom?.revision ?? room.revision) > leased.revision;
    roomMailTask = updateRoomMailTaskNode(roomMailTask, {
      status: staleRevision ? "cancelled" : "failed",
      stage: staleRevision ? "stale" : "failed",
      summary: staleRevision
        ? `Mail task was superseded by room revision ${latestRoom?.revision ?? leased.revision} after failing.`
        : `Mail task failed: ${messageText}`,
      nextAction: describeNextActionForStage(
        staleRevision ? "stale" : "failed",
        roomMailTask.mailTaskKind ?? "reply_now"
      )
    });
    saveTaskNode(deps.db, roomMailTask);
    updateMailRunFailed(deps.db, runId, {
      errorText: messageText,
      completedAt
    });
    failRoomJob(deps.db, leased.jobId, {
      failedAt: completedAt
    });
    appendThreadLedgerEvent(deps.db, {
      roomKey: room.roomKey,
      revision: leased.revision,
      type: "room.failed",
      payload: {
        runId,
        error: messageText,
        stale: staleRevision,
        supersededByRevision: staleRevision ? latestRoom?.revision : undefined
      }
    });
    appendThreadLedgerEvent(deps.db, {
      roomKey: room.roomKey,
      revision: leased.revision,
      type: "task.mail_stage_changed",
      payload: {
        nodeId: roomMailTask.nodeId,
        stage: roomMailTask.mailTaskStage,
        status: roomMailTask.status,
        error: messageText
      }
    });
    if (!staleRevision) {
      saveThreadRoom(deps.db, {
        ...room,
        state: "failed"
      });
      const project = maybeBindRoomToProject({
        db: deps.db,
        room: {
          ...room,
          state: "failed"
        },
        subject: message.rawSubject ?? message.normalizedSubject,
        body: message.textBody,
        createdAt: completedAt
      });
      if (project) {
        refreshProjectAggregate(deps.db, project.projectId, completedAt);
      }
    }
    throw error;
  }
}

function evaluateInboundPolicies(
  normalized: ReturnType<typeof normalizeMailEnvelope>,
  options: {
    config: AppConfig;
    identity: MailIdentity;
    senderPolicy?: SenderPolicyConfig;
    attachmentPolicy?: AttachmentPolicyConfig;
  }
) {
  const reasons: string[] = [];
  const loopGuard = evaluateLoopGuard({
    from: normalized.from.email,
    headers: Object.fromEntries(normalized.headers.map((header) => [header.name, header.value]))
  });
  if (loopGuard.blocked) {
    reasons.push(...loopGuard.reasons.map((reason) => `loop_guard:${reason}`));
  }

  const senderPolicy = evaluateSenderPolicy({
    from: normalized.from.email,
    config: options.senderPolicy
  });
  if (!senderPolicy.allowed) {
    reasons.push(`sender_policy:${senderPolicy.reason}`);
  }

  if (
    options.config.features.identityTrustGate &&
    !meetsMinimumTrustLevel(options.identity.trustLevel, options.config.identity.minTrustLevel)
  ) {
    reasons.push(`identity_policy:minimum_trust:${options.config.identity.minTrustLevel}`);
  }

  const attachmentPolicy = evaluateAttachmentPolicy({
    attachments: normalized.attachments.map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.mimeType,
      sizeBytes: attachment.size ?? 0
    })),
    config: options.attachmentPolicy
  });
  if (!attachmentPolicy.allowed) {
    reasons.push(...attachmentPolicy.reasons.map((reason) => `attachment_policy:${reason}`));
  }

  return reasons;
}

function collectParticipants(
  normalized: ReturnType<typeof normalizeMailEnvelope>,
  mailboxRoute: ReturnType<typeof resolveMailboxRoute>
) {
  return [
    normalized.from.email,
    ...filterInternalAliasRecipients(
      normalized.to.map((entry) => entry.email),
      mailboxRoute.canonicalMailboxAddress,
      mailboxRoute.internalAliasAddresses
    ),
    ...filterInternalAliasRecipients(
      normalized.cc.map((entry) => entry.email),
      mailboxRoute.canonicalMailboxAddress,
      mailboxRoute.internalAliasAddresses
    ),
    ...filterInternalAliasRecipients(
      normalized.replyTo.map((entry) => entry.email),
      mailboxRoute.canonicalMailboxAddress,
      mailboxRoute.internalAliasAddresses
    )
  ];
}

function resolveRoomAgentRouting(
  existingRoom: ReturnType<typeof getThreadRoom>,
  mailboxRoute: ReturnType<typeof resolveMailboxRoute>,
  account?: MailAccountRecord | null
) {
  const accountRouting = readAccountAgentRoutingHints(account);
  const frontAgentAddress = existingRoom?.frontAgentAddress ?? mailboxRoute.frontAgentAddress;
  const frontAgentId =
    existingRoom?.frontAgentId ??
    accountRouting.defaultFrontAgentId ??
    mailboxRoute.frontAgentId ??
    frontAgentAddress;
  const currentFrontAliasIsPublic =
    normalizeRecipient(mailboxRoute.frontAgentAddress).length > 0 &&
    mailboxRoute.publicAgentAddresses.some(
      (address) => normalizeRecipient(address) === normalizeRecipient(mailboxRoute.frontAgentAddress)
    );
  const collaboratorAgentAddresses = mergeOrderedRecipientLists(
    existingRoom?.collaboratorAgentAddresses ?? [],
    currentFrontAliasIsPublic &&
      normalizeRecipient(mailboxRoute.frontAgentAddress) !== normalizeRecipient(frontAgentAddress)
      ? [mailboxRoute.frontAgentAddress]
      : [],
    mailboxRoute.collaboratorAgentAddresses
  ).filter((address) => normalizeRecipient(address) !== normalizeRecipient(frontAgentAddress));
  const collaboratorAgentIds = mergeOrderedRecipientLists(
    existingRoom?.collaboratorAgentIds ?? [],
    accountRouting.collaboratorAgentIds,
    mailboxRoute.collaboratorAgentIds,
    mailboxRoute.collaboratorAgentAddresses.filter(looksLikeDurableAgentId)
  ).filter((agentId) => normalizeRecipient(agentId) !== normalizeRecipient(frontAgentId));

  return {
    frontAgentAddress,
    frontAgentId,
    publicAgentAddresses: mergeOrderedRecipientLists(
      frontAgentAddress ? [frontAgentAddress] : [],
      existingRoom?.publicAgentAddresses ?? [],
      mailboxRoute.publicAgentAddresses
    ),
    publicAgentIds: mergeOrderedRecipientLists(
      frontAgentId ? [frontAgentId] : [],
      existingRoom?.publicAgentIds ?? [],
      mailboxRoute.publicAgentIds,
      accountRouting.durableAgentIds,
      collaboratorAgentIds
    ),
    collaboratorAgentAddresses,
    collaboratorAgentIds,
    summonedRoles: mergeOrderedWorkerRoles(
      existingRoom?.summonedRoles ?? [],
      mailboxRoute.summonedRoles
    )
  };
}

function readAccountAgentRoutingHints(account?: MailAccountRecord | null) {
  const settings =
    typeof account?.settings === "object" && account.settings !== null
      ? (account.settings as Record<string, unknown>)
      : {};
  const routing =
    typeof settings.agentRouting === "object" && settings.agentRouting !== null
      ? (settings.agentRouting as Record<string, unknown>)
      : {};

  return {
    defaultFrontAgentId: readNormalizedAgentId(routing.defaultFrontAgentId),
    collaboratorAgentIds: readNormalizedAgentIdList(routing.collaboratorAgentIds),
    durableAgentIds: readNormalizedAgentIdList(routing.durableAgentIds)
  };
}

function roomUsesDurableAgentRoster(room: NonNullable<ReturnType<typeof getThreadRoom>>) {
  return [...(room.publicAgentIds ?? []), ...(room.collaboratorAgentIds ?? [])].some((value) =>
    looksLikeDurableAgentId(value)
  );
}

function resolveExecutionAgentId(config: AppConfig, role: WorkerRole) {
  const configuredAgentId = config.openClaw.roleAgentIds[role];

  if (typeof configuredAgentId !== "string" || configuredAgentId.trim().length === 0) {
    return undefined;
  }

  return configuredAgentId.trim();
}

function persistRoomParticipants(
  db: DatabaseSync,
  input: {
    roomKey: string;
    seenAt: string;
    mailboxAddress: string;
    mailboxRoute: ReturnType<typeof resolveMailboxRoute>;
    normalized: ReturnType<typeof normalizeMailEnvelope>;
  }
) {
  upsertRoomParticipant(db, {
    roomKey: input.roomKey,
    emailAddress: input.mailboxAddress,
    participantType: "agent",
    visibility: "visible",
    role: "front-agent",
    source: "mailbox",
    seenAt: input.seenAt
  });

  upsertRoomParticipant(db, {
    roomKey: input.roomKey,
    participantType: "agent",
    visibility: "internal",
    role: "mail-orchestrator",
    source: "runtime",
    seenAt: input.seenAt
  });

  upsertRoomParticipant(db, {
    roomKey: input.roomKey,
    emailAddress: input.normalized.from.email,
    displayName: input.normalized.from.name,
    participantType: "human",
    visibility: "visible",
    source: "from",
    seenAt: input.seenAt
  });

  for (const entry of input.normalized.to) {
    persistAddressParticipant(db, {
      roomKey: input.roomKey,
      mailboxAddress: input.mailboxAddress,
      internalAliasAddresses: input.mailboxRoute.internalAliasAddresses,
      collaboratorAgentAddresses: input.mailboxRoute.collaboratorAgentAddresses,
      seenAt: input.seenAt,
      emailAddress: entry.email,
      displayName: entry.name,
      source: "to",
      visibility: "visible"
    });
  }

  for (const entry of input.normalized.cc) {
    persistAddressParticipant(db, {
      roomKey: input.roomKey,
      mailboxAddress: input.mailboxAddress,
      internalAliasAddresses: input.mailboxRoute.internalAliasAddresses,
      collaboratorAgentAddresses: input.mailboxRoute.collaboratorAgentAddresses,
      seenAt: input.seenAt,
      emailAddress: entry.email,
      displayName: entry.name,
      source: "cc",
      visibility: "visible"
    });
  }

  for (const entry of input.normalized.bcc) {
    persistAddressParticipant(db, {
      roomKey: input.roomKey,
      mailboxAddress: input.mailboxAddress,
      internalAliasAddresses: input.mailboxRoute.internalAliasAddresses,
      collaboratorAgentAddresses: input.mailboxRoute.collaboratorAgentAddresses,
      seenAt: input.seenAt,
      emailAddress: entry.email,
      displayName: entry.name,
      source: "bcc",
      visibility: "bcc"
    });
  }

  for (const entry of input.normalized.replyTo) {
    persistAddressParticipant(db, {
      roomKey: input.roomKey,
      mailboxAddress: input.mailboxAddress,
      internalAliasAddresses: input.mailboxRoute.internalAliasAddresses,
      collaboratorAgentAddresses: input.mailboxRoute.collaboratorAgentAddresses,
      seenAt: input.seenAt,
      emailAddress: entry.email,
      displayName: entry.name,
      source: "reply-to",
      visibility: "visible"
    });
  }

  for (const aliasAddress of input.mailboxRoute.internalAliasAddresses) {
    upsertRoomParticipant(db, {
      roomKey: input.roomKey,
      emailAddress: aliasAddress,
      participantType: "agent",
      visibility: "internal",
      source: "route-alias",
      seenAt: input.seenAt
    });
  }

  for (const collaboratorAddress of input.mailboxRoute.collaboratorAgentAddresses) {
    upsertRoomParticipant(db, {
      roomKey: input.roomKey,
      emailAddress: collaboratorAddress,
      participantType: "agent",
      visibility: "visible",
      role: "collaborator-agent",
      source: "route-collaborator",
      seenAt: input.seenAt
    });
  }

  for (const role of input.mailboxRoute.summonedRoles) {
    upsertRoomParticipant(db, {
      roomKey: input.roomKey,
      participantType: "agent",
      visibility: "internal",
      role,
      source: "route-role",
      seenAt: input.seenAt
    });
  }
}

function persistAddressParticipant(
  db: DatabaseSync,
  input: {
    roomKey: string;
    mailboxAddress: string;
    internalAliasAddresses: string[];
    collaboratorAgentAddresses: string[];
    seenAt: string;
    emailAddress: string;
    displayName?: string;
    source: string;
    visibility: "visible" | "bcc";
  }
) {
  const filtered = filterInternalAliasRecipients(
    [input.emailAddress],
    input.mailboxAddress,
    input.internalAliasAddresses
  );
  if (filtered.length === 0) {
    return;
  }

  if (input.collaboratorAgentAddresses.includes(filtered[0]!)) {
    upsertRoomParticipant(db, {
      roomKey: input.roomKey,
      emailAddress: filtered[0],
      displayName: input.displayName,
      participantType: "agent",
      visibility: input.visibility === "bcc" ? "internal" : "visible",
      role: "collaborator-agent",
      source: input.source,
      seenAt: input.seenAt
    });
    return;
  }

  upsertRoomParticipant(db, {
    roomKey: input.roomKey,
    emailAddress: filtered[0],
    displayName: input.displayName,
    participantType: "human",
    visibility: input.visibility,
    source: input.source,
    seenAt: input.seenAt
  });
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string) {
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value;
}

function persistOutboundMessageIndex(
  db: DatabaseSync,
  input: {
    accountId: string;
    stableThreadId: string;
    mailboxAddress: string;
    record: MailOutboxRecord;
  }
) {
  const internetMessageId = input.record.headers["Message-ID"];
  if (!internetMessageId) {
    return;
  }

  const dedupeKey = `outbox:${input.record.outboxId}`;
  if (findMailMessageByDedupeKey(db, dedupeKey)) {
    return;
  }

  const participants = [input.mailboxAddress, ...input.record.to, ...input.record.cc, ...input.record.bcc];
  insertMailMessage(db, {
    dedupeKey,
    accountId: input.accountId,
    stableThreadId: input.stableThreadId,
    internetMessageId,
    inReplyTo: input.record.headers["In-Reply-To"],
    references: parseReferences(input.record.headers.References),
    mailboxAddress: input.mailboxAddress,
    rawSubject: input.record.subject,
    textBody: input.record.textBody,
    htmlBody: input.record.htmlBody,
    from: input.mailboxAddress,
    to: input.record.to,
    cc: input.record.cc,
    bcc: input.record.bcc,
    replyTo: [],
    normalizedSubject: normalizeSubject(input.record.subject),
    participantFingerprint: buildParticipantFingerprint(participants),
    receivedAt: input.record.createdAt,
    createdAt: input.record.createdAt
  });
}

function parseReferences(value: string | undefined) {
  return value?.split(/\s+/).map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function summarizeAttachment(
  filename: string,
  mimeType: string,
  size?: number,
  extractedText?: string
) {
  const metadata = `${filename} (${mimeType}${typeof size === "number" ? `, ${size} bytes` : ""})`;
  const snippet = extractedText
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

  return snippet ? `${metadata}: ${snippet}` : metadata;
}

function extractAttachmentText(
  rawData: string | Uint8Array | undefined,
  mimeType: string,
  filename: string
) {
  if (typeof rawData === "undefined" || !isTextLikeAttachment(mimeType, filename)) {
    return undefined;
  }

  const decoded = typeof rawData === "string" ? rawData : Buffer.from(rawData).toString("utf8");
  const normalizedMimeType = mimeType.trim().toLowerCase();
  const text =
    normalizedMimeType.includes("html") || filename.toLowerCase().endsWith(".html")
      ? stripHtml(decoded)
      : decoded;

  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim() || undefined;
}

function hashAttachmentContent(rawData: string | Uint8Array | undefined) {
  if (typeof rawData === "undefined") {
    return undefined;
  }

  return createHash("sha256").update(rawData).digest("hex");
}

function isTextLikeAttachment(mimeType: string, filename: string) {
  const normalizedMimeType = mimeType.trim().toLowerCase();
  const normalizedFilename = filename.trim().toLowerCase();

  return (
    normalizedMimeType.startsWith("text/") ||
    normalizedMimeType.includes("json") ||
    normalizedMimeType.includes("csv") ||
    normalizedMimeType.includes("xml") ||
    normalizedMimeType.includes("html") ||
    normalizedFilename.endsWith(".txt") ||
    normalizedFilename.endsWith(".md") ||
    normalizedFilename.endsWith(".csv") ||
    normalizedFilename.endsWith(".json") ||
    normalizedFilename.endsWith(".xml") ||
    normalizedFilename.endsWith(".html")
  );
}

function buildRoomContextQuery(message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>) {
  return [message.rawSubject ?? message.normalizedSubject, message.textBody ?? ""]
    .filter((value) => value.trim().length > 0)
    .join("\n");
}

function buildOpenClawInput(
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>,
  retrievedContext: RoomSearchHit[] = [],
  options: {
    attachments?: ReturnType<typeof listMailAttachmentsForRoom>;
    preSnapshot?: ReturnType<typeof getLatestRoomPreSnapshot>;
    additionalContext?: string;
  } = {}
) {
  const replyTo = message.replyTo ?? [];
  const attachmentBlock = replyTo.length > 0 ? `Reply-To: ${replyTo.join(", ")}\n` : "";
  const relatedContext = formatRetrievedRoomContext(message, retrievedContext);
  const emailPacket = formatInboundEmailPacket({
    mode: "write",
    message,
    retrievedContext,
    attachments: options.attachments,
    preSnapshot: options.preSnapshot
  });

  return [
    formatDefaultMailSkills("front-orchestrator"),
    `From: ${message.from ?? "unknown"}`,
    `Subject: ${message.rawSubject ?? message.normalizedSubject}`,
    attachmentBlock.trimEnd(),
    "",
    emailPacket,
    "Current inbound body:",
    message.textBody ?? "",
    relatedContext,
    options.additionalContext ?? ""
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function buildTurnAttachmentDescriptors(
  attachments: ReturnType<typeof listMailAttachmentsForRoom>,
  inputRefs?: string[]
): MailTurnAttachmentDescriptor[] {
  const allowedAttachmentIds = inputRefs?.length ? new Set(inputRefs) : null;

  return attachments
    .filter((attachment) => !allowedAttachmentIds || allowedAttachmentIds.has(attachment.attachmentId))
    .map((attachment) => {
      const metadata = readAttachmentArtifactMetadata(attachment.artifactPath);
      const preferredInput = selectPreferredTurnAttachmentInput(attachment, metadata);

      return {
        attachmentId: attachment.attachmentId,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        contentSha256: attachment.contentSha256,
        summaryText: attachment.summaryText,
        artifactPath: attachment.artifactPath,
        rawDataPath: metadata?.rawDataPath ?? undefined,
        extractedTextPath: metadata?.extractedTextPath ?? undefined,
        summaryPath: metadata?.summaryPath ?? undefined,
        summaryShortPath: metadata?.summaryShortPath ?? undefined,
        summaryLongPath: metadata?.summaryLongPath ?? undefined,
        preferredInputPath: preferredInput?.path,
        preferredInputFilename: preferredInput?.filename,
        preferredInputMimeType: preferredInput?.mimeType,
        preferredInputKind: preferredInput?.kind,
        chunks:
          metadata?.chunks?.map((chunk) => ({
            chunkId: chunk.chunkId,
            chunkPath: chunk.chunkPath,
            summaryPath: chunk.summaryPath ?? undefined,
            sourcePath: chunk.sourcePath ?? undefined,
            tokenEstimate: chunk.tokenEstimate,
            sha256: chunk.sha256
          })) ?? []
      };
    });
}

function selectPreferredTurnAttachmentInput(
  attachment: ReturnType<typeof listMailAttachmentsForRoom>[number],
  metadata: ReturnType<typeof readAttachmentArtifactMetadata>
) {
  const extractedMarkdownName = createMarkdownAttachmentName(attachment.filename);
  if (isTextLikeAttachment(attachment.mimeType, attachment.filename) && metadata?.extractedTextPath) {
    return {
      path: metadata.extractedTextPath,
      filename: extractedMarkdownName,
      mimeType: "text/markdown",
      kind: "extracted" as const
    };
  }

  if (metadata?.rawDataPath) {
    return {
      path: metadata.rawDataPath,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      kind: "raw" as const
    };
  }

  if (metadata?.extractedTextPath) {
    return {
      path: metadata.extractedTextPath,
      filename: extractedMarkdownName,
      mimeType: "text/markdown",
      kind: "extracted" as const
    };
  }

  const summaryPath = metadata?.summaryLongPath ?? metadata?.summaryPath ?? metadata?.summaryShortPath;
  if (summaryPath) {
    return {
      path: summaryPath,
      filename: createMarkdownAttachmentName(`${attachment.filename}-summary`),
      mimeType: "text/markdown",
      kind: "summary" as const
    };
  }

  return null;
}

function createMarkdownAttachmentName(filename: string) {
  const parsed = path.parse(filename);
  const base = parsed.name.trim().length > 0 ? parsed.name : parsed.base || "attachment";
  return `${base}.md`;
}

function formatRetrievedRoomContext(
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>,
  hits: RoomSearchHit[]
) {
  const relatedHits = hits
    .filter((hit) => !(hit.kind === "message" && hit.sourceId === message.dedupeKey))
    .slice(0, 3);

  if (relatedHits.length === 0) {
    return "";
  }

  const lines = relatedHits.map((hit) => {
    const location = hit.chunkId ? ` ${hit.chunkId}` : "";
    return `- [${hit.kind}${location}] ${hit.title}: ${hit.excerpt}`;
  });

  return ["Relevant room context:", ...lines].join("\n");
}

function buildRoomSharedFacts(input: {
  roomKey: string;
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>;
  attachments: ReturnType<typeof listMailAttachmentsForRoom>;
  existingFacts?: RoomSharedFactsArtifact | null;
  responseText?: string;
  workerSummaries?: WorkerExecutionSummary[];
}): RoomSharedFactsArtifact {
  const mergedWorkerFacts = mergeWorkerFacts(input.existingFacts, input.workerSummaries ?? []);

  return {
    schemaVersion: 3,
    roomKey: input.roomKey,
    latestInbound: {
      dedupeKey: input.message.dedupeKey,
      subject: input.message.rawSubject ?? input.message.normalizedSubject,
      from: input.message.from ?? "unknown",
      receivedAt: input.message.receivedAt
    },
    latestResponse: input.responseText
      ? {
          text: input.responseText
        }
      : (input.existingFacts?.latestResponse ?? null),
    workerSummaries: (input.workerSummaries ?? []).map((summary) => ({
      role: summary.role,
      status: summary.status,
      summary: summary.summary
    })),
    attachments: input.attachments.map((attachment) => ({
      attachmentId: attachment.attachmentId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      summaryText: attachment.summaryText,
      artifactPath: attachment.artifactPath
    })),
    facts: mergedWorkerFacts.facts,
    conflicts: mergedWorkerFacts.conflicts,
    openQuestions: mergedWorkerFacts.openQuestions,
    recommendedActions: mergedWorkerFacts.recommendedActions
  };
}

function buildRoomDigest(input: {
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>;
  responseText: string;
  attachments: ReturnType<typeof listMailAttachmentsForRoom>;
}) {
  const sections = [
    "# Room Digest",
    `Subject: ${input.message.rawSubject ?? input.message.normalizedSubject}`,
    `From: ${input.message.from ?? "unknown"}`,
    "",
    "## Latest Reply",
    input.responseText
  ];

  if (input.attachments.length > 0) {
    sections.push("", "## Attachment Summaries");
    for (const attachment of input.attachments) {
      sections.push(
        `- ${attachment.filename} (${attachment.mimeType})${attachment.summaryText ? `: ${attachment.summaryText}` : ""}`
      );
    }
  }

  return sections.join("\n");
}

interface WorkerExecutionSummary {
  role: WorkerRole;
  headline?: string;
  summary: string;
  status: "ok" | "partial" | "blocked" | "failed";
  approvalRequired?: boolean;
  blocked?: boolean;
  keyEvidence: string[];
  risks: string[];
  nextStep?: string;
  facts: WorkerFact[];
  openQuestions: string[];
  recommendedAction?: string;
  draftReply?: string;
  taskMessageId?: string;
  resultMessageId?: string;
  threadId?: string;
}

interface WorkerFact {
  key?: string;
  claim: string;
  evidenceRef?: string;
}

interface ParsedWorkerSummary {
  headline?: string;
  summary: string;
  status: WorkerExecutionSummary["status"];
  approvalRequired: boolean;
  blocked: boolean;
  keyEvidence: string[];
  risks: string[];
  nextStep?: string;
  facts: WorkerFact[];
  openQuestions: string[];
  recommendedAction?: string;
  draftReply?: string;
}

interface WorkerExecutionPlan {
  role: WorkerRole;
  inputRefs: string[];
  priority: number;
  inputText: string;
}

interface WorkerExecutionReceipt {
  role: WorkerRole;
  taskMessageId: string;
  resultMessageId?: string;
  threadId?: string;
}

interface WorkerResultLedgerPayload {
  role?: unknown;
  headline?: unknown;
  summary?: unknown;
  status?: unknown;
  approvalRequired?: unknown;
  blocked?: unknown;
  keyEvidence?: unknown;
  risks?: unknown;
  nextStep?: unknown;
  facts?: unknown;
  openQuestions?: unknown;
  recommendedAction?: unknown;
  draftReply?: unknown;
  taskMessageId?: unknown;
  resultMessageId?: unknown;
}

function buildPreludeWorkerPlans(input: {
  room: NonNullable<ReturnType<typeof getThreadRoom>>;
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>;
  attachments: ReturnType<typeof listMailAttachmentsForRoom>;
  retrievedContext: RoomSearchHit[];
}) {
  const plans: WorkerExecutionPlan[] = [];
  const seenRoles = new Set<WorkerRole>();

  const addPlan = (plan: WorkerExecutionPlan | null) => {
    if (!plan || seenRoles.has(plan.role)) {
      return;
    }

    seenRoles.add(plan.role);
    plans.push(plan);
  };

  if (input.attachments.length > 0) {
    addPlan({
      role: "mail-attachment-reader",
      inputRefs: input.attachments.map((attachment) => attachment.attachmentId),
      priority: 200,
      inputText: buildAttachmentWorkerInput(input.room, input.message, input.attachments)
    });
  }

  addPlan({
    role: "mail-researcher",
    inputRefs: [input.message.dedupeKey, ...input.attachments.map((attachment) => attachment.attachmentId)],
    priority: 180,
    inputText: buildResearchWorkerInput(input.room, input.message, input.retrievedContext, input.attachments)
  });

  if (input.room.summonedRoles?.includes("mail-drafter")) {
    addPlan({
      role: "mail-drafter",
      inputRefs: [input.message.dedupeKey, ...input.attachments.map((attachment) => attachment.attachmentId)],
      priority: 170,
      inputText: buildDrafterWorkerInput(input.room, input.message, input.retrievedContext, input.attachments)
    });
  }

  return plans;
}

function buildPostRunWorkerPlans(input: {
  room: NonNullable<ReturnType<typeof getThreadRoom>>;
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>;
  responseText: string;
  workerSummaries: WorkerExecutionSummary[];
}) {
  return [
    {
      role: "mail-reviewer" as const,
      inputRefs: [input.message.dedupeKey],
      priority: 160,
      inputText: buildReviewerWorkerInput(input.room, input.message, input.responseText, input.workerSummaries)
    },
    {
      role: "mail-guard" as const,
      inputRefs: [input.message.dedupeKey],
      priority: 150,
      inputText: buildGuardWorkerInput(input.room, input.message, input.responseText, input.workerSummaries)
    }
  ] satisfies WorkerExecutionPlan[];
}

function ensureRoomVirtualMailboxes(
  db: DatabaseSync,
  room: NonNullable<ReturnType<typeof getThreadRoom>>,
  roles: WorkerRole[],
  createdAt: string
) {
  const identitySeed = buildRoomInternalMailboxOwner(room);
  const principalId = `principal:${identitySeed}`;
  const mailboxIds: Partial<Record<WorkerRole, string>> = {};

  for (const role of roles) {
    const mailboxId = buildRoleMailboxId(identitySeed, role);
    const kind = role === "mail-reviewer" || role === "mail-guard" ? "governance" : "internal_role";
    upsertVirtualMailbox(db, {
      mailboxId,
      accountId: room.accountId,
      kind,
      principalId,
      role: role.replace(/^mail-/, ""),
      active: true,
      createdAt,
      updatedAt: createdAt
    } satisfies VirtualMailbox);
    mailboxIds[role] = mailboxId;
  }

  return {
    principalId,
    mailboxIds: mailboxIds as Record<WorkerRole, string>
  };
}

function buildRoleMailboxId(identitySeed: string, role: WorkerRole) {
  const suffix = role.replace(/^mail-/, "");
  const prefix = role === "mail-reviewer" || role === "mail-guard" ? "governance" : "internal";
  return `${prefix}:${identitySeed}:${suffix}`;
}

function buildRoomInternalMailboxOwner(room: NonNullable<ReturnType<typeof getThreadRoom>>) {
  const localPart =
    sanitizeInternalMailboxLocalPart(room.frontAgentId) ||
    sanitizeInternalMailboxLocalPart(room.accountId) ||
    "room";
  return `${localPart}@internal.mailclaws`;
}

function sanitizeInternalMailboxLocalPart(value?: string | null) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized.length > 0 ? normalized : "";
}

function resolveWorkerMessageVisibility(role: WorkerRole): VirtualMessageVisibility {
  return role === "mail-reviewer" || role === "mail-guard" ? "governance" : "internal";
}

function resolveWorkerResultKind(
  role: WorkerRole,
  parsed: ParsedWorkerSummary
): VirtualMessage["kind"] {
  switch (role) {
    case "mail-attachment-reader":
      return parsed.facts.length > 0 ? "evidence" : "claim";
    case "mail-researcher":
      return "claim";
    case "mail-drafter":
      return "draft";
    case "mail-reviewer":
      return "review";
    case "mail-guard":
      return parsed.approvalRequired || parsed.blocked ? "approval" : "review";
    case "mail-orchestrator":
      return "final_ready";
  }
}

function buildVirtualBodyRef(input: {
  roomKey: string;
  role: WorkerRole | "reducer";
  kind: string;
  revision: number;
  token: string;
}) {
  return `virtual-body://${encodeURIComponent(input.roomKey)}/${input.role}/${input.kind}/r${input.revision}/${input.token}`;
}

function normalizeWorkerInputRef(ref: string) {
  return /^[a-z][a-z0-9+.-]*:(\/\/)?/i.test(ref) || /^(\/|\.\/|\.\.\/|[A-Za-z]:[\\/])/.test(ref)
    ? ref
    : `mailclaws-ref:${encodeURIComponent(ref)}`;
}

function emitReducerFinalReady(input: {
  db: DatabaseSync;
  room: NonNullable<ReturnType<typeof getThreadRoom>>;
  revision: number;
  responseText: string;
  workerSummaries: WorkerExecutionSummary[];
  createdAt: string;
}) {
  if (input.workerSummaries.length === 0) {
    return null;
  }

  const workerRoles = input.workerSummaries.map((summary) => summary.role);
  const virtualMailboxes = ensureRoomVirtualMailboxes(
    input.db,
    input.room,
    Array.from(new Set<WorkerRole>(["mail-orchestrator", ...workerRoles])),
    input.createdAt
  );
  const workerMessageIds = input.workerSummaries
    .flatMap((summary) => (summary.resultMessageId ? [summary.resultMessageId] : []))
    .sort();
  const inputsHash = createHash("sha256")
    .update(input.responseText)
    .update("\n")
    .update(workerMessageIds.join(","))
    .digest("hex");

  appendThreadLedgerEvent(input.db, {
    roomKey: input.room.roomKey,
    revision: input.revision,
    type: "virtual_mail.reducer_started",
    payload: {
      workerRoles,
      workerMessageIds
    }
  });

  const result = submitVirtualMessage(input.db, {
    roomKey: input.room.roomKey,
    threadKind: "work",
    topic: "Reducer final ready",
    fromPrincipalId: virtualMailboxes.principalId,
    fromMailboxId: virtualMailboxes.mailboxIds["mail-orchestrator"],
    toMailboxIds: [virtualMailboxes.mailboxIds["mail-orchestrator"]],
    kind: "final_ready",
    visibility: "internal",
    subject: "Final reply ready for delivery",
    bodyRef: buildVirtualBodyRef({
      roomKey: input.room.roomKey,
      role: "reducer",
      kind: "final-ready",
      revision: input.revision,
      token: inputsHash.slice(0, 12)
    }),
    artifactRefs: input.workerSummaries.flatMap((summary) =>
      summary.facts.flatMap((fact) => (fact.evidenceRef ? [fact.evidenceRef] : []))
    ),
    memoryRefs: workerMessageIds.map((messageId) => `virtual-message:${messageId}`),
    roomRevision: input.revision,
    inputsHash,
    createdAt: input.createdAt
  });

  appendThreadLedgerEvent(input.db, {
    roomKey: input.room.roomKey,
    revision: input.revision,
    type: "virtual_mail.reducer_completed",
    payload: {
      workerRoles,
      workerMessageIds,
      threadId: result.thread.threadId,
      messageId: result.message.messageId
    }
  });
  maybeAutoProjectRoomOutcomeToGateway(input.db, {
    roomKey: input.room.roomKey,
    messageId: result.message.messageId,
    projectedAt: input.createdAt
  });

  return result.message.messageId;
}

async function executePreludeWorkers(input: {
  db: DatabaseSync;
  config: AppConfig;
  room: NonNullable<ReturnType<typeof getThreadRoom>>;
  revision: number;
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>;
  attachments: ReturnType<typeof listMailAttachmentsForRoom>;
  retrievedContext: RoomSearchHit[];
  agentExecutor: MailAgentExecutor;
}) {
  const plans = buildPreludeWorkerPlans(input).slice(0, input.config.queue.maxWorkersPerRoom);

  if (plans.length === 0) {
    return [] satisfies WorkerExecutionSummary[];
  }

  saveThreadRoom(input.db, {
    ...input.room,
    state: "waiting_workers"
  });

  const receipts = await Promise.all(
    plans.map((plan) =>
      executeWorkerTurn({
        db: input.db,
        config: input.config,
        room: input.room,
        revision: input.revision,
        role: plan.role,
        trustLevel: input.message.trustLevel,
        inputRefs: plan.inputRefs,
        priority: plan.priority,
        inputText: plan.inputText,
        agentExecutor: input.agentExecutor
      })
    )
  );
  const results = collectWorkerReplySummaries({
    db: input.db,
    room: input.room,
    revision: input.revision,
    workerRoles: plans.map((plan) => plan.role),
    receipts,
    stage: "prelude",
    consumedAt: new Date().toISOString()
  });

  persistWorkerSharedFacts({
    db: input.db,
    config: input.config,
    room: input.room,
    revision: input.revision,
    message: input.message,
    attachments: input.attachments,
    workerSummaries: results
  });

  saveThreadRoom(input.db, {
    ...(getThreadRoom(input.db, input.room.roomKey) ?? input.room),
    state: "running"
  });

  return results;
}

async function executePreludeSubAgentTurns(input: {
  db: DatabaseSync;
  config: AppConfig;
  room: NonNullable<ReturnType<typeof getThreadRoom>>;
  revision: number;
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>;
  attachments: ReturnType<typeof listMailAttachmentsForRoom>;
  retrievedContext: RoomSearchHit[];
  existingWorkerSummaries: WorkerExecutionSummary[];
  subAgentTransport: OpenClawSubAgentTransport;
  now: string;
}) {
  const triage = triageInboxRoom(input.db, {
    room: input.room,
    now: input.now,
    ackSlaSeconds: Math.max(1, Math.floor(input.config.reporting.ackTimeoutMs / 1000))
  });
  if (!triage.shouldDelegate || triage.preferredTargets.length === 0) {
    return [] satisfies WorkerExecutionSummary[];
  }

  const delegationBudget = Math.max(0, input.config.queue.maxWorkersPerRoom - input.existingWorkerSummaries.length);
  if (delegationBudget <= 0) {
    return [] satisfies WorkerExecutionSummary[];
  }

  const preferredTargets = triage.preferredTargets
    .map((mailboxId) => getSubAgentTargetByMailboxId(input.db, mailboxId))
    .filter((target): target is NonNullable<ReturnType<typeof getSubAgentTargetByMailboxId>> => Boolean(target?.enabled))
    .slice(0, delegationBudget);
  if (preferredTargets.length === 0) {
    return [] satisfies WorkerExecutionSummary[];
  }

  const virtualMailboxes = ensureRoomVirtualMailboxes(
    input.db,
    input.room,
    ["mail-orchestrator"],
    input.now
  );
  const receipts: WorkerExecutionReceipt[] = [];

  for (const target of preferredTargets) {
    const taskToken = randomUUID();
    const taskInputText = buildSubAgentDelegationInput({
      room: input.room,
      message: input.message,
      attachments: input.attachments,
      retrievedContext: input.retrievedContext,
      targetId: target.targetId
    });
    const inputsHash = createHash("sha256")
      .update(taskInputText)
      .update("\n")
      .update(target.mailboxId)
      .digest("hex");
    const taskBodyRef = persistRunArtifact(input.config, {
      accountId: input.room.accountId,
      stableThreadId: input.room.stableThreadId,
      runId: `subagent-task-${taskToken}`,
      payload: {
        targetId: target.targetId,
        mailboxId: target.mailboxId,
        taskInputText,
        createdAt: input.now
      }
    });
    const taskMessage = submitVirtualMessage(input.db, {
      roomKey: input.room.roomKey,
      threadKind: "work",
      topic: `${target.targetId} task`,
      fromPrincipalId: virtualMailboxes.principalId,
      fromMailboxId: virtualMailboxes.mailboxIds["mail-orchestrator"],
      toMailboxIds: [target.mailboxId],
      kind: "task",
      visibility: "internal",
      subject: `Task: ${target.targetId}`,
      bodyRef: taskBodyRef,
      artifactRefs: [
        normalizeWorkerInputRef(input.message.dedupeKey),
        ...input.attachments.map((attachment) => normalizeWorkerInputRef(attachment.attachmentId))
      ],
      memoryRefs: [
        `room:${input.room.roomKey}`,
        `room-revision:${input.revision}`
      ],
      roomRevision: input.revision,
      inputsHash,
      createdAt: input.now
    });
    try {
      const dispatched = await dispatchSubAgentMailbox(input.db, input.config, input.subAgentTransport, {
        mailboxId: target.mailboxId,
        consumerId: `${input.room.parentSessionKey}:subagent-dispatch:${target.targetId}:r${input.revision}`,
        batchSize: 1,
        roomKey: input.room.roomKey,
        now: input.now
      });
      const dispatchedReceipt = dispatched.find((entry) => entry.run.parentMessageId === taskMessage.message.messageId);

      receipts.push({
        role: resolveSubAgentWorkerRole(target.resultSchema),
        taskMessageId: taskMessage.message.messageId,
        resultMessageId: dispatchedReceipt?.resultMessageId,
        threadId: taskMessage.thread.threadId
      });
    } catch (error) {
      appendThreadLedgerEvent(input.db, {
        roomKey: input.room.roomKey,
        revision: input.revision,
        type: "subagent.run.failed",
        payload: {
          targetId: target.targetId,
          mailboxId: target.mailboxId,
          parentMessageId: taskMessage.message.messageId,
          stage: "dispatch",
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  return collectSubAgentReplySummaries({
    db: input.db,
    room: input.room,
    revision: input.revision,
    receipts,
    consumedAt: input.now
  });
}

async function executePostRunWorkers(input: {
  db: DatabaseSync;
  config: AppConfig;
  room: NonNullable<ReturnType<typeof getThreadRoom>>;
  revision: number;
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>;
  attachments: ReturnType<typeof listMailAttachmentsForRoom>;
  responseText: string;
  workerSummaries: WorkerExecutionSummary[];
  agentExecutor: MailAgentExecutor;
}) {
  const plans = buildPostRunWorkerPlans(input).slice(0, input.config.queue.maxWorkersPerRoom);

  saveThreadRoom(input.db, {
    ...(getThreadRoom(input.db, input.room.roomKey) ?? input.room),
    state: "waiting_workers"
  });

  const receipts = await Promise.all(
    plans.map((plan) =>
      executeWorkerTurn({
        db: input.db,
        config: input.config,
        room: input.room,
        revision: input.revision,
        role: plan.role,
        trustLevel: input.message.trustLevel,
        inputRefs: plan.inputRefs,
        priority: plan.priority,
        inputText: plan.inputText,
        agentExecutor: input.agentExecutor
      })
    )
  );
  const results = collectWorkerReplySummaries({
    db: input.db,
    room: input.room,
    revision: input.revision,
    workerRoles: plans.map((plan) => plan.role),
    receipts,
    stage: "postrun",
    consumedAt: new Date().toISOString()
  });

  persistWorkerSharedFacts({
    db: input.db,
    config: input.config,
    room: input.room,
    revision: input.revision,
    message: input.message,
    attachments: input.attachments,
    workerSummaries: [...input.workerSummaries, ...results]
  });

  saveThreadRoom(input.db, {
    ...(getThreadRoom(input.db, input.room.roomKey) ?? input.room),
    state: "replying"
  });

  return results;
}

async function executeWorkerTurn(input: {
  db: DatabaseSync;
  config: AppConfig;
  room: NonNullable<ReturnType<typeof getThreadRoom>>;
  revision: number;
  role: WorkerRole;
  trustLevel?: string;
  inputRefs: string[];
  priority: number;
  inputText: string;
  agentExecutor: MailAgentExecutor;
}): Promise<WorkerExecutionReceipt> {
  const sessionKey = buildWorkerSessionKey(
    input.room.accountId,
    input.room.stableThreadId,
    input.role,
    input.config.openClaw.sessionPrefix,
    input.room.frontAgentAddress
  );
  const taskNodeId = randomUUID();
  const virtualMailCreatedAt = new Date().toISOString();
  const virtualMailboxes = ensureRoomVirtualMailboxes(
    input.db,
    input.room,
    Array.from(new Set<WorkerRole>(["mail-orchestrator", input.role])),
    virtualMailCreatedAt
  );
  const inputsHash = createHash("sha256")
    .update(input.inputText)
    .update("\n")
    .update(JSON.stringify(input.inputRefs))
    .digest("hex");
  const taskMessage = submitVirtualMessage(input.db, {
    roomKey: input.room.roomKey,
    threadKind: "work",
    topic: `${input.role} task`,
    fromPrincipalId: virtualMailboxes.principalId,
    fromMailboxId: virtualMailboxes.mailboxIds["mail-orchestrator"],
    toMailboxIds: [virtualMailboxes.mailboxIds[input.role]],
    kind: "task",
    visibility: resolveWorkerMessageVisibility(input.role),
    subject: `Task: ${input.role}`,
    bodyRef: buildVirtualBodyRef({
      roomKey: input.room.roomKey,
      role: input.role,
      kind: "task",
      revision: input.revision,
      token: taskNodeId
    }),
    artifactRefs: input.inputRefs.map(normalizeWorkerInputRef),
    roomRevision: input.revision,
    inputsHash,
    createdAt: virtualMailCreatedAt
  });
  const leasedDelivery = consumeMailbox(input.db, {
    mailboxId: virtualMailboxes.mailboxIds[input.role],
    consumerId: sessionKey,
    batchSize: 1,
    roomKey: input.room.roomKey,
    now: virtualMailCreatedAt
  }).find((delivery) => delivery.messageId === taskMessage.message.messageId);

  saveWorkerSession(input.db, {
    sessionKey,
    roomKey: input.room.roomKey,
    role: input.role,
    revision: input.revision,
    state: "running"
  });
  saveTaskNode(input.db, {
    nodeId: taskNodeId,
    roomKey: input.room.roomKey,
    revision: input.revision,
    role: input.role,
    dependsOn: [],
    inputRefs: input.inputRefs,
    priority: input.priority,
    status: "running",
    taskClass: "worker_execution"
  });
  appendThreadLedgerEvent(input.db, {
    roomKey: input.room.roomKey,
    revision: input.revision,
    type: "worker.task_assigned",
    payload: {
      role: input.role,
      sessionKey,
      taskNodeId,
      taskMessageId: taskMessage.message.messageId,
      inputRefs: input.inputRefs
    }
  });
  appendThreadLedgerEvent(input.db, {
    roomKey: input.room.roomKey,
    revision: input.revision,
    type: "worker.progress",
    payload: {
      role: input.role,
      status: "running"
    }
  });
  const executionAgentId = resolveExecutionAgentId(input.config, input.role);
  const runtimeAgentId = executionAgentId ?? input.role;
  bindGatewaySessionToRoom(input.db, {
    sessionKey,
    roomKey: input.room.roomKey,
    bindingKind: "work_thread",
    workThreadId: taskMessage.thread.threadId,
    parentMessageId: taskMessage.message.messageId,
    sourceControlPlane: resolveRuntimeControlPlane(input.config),
    frontAgentId: executionAgentId ?? runtimeAgentId,
    now: virtualMailCreatedAt
  });
  const memoryNamespaces = resolveWorkerTurnMemoryNamespaces(input.config, {
    tenantId: input.room.accountId,
    roomKey: input.room.roomKey,
    agentId: runtimeAgentId,
    scratchAgentId: input.role
  });
  const executionPolicy = resolveMailTurnExecutionPolicy(input.config, {
    role: input.role,
    tenantId: input.room.accountId,
    roomKey: input.room.roomKey,
    runtimeAgentId,
    scratchAgentId: input.role,
    trustLevel: input.trustLevel
  });
  syncRoomMemoryNamespaces(input.db, input.room.roomKey, memoryNamespaces, virtualMailCreatedAt);

  try {
    const execution = await input.agentExecutor.executeMailTurn({
      sessionKey,
      inputText: input.inputText,
      tenantId: input.room.accountId,
      ...(input.room.frontAgentId ? { ownerAgentId: input.room.frontAgentId } : {}),
      ...(input.inputRefs.length > 0
        ? {
            attachments: buildTurnAttachmentDescriptors(
              listMailAttachmentsForRoom(input.db, input.room.roomKey),
              input.inputRefs
            )
          }
        : {}),
      ...(executionAgentId ? { agentId: executionAgentId } : {}),
      memoryNamespaces,
      executionPolicy
    });
    const parsed = parseWorkerSummary(execution.responseText);
    const latestRoom = getThreadRoom(input.db, input.room.roomKey);
    const staleRevision = (latestRoom?.revision ?? input.room.revision) > input.revision;

    if (staleRevision) {
      saveWorkerSession(input.db, {
        sessionKey,
        roomKey: input.room.roomKey,
        role: input.role,
        revision: input.revision,
        state: "stale"
      });
      saveTaskNode(input.db, {
        nodeId: taskNodeId,
        roomKey: input.room.roomKey,
        revision: input.revision,
        role: input.role,
        dependsOn: [],
        inputRefs: input.inputRefs,
        priority: input.priority,
        status: "done",
        taskClass: "worker_execution"
      });
      appendThreadLedgerEvent(input.db, {
        roomKey: input.room.roomKey,
        revision: input.revision,
        type: "worker.result",
        payload: {
          role: input.role,
          summary: parsed.summary,
          stale: true,
          supersededByRevision: latestRoom?.revision,
          taskMessageId: taskMessage.message.messageId
        }
      });
      markVirtualMessageStale(input.db, {
        messageId: taskMessage.message.messageId,
        supersededByRevision: latestRoom?.revision,
        staleAt: execution.completedAt
      });

      return {
        role: input.role,
        taskMessageId: taskMessage.message.messageId,
        threadId: taskMessage.thread.threadId
      };
    }

    const resultMessage = replyVirtualMessage(input.db, taskMessage.message.messageId, {
      fromPrincipalId: virtualMailboxes.principalId,
      fromMailboxId: virtualMailboxes.mailboxIds[input.role],
      toMailboxIds: [virtualMailboxes.mailboxIds["mail-orchestrator"]],
      kind: resolveWorkerResultKind(input.role, parsed),
      visibility: resolveWorkerMessageVisibility(input.role),
      ...resolveExecutionProjection({
        requestUrl: execution.request.url,
        sessionKey,
        frontAgentId: executionAgentId ?? runtimeAgentId,
        sourceMessageId: taskMessage.message.messageId
      }),
      subject: `${input.role} result`,
      bodyRef: buildVirtualBodyRef({
        roomKey: input.room.roomKey,
        role: input.role,
        kind: "result",
        revision: input.revision,
        token: taskNodeId
      }),
      artifactRefs: parsed.facts.flatMap((fact) => (fact.evidenceRef ? [fact.evidenceRef] : [])),
      roomRevision: input.revision,
      inputsHash,
      createdAt: execution.completedAt
    });
    if (leasedDelivery) {
      consumeMailboxDelivery(input.db, {
        deliveryId: leasedDelivery.deliveryId,
        consumerId: sessionKey,
        consumedAt: execution.completedAt
      });
    }

    saveWorkerSession(input.db, {
      sessionKey,
      roomKey: input.room.roomKey,
      role: input.role,
      revision: input.revision,
      state: "idle"
    });
    saveTaskNode(input.db, {
      nodeId: taskNodeId,
      roomKey: input.room.roomKey,
      revision: input.revision,
      role: input.role,
      dependsOn: [],
      inputRefs: input.inputRefs,
      priority: input.priority,
      status: "done",
      taskClass: "worker_execution"
    });
    appendThreadLedgerEvent(input.db, {
      roomKey: input.room.roomKey,
      revision: input.revision,
      type: "worker.result",
      payload: {
        role: input.role,
        headline: parsed.headline,
        summary: parsed.summary,
        status: parsed.status,
        approvalRequired: parsed.approvalRequired,
        blocked: parsed.blocked,
        keyEvidence: parsed.keyEvidence,
        risks: parsed.risks,
        nextStep: parsed.nextStep,
        facts: parsed.facts,
        openQuestions: parsed.openQuestions,
        recommendedAction: parsed.recommendedAction,
        draftReply: parsed.draftReply,
        taskMessageId: taskMessage.message.messageId,
        resultMessageId: resultMessage.message.messageId
      }
    });

    return {
      role: input.role,
      taskMessageId: taskMessage.message.messageId,
      resultMessageId: resultMessage.message.messageId,
      threadId: taskMessage.thread.threadId
    };
  } catch (error) {
    saveWorkerSession(input.db, {
      sessionKey,
      roomKey: input.room.roomKey,
      role: input.role,
      revision: input.revision,
      state: "stale"
    });
    saveTaskNode(input.db, {
      nodeId: taskNodeId,
      roomKey: input.room.roomKey,
      revision: input.revision,
      role: input.role,
      dependsOn: [],
      inputRefs: input.inputRefs,
      priority: input.priority,
      status: "failed",
      taskClass: "worker_execution"
    });
    throw error;
  }
}

function collectWorkerReplySummaries(input: {
  db: DatabaseSync;
  room: NonNullable<ReturnType<typeof getThreadRoom>>;
  revision: number;
  workerRoles: WorkerRole[];
  receipts: WorkerExecutionReceipt[];
  stage: "prelude" | "postrun";
  consumedAt: string;
}) {
  const expectedResultMessageIds = input.receipts
    .flatMap((receipt) => (receipt.resultMessageId ? [receipt.resultMessageId] : []));
  if (expectedResultMessageIds.length === 0) {
    return [] satisfies WorkerExecutionSummary[];
  }

  const virtualMailboxes = ensureRoomVirtualMailboxes(
    input.db,
    input.room,
    Array.from(new Set<WorkerRole>(["mail-orchestrator", ...input.workerRoles])),
    input.consumedAt
  );
  const orchestratorMailboxId = virtualMailboxes.mailboxIds["mail-orchestrator"];
  const consumerId = `${input.room.parentSessionKey}:${input.stage}:mailbox-consumer:r${input.revision}`;
  staleSupersededMailboxDeliveries(input.db, {
    roomKey: input.room.roomKey,
    mailboxId: orchestratorMailboxId,
    currentRevision: input.revision,
    staleAt: input.consumedAt
  });
  const queuedEntries = projectMailboxView(input.db, {
    roomKey: input.room.roomKey,
    mailboxId: orchestratorMailboxId
  }).filter((entry) => entry.delivery.status === "queued");

  if (queuedEntries.length > 0) {
    consumeMailbox(input.db, {
      mailboxId: orchestratorMailboxId,
      consumerId,
      batchSize: queuedEntries.length,
      roomKey: input.room.roomKey,
      now: input.consumedAt
    });
  }

  const resultMessageIdSet = new Set(expectedResultMessageIds);
  const entries = projectMailboxView(input.db, {
    roomKey: input.room.roomKey,
    mailboxId: orchestratorMailboxId
  })
    .filter((entry) => resultMessageIdSet.has(entry.message.messageId))
    .sort(
      (left, right) =>
        expectedResultMessageIds.indexOf(left.message.messageId) -
        expectedResultMessageIds.indexOf(right.message.messageId)
    );
  const payloadByMessageId = indexWorkerResultPayloads(input.db, input.room.roomKey, input.revision);
  const currentRevision = getThreadRoom(input.db, input.room.roomKey)?.revision ?? input.room.revision;
  const summaries: WorkerExecutionSummary[] = [];

  for (const entry of entries) {
    if (currentRevision > input.revision || entry.message.roomRevision > input.revision) {
      markVirtualMessageStale(input.db, {
        messageId: entry.message.messageId,
        supersededByRevision: currentRevision,
        staleAt: input.consumedAt
      });
      continue;
    }

    if (entry.delivery.status !== "consumed") {
      consumeMailboxDelivery(input.db, {
        deliveryId: entry.delivery.deliveryId,
        consumerId,
        consumedAt: input.consumedAt
      });
    }

    const payload = payloadByMessageId.get(entry.message.messageId);
    if (!payload) {
      continue;
    }

    summaries.push(buildWorkerExecutionSummary(entry, payload));
  }

  return summaries;
}

function collectSubAgentReplySummaries(input: {
  db: DatabaseSync;
  room: NonNullable<ReturnType<typeof getThreadRoom>>;
  revision: number;
  receipts: WorkerExecutionReceipt[];
  consumedAt: string;
}) {
  const expectedResultMessageIds = input.receipts
    .flatMap((receipt) => (receipt.resultMessageId ? [receipt.resultMessageId] : []));
  if (expectedResultMessageIds.length === 0) {
    return [] satisfies WorkerExecutionSummary[];
  }

  const virtualMailboxes = ensureRoomVirtualMailboxes(
    input.db,
    input.room,
    ["mail-orchestrator"],
    input.consumedAt
  );
  const orchestratorMailboxId = virtualMailboxes.mailboxIds["mail-orchestrator"];
  const consumerId = `${input.room.parentSessionKey}:subagent-mailbox-consumer:r${input.revision}`;
  staleSupersededMailboxDeliveries(input.db, {
    roomKey: input.room.roomKey,
    mailboxId: orchestratorMailboxId,
    currentRevision: input.revision,
    staleAt: input.consumedAt
  });
  const queuedEntries = projectMailboxView(input.db, {
    roomKey: input.room.roomKey,
    mailboxId: orchestratorMailboxId
  }).filter((entry) => entry.delivery.status === "queued");

  if (queuedEntries.length > 0) {
    consumeMailbox(input.db, {
      mailboxId: orchestratorMailboxId,
      consumerId,
      batchSize: queuedEntries.length,
      roomKey: input.room.roomKey,
      now: input.consumedAt
    });
  }

  const resultMessageIdSet = new Set(expectedResultMessageIds);
  const entries = projectMailboxView(input.db, {
    roomKey: input.room.roomKey,
    mailboxId: orchestratorMailboxId
  })
    .filter((entry) => resultMessageIdSet.has(entry.message.messageId))
    .sort(
      (left, right) =>
        expectedResultMessageIds.indexOf(left.message.messageId) -
        expectedResultMessageIds.indexOf(right.message.messageId)
    );
  const currentRevision = getThreadRoom(input.db, input.room.roomKey)?.revision ?? input.room.revision;
  const summaries: WorkerExecutionSummary[] = [];

  for (const entry of entries) {
    if (currentRevision > input.revision || entry.message.roomRevision > input.revision) {
      markVirtualMessageStale(input.db, {
        messageId: entry.message.messageId,
        supersededByRevision: currentRevision,
        staleAt: input.consumedAt
      });
      continue;
    }

    if (entry.delivery.status !== "consumed") {
      consumeMailboxDelivery(input.db, {
        deliveryId: entry.delivery.deliveryId,
        consumerId,
        consumedAt: input.consumedAt
      });
    }

    const target = getSubAgentTargetByMailboxId(input.db, entry.message.fromMailboxId);
    if (!target) {
      continue;
    }

    const artifact = readSubAgentReplyArtifact(entry.message.bodyRef);
    const summary: WorkerExecutionSummary = {
      role: resolveSubAgentWorkerRole(target.resultSchema),
      headline: artifact.normalized.headline,
      summary: artifact.normalized.summary ?? entry.message.subject,
      status: normalizeSubAgentExecutionStatus(artifact.normalized.status),
      blocked: normalizeSubAgentExecutionStatus(artifact.normalized.status) === "blocked",
      keyEvidence: artifact.normalized.keyEvidence,
      risks: artifact.normalized.risks,
      nextStep: artifact.normalized.nextStep,
      facts: artifact.normalized.facts,
      openQuestions: artifact.normalized.openQuestions,
      recommendedAction: artifact.normalized.recommendedAction,
      draftReply: artifact.normalized.draftReply,
      taskMessageId: entry.message.parentMessageId,
      resultMessageId: entry.message.messageId,
      threadId: entry.thread.threadId
    };

    appendThreadLedgerEvent(input.db, {
      roomKey: input.room.roomKey,
      revision: input.revision,
      type: "worker.result",
      payload: {
        role: summary.role,
        headline: summary.headline,
        summary: summary.summary,
        status: summary.status,
        blocked: summary.blocked === true,
        keyEvidence: summary.keyEvidence,
        risks: summary.risks,
        nextStep: summary.nextStep,
        facts: summary.facts,
        openQuestions: summary.openQuestions,
        recommendedAction: summary.recommendedAction,
        draftReply: summary.draftReply,
        taskMessageId: summary.taskMessageId,
        resultMessageId: summary.resultMessageId,
        source: "subagent",
        targetId: target.targetId
      }
    });
    summaries.push(summary);
  }

  return summaries;
}

function staleSupersededMailboxDeliveries(
  db: DatabaseSync,
  input: {
    roomKey: string;
    mailboxId: string;
    currentRevision: number;
    staleAt: string;
  }
) {
  const supersededMessageIds = new Set(
    projectMailboxView(db, {
      roomKey: input.roomKey,
      mailboxId: input.mailboxId
    })
      .filter(
        (entry) =>
          (entry.delivery.status === "queued" || entry.delivery.status === "leased") &&
          entry.message.roomRevision < input.currentRevision
      )
      .map((entry) => entry.message.messageId)
  );

  for (const messageId of supersededMessageIds) {
    markVirtualMessageStale(db, {
      messageId,
      supersededByRevision: input.currentRevision,
      staleAt: input.staleAt
    });
  }
}

function readSubAgentReplyArtifact(bodyRef: string | undefined) {
  const empty = {
    normalized: {
      status: "ok" as const,
      headline: undefined as string | undefined,
      summary: "",
      keyEvidence: [] as string[],
      risks: [] as string[],
      nextStep: undefined as string | undefined,
      facts: [] as WorkerFact[],
      openQuestions: [] as string[],
      recommendedAction: undefined as string | undefined,
      draftReply: undefined as string | undefined
    }
  };
  if (!bodyRef) {
    return empty;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(bodyRef, "utf8")) as {
      normalized?: {
        status?: unknown;
        headline?: unknown;
        summary?: unknown;
        keyEvidence?: unknown;
        risks?: unknown;
        nextStep?: unknown;
        facts?: unknown;
        openQuestions?: unknown;
        recommendedAction?: unknown;
        draftReply?: unknown;
      };
    };
    const normalized = parsed.normalized ?? {};

    return {
      normalized: {
        status:
          typeof normalized.status === "string" && normalized.status.trim().length > 0
            ? normalized.status.trim().toLowerCase()
            : "ok",
        headline: normalizeOptionalString(normalized.headline),
        summary: normalizeOptionalString(normalized.summary) ?? "",
        keyEvidence: normalizeCompactLineList(normalized.keyEvidence),
        risks: normalizeCompactLineList(normalized.risks),
        nextStep: normalizeOptionalString(normalized.nextStep),
        facts: normalizeWorkerFacts(normalized.facts),
        openQuestions: normalizeStringList(normalized.openQuestions),
        recommendedAction: normalizeOptionalString(normalized.recommendedAction),
        draftReply: normalizeOptionalString(normalized.draftReply)
      }
    };
  } catch {
    return empty;
  }
}

function resolveSubAgentWorkerRole(resultSchema: "research" | "reader" | "draft" | "review"): WorkerRole {
  switch (resultSchema) {
    case "reader":
      return "mail-attachment-reader";
    case "draft":
      return "mail-drafter";
    case "review":
      return "mail-reviewer";
    case "research":
    default:
      return "mail-researcher";
  }
}

function normalizeSubAgentExecutionStatus(value: string): WorkerExecutionSummary["status"] {
  if (value === "partial") {
    return "partial";
  }
  if (value === "blocked") {
    return "blocked";
  }
  if (value === "timeout" || value === "error" || value === "stale") {
    return "failed";
  }
  return "ok";
}

function buildAttachmentWorkerInput(
  room: NonNullable<ReturnType<typeof getThreadRoom>>,
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>,
  attachments: ReturnType<typeof listMailAttachmentsForRoom>
) {
  return [
    formatDefaultMailSkills("attachment-reader"),
    "Role: mail-attachment-reader",
    `Subject: ${message.rawSubject ?? message.normalizedSubject}`,
    "",
    formatRoutingContext(room),
    "Task: read the latest attachment evidence for the current reply.",
    formatWorkerOutputContract({
      includeFacts: true,
      includeRecommendedAction: true
    }),
    "Focus on the few facts that will change the reply. Skip boilerplate and do not restate the request.",
    ...attachments.map((attachment) =>
      `- ${attachment.filename}${attachment.summaryText ? `: ${attachment.summaryText}` : ""}`
    )
  ].join("\n");
}

function buildResearchWorkerInput(
  room: NonNullable<ReturnType<typeof getThreadRoom>>,
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>,
  retrievedContext: RoomSearchHit[],
  attachments: ReturnType<typeof listMailAttachmentsForRoom>
) {
  return [
    formatDefaultMailSkills("researcher"),
    "Role: mail-researcher",
    `Subject: ${message.rawSubject ?? message.normalizedSubject}`,
    "",
    formatRoutingContext(room),
    "Task: identify the strongest support, gaps, and reply direction for the current inbound mail.",
    formatWorkerOutputContract({
      includeFacts: true,
      includeRecommendedAction: true
    }),
    "Prefer room facts, retrieved context, and attachments over transcript retelling.",
    formatInboundEmailPacket({
      mode: "read",
      message,
      retrievedContext,
      attachments
    }),
    "Current inbound body:",
    message.textBody ?? "",
    formatRetrievedRoomContext(message, retrievedContext),
    attachments.length > 0
      ? `Attachment inventory:\n${attachments
          .map((attachment) =>
            `- ${attachment.filename}${attachment.summaryText ? `: ${attachment.summaryText}` : ""}`
          )
          .join("\n")}`
      : ""
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function buildSubAgentDelegationInput(input: {
  room: NonNullable<ReturnType<typeof getThreadRoom>>;
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>;
  attachments: ReturnType<typeof listMailAttachmentsForRoom>;
  retrievedContext: RoomSearchHit[];
  targetId: string;
}) {
  return [
    formatDefaultMailSkills(`subagent:${input.targetId}`),
    `Role: subagent:${input.targetId}`,
    `Subject: ${input.message.rawSubject ?? input.message.normalizedSubject}`,
    "",
    formatRoutingContext(input.room),
    "Return internal-only analysis. Never send external email or perform side effects.",
    formatWorkerOutputContract({
      includeFacts: true,
      includeRecommendedAction: true,
      includeDraftReply: true
    }),
    formatInboundEmailPacket({
      mode: "explain",
      message: input.message,
      retrievedContext: input.retrievedContext,
      attachments: input.attachments
    }),
    "Current inbound body:",
    input.message.textBody ?? "(no text body)",
    formatRetrievedRoomContext(input.message, input.retrievedContext),
    input.attachments.length > 0
      ? `Attachment inventory:\n${input.attachments
          .map((attachment) =>
            `- ${attachment.filename}${attachment.summaryText ? `: ${attachment.summaryText}` : ""}`
          )
          .join("\n")}`
      : ""
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function buildDrafterWorkerInput(
  room: NonNullable<ReturnType<typeof getThreadRoom>>,
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>,
  retrievedContext: RoomSearchHit[],
  attachments: ReturnType<typeof listMailAttachmentsForRoom>
) {
  return [
    formatDefaultMailSkills("drafter"),
    "Role: mail-drafter",
    `Subject: ${message.rawSubject ?? message.normalizedSubject}`,
    "",
    formatRoutingContext(room),
    "Task: prepare a concise reply direction the front orchestrator can send or refine quickly.",
    formatWorkerOutputContract({
      includeFacts: true,
      includeRecommendedAction: true,
      includeDraftReply: true
    }),
    formatInboundEmailPacket({
      mode: "write",
      message,
      retrievedContext,
      attachments
    }),
    "Current inbound body:",
    message.textBody ?? "",
    formatRetrievedRoomContext(message, retrievedContext),
    attachments.length > 0
      ? `Attachment inventory:\n${attachments
          .map((attachment) =>
            `- ${attachment.filename}${attachment.summaryText ? `: ${attachment.summaryText}` : ""}`
          )
          .join("\n")}`
      : ""
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function buildReviewerWorkerInput(
  room: NonNullable<ReturnType<typeof getThreadRoom>>,
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>,
  responseText: string,
  workerSummaries: WorkerExecutionSummary[]
) {
  return [
    formatDefaultMailSkills("reviewer"),
    "Role: mail-reviewer",
    `Subject: ${message.rawSubject ?? message.normalizedSubject}`,
    "",
    formatRoutingContext(room),
    "Task: review the draft reply for factual gaps, ambiguity, tone, and policy issues.",
    formatWorkerOutputContract({
      includeFacts: true,
      includeRecommendedAction: true
    }),
    formatInboundEmailPacket({
      mode: "explain",
      message
    }),
    "Draft reply:",
    responseText,
    formatWorkerContext(workerSummaries)
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function buildGuardWorkerInput(
  room: NonNullable<ReturnType<typeof getThreadRoom>>,
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>,
  responseText: string,
  workerSummaries: WorkerExecutionSummary[]
) {
  return [
    formatDefaultMailSkills("guard"),
    "Role: mail-guard",
    `Subject: ${message.rawSubject ?? message.normalizedSubject}`,
    "",
    formatRoutingContext(room),
    "Task: decide whether the draft may be sent automatically.",
    formatWorkerOutputContract({
      includeFacts: true,
      includeRecommendedAction: true,
      includeApprovalFields: true
    }),
    formatInboundEmailPacket({
      mode: "explain",
      message
    }),
    "Draft reply:",
    responseText,
    formatWorkerContext(workerSummaries)
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function formatDefaultMailSkills(actorLabel: string) {
  return [
    `Default mail skills for ${actorLabel}:`,
    "- Read Email: read the newest inbound first; only pull older room context by reference when it changes the answer; ignore decorative transcript noise.",
    "- Email Schema: start from the inbound email packet; preserve asks, deadlines, decisions, commitments, stakeholders, evidence, and explain briefly why retained items matter.",
    "- Compress for humans: produce one headline, up to 3 key evidence bullets, up to 2 risks or pending checks, and one concrete next step.",
    "- Read Attachments: decode text-like attachments into plain-language facts; never leak base64, hashes, or raw transport wrappers into the mail body.",
    "- Write Email: spend words on decisions, evidence, risk, and next action; avoid rephrasing the whole request; keep every claim tied to facts, artifacts, or approved room memory.",
    "- Safety: never expose hidden recipients, governance-only notes, internal routing, or secrets."
  ].join("\n");
}

function formatWorkerOutputContract(input: {
  includeFacts?: boolean;
  includeRecommendedAction?: boolean;
  includeDraftReply?: boolean;
  includeApprovalFields?: boolean;
}) {
  const optionalLines = [
    input.includeFacts ? '- "facts": [{"claim":"...", "key":"...", "evidenceRef":"..."}]' : "",
    input.includeRecommendedAction ? '- "recommendedAction": "..."' : "",
    input.includeDraftReply ? '- "draftReply": "..."' : "",
    input.includeApprovalFields ? '- "approvalRequired": true|false' : "",
    input.includeApprovalFields ? '- "blocked": true|false' : ""
  ].filter((line) => line.length > 0);

  return [
    "Return JSON only. Keep fields compact and omit empty fields.",
    "{",
    '  "headline": "one-line result",',
    '  "summary": "2-3 short sentences for the human reader",',
    '  "status": "ok|partial|blocked|failed",',
    '  "keyEvidence": ["up to 3 concrete evidence bullets"],',
    '  "risks": ["up to 2 risks or pending confirmations"],',
    '  "nextStep": "single next action"',
    "}",
    ...optionalLines
  ].join("\n");
}

function formatWorkerContext(workerSummaries: WorkerExecutionSummary[]) {
  if (workerSummaries.length === 0) {
    return "";
  }

  const lines = ["Worker summaries:"];

  for (const summary of workerSummaries) {
    lines.push(`- ${summary.role}: ${summary.headline ?? summary.summary}`);
    if (summary.keyEvidence.length > 0) {
      lines.push(`  evidence: ${summary.keyEvidence.join(" | ")}`);
    }
    if (summary.risks.length > 0) {
      lines.push(`  risks: ${summary.risks.join(" | ")}`);
    }
    if (summary.nextStep) {
      lines.push(`  next step: ${summary.nextStep}`);
    }
  }

  const draftReplies = workerSummaries.filter((summary) => summary.draftReply);
  if (draftReplies.length > 0) {
    lines.push(
      "",
      "Worker draft replies:",
      ...draftReplies.map(
        (summary) => `- ${summary.role}: ${summary.draftReply ?? ""}`
      )
    );
  }

  return lines.join("\n");
}

function formatRoutingContext(room: NonNullable<ReturnType<typeof getThreadRoom>>) {
  const frontAgentIdentity = room.frontAgentId ?? room.frontAgentAddress;
  const visibleCollaboratorAgents: string[] =
    (room.collaboratorAgentIds?.length ?? 0) > 0
      ? [...(room.collaboratorAgentIds ?? [])]
      : [...(room.collaboratorAgentAddresses ?? [])];
  const lines = [
    room.frontAgentId ? `- Front agent: ${room.frontAgentId}` : "",
    frontAgentIdentity ? `- Front agent identity: ${frontAgentIdentity}` : "",
    room.frontAgentAddress ? `- Front mailbox identity: ${room.frontAgentAddress}` : "",
    (room.publicAgentIds?.length ?? 0) > 0
      ? `- Public agents: ${room.publicAgentIds?.join(", ")}`
      : "",
    (room.publicAgentAddresses?.length ?? 0) > 0
      ? `- Public agent identities: ${room.publicAgentAddresses?.join(", ")}`
      : "",
    visibleCollaboratorAgents.length > 0
      ? `- Visible collaborator agents: ${visibleCollaboratorAgents.join(", ")}`
      : "",
    (room.collaboratorAgentAddresses?.length ?? 0) > 0
      ? `- Collaborator mailbox identities: ${room.collaboratorAgentAddresses?.join(", ")}`
      : "",
    (room.summonedRoles?.length ?? 0) > 0
      ? `- Explicitly summoned worker roles: ${room.summonedRoles?.join(", ")}`
      : ""
  ].filter((line) => line.length > 0);

  if (lines.length === 0) {
    return "";
  }

  return ["Routing context:", ...lines].join("\n");
}

function formatInboundEmailPacket(input: {
  mode: "read" | "write" | "explain";
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>;
  retrievedContext?: RoomSearchHit[];
  attachments?: ReturnType<typeof listMailAttachmentsForRoom>;
  preSnapshot?: ReturnType<typeof getLatestRoomPreSnapshot>;
}) {
  return formatEmailSemanticPacket(
    buildEmailSemanticPacket({
      mode: input.mode,
      from: input.message.from,
      to: input.message.to,
      cc: input.message.cc,
      replyTo: input.message.replyTo,
      subject: input.message.rawSubject ?? input.message.normalizedSubject,
      body: input.message.textBody ?? "",
      attachments: (input.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        summaryText: attachment.summaryText
      })),
      preSnapshot: input.preSnapshot
        ? {
            summary: input.preSnapshot.summary,
            decisions: input.preSnapshot.decisions,
            openQuestions: input.preSnapshot.openQuestions,
            requestedActions: input.preSnapshot.requestedActions,
            commitments: input.preSnapshot.commitments
          }
        : null
    })
  );
}

function formatSharedFactsContext(sharedFacts: RoomSharedFactsArtifact | null | undefined) {
  if (!sharedFacts) {
    return "";
  }

  const lines: string[] = [];

  if (sharedFacts.facts.length > 0) {
    lines.push(
      "Shared facts:",
      ...sharedFacts.facts.map((fact) => `- ${fact.key}: ${fact.claim}`)
    );
  }

  const acknowledgedConflicts = sharedFacts.conflicts.filter(
    (conflict) => (conflict.acknowledgements?.length ?? 0) > 0
  );
  if (acknowledgedConflicts.length > 0) {
    lines.push(
      "Acknowledged shared-facts conflicts:",
      ...acknowledgedConflicts.flatMap((conflict) => [
        `- ${conflict.key}: ${conflict.claims.map((claim) => `${claim.role} says "${claim.claim}"`).join("; ")}`,
        ...(conflict.acknowledgements ?? []).map(
          (acknowledgement) =>
            `  acknowledgement ${acknowledgement.acknowledgedAt}: ${acknowledgement.note}`
        )
      ])
    );
  }

  const openConflicts = sharedFacts.conflicts.filter(
    (conflict) => (conflict.acknowledgements?.length ?? 0) === 0
  );
  if (openConflicts.length > 0) {
    lines.push(
      "Open shared-facts conflicts:",
      ...openConflicts.map(
        (conflict) =>
          `- ${conflict.key}: ${conflict.claims.map((claim) => `${claim.role} says "${claim.claim}"`).join("; ")}`
      )
    );
  }

  if (sharedFacts.openQuestions.length > 0) {
    lines.push("Open questions:", ...sharedFacts.openQuestions.map((question) => `- ${question}`));
  }

  return lines.join("\n");
}

function formatRoomPreContext(preSnapshot: ReturnType<typeof getLatestRoomPreSnapshot>) {
  if (!preSnapshot) {
    return "";
  }

  const lines = [
    `Latest room pre snapshot: kind=${preSnapshot.kind} audience=${preSnapshot.audience} revision=${preSnapshot.roomRevision}`,
    `Summary: ${preSnapshot.summary}`
  ];

  if (preSnapshot.facts.length > 0) {
    lines.push("Facts:", ...preSnapshot.facts.map((fact) => `- ${fact.claim}`));
  }

  if (preSnapshot.openQuestions.length > 0) {
    lines.push("Open questions:", ...preSnapshot.openQuestions.map((question) => `- ${question}`));
  }

  if (preSnapshot.decisions.length > 0) {
    lines.push("Decisions:", ...preSnapshot.decisions.map((decision) => `- ${decision}`));
  }

  if (preSnapshot.commitments.length > 0) {
    lines.push(
      "Commitments:",
      ...preSnapshot.commitments.map((commitment) =>
        `- ${commitment.owner}: ${commitment.action}${commitment.dueAt ? ` (due ${commitment.dueAt})` : ""}`
      )
    );
  }

  return lines.join("\n");
}

function persistWorkerSharedFacts(input: {
  db: DatabaseSync;
  config: AppConfig;
  room: NonNullable<ReturnType<typeof getThreadRoom>>;
  revision: number;
  message: NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>;
  attachments: ReturnType<typeof listMailAttachmentsForRoom>;
  workerSummaries: WorkerExecutionSummary[];
}) {
  if (input.workerSummaries.length === 0) {
    return undefined;
  }

  const latestRoom = getThreadRoom(input.db, input.room.roomKey);
  if ((latestRoom?.revision ?? input.room.revision) > input.revision) {
    for (const workerSummary of input.workerSummaries) {
      appendThreadLedgerEvent(input.db, {
        roomKey: input.room.roomKey,
        revision: input.revision,
        type: "room.shared_facts_updated",
        payload: {
          role: workerSummary.role,
          stale: true,
          supersededByRevision: latestRoom?.revision
        }
      });
    }

    return latestRoom?.sharedFactsRef;
  }

  const existingFacts = readRoomSharedFactsArtifact(latestRoom?.sharedFactsRef);
  const mergedFacts = buildRoomSharedFacts({
    roomKey: input.room.roomKey,
    message: input.message,
    attachments: input.attachments,
    existingFacts,
    workerSummaries: input.workerSummaries
  });

  const sharedFactsRef = persistRoomFactsArtifact(input.config, {
    accountId: input.room.accountId,
    stableThreadId: input.room.stableThreadId,
    snapshotId: buildSharedFactsSnapshotId(input.revision, input.workerSummaries),
    payload: mergedFacts
  });

  for (const workerSummary of input.workerSummaries) {
    appendThreadLedgerEvent(input.db, {
      roomKey: input.room.roomKey,
      revision: input.revision,
      type: "room.shared_facts_updated",
      payload: {
        role: workerSummary.role,
        sharedFactsRef,
        factCount: mergedFacts.facts.length,
        conflictCount: mergedFacts.conflicts.length,
        openQuestionCount: mergedFacts.openQuestions.length
      }
    });
  }

  saveThreadRoom(input.db, {
    ...(getThreadRoom(input.db, input.room.roomKey) ?? input.room),
    sharedFactsRef
  });

  return sharedFactsRef;
}

function parseWorkerSummary(responseText: string): ParsedWorkerSummary {
  try {
    const parsed = JSON.parse(responseText) as {
      headline?: unknown;
      decision?: unknown;
      summary?: unknown;
      status?: unknown;
      approvalRequired?: unknown;
      blocked?: unknown;
      key_evidence?: unknown;
      keyEvidence?: unknown;
      risks?: unknown;
      next_step?: unknown;
      nextStep?: unknown;
      facts?: unknown;
      open_questions?: unknown;
      openQuestions?: unknown;
      recommended_action?: unknown;
      recommendedAction?: unknown;
      draft_reply?: unknown;
      draftReply?: unknown;
    };
    const headline = normalizeOptionalString(parsed.headline ?? parsed.decision);
    const facts = normalizeWorkerFacts(parsed.facts);
    const openQuestions = normalizeStringList(parsed.open_questions ?? parsed.openQuestions);
    const recommendedAction = normalizeOptionalString(parsed.recommended_action ?? parsed.recommendedAction);
    const keyEvidence = normalizeCompactLineList(parsed.key_evidence ?? parsed.keyEvidence);
    const risks = normalizeCompactLineList(parsed.risks);
    const nextStep = normalizeOptionalString(parsed.next_step ?? parsed.nextStep) ?? recommendedAction;

    return {
      headline,
      summary:
        typeof parsed.summary === "string" && parsed.summary.trim().length > 0
          ? parsed.summary
          : headline ?? responseText,
      status: normalizeWorkerStatus(parsed.status, parsed.blocked),
      approvalRequired: parsed.approvalRequired === true,
      blocked: parsed.blocked === true,
      keyEvidence: keyEvidence.length > 0 ? keyEvidence : facts.map((fact) => fact.claim).slice(0, 3),
      risks: risks.length > 0 ? risks : openQuestions.slice(0, 2),
      nextStep,
      facts,
      openQuestions,
      recommendedAction,
      draftReply: normalizeOptionalString(parsed.draft_reply ?? parsed.draftReply)
    };
  } catch {
    const normalized = responseText.toLowerCase();
    const approvalRequired =
      normalized.includes("approval required") ||
      normalized.includes("pending approval") ||
      normalized.includes("needs approval");
    const blocked =
      normalized.includes("blocked") ||
      normalized.includes("reject") ||
      normalized.includes("denied");

    return {
      headline: summarizeHeadline(responseText),
      summary: responseText,
      status: blocked ? "blocked" : "ok",
      approvalRequired,
      blocked,
      keyEvidence: [],
      risks: [],
      nextStep: undefined,
      facts: [],
      openQuestions: [],
      recommendedAction: undefined,
      draftReply: undefined
    };
  }
}

function indexWorkerResultPayloads(
  db: DatabaseSync,
  roomKey: string,
  revision: number
) {
  const results = new Map<string, WorkerResultLedgerPayload>();

  for (const event of listThreadLedgerEvents(db, roomKey)) {
    if (event.type !== "worker.result" || event.revision !== revision) {
      continue;
    }

    const payload = event.payload as WorkerResultLedgerPayload;
    if (typeof payload.resultMessageId !== "string" || payload.resultMessageId.trim().length === 0) {
      continue;
    }

    results.set(payload.resultMessageId, payload);
  }

  return results;
}

function buildWorkerExecutionSummary(
  entry: VirtualMailboxViewEntry,
  payload: WorkerResultLedgerPayload
): WorkerExecutionSummary {
  const role = coerceWorkerRole(payload.role);
  if (!role) {
    throw new Error(`worker.result payload is missing a valid role for ${entry.message.messageId}`);
  }

  return {
    role,
    headline: normalizeOptionalString(payload.headline),
    summary:
      typeof payload.summary === "string" && payload.summary.trim().length > 0
        ? payload.summary
        : entry.message.subject,
    status: normalizeWorkerExecutionStatus(payload.status),
    approvalRequired: payload.approvalRequired === true,
    blocked: payload.blocked === true,
    keyEvidence: (() => {
      const keyEvidence = normalizeCompactLineList(payload.keyEvidence);
      const facts = normalizeWorkerFacts(payload.facts);
      return keyEvidence.length > 0 ? keyEvidence : facts.map((fact) => fact.claim).slice(0, 3);
    })(),
    risks: (() => {
      const risks = normalizeCompactLineList(payload.risks);
      const openQuestions = normalizeStringList(payload.openQuestions);
      return risks.length > 0 ? risks : openQuestions.slice(0, 2);
    })(),
    nextStep: normalizeOptionalString(payload.nextStep) ?? normalizeOptionalString(payload.recommendedAction),
    facts: normalizeWorkerFacts(payload.facts),
    openQuestions: normalizeStringList(payload.openQuestions),
    recommendedAction: normalizeOptionalString(payload.recommendedAction),
    draftReply: normalizeOptionalString(payload.draftReply),
    taskMessageId:
      typeof payload.taskMessageId === "string" && payload.taskMessageId.trim().length > 0
        ? payload.taskMessageId
        : entry.message.parentMessageId,
    resultMessageId: entry.message.messageId,
    threadId: entry.thread.threadId
  };
}

function coerceWorkerRole(value: unknown): WorkerRole | null {
  return typeof value === "string" && workerRolesSet.has(value as WorkerRole)
    ? (value as WorkerRole)
    : null;
}

function normalizeWorkerExecutionStatus(
  value: unknown
): WorkerExecutionSummary["status"] {
  switch (value) {
    case "ok":
    case "partial":
    case "blocked":
    case "failed":
      return value;
    default:
      return "ok";
  }
}

const workerRolesSet = new Set<WorkerRole>([
  "mail-orchestrator",
  "mail-attachment-reader",
  "mail-researcher",
  "mail-drafter",
  "mail-reviewer",
  "mail-guard"
]);

function readRoomSharedFactsArtifact(sharedFactsRef?: string) {
  return readSharedFactsState({
    sharedFactsRef
  });
}

function mergeWorkerFacts(
  existingFacts: RoomSharedFactsArtifact | null | undefined,
  workerSummaries: WorkerExecutionSummary[]
) {
  const factCandidates = new Map<
    string,
    Map<
      string,
      {
        claim: string;
        roles: Set<string>;
        evidenceRefs: Set<string>;
      }
    >
  >();
  const openQuestions = new Map<string, string>();
  const recommendedActions = new Map<string, { role: string; action: string }>();
  const acknowledgedConflicts = new Map<
    string,
    NonNullable<RoomSharedFactConflict["acknowledgements"]>
  >();

  for (const fact of existingFacts?.facts ?? []) {
    addFactCandidate(factCandidates, {
      key: fact.key,
      claim: fact.claim,
      roles: fact.roles.length > 0 ? fact.roles : ["room"],
      evidenceRefs: fact.evidenceRefs
    });
  }

  for (const conflict of existingFacts?.conflicts ?? []) {
    if ((conflict.acknowledgements?.length ?? 0) > 0) {
      acknowledgedConflicts.set(conflict.key, conflict.acknowledgements ?? []);
    }

    for (const claim of conflict.claims) {
      addFactCandidate(factCandidates, {
        key: conflict.key,
        claim: claim.claim,
        roles: [claim.role],
        evidenceRefs: claim.evidenceRef ? [claim.evidenceRef] : []
      });
    }
  }

  for (const question of existingFacts?.openQuestions ?? []) {
    const normalizedQuestion = normalizeComparableText(question);
    if (normalizedQuestion.length > 0) {
      openQuestions.set(normalizedQuestion, question.trim());
    }
  }

  for (const action of existingFacts?.recommendedActions ?? []) {
    const actionKey = `${action.role}:${normalizeComparableText(action.action)}`;
    recommendedActions.set(actionKey, action);
  }

  for (const workerSummary of workerSummaries) {
    for (const fact of workerSummary.facts) {
      addFactCandidate(factCandidates, {
        key: fact.key,
        claim: fact.claim,
        roles: [workerSummary.role],
        evidenceRefs: fact.evidenceRef ? [fact.evidenceRef] : []
      });
    }

    for (const question of workerSummary.openQuestions) {
      const normalizedQuestion = normalizeComparableText(question);
      if (normalizedQuestion.length > 0) {
        openQuestions.set(normalizedQuestion, question.trim());
      }
    }

    if (workerSummary.recommendedAction) {
      const actionKey = `${workerSummary.role}:${normalizeComparableText(workerSummary.recommendedAction)}`;
      recommendedActions.set(actionKey, {
        role: workerSummary.role,
        action: workerSummary.recommendedAction
      });
    }
  }

  const facts: RoomSharedFactRecord[] = [];
  const conflicts: RoomSharedFactConflict[] = [];

  for (const [key, claims] of factCandidates.entries()) {
    const mergedClaims = Array.from(claims.values()).map((entry) => ({
      claim: entry.claim,
      roles: Array.from(entry.roles).sort(),
      evidenceRefs: Array.from(entry.evidenceRefs).sort()
    }));

    if (mergedClaims.length === 1) {
      const merged = mergedClaims[0];
      facts.push({
        key,
        claim: merged.claim,
        roles: merged.roles,
        evidenceRefs: merged.evidenceRefs
      });
      continue;
    }

    conflicts.push({
      key,
      status: (acknowledgedConflicts.get(key)?.length ?? 0) > 0 ? "acknowledged" : "open",
      acknowledgements: acknowledgedConflicts.get(key) ?? [],
      claims: mergedClaims
        .flatMap((entry) =>
          entry.roles.map((role) => ({
            claim: entry.claim,
            role,
            evidenceRef: entry.evidenceRefs[0]
          }))
        )
        .sort((left, right) => left.role.localeCompare(right.role) || left.claim.localeCompare(right.claim))
    });
  }

  facts.sort((left, right) => left.key.localeCompare(right.key));
  conflicts.sort((left, right) => left.key.localeCompare(right.key));

  return {
    facts,
    conflicts,
    openQuestions: Array.from(openQuestions.values()),
    recommendedActions: Array.from(recommendedActions.values()).sort((left, right) =>
      left.role.localeCompare(right.role) || left.action.localeCompare(right.action)
    )
  };
}

function addFactCandidate(
  factCandidates: Map<
    string,
    Map<
      string,
      {
        claim: string;
        roles: Set<string>;
        evidenceRefs: Set<string>;
      }
    >
  >,
  input: {
    key?: string;
    claim: string;
    roles: string[];
    evidenceRefs: string[];
  }
) {
  const normalizedClaim = normalizeComparableText(input.claim);
  if (normalizedClaim.length === 0) {
    return;
  }

  const factKey = normalizeFactKey(input.key, input.claim);
  let claims = factCandidates.get(factKey);
  if (!claims) {
    claims = new Map();
    factCandidates.set(factKey, claims);
  }

  const existing = claims.get(normalizedClaim);
  if (existing) {
    for (const role of input.roles) {
      existing.roles.add(role);
    }
    for (const evidenceRef of input.evidenceRefs) {
      if (evidenceRef.trim().length > 0) {
        existing.evidenceRefs.add(evidenceRef.trim());
      }
    }
    return;
  }

  claims.set(normalizedClaim, {
    claim: input.claim.trim(),
    roles: new Set(input.roles),
    evidenceRefs: new Set(input.evidenceRefs.map((evidenceRef) => evidenceRef.trim()).filter(Boolean))
  });
}

function normalizeWorkerFacts(value: unknown): WorkerFact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const claim = normalizeOptionalString((entry as { claim?: unknown }).claim);
    if (!claim) {
      return [];
    }

    return [
      {
        key: normalizeOptionalString((entry as { key?: unknown }).key),
        claim,
        evidenceRef: normalizeOptionalString((entry as { evidenceRef?: unknown }).evidenceRef)
      }
    ];
  });
}

function normalizeCompactLineList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Map<string, string>();
  for (const entry of value) {
    const raw =
      typeof entry === "string"
        ? entry
        : typeof entry === "object" && entry
          ? normalizeOptionalString(
              (entry as { claim?: unknown; text?: unknown; summary?: unknown }).claim ??
                (entry as { text?: unknown }).text ??
                (entry as { summary?: unknown }).summary
            )
          : undefined;
    if (!raw) {
      continue;
    }

    const normalized = normalizeComparableText(raw);
    if (normalized.length > 0) {
      deduped.set(normalized, raw);
    }
  }

  return Array.from(deduped.values());
}

function normalizeWorkerStatus(
  status: unknown,
  blocked: unknown
): WorkerExecutionSummary["status"] {
  if (blocked === true) {
    return "blocked" as const;
  }

  if (typeof status !== "string") {
    return "ok" as const;
  }

  const normalized = status.trim().toLowerCase();
  if (
    normalized === "ok" ||
    normalized === "partial" ||
    normalized === "blocked" ||
    normalized === "failed"
  ) {
    return normalized;
  }

  return "ok" as const;
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Map<string, string>();
  for (const entry of value) {
    if (typeof entry !== "string") {
      continue;
    }

    const normalized = normalizeComparableText(entry);
    if (normalized.length > 0) {
      deduped.set(normalized, entry.trim());
    }
  }

  return Array.from(deduped.values());
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function summarizeHeadline(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }

  const firstSentence = normalized.match(/^(.+?[.!?。！？])(?:\s|$)/)?.[1]?.trim() ?? normalized;
  return firstSentence.length <= 72 ? firstSentence : `${firstSentence.slice(0, 69).trim()}...`;
}

function normalizeComparableText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeFactKey(key: string | undefined, claim: string) {
  const base = key && key.trim().length > 0 ? key : claim;
  return base
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "fact";
}

function buildSharedFactsSnapshotId(
  revision: number,
  workerSummaries: WorkerExecutionSummary[]
) {
  const suffix = workerSummaries
    .map((summary) => summary.role)
    .sort()
    .join("__")
    .replace(/[^a-z0-9_-]+/gi, "-");

  return suffix.length > 0 ? `r${revision}-workers-${suffix}` : `r${revision}-workers`;
}

function buildOutboxReplies(input: {
  roomKey: string;
  revision: number;
  runId: string;
  message: NonNullable<ReturnType<typeof findLatestMailMessageForThread>> | NonNullable<
    ReturnType<typeof findMailMessageByDedupeKey>
  >;
  mailboxAddress: string;
  ackNeeded: boolean;
  progressNeeded: boolean;
  finalBody: string;
  createdAt: string;
  approvalGate: boolean;
}) {
  const recipients = buildReplyRecipients(input.message, input.mailboxAddress);
  if (recipients.to.length === 0 && recipients.cc.length === 0) {
    return [];
  }

  const thread = {
    subject: input.message.rawSubject ?? input.message.normalizedSubject,
    from: input.mailboxAddress,
    to: recipients.to,
    cc: recipients.cc,
    inReplyTo: input.message.internetMessageId,
    references: [...input.message.references, input.message.internetMessageId]
  };

  const status = input.approvalGate ? "pending_approval" : "queued";
  const records: MailOutboxRecord[] = [];

  if (input.ackNeeded) {
    const ackBody = "Received. Processing is still in progress.";
    const ack = renderPreToMail(
      {
        ...thread,
        messageId: `<mailclaws-${randomUUID()}@local>`
      },
      {
        kind: "ack",
        summary: ackBody,
        draftBody: ackBody,
        roomRevision: input.revision,
        inputsHash: createHash("sha256").update(ackBody).digest("hex"),
        createdBy: {
          mailboxId: `public:${encodeURIComponent(input.mailboxAddress)}`
        }
      }
    );
    records.push({
      outboxId: randomUUID(),
      roomKey: input.roomKey,
      runId: input.runId,
      kind: "ack",
      status,
      subject: ack.headers.Subject,
      textBody: ack.body,
      to: recipients.to,
      cc: recipients.cc,
      bcc: [],
      headers: ack.headers,
      createdAt: input.createdAt,
      updatedAt: input.createdAt
    });
  }

  if (input.progressNeeded) {
    const progressBody = "Processing is still underway. A complete reply will follow in this thread.";
    const progress = renderPreToMail(
      {
        ...thread,
        messageId: `<mailclaws-${randomUUID()}@local>`
      },
      {
        kind: "progress",
        summary: progressBody,
        draftBody: progressBody,
        roomRevision: input.revision,
        inputsHash: createHash("sha256").update(progressBody).digest("hex"),
        createdBy: {
          mailboxId: `public:${encodeURIComponent(input.mailboxAddress)}`
        }
      }
    );
    records.push({
      outboxId: randomUUID(),
      roomKey: input.roomKey,
      runId: input.runId,
      kind: "progress",
      status,
      subject: progress.headers.Subject,
      textBody: progress.body,
      to: recipients.to,
      cc: recipients.cc,
      bcc: [],
      headers: progress.headers,
      createdAt: input.createdAt,
      updatedAt: input.createdAt
    });
  }

  const final = renderPreToMail(
    {
      ...thread,
      messageId: `<mailclaws-${randomUUID()}@local>`
    },
    {
      kind: "final",
      summary: input.finalBody,
      draftBody: input.finalBody,
      roomRevision: input.revision,
      inputsHash: createHash("sha256").update(input.finalBody).digest("hex"),
      createdBy: {
        mailboxId: `public:${encodeURIComponent(input.mailboxAddress)}`
      }
    }
  );
  records.push({
    outboxId: randomUUID(),
    roomKey: input.roomKey,
    runId: input.runId,
    kind: "final",
    status,
    subject: final.headers.Subject,
    textBody: final.body,
    to: recipients.to,
    cc: recipients.cc,
    bcc: [],
    headers: final.headers,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  });

  return records;
}

function buildReplyRecipients(
  message:
    | NonNullable<ReturnType<typeof findLatestMailMessageForThread>>
    | NonNullable<ReturnType<typeof findMailMessageByDedupeKey>>,
  mailboxAddress: string
) {
  const to = uniqueRecipients(
    (message.replyTo ?? []).length > 0 ? message.replyTo ?? [] : message.from ? [message.from] : []
  ).filter((recipient) => {
    const filtered = filterInternalAliasRecipients([recipient], mailboxAddress);
    return filtered.length > 0;
  });
  const toSet = new Set(to.map((recipient) => normalizeRecipient(recipient)));
  const cc = filterInternalAliasRecipients(
    uniqueRecipients([
      ...(message.from ? [message.from] : []),
      ...(message.to ?? []),
      ...(message.cc ?? [])
    ]),
    mailboxAddress
  ).filter((recipient) => {
    const normalized = normalizeRecipient(recipient);
    return normalized.length > 0 && !toSet.has(normalized);
  });

  return {
    to,
    cc
  };
}

function uniqueRecipients(values: string[]) {
  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const value of values) {
    const normalized = normalizeRecipient(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    recipients.push(normalized);
  }

  return recipients;
}

function mergeOrderedRecipientLists(...groups: string[][]) {
  return uniqueRecipients(groups.flat());
}

function mergeOrderedWorkerRoles(...groups: WorkerRole[][]) {
  const roles: WorkerRole[] = [];
  const seen = new Set<WorkerRole>();

  for (const group of groups) {
    for (const role of group) {
      if (seen.has(role)) {
        continue;
      }

      seen.add(role);
      roles.push(role);
    }
  }

  return roles;
}

function resolveExecutionProjection(input: {
  requestUrl: string;
  sessionKey: string;
  frontAgentId?: string;
  sourceMessageId: string;
}) {
  const controlPlane = inferExecutionControlPlane(input.requestUrl);
  const originKind = controlPlane === "openclaw" ? "gateway_chat" : "virtual_internal";

  return {
    originKind,
    projectionMetadata: {
      origin: {
        kind: originKind,
        controlPlane,
        sessionKey: input.sessionKey,
        ...(input.frontAgentId ? { frontAgentId: input.frontAgentId } : {}),
        sourceMessageId: input.sourceMessageId
      }
    }
  } satisfies Pick<VirtualMessage, "originKind" | "projectionMetadata">;
}

function inferExecutionControlPlane(requestUrl: string) {
  if (requestUrl.startsWith("embedded://")) {
    return "embedded";
  }

  if (requestUrl.startsWith("command://")) {
    return "command";
  }

  try {
    const url = new URL(requestUrl);
    if (url.pathname.endsWith("/v1/responses")) {
      return "openclaw";
    }
  } catch {
    return "unknown";
  }

  return "unknown";
}

function resolveRuntimeControlPlane(config: AppConfig) {
  if (config.runtime.mode === "embedded") {
    return "embedded";
  }
  if (config.runtime.mode === "command") {
    return "command";
  }

  return "openclaw";
}

function normalizeRecipient(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function readNormalizedAgentId(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function readNormalizedAgentIdList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return uniqueRecipients(
    value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0)
  );
}

function looksLikeDurableAgentId(value?: string) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && !normalized.includes("@");
}
