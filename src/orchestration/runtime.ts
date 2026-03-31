import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import type { AppConfig } from "../config.js";
import { recoverRoomQueue } from "../core/recovery.js";
import { replayRoom } from "../core/replay.js";
import { redactSensitiveText, redactSensitiveValue } from "../security/redaction.js";
import {
  bindGatewaySessionToRoom,
  markGatewayOutcomeDispatchFailed,
  markGatewayOutcomeDispatched,
  maybeAutoProjectRoomOutcomeToGateway,
  projectGatewayTurnToVirtualMail,
  projectRoomOutcomeToGateway,
  resolveGatewayTurnRoom
} from "../gateway/projection-adapter.js";
import { importGatewayThreadHistory } from "../gateway/thread-history.js";
import {
  consumeMailbox,
  projectMailboxFeed,
  projectMailboxView,
  rebuildVirtualMailProjectionFromLedger,
  replyVirtualMessage,
  submitVirtualMessage,
  upsertVirtualMailbox
} from "../core/virtual-mail.js";
import {
  cancelRoomJob,
  enqueueRoomJob,
  getRoomQueueJob,
  listRoomQueueJobs,
  retryFailedRoomJob
} from "../queue/thread-queue.js";
import {
  createAccountSmtpSender,
  createConfiguredSmtpSender,
  type SmtpSender,
  type SmtpTransportFactory
} from "../providers/smtp.js";
import {
  hasConfiguredImapSettings,
  type ImapClientConfig,
  type ImapClientLike
} from "../providers/imap.js";
import { parseRawMimeEnvelope } from "../providers/rfc822.js";
import {
  startGmailWatcher,
  startImapPoller,
  type GmailWatchBatch,
  type GmailWatchNotification,
  type ImapPollBatch,
  type WatcherController
} from "../providers/watcher.js";
import {
  createConfiguredGmailSender,
  mapGmailMessageToEnvelope,
  hasConfiguredGmailSettings,
  parseGmailPubsubNotification,
  type GmailApiClientLike,
  type GmailMessage,
  type GmailPubsubNotification,
  type GmailPubsubPushEnvelope
} from "../providers/gmail.js";
import {
  createCommandMailIoPlane,
  createLocalMailIoPlane,
  resolveDefaultSmtpTransportConfig,
  resolveLocalDeliverySender,
  type GmailSendClientLike,
  type MailIoPlane
} from "../providers/mail-io-plane.js";
import type { LocalCommandRunner } from "../runtime/local-command-executor.js";
import {
  buildGmailOAuthAuthorizeUrl,
  createGmailOAuthClient,
  type GmailOAuthClientLike,
  type GmailOAuthProfile
} from "../auth/gmail-oauth.js";
import {
  buildMicrosoftOAuthAuthorizeUrl,
  buildMicrosoftTokenEndpoint,
  createMicrosoftOAuthClient,
  type MicrosoftOAuthClientLike,
  type MicrosoftOAuthProfile
} from "../auth/microsoft-oauth.js";
import {
  createOAuthState,
  createPkceCodeChallenge,
  createPkceCodeVerifier
} from "../auth/oauth-core.js";
import {
  buildConnectOnboardingPlan,
  listConnectProviderGuides,
  resolveOAuthProvider
} from "../auth/oauth-providers.js";
import {
  buildAgentDirectoryEntry,
  buildAgentVirtualMailboxes,
  getAgentTemplate,
  listAgentTemplateDefinitions,
  listAgentTemplates as listConfiguredAgentTemplates,
  recommendAgentHeadcount
} from "../agents/templates.js";
import {
  approveAgentMemoryDraft,
  createAgentMemoryDraftFromLatestRoomSnapshot,
  ensureAgentWorkspace,
  findAgentMemoryDraft,
  getAgentWorkspaceSkill,
  getTenantStateDir,
  installAgentWorkspaceSkill,
  listAgentMemoryDrafts,
  listAgentWorkspaceSkills,
  rejectAgentMemoryDraft,
  resolveAgentMemoryDraftNamespaces,
  reviewAgentMemoryDraft
} from "../memory/agent-memory.js";
import {
  consoleBoundaries,
  consoleTerminology,
  getConsoleAccount as getConsoleAccountView,
  getConsoleRoom as getConsoleRoomView,
  listConsoleAccounts as listConsoleAccountsView,
  listConsoleApprovals as listConsoleApprovalsView,
  listConsoleRooms as listConsoleRoomsView
} from "../presentation/console.js";
import { summarizeAccountProviderState } from "../presentation/provider-state.js";
import {
  assertMemoryManagementAllowed,
  getMemoryNamespaceCapabilities,
  type MemoryNamespaceActor,
  type MemoryNamespaceSpec
} from "../memory/namespace-spec.js";
import { readMemoryNamespace as readScopedMemoryNamespace } from "../memory/namespaces.js";
import type { MailAgentExecutor } from "../runtime/agent-executor.js";
import { createDefaultMailAgentExecutor } from "../runtime/default-executor.js";
import {
  listBridgeRuntimeSessions,
  describeRuntimeExecutionBoundary,
  listEmbeddedRuntimeSessions
} from "../runtime/runtime-observability.js";
import type {
  EmbeddedRuntimeSessionSummary,
  MailIoBoundarySummary,
  MailRuntimeExecutionBoundary,
  PublicAgentInbox,
  SubAgentTarget,
  VirtualMailbox,
  VirtualMessage,
  VirtualMessageOriginKind
} from "../core/types.js";
import {
  findMailOutboxById,
  type MailOutboxRecord,
  type MailOutboxStatus,
  updateMailOutboxStatus
} from "../storage/repositories/mail-outbox.js";
import { persistOutboxArtifact } from "../storage/artifacts.js";
import {
  findApprovalRequestByReferenceId,
  findControlPlaneOutboxByReferenceId,
  insertControlPlaneOutboxRecord,
  listApprovalRequestsForRoom,
  listControlPlaneOutboxByStatus,
  listControlPlaneOutboxForRoom,
  listOutboxIntentsForRoom,
  mapOutboxIntentToMailOutboxRecord,
  updateOutboxIntentStatus,
  updateApprovalRequestStatus
} from "../storage/repositories/outbox-intents.js";
import {
  bindMemoryNamespaceToRoom,
  upsertMemoryNamespace,
  upsertMemoryPromotion
} from "../storage/repositories/memory-registry.js";
import {
  findLatestMailMessageForThread,
  findMailMessageByDedupeKey,
  insertMailMessage,
  listMailMessagesForThread
} from "../storage/repositories/mail-messages.js";
import { getLatestRoomPreSnapshot } from "../storage/repositories/room-pre-snapshots.js";
import { getVirtualMessage } from "../storage/repositories/virtual-messages.js";
import { renderPreToMail } from "../reporting/compose.js";
import {
  normalizeAndValidateOutboundHeaders,
  validateOutboundRecipients
} from "../reporting/rfc.js";
import { buildParticipantFingerprint, normalizeSubject } from "../threading/dedupe.js";
import { filterInternalAliasRecipients } from "../threading/mailbox-routing.js";
import {
  ingestIncomingMail,
  type LeasedRoomJob,
  processLeasedRoomJob,
  processNextRoomJob,
  type IngestIncomingMailInput
} from "./service.js";
import {
  getMailAccount,
  listMailAccounts,
  upsertMailAccount,
  type MailAccountRecord
} from "../storage/repositories/mail-accounts.js";
import {
  findProviderCursor,
  listProviderCursors,
  upsertProviderCursor
} from "../storage/repositories/provider-cursors.js";
import {
  appendProviderEvent,
  listProviderEventsForAccount
} from "../storage/repositories/provider-events.js";
import { appendThreadLedgerEvent, listThreadLedgerEvents } from "../storage/repositories/thread-ledger.js";
import { getThreadRoom, listThreadRooms, saveThreadRoom } from "../storage/repositories/thread-rooms.js";
import { getMailThread } from "../storage/repositories/mail-threads.js";
import { createWorkerPool } from "../queue/worker-pool.js";
import { leaseNextRoomJob } from "../queue/thread-queue.js";
import { searchRoomContext } from "../retrieval/room-search.js";
import {
  createOpenClawSubAgentTransport,
  type OpenClawSubAgentTransport
} from "../subagent-bridge/openclaw.js";
import { dispatchSubAgentMailbox } from "../subagent-bridge/bridge.js";
import {
  ensurePublicAgentInbox,
  markInboxItemTriaged,
  projectInboxItemForRoom,
  projectPublicAgentInbox
} from "../inbox/projector.js";
import { schedulePublicAgentInbox } from "../inbox/scheduler.js";
import {
  getSubAgentTarget,
  getSubAgentTargetByMailboxId,
  listSubAgentTargetsForAccount,
  saveSubAgentTarget
} from "../storage/repositories/subagent-targets.js";
import { listSubAgentRunsForRoom } from "../storage/repositories/subagent-runs.js";
import { listProjectAggregates } from "../storage/repositories/project-aggregates.js";
import {
  getPublicAgentInbox,
  listPublicAgentInboxesForAccount,
  savePublicAgentInbox
} from "../storage/repositories/public-agent-inboxes.js";
import { getInboxItem, getInboxItemForRoom, listInboxItemsForInbox } from "../storage/repositories/inbox-items.js";
import { listVirtualMailboxesForAccount } from "../storage/repositories/virtual-mailboxes.js";
import {
  getOAuthLoginSession,
  getOAuthLoginSessionByState,
  upsertOAuthLoginSession
} from "../storage/repositories/oauth-login-sessions.js";
import { listScheduledMailJobs } from "../storage/repositories/scheduled-mail-jobs.js";
import {
  cancelScheduledMailJob,
  pauseScheduledMailJob,
  resumeScheduledMailJob,
  runScheduledMailJobNow,
  runScheduledMailJobs
} from "./scheduled-mail.js";

export interface MailSidecarRuntimeDeps {
  db: DatabaseSync;
  config: AppConfig;
  agentExecutor?: MailAgentExecutor;
  subAgentTransport?: OpenClawSubAgentTransport;
  gatewayOutcomeDispatcher?: (input: {
    roomKey: string;
    messageId: string;
    message: VirtualMessage;
    sessionKey: string;
    mode: Parameters<typeof markGatewayOutcomeDispatched>[1]["mode"];
    projectedAt: string;
  }) => Promise<
    | void
    | {
        dispatchTarget?: string;
      }
  >;
  smtpSender?: SmtpSender;
  smtpTransportFactory?: SmtpTransportFactory;
  gmailSendClientFactory?: (config: { accessToken: string }) => GmailSendClientLike;
  mailIoPlane?: MailIoPlane;
  mailIoCommandRunner?: LocalCommandRunner;
  gmailOAuthClient?: GmailOAuthClientLike;
  microsoftOAuthClient?: MicrosoftOAuthClientLike;
}

export interface RuntimeWatcherOptions {
  imap?: {
    fetch?(input: {
      accountId: string;
      settings: Record<string, unknown>;
      checkpoint?: string;
      signal: AbortSignal;
    }): Promise<ImapPollBatch>;
    clientFactory?: (config: ImapClientConfig) => ImapClientLike;
  };
  gmail?: {
    listen?(input: {
      accountId: string;
      settings: Record<string, unknown>;
      checkpoint?: string;
      signal: AbortSignal;
    }): Promise<GmailWatchBatch>;
    fetch?(input: {
      accountId: string;
      settings: Record<string, unknown>;
      notification: GmailWatchNotification;
      signal: AbortSignal;
    }): Promise<GmailMessage | null>;
    clientFactory?: (config: { accessToken: string }) => GmailApiClientLike;
  };
  processImmediately?: boolean;
}

type GatewayRuntimeEvent =
  | ({ type: "gateway.session.bind" } & Parameters<typeof bindGatewaySessionToRoom>[1])
  | ({ type: "gateway.turn.project" } & Parameters<typeof projectGatewayTurnToVirtualMail>[1])
  | ({ type: "gateway.outcome.project" } & Parameters<typeof projectRoomOutcomeToGateway>[1])
  | ({ type: "gateway.history.import" } & Omit<Parameters<typeof importGatewayThreadHistory>[1], "stateDir">);

export interface RuntimeIngestInput extends IngestIncomingMailInput {
  processImmediately?: boolean;
}

export interface RuntimeRawIngestInput {
  accountId: string;
  mailboxAddress: string;
  rawMime?: string | Uint8Array;
  rawMimeBase64?: string;
  providerMessageId?: string;
  threadId?: string;
  envelopeRecipients?: string[];
  processImmediately?: boolean;
}

export interface RuntimeGmailNotificationInput {
  accountId: string;
  notification: GmailPubsubNotification | GmailPubsubPushEnvelope | { data: string };
  processImmediately?: boolean;
  signal?: AbortSignal;
  clientFactory?: (config: { accessToken: string }) => GmailApiClientLike;
}

export interface RuntimeGmailRecoveryInput {
  accountId: string;
  processImmediately?: boolean;
  signal?: AbortSignal;
  reason?: string;
  clientFactory?: (config: { accessToken: string }) => GmailApiClientLike;
}

export interface RuntimeOAuthStartInput {
  provider: string;
  accountId: string;
  redirectUri: string;
  displayName?: string;
  loginHint?: string;
  scopes?: string[];
  tenant?: string;
  topicName?: string;
  userId?: string;
  labelIds?: string[];
  clientId?: string;
  clientSecret?: string;
}

export interface RuntimeOAuthCompleteInput {
  state: string;
  code?: string;
  error?: string;
  errorDescription?: string;
  signal?: AbortSignal;
}

export interface RuntimeRoomMailSyncInput {
  roomKey: string;
  messageId: string;
  subject?: string;
  body?: string;
  kind?: MailOutboxRecord["kind"];
  mailboxAddress?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  createdAt?: string;
  approvalRequired?: boolean;
  requireApproval?: boolean;
}

export type RuntimeGmailOAuthStartInput = Omit<RuntimeOAuthStartInput, "provider" | "tenant">;
export type RuntimeGmailOAuthCompleteInput = RuntimeOAuthCompleteInput;

export class RuntimeFeatureDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeFeatureDisabledError";
  }
}

export class OutboxActionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "OutboxActionError";
  }
}

export class RoomJobActionError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "RoomJobActionError";
  }
}

export class RuntimeApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "RuntimeApiError";
  }
}

export function createMailSidecarRuntime(deps: MailSidecarRuntimeDeps) {
  const agentExecutor = deps.agentExecutor ?? createDefaultMailAgentExecutor(deps.config);
  const smtpSender = deps.smtpSender ?? createConfiguredSmtpSender(deps.config, deps.smtpTransportFactory);
  const subAgentTransport =
    deps.subAgentTransport ??
    (deps.config.features.openClawBridge ? createOpenClawSubAgentTransport(deps.config) : undefined);
  const gmailOAuthClient = deps.gmailOAuthClient ?? createGmailOAuthClient();
  const microsoftOAuthClient = deps.microsoftOAuthClient ?? createMicrosoftOAuthClient();
  const mailIoPlane =
    deps.mailIoPlane ??
    (deps.config.mailIo.mode === "command"
      ? createCommandMailIoPlane({
          command: deps.config.mailIo.command,
          cwd: deps.config.storage.stateDir,
          runner: deps.mailIoCommandRunner,
          defaultSmtpConfig: resolveDefaultSmtpTransportConfig(deps.config),
          getRoom: ({ roomKey }) => getThreadRoom(deps.db, roomKey),
          getAccount: ({ accountId }) => getMailAccount(deps.db, accountId),
          getProviderThreadId: ({ stableThreadId }) =>
            getMailThread(deps.db, stableThreadId)?.providerThreadId
        })
      : createLocalMailIoPlane({
          smtpSender,
          smtpTransportFactory: deps.smtpTransportFactory,
          gmailSendClientFactory: deps.gmailSendClientFactory
        }));
  const deliverySenderCaches = {
    gmailSenderCache: new Map<string, ReturnType<typeof createConfiguredGmailSender>>(),
    accountSmtpSenderCache: new Map<string, ReturnType<typeof createAccountSmtpSender>>()
  };
  const resolveOutboxSender = (roomKey: string) => {
    return resolveLocalDeliverySender(
      {
        roomKey,
        defaultSender: smtpSender,
        getRoom: ({ roomKey: nextRoomKey }) => getThreadRoom(deps.db, nextRoomKey),
        getAccount: ({ accountId }) => getMailAccount(deps.db, accountId),
        getProviderThreadId: ({ stableThreadId }) =>
          getMailThread(deps.db, stableThreadId)?.providerThreadId,
        smtpTransportFactory: deps.smtpTransportFactory,
        gmailSendClientFactory: deps.gmailSendClientFactory
      },
      deliverySenderCaches
    );
  };
  const ingestMail = async (input: RuntimeIngestInput) => {
    if (!deps.config.features.mailIngest) {
      throw new RuntimeFeatureDisabledError("mail ingest is disabled");
    }

    const ingested = ingestIncomingMail(
      {
        db: deps.db,
        config: deps.config
      },
      input
    );

    const processed =
      input.processImmediately &&
      ingested.status === "queued"
        ? await (async () => {
            const result = await processNextRoomJob({
              db: deps.db,
              config: deps.config,
              agentExecutor,
              subAgentTransport
            });
            if (result?.status === "completed") {
              await autoDispatchGatewayOutcomesForRoom(result.roomKey);
            }
            return result;
          })()
        : null;

    const room = getThreadRoom(deps.db, ingested.roomKey);
    const inboxAgentAddresses = room
      ? Array.from(
          new Set(
            [room.frontAgentAddress, ...(room.publicAgentAddresses ?? [])].filter(
              (value): value is string => typeof value === "string" && value.trim().length > 0
            )
          )
        )
      : [];
    for (const agentId of inboxAgentAddresses) {
      projectPublicAgentInbox(deps.db, {
        accountId: room!.accountId,
        agentId,
        activeRoomLimit: deps.config.queue.maxConcurrentRooms,
        ackSlaSeconds: Math.max(1, Math.floor(deps.config.reporting.ackTimeoutMs / 1000)),
        burstCoalesceSeconds: 60
      });
    }

    return {
      ingested,
      processed
    };
  };
  const loadLatestAccount = (accountId: string, fallback?: MailAccountRecord) =>
    getMailAccount(deps.db, accountId) ?? fallback ?? null;
  const resolveDurableWatchCheckpoint = (account: MailAccountRecord) =>
    findProviderCursor(deps.db, {
      accountId: account.accountId,
      cursorKind: "watch"
    })?.cursorValue ?? getWatchSettings(account.settings).checkpoint;
  const persistWatchCheckpoint = (
    accountId: string,
    checkpoint: string,
    metadata?: Record<string, unknown>,
    fallback?: MailAccountRecord
  ) => {
    const latest = loadLatestAccount(accountId, fallback);
    if (!latest) {
      return;
    }

    const priorCursor =
      findProviderCursor(deps.db, {
        accountId: latest.accountId,
        cursorKind: "watch"
      })?.cursorValue ?? getWatchSettings(latest.settings).checkpoint;
    const timestamp = new Date().toISOString();
    const persistedMetadata = {
      source: "runtime.startWatchers",
      ...(metadata ?? {})
    };
    upsertProviderCursor(deps.db, {
      accountId: latest.accountId,
      provider: latest.provider,
      cursorKind: "watch",
      cursorValue: checkpoint,
      metadata: persistedMetadata,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    const previousCheckpoint =
      typeof (metadata as { invalidatedCheckpoint?: unknown } | undefined)?.invalidatedCheckpoint === "string"
        ? ((metadata as { invalidatedCheckpoint: string }).invalidatedCheckpoint ?? null)
        : priorCursor ?? null;
    const cursorInvalidated =
      (metadata as { historyInvalidated?: unknown } | undefined)?.historyInvalidated === true ||
      (metadata as { cursorInvalidated?: unknown } | undefined)?.cursorInvalidated === true;
    if (cursorInvalidated) {
      const invalidationReason =
        typeof (metadata as { invalidationReason?: unknown } | undefined)?.invalidationReason === "string"
          ? (metadata as { invalidationReason: string }).invalidationReason
          : "unknown";
      appendProviderEvent(deps.db, {
        accountId: latest.accountId,
        provider: latest.provider,
        eventType: "provider.cursor.invalidated",
        cursorValue: checkpoint,
        payload: {
          cursorKind: "watch",
          previousCheckpoint,
          reason: invalidationReason,
          previousUidValidity:
            typeof (metadata as { previousUidValidity?: unknown } | undefined)?.previousUidValidity === "string"
              ? (metadata as { previousUidValidity: string }).previousUidValidity
              : null,
          uidValidity:
            typeof (metadata as { uidValidity?: unknown } | undefined)?.uidValidity === "string"
              ? (metadata as { uidValidity: string }).uidValidity
              : null
        },
        createdAt: timestamp
      });
      appendProviderEvent(deps.db, {
        accountId: latest.accountId,
        provider: latest.provider,
        eventType: "provider.backfill.started",
        cursorValue: checkpoint,
        payload: {
          cursorKind: "watch",
          previousCheckpoint,
          reason: invalidationReason
        },
        createdAt: timestamp
      });
      if ((metadata as { backfillCompleted?: unknown } | undefined)?.backfillCompleted === true) {
        appendProviderEvent(deps.db, {
          accountId: latest.accountId,
          provider: latest.provider,
          eventType: "provider.backfill.completed",
          cursorValue: checkpoint,
          payload: {
            cursorKind: "watch",
            previousCheckpoint,
            notificationCount:
              typeof (metadata as { backfillCount?: unknown }).backfillCount === "number"
                ? (metadata as { backfillCount: number }).backfillCount
                : 0,
            source:
              typeof (metadata as { backfillSource?: unknown }).backfillSource === "string"
                ? (metadata as { backfillSource: string }).backfillSource
                : latest.provider === "imap"
                  ? "imap.rebuild"
                  : "unknown",
            reason: invalidationReason
          },
          createdAt: timestamp
        });
      }
    }
    if (priorCursor !== checkpoint) {
      appendProviderEvent(deps.db, {
        accountId: latest.accountId,
        provider: latest.provider,
        eventType: "provider.cursor.advanced",
        cursorValue: checkpoint,
        payload: {
          cursorKind: "watch",
          previousCheckpoint: priorCursor ?? null
        },
        createdAt: timestamp
      });
    }
    const watchMetadata = metadata as {
      watchHistoryId?: unknown;
      watchExpiration?: unknown;
      uidValidity?: unknown;
    };
    const watchPatch: Record<string, unknown> = {
      ...getWatchSettings(latest.settings),
      checkpoint
    };
    if (typeof watchMetadata?.watchHistoryId === "string") {
      watchPatch.historyId = watchMetadata.watchHistoryId;
    }
    if (typeof watchMetadata?.watchExpiration === "string") {
      watchPatch.expiration = watchMetadata.watchExpiration;
    }
    if (typeof watchMetadata?.uidValidity === "string") {
      watchPatch.uidValidity = watchMetadata.uidValidity;
    }
    upsertMailAccount(deps.db, {
      ...latest,
      settings: {
        ...latest.settings,
        watch: {
          ...watchPatch
        },
        ...(latest.provider === "gmail"
          ? {
              gmail: {
                ...(latest.settings.gmail && typeof latest.settings.gmail === "object"
                  ? (latest.settings.gmail as Record<string, unknown>)
                  : {}),
                watch: {
                  ...(((latest.settings.gmail as { watch?: unknown } | undefined)?.watch &&
                  typeof (latest.settings.gmail as { watch?: unknown }).watch === "object"
                    ? ((latest.settings.gmail as { watch: Record<string, unknown> }).watch as Record<string, unknown>)
                    : {}) as Record<string, unknown>),
                  ...watchPatch
                }
              }
            }
          : {})
      },
      createdAt: latest.createdAt,
      updatedAt: timestamp
    });
  };
  const requireGmailAccount = (accountId: string) => {
    const account = loadLatestAccount(accountId);
    if (!account) {
      throw new Error(`mail account not found: ${accountId}`);
    }
    if (account.provider !== "gmail") {
      throw new Error(`mail account is not Gmail: ${accountId}`);
    }
    if (!hasConfiguredGmailSettings(account.settings)) {
      throw new Error(`mail account is missing Gmail settings: ${accountId}`);
    }

    return account;
  };
  const ingestFetchedGmailBatch = async (input: {
    account: MailAccountRecord;
    notifications: GmailWatchNotification[];
    processImmediately: boolean;
    signal: AbortSignal;
    clientFactory?: (config: { accessToken: string }) => GmailApiClientLike;
  }) => {
    const results: Array<Awaited<ReturnType<typeof ingestMail>>> = [];

    for (const notification of input.notifications) {
      const message = await mailIoPlane.fetchGmailMessage(
        {
          accountId: input.account.accountId,
          settings: loadLatestAccount(input.account.accountId, input.account)?.settings ?? input.account.settings,
          notification,
          signal: input.signal
        },
        {
          clientFactory: input.clientFactory
        }
      );
      if (!message) {
        continue;
      }

      const envelope = mapGmailMessageToEnvelope(message);
      results.push(
        await ingestMail({
          accountId: input.account.accountId,
          mailboxAddress: input.account.emailAddress,
          envelope,
          processImmediately: input.processImmediately
        })
      );
    }

    return results;
  };
  const buildGmailOAuthSettings = (input: RuntimeGmailOAuthStartInput, existing?: MailAccountRecord) => {
    const existingProviderSettings =
      existing?.settings.gmail && typeof existing.settings.gmail === "object"
        ? (existing.settings.gmail as Record<string, unknown>)
        : {};
    const watchSettings =
      existingProviderSettings.watch && typeof existingProviderSettings.watch === "object"
        ? (existingProviderSettings.watch as Record<string, unknown>)
        : {};
    const clientId = input.clientId?.trim() || deps.config.gmailOAuth.clientId;
    if (!clientId) {
      throw new RuntimeApiError(
        "missing Gmail OAuth client id: set MAILCLAW_GMAIL_OAUTH_CLIENT_ID or pass clientId",
        400
      );
    }

    const topicName = input.topicName?.trim() || deps.config.gmailOAuth.topicName || undefined;
    const labelIds = input.labelIds?.length ? input.labelIds : deps.config.gmailOAuth.labelIds;
    const scopes = input.scopes?.length ? input.scopes : deps.config.gmailOAuth.scopes;

    return {
      oauthClientId: clientId,
      ...(input.clientSecret?.trim() || deps.config.gmailOAuth.clientSecret
        ? { oauthClientSecret: input.clientSecret?.trim() || deps.config.gmailOAuth.clientSecret }
        : {}),
      ...(topicName ? { topicName } : {}),
      userId: input.userId?.trim() || deps.config.gmailOAuth.userId || "me",
      ...(labelIds.length > 0 ? { labelIds } : {}),
      watch: {
        ...watchSettings,
        backfillMaxMessages:
          typeof watchSettings.backfillMaxMessages === "number" ? watchSettings.backfillMaxMessages : 100
      },
      oauthScopes: scopes
    } satisfies Record<string, unknown>;
  };
  const buildOutlookOAuthSettings = (input: RuntimeOAuthStartInput, existing?: MailAccountRecord) => {
    const clientId = input.clientId?.trim() || deps.config.microsoftOAuth.clientId;
    if (!clientId) {
      throw new RuntimeApiError(
        "missing Microsoft OAuth client id: set MAILCLAW_MICROSOFT_OAUTH_CLIENT_ID or pass clientId",
        400
      );
    }

    const tenant = input.tenant?.trim() || deps.config.microsoftOAuth.tenant || "common";
    const scopes = input.scopes?.length ? input.scopes : deps.config.microsoftOAuth.scopes;
    const existingImap =
      existing?.settings.imap && typeof existing.settings.imap === "object"
        ? (existing.settings.imap as Record<string, unknown>)
        : {};
    const existingSmtp =
      existing?.settings.smtp && typeof existing.settings.smtp === "object"
        ? (existing.settings.smtp as Record<string, unknown>)
        : {};

    return {
      oauthClientId: clientId,
      ...(input.clientSecret?.trim() || deps.config.microsoftOAuth.clientSecret
        ? { oauthClientSecret: input.clientSecret?.trim() || deps.config.microsoftOAuth.clientSecret }
        : {}),
      oauthTenant: tenant,
      oauthScopes: scopes,
      tokenEndpoint: buildMicrosoftTokenEndpoint(tenant),
      imap: {
        host: typeof existingImap.host === "string" ? existingImap.host : "outlook.office365.com",
        port: typeof existingImap.port === "number" ? existingImap.port : 993,
        secure: typeof existingImap.secure === "boolean" ? existingImap.secure : true,
        mailbox: typeof existingImap.mailbox === "string" ? existingImap.mailbox : "INBOX"
      },
      smtp: {
        host: typeof existingSmtp.host === "string" ? existingSmtp.host : "smtp.office365.com",
        port: typeof existingSmtp.port === "number" ? existingSmtp.port : 587,
        secure: typeof existingSmtp.secure === "boolean" ? existingSmtp.secure : false
      }
    } satisfies Record<string, unknown>;
  };
  const redactOAuthLoginSession = (session: ReturnType<typeof getOAuthLoginSession>) => {
    if (!session) {
      return null;
    }

    const providerSettings =
      session.settings[session.provider] && typeof session.settings[session.provider] === "object"
        ? (session.settings[session.provider] as Record<string, unknown>)
        : {};
    const redactedSettings =
      session.provider === "gmail"
        ? {
            gmail: {
              ...(typeof providerSettings.topicName === "string" ? { topicName: providerSettings.topicName } : {}),
              ...(typeof providerSettings.userId === "string" ? { userId: providerSettings.userId } : {}),
              ...(Array.isArray(providerSettings.labelIds) ? { labelIds: providerSettings.labelIds } : {}),
              oauthClientConfigured: typeof providerSettings.oauthClientId === "string"
            }
          }
        : session.provider === "outlook"
          ? {
              outlook: {
                ...(typeof providerSettings.oauthTenant === "string"
                  ? { tenant: providerSettings.oauthTenant }
                  : {}),
                imapHost:
                  providerSettings.imap && typeof providerSettings.imap === "object"
                    ? ((providerSettings.imap as Record<string, unknown>).host ?? null)
                    : null,
                smtpHost:
                  providerSettings.smtp && typeof providerSettings.smtp === "object"
                    ? ((providerSettings.smtp as Record<string, unknown>).host ?? null)
                    : null,
                oauthClientConfigured: typeof providerSettings.oauthClientId === "string"
              }
            }
          : {};

    return {
      sessionId: session.sessionId,
      provider: session.provider,
      accountId: session.accountId,
      loginHint: session.loginHint ?? null,
      displayName: session.displayName ?? null,
      redirectUri: session.redirectUri,
      scopes: session.scopes,
      status: session.status,
      resolvedEmailAddress: session.resolvedEmailAddress ?? null,
      errorText: session.errorText ?? null,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt ?? null,
      settings: redactedSettings
    };
  };
  const upsertAccountRecord = (input: Omit<MailAccountRecord, "createdAt" | "updatedAt">) => {
    const existing = listMailAccounts(deps.db).find((account) => account.accountId === input.accountId);
    const timestamp = new Date().toISOString();
    deliverySenderCaches.gmailSenderCache.delete(input.accountId);
    deliverySenderCaches.accountSmtpSenderCache.delete(input.accountId);
    upsertMailAccount(deps.db, {
      ...input,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    });

    return listMailAccounts(deps.db).find((account) => account.accountId === input.accountId) ?? null;
  };
  const buildGmailOAuthAccount = (input: {
    session: NonNullable<ReturnType<typeof getOAuthLoginSessionByState>>;
    tokens: {
      accessToken: string;
      refreshToken?: string;
      tokenType?: string;
      scope?: string;
      expiresAt?: string;
    };
    profile: GmailOAuthProfile;
  }) => {
    const existing = loadLatestAccount(input.session.accountId);
    const existingProviderSettings =
      existing?.settings.gmail && typeof existing.settings.gmail === "object"
        ? (existing.settings.gmail as Record<string, unknown>)
        : {};
    const sessionProviderSettings =
      input.session.settings.gmail && typeof input.session.settings.gmail === "object"
        ? (input.session.settings.gmail as Record<string, unknown>)
        : {};
    const nextProviderSettings = {
      ...existingProviderSettings,
      ...sessionProviderSettings,
      oauthAccessToken: input.tokens.accessToken,
      oauthRefreshToken:
        input.tokens.refreshToken ??
        (typeof existingProviderSettings.oauthRefreshToken === "string"
          ? existingProviderSettings.oauthRefreshToken
          : undefined),
      oauthTokenType: input.tokens.tokenType ?? existingProviderSettings.oauthTokenType,
      oauthScope: input.tokens.scope ?? existingProviderSettings.oauthScope,
      oauthExpiry: input.tokens.expiresAt ?? existingProviderSettings.oauthExpiry
    };

    return upsertAccountRecord({
      accountId: input.session.accountId,
      provider: "gmail",
      emailAddress: input.profile.emailAddress,
      displayName: input.session.displayName ?? existing?.displayName,
      status: "active",
      settings: {
        ...existing?.settings,
        gmail: nextProviderSettings
      }
    });
  };
  const buildOutlookOAuthAccount = (input: {
    session: NonNullable<ReturnType<typeof getOAuthLoginSessionByState>>;
    tokens: {
      accessToken: string;
      refreshToken?: string;
      tokenType?: string;
      scope?: string;
      expiresAt?: string;
      idToken?: string;
    };
    profile: MicrosoftOAuthProfile;
  }) => {
    const existing = loadLatestAccount(input.session.accountId);
    const sessionProviderSettings =
      input.session.settings.outlook && typeof input.session.settings.outlook === "object"
        ? (input.session.settings.outlook as Record<string, unknown>)
        : {};
    const existingImap =
      existing?.settings.imap && typeof existing.settings.imap === "object"
        ? (existing.settings.imap as Record<string, unknown>)
        : {};
    const existingImapOauth =
      existingImap.oauth && typeof existingImap.oauth === "object"
        ? (existingImap.oauth as Record<string, unknown>)
        : {};
    const existingSmtp =
      existing?.settings.smtp && typeof existing.settings.smtp === "object"
        ? (existing.settings.smtp as Record<string, unknown>)
        : {};
    const existingSmtpOauth =
      existingSmtp.oauth && typeof existingSmtp.oauth === "object"
        ? (existingSmtp.oauth as Record<string, unknown>)
        : {};
    const imapSessionSettings =
      sessionProviderSettings.imap && typeof sessionProviderSettings.imap === "object"
        ? (sessionProviderSettings.imap as Record<string, unknown>)
        : {};
    const smtpSessionSettings =
      sessionProviderSettings.smtp && typeof sessionProviderSettings.smtp === "object"
        ? (sessionProviderSettings.smtp as Record<string, unknown>)
        : {};
    const oauthClientId =
      typeof sessionProviderSettings.oauthClientId === "string"
        ? sessionProviderSettings.oauthClientId
        : undefined;
    const oauthClientSecret =
      typeof sessionProviderSettings.oauthClientSecret === "string"
        ? sessionProviderSettings.oauthClientSecret
        : undefined;
    const tokenEndpoint =
      typeof sessionProviderSettings.tokenEndpoint === "string"
        ? sessionProviderSettings.tokenEndpoint
        : buildMicrosoftTokenEndpoint(
            typeof sessionProviderSettings.oauthTenant === "string" ? sessionProviderSettings.oauthTenant : undefined
          );

    const baseOauthSettings = {
      provider: "outlook",
      accessToken: input.tokens.accessToken,
      refreshToken:
        input.tokens.refreshToken ??
        (typeof existingImapOauth.refreshToken === "string"
          ? existingImapOauth.refreshToken
          : typeof existingSmtpOauth.refreshToken === "string"
            ? existingSmtpOauth.refreshToken
            : undefined),
      tokenType:
        input.tokens.tokenType ??
        (typeof existingImapOauth.tokenType === "string"
          ? existingImapOauth.tokenType
          : typeof existingSmtpOauth.tokenType === "string"
            ? existingSmtpOauth.tokenType
            : undefined),
      scope:
        input.tokens.scope ??
        (typeof existingImapOauth.scope === "string"
          ? existingImapOauth.scope
          : typeof existingSmtpOauth.scope === "string"
            ? existingSmtpOauth.scope
            : undefined),
      expiry:
        input.tokens.expiresAt ??
        (typeof existingImapOauth.expiry === "string"
          ? existingImapOauth.expiry
          : typeof existingSmtpOauth.expiry === "string"
            ? existingSmtpOauth.expiry
            : undefined),
      idToken: input.tokens.idToken,
      ...(oauthClientId ? { clientId: oauthClientId } : {}),
      ...(oauthClientSecret ? { clientSecret: oauthClientSecret } : {}),
      tokenEndpoint
    };

    return upsertAccountRecord({
      accountId: input.session.accountId,
      provider: "imap",
      emailAddress: input.profile.emailAddress,
      displayName: input.session.displayName ?? input.profile.displayName ?? existing?.displayName,
      status: "active",
      settings: {
        ...existing?.settings,
        imap: {
          ...existingImap,
          ...imapSessionSettings,
          username: input.profile.emailAddress,
          oauth: {
            ...existingImapOauth,
            ...baseOauthSettings
          }
        },
        smtp: {
          ...existingSmtp,
          ...smtpSessionSettings,
          username: input.profile.emailAddress,
          from:
            typeof existingSmtp.from === "string" && existingSmtp.from.trim().length > 0
              ? existingSmtp.from
              : input.profile.emailAddress,
          oauth: {
            ...existingSmtpOauth,
            ...baseOauthSettings
          }
        }
      }
    });
  };
  const listConsoleAccountsSnapshot = () =>
    listConsoleAccountsView(deps.db, {
      globalSmtpConfigured: Boolean(smtpSender)
    });
  const resolveConsoleBoundaries = <T extends { boundaries: typeof consoleBoundaries }>(view: T): T => ({
    ...view,
    boundaries: {
      ...view.boundaries,
      automaticGatewayRoundTrip: Boolean(deps.gatewayOutcomeDispatcher)
    }
  });
  const getConsoleAccountDetail = (accountId: string) => {
    const view = getConsoleAccountView(deps.db, accountId, {
      globalSmtpConfigured: Boolean(smtpSender)
    });
    if (!view) {
      throw new RuntimeApiError(`mail account not found: ${accountId}`, 404);
    }

    return resolveConsoleBoundaries(view);
  };
  const tryGetConsoleAccountDetail = (accountId: string) => {
    try {
      return getConsoleAccountDetail(accountId);
    } catch (error) {
      if (error instanceof RuntimeApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  };
  const buildMailboxConsole = (accountId: string) => {
    const account = getMailAccount(deps.db, accountId);
    if (!account) {
      throw new RuntimeApiError(`mail account not found: ${accountId}`, 404);
    }
    const accountAgentRouting = readAccountAgentRoutingSettings(account.settings);

    const cursors = listProviderCursors(deps.db, accountId);
    const recentEvents = listProviderEventsForAccount(deps.db, accountId).slice(-20);
    const providerState = {
      account,
      cursors,
      recentEvents,
      summary: summarizeAccountProviderState(account, cursors, recentEvents, {
        globalSmtpConfigured: Boolean(smtpSender)
      })
    };
    const roomAgents = listThreadRooms(deps.db)
      .filter((room) => room.accountId === accountId)
      .flatMap((room) =>
        accountAgentRouting.durableAgentIds.length > 0 || room.frontAgentId || (room.publicAgentIds?.length ?? 0) > 0
          ? [room.frontAgentId, ...(room.publicAgentIds ?? [])]
          : [room.frontAgentAddress, ...(room.publicAgentAddresses ?? [])]
      )
      .filter((agentId): agentId is string =>
        typeof agentId === "string" &&
        agentId.trim().length > 0 &&
        shouldExposeDurableAgentId(agentId, accountAgentRouting)
      );
    const existingInboxAgents = listPublicAgentInboxesForAccount(deps.db, accountId)
      .map((inbox) => inbox.agentId)
      .filter((agentId) => shouldExposeDurableAgentId(agentId, accountAgentRouting));
    const agentIds = Array.from(new Set([...existingInboxAgents, ...roomAgents])).sort((left, right) =>
      left.localeCompare(right)
    );

    return {
      account,
      providerState,
      publicAgentInboxes: agentIds.map((agentId) =>
        projectPublicAgentInbox(deps.db, {
          accountId,
          agentId
        })
      ),
      virtualMailboxes: listVirtualMailboxesForAccount(deps.db, accountId)
    };
  };
  const collectAccountSubagentRunCounts = (accountId: string) => {
    const counts: Record<string, number> = {};
    for (const room of listThreadRooms(deps.db).filter((entry) => entry.accountId === accountId)) {
      for (const run of listSubAgentRunsForRoom(deps.db, room.roomKey)) {
        const target = getSubAgentTarget(deps.db, run.targetId);
        const key = target?.mailboxId ?? run.targetId;
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  };
  const listAgentDirectory = (input: {
    tenantId: string;
    accountId?: string;
  }) => {
    const agentRoot = path.join(getTenantStateDir(deps.config, input.tenantId), "agents");
    const knownTemplates = listAgentTemplateDefinitions();
    const templateIndex = new Map(
      knownTemplates.flatMap((template) =>
        template.persistentAgents.map((agent) => [
          agent.agentId,
          {
            templateId: template.templateId,
            agent
          }
        ] as const)
      )
    );
    const accountMailboxes = input.accountId ? listVirtualMailboxesForAccount(deps.db, input.accountId) : [];
    const inboxes = input.accountId ? listPublicAgentInboxesForAccount(deps.db, input.accountId) : [];
    const accountAgentRouting = input.accountId
      ? readAccountAgentRoutingSettings(getMailAccount(deps.db, input.accountId)?.settings ?? {})
      : createEmptyAccountAgentRouting();
    const filesystemAgents = fs.existsSync(agentRoot)
      ? fs
          .readdirSync(agentRoot, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name)
          .filter(
            (agentId) =>
              templateIndex.has(agentId) ||
              inboxes.some((inbox) => inbox.agentId === agentId) ||
              accountMailboxes.some((mailbox) => mailbox.principalId === `principal:${agentId}` && mailbox.kind === "public")
          )
      : [];
    const accountAgents = Array.from(
      new Set([
        ...inboxes.map((inbox) => inbox.agentId).filter((agentId) => shouldExposeDurableAgentId(agentId, accountAgentRouting)),
        ...accountMailboxes
          .filter((mailbox) => mailbox.kind === "public")
          .map((mailbox) => mailbox.principalId?.replace(/^principal:/, ""))
          .filter((value): value is string => typeof value === "string" && value.length > 0)
          .filter((agentId) => shouldExposeDurableAgentId(agentId, accountAgentRouting))
      ])
    );
    const agentIds = Array.from(new Set([...filesystemAgents, ...accountAgents])).sort((left, right) =>
      left.localeCompare(right)
    );

    return agentIds.map((agentId) => {
      const templateRecord = templateIndex.get(agentId);
      const agentMailboxes = accountMailboxes
        .filter(
          (mailbox) =>
            mailbox.principalId === `principal:${agentId}` ||
            mailbox.mailboxId === templateRecord?.agent.publicMailboxId
        )
        .map((mailbox) => mailbox.mailboxId);
      const entry = templateRecord
        ? buildAgentDirectoryEntry({
            templateId: templateRecord.templateId,
            agent: templateRecord.agent
          })
        : {
            agentId,
            displayName: agentId,
            purpose: "Durable MailClaws agent with its own workspace soul and memory boundary.",
            publicMailboxId: `public:${agentId}`,
            virtualMailboxes: [],
            collaboratorAgentIds: []
          };

      return {
        ...entry,
        inbox: inboxes.find((inbox) => inbox.agentId === agentId) ?? null,
        virtualMailboxes: Array.from(new Set([...entry.virtualMailboxes, ...agentMailboxes])).sort((left, right) =>
          left.localeCompare(right)
        )
      };
    });
  };
  const listSkillsForAgents = (input: {
    tenantId: string;
    accountId?: string;
    agentId?: string;
  }) => {
    const directory = listAgentDirectory({
      tenantId: input.tenantId,
      accountId: input.accountId
    });
    const agentIds =
      typeof input.agentId === "string" && input.agentId.trim().length > 0
        ? [input.agentId.trim()]
        : directory.map((entry) => entry.agentId);

    return agentIds.map((agentId) => {
      const directoryEntry = directory.find((entry) => entry.agentId === agentId);
      return {
        agentId,
        displayName: directoryEntry?.displayName ?? agentId,
        skills: listAgentWorkspaceSkills(deps.config, input.tenantId, agentId)
      };
    });
  };
  const listHeadcountRecommendations = (accountId?: string) => {
    const activeRoomCount = accountId
      ? listThreadRooms(deps.db).filter((room) => room.accountId === accountId && room.state !== "done").length
      : 0;

    return recommendAgentHeadcount({
      activeRoomCount,
      subagentRunCounts: accountId ? collectAccountSubagentRunCounts(accountId) : {}
    });
  };
  const redactMailAccountSettings = (settings: Record<string, unknown>) => {
    const watch =
      settings.watch && typeof settings.watch === "object" ? (settings.watch as Record<string, unknown>) : null;
    const gmail =
      settings.gmail && typeof settings.gmail === "object" ? (settings.gmail as Record<string, unknown>) : null;
    const gmailWatch =
      gmail?.watch && typeof gmail.watch === "object" ? (gmail.watch as Record<string, unknown>) : null;
    const smtp =
      settings.smtp && typeof settings.smtp === "object" ? (settings.smtp as Record<string, unknown>) : null;
    const smtpOauth =
      smtp?.oauth && typeof smtp.oauth === "object" ? (smtp.oauth as Record<string, unknown>) : null;
    const imap =
      settings.imap && typeof settings.imap === "object" ? (settings.imap as Record<string, unknown>) : null;
    const imapOauth =
      imap?.oauth && typeof imap.oauth === "object" ? (imap.oauth as Record<string, unknown>) : null;

    return {
      ...(typeof settings.host === "string" ? { host: settings.host } : {}),
      ...(typeof settings.port === "number" ? { port: settings.port } : {}),
      ...(typeof settings.secure === "boolean" ? { secure: settings.secure } : {}),
      ...(watch
        ? {
            watch: {
              ...(typeof watch.checkpoint === "string" ? { checkpoint: watch.checkpoint } : {}),
              ...(typeof watch.historyId === "string" ? { historyId: watch.historyId } : {}),
              ...(typeof watch.expiration === "string" ? { expiration: watch.expiration } : {}),
              ...(typeof watch.uidValidity === "string" ? { uidValidity: watch.uidValidity } : {}),
              ...(typeof watch.intervalMs === "number" ? { intervalMs: watch.intervalMs } : {})
            }
          }
        : {}),
      ...(gmail
        ? {
            gmail: {
              ...(typeof gmail.topicName === "string" ? { topicName: gmail.topicName } : {}),
              ...(typeof gmail.userId === "string" ? { userId: gmail.userId } : {}),
              ...(Array.isArray(gmail.labelIds) ? { labelIds: gmail.labelIds } : {}),
              ...(Array.isArray(gmail.oauthScopes) ? { oauthScopes: gmail.oauthScopes } : {}),
              ...(typeof gmail.oauthClientId === "string" ? { oauthClientConfigured: true } : {}),
              ...(gmailWatch
                ? {
                    watch: {
                      ...(typeof gmailWatch.historyId === "string" ? { historyId: gmailWatch.historyId } : {}),
                      ...(typeof gmailWatch.expiration === "string" ? { expiration: gmailWatch.expiration } : {}),
                      ...(typeof gmailWatch.backfillMaxMessages === "number"
                        ? { backfillMaxMessages: gmailWatch.backfillMaxMessages }
                        : {})
                    }
                  }
                : {})
            }
          }
        : {}),
      ...(imap
        ? {
            imap: {
              ...(typeof imap.host === "string" ? { host: imap.host } : {}),
              ...(typeof imap.port === "number" ? { port: imap.port } : {}),
              ...(typeof imap.secure === "boolean" ? { secure: imap.secure } : {}),
              ...(typeof imap.mailbox === "string" ? { mailbox: imap.mailbox } : {}),
              ...(imapOauth
                ? {
                    oauth: {
                      ...(typeof imapOauth.clientId === "string" ? { clientConfigured: true } : {}),
                      ...(typeof imapOauth.tokenEndpoint === "string" ? { tokenEndpoint: imapOauth.tokenEndpoint } : {}),
                      ...(typeof imapOauth.scope === "string" ? { scope: imapOauth.scope } : {})
                    }
                  }
                : {})
            }
          }
        : {}),
      ...(smtp
        ? {
            smtp: {
              ...(typeof smtp.host === "string" ? { host: smtp.host } : {}),
              ...(typeof smtp.port === "number" ? { port: smtp.port } : {}),
              ...(typeof smtp.secure === "boolean" ? { secure: smtp.secure } : {}),
              ...(typeof smtp.from === "string" ? { from: smtp.from } : {}),
              ...(smtpOauth
                ? {
                    oauth: {
                      ...(typeof smtpOauth.clientId === "string" ? { clientConfigured: true } : {}),
                      ...(typeof smtpOauth.tokenEndpoint === "string" ? { tokenEndpoint: smtpOauth.tokenEndpoint } : {}),
                      ...(typeof smtpOauth.scope === "string" ? { scope: smtpOauth.scope } : {})
                    }
                  }
                : {})
            }
          }
        : {})
    } satisfies Record<string, unknown>;
  };
  const redactMailAccount = (account: MailAccountRecord) => ({
    accountId: account.accountId,
    provider: account.provider,
    emailAddress: account.emailAddress,
    displayName: account.displayName ?? null,
    status: account.status,
    settings: redactMailAccountSettings(account.settings),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  });
  const buildPublicAccountProviderState = (accountId: string, options?: { eventLimit?: number }) => {
    const account = getMailAccount(deps.db, accountId);
    if (!account) {
      throw new RuntimeApiError(`mail account not found: ${accountId}`, 404);
    }

    const cursors = listProviderCursors(deps.db, accountId);
    const recentEvents = listProviderEventsForAccount(deps.db, accountId).slice(-(options?.eventLimit ?? 20));

    return {
      account: redactMailAccount(account),
      cursors: cursors.map((cursor) => ({
        ...cursor,
        metadata: redactSensitiveValue(cursor.metadata) as Record<string, unknown>
      })),
      recentEvents: recentEvents.map((event) => ({
        ...event,
        payload: redactSensitiveValue(event.payload) as Record<string, unknown>
      })),
      summary: summarizeAccountProviderState(account, cursors, recentEvents, {
        globalSmtpConfigured: Boolean(smtpSender)
      })
    };
  };
  const buildPublicMailboxConsole = (accountId: string) => {
    const console = buildMailboxConsole(accountId);
    return {
      ...console,
      account: redactMailAccount(console.account),
      providerState: buildPublicAccountProviderState(accountId)
    };
  };
  const buildConsoleWorkbenchWorkspace = (input: {
    mode?: "connect" | "accounts" | "rooms" | "mailboxes" | "approvals";
    selectedAccountId: string | null;
    selectedRoomKey: string | null;
    selectedMailboxId: string | null;
    accounts: ReturnType<typeof listConsoleAccountsSnapshot>;
    rooms: ReturnType<typeof listConsoleRoomsView>;
    approvals: ReturnType<typeof listConsoleApprovalsView>;
    mailboxConsole: ReturnType<typeof buildPublicMailboxConsole> | null;
  }) => {
    const selectedAccount = input.selectedAccountId
      ? input.accounts.find((account) => account.accountId === input.selectedAccountId) ?? null
      : null;
    const activeTab =
      input.mode ??
      (input.selectedMailboxId
        ? "mailboxes"
        : input.selectedRoomKey
          ? "rooms"
          : input.approvals.length > 0 && !input.selectedAccountId
            ? "approvals"
            : input.accounts.length === 0
              ? "mail"
              : "accounts");
    const connectPlan = buildConnectOnboardingPlan({
      emailAddress: selectedAccount?.emailAddress
    });
    const templateAccountId = input.selectedAccountId ?? input.accounts[0]?.accountId ?? null;
    const templateTenantId = templateAccountId ?? "default";
    const standaloneBasePath = "/workbench/mail";
    const embeddedBasePath = "/workbench/mail/tab";
    const buildTabHref = (
      basePath: string,
      mode: string,
      extraParams?: Record<string, string | null | undefined>
    ) => {
      const params = new URLSearchParams();
      params.set("mode", mode);
      for (const [key, value] of Object.entries(extraParams ?? {})) {
        if (value) {
          params.set(key, value);
        }
      }
      return `${basePath}?${params.toString()}`;
    };

    return {
      activeTab,
      entrypoints: {
        standalone: standaloneBasePath,
        embedded: embeddedBasePath,
        compatAliases: [
          "/dashboard",
          "/mail",
          "/workbench/mailclaws",
          "/workbench/mailclaw",
          "/workbench/mailclaws/tab",
          "/workbench/mailclaw/tab"
        ]
      },
      hostIntegration: {
        tabId: "mailclaw.mail",
        label: "Mail",
        standalonePath: standaloneBasePath,
        embeddedPath: embeddedBasePath,
        defaultShell: "embedded",
        capabilities: {
          deepLinks: true,
          readOnly: true,
          approvals: true,
          internalMail: true,
          gatewayTrace: true,
          gatewayIngress: true,
          outboundMailSync: true
        },
        apis: {
          gatewayEvents: "/api/gateway/events",
          gatewayHistoryImport: "/api/gateway/history/import",
          gatewayOutcomeDispatch: "/api/gateway/outcomes/dispatch",
          roomMessageEmailSync: "/api/rooms/:roomKey/messages/:messageId/sync-email",
          outboxDeliver: "/api/outbox/deliver"
        }
      },
      tabs: [
        {
          id: "mail",
          label: "Mail",
          href: buildTabHref(standaloneBasePath, "connect"),
          embeddedHref: buildTabHref(embeddedBasePath, "connect"),
          active: activeTab === "mail" || activeTab === "connect",
          count: null
        },
        {
          id: "accounts",
          label: "Accounts",
          href: buildTabHref(standaloneBasePath, "accounts", {
            accountId: input.selectedAccountId
          }),
          embeddedHref: buildTabHref(embeddedBasePath, "accounts", {
            accountId: input.selectedAccountId
          }),
          active: activeTab === "accounts",
          count: input.accounts.length
        },
        {
          id: "rooms",
          label: "Rooms",
          href: buildTabHref(standaloneBasePath, "rooms", {
            accountId: input.selectedAccountId,
            roomKey: input.selectedRoomKey
          }),
          embeddedHref: buildTabHref(embeddedBasePath, "rooms", {
            accountId: input.selectedAccountId,
            roomKey: input.selectedRoomKey
          }),
          active: activeTab === "rooms",
          count: input.rooms.length
        },
        {
          id: "mailboxes",
          label: "Mailboxes",
          href: buildTabHref(standaloneBasePath, "mailboxes", {
            accountId: input.selectedAccountId,
            mailboxId: input.selectedMailboxId
          }),
          embeddedHref: buildTabHref(embeddedBasePath, "mailboxes", {
            accountId: input.selectedAccountId,
            mailboxId: input.selectedMailboxId
          }),
          active: activeTab === "mailboxes",
          count: input.mailboxConsole?.virtualMailboxes?.length ?? 0
        },
        {
          id: "approvals",
          label: "Approvals",
          href: buildTabHref(standaloneBasePath, "approvals", {
            accountId: input.selectedAccountId,
            approvalStatus: "requested"
          }),
          embeddedHref: buildTabHref(embeddedBasePath, "approvals", {
            accountId: input.selectedAccountId,
            approvalStatus: "requested"
          }),
          active: activeTab === "approvals",
          count: input.approvals.length
        }
      ],
      connect: {
        browserPath: standaloneBasePath,
        embeddedBrowserPath: embeddedBasePath,
        onboardingApiPath: "/api/connect/onboarding",
        recommendedStartCommand: "mailclaws onboard you@example.com",
        recommendedLoginCommand: "mailclaws login",
        templateApplyAccountId: templateAccountId,
        templateApplyTenantId: templateTenantId,
        defaultPlan: connectPlan,
        providerOptions: listConnectProviderGuides().map((guide) => ({
          id: guide.id,
          displayName: guide.displayName,
          setupKind: guide.setupKind
        })),
        agentTemplates: listConfiguredAgentTemplates(),
        agentDirectory: listAgentDirectory({
          tenantId: templateTenantId,
          accountId: templateAccountId ?? undefined
        }),
        skills: listSkillsForAgents({
          tenantId: templateTenantId,
          accountId: templateAccountId ?? undefined
        }),
        headcountRecommendations: listHeadcountRecommendations(templateAccountId ?? undefined)
      },
      mailboxWorkspace: input.selectedAccountId
        ? {
            accountId: input.selectedAccountId,
            mailboxCount: input.mailboxConsole?.virtualMailboxes?.length ?? 0,
            inboxCount: input.mailboxConsole?.publicAgentInboxes?.length ?? 0,
            selectedMailboxId: input.selectedMailboxId,
            selectedRoomKey: input.selectedRoomKey,
            browserPaths: {
              account: `${standaloneBasePath}/accounts/${encodeURIComponent(input.selectedAccountId)}`,
              embeddedAccount: `${embeddedBasePath}/accounts/${encodeURIComponent(input.selectedAccountId)}`,
              room: input.selectedRoomKey ? `${standaloneBasePath}/rooms/${encodeURIComponent(input.selectedRoomKey)}` : null,
              embeddedRoom: input.selectedRoomKey ? `${embeddedBasePath}/rooms/${encodeURIComponent(input.selectedRoomKey)}` : null,
              mailbox:
                input.selectedMailboxId
                  ? `${standaloneBasePath}/mailboxes/${encodeURIComponent(input.selectedAccountId)}/${encodeURIComponent(input.selectedMailboxId)}`
                  : null,
              embeddedMailbox:
                input.selectedMailboxId
                  ? `${embeddedBasePath}/mailboxes/${encodeURIComponent(input.selectedAccountId)}/${encodeURIComponent(input.selectedMailboxId)}`
                  : null
            }
          }
        : null
    };
  };
  const collectPendingGatewayOutcomeProjections = (input: {
    roomKey?: string;
    limit?: number;
  }) => {
    const rooms = input.roomKey
      ? [getThreadRoom(deps.db, input.roomKey)].filter((value): value is NonNullable<typeof value> => value !== null)
      : listThreadRooms(deps.db);
    const pending = rooms.flatMap((room) => {
      const replay = replayRoom(deps.db, room.roomKey);
      return replay.gatewayProjectionTrace.outcomeProjections
        .filter((projection) => projection.dispatchStatus === "pending")
        .map((projection) => ({
          roomKey: room.roomKey,
          messageId: projection.messageId,
          sessionKey: projection.sessionKey,
          mode: projection.mode,
          projectedAt: projection.projectedAt
        }));
    });

    return typeof input.limit === "number" ? pending.slice(0, Math.max(1, input.limit)) : pending;
  };
  const dispatchPendingGatewayOutcomes = async (input: {
    roomKey?: string;
    limit?: number;
  } = {}) => {
    if (!deps.gatewayOutcomeDispatcher) {
      throw new RuntimeFeatureDisabledError("gateway outcome dispatch is not configured");
    }
    if (input.roomKey && !getThreadRoom(deps.db, input.roomKey)) {
      throw new RuntimeApiError(`thread room not found: ${input.roomKey}`, 404);
    }

    const pending = collectPendingGatewayOutcomeProjections(input);
    const results: Array<{
      roomKey: string;
      messageId: string;
      sessionKey: string;
      mode: Parameters<typeof markGatewayOutcomeDispatched>[1]["mode"];
      dispatchStatus: "dispatched" | "failed";
      dispatchTarget?: string;
      dispatchError?: string;
      dispatchAttemptedAt: string;
    }> = [];

    for (const projection of pending) {
      const attemptedAt = new Date().toISOString();
      const message = getVirtualMessage(deps.db, projection.messageId);
      if (!message) {
        results.push(
          markGatewayOutcomeDispatchFailed(deps.db, {
            ...projection,
            dispatchError: "gateway outcome message not found",
            dispatchedAt: attemptedAt
          })
        );
        continue;
      }
      try {
        const dispatched = await deps.gatewayOutcomeDispatcher({
          roomKey: projection.roomKey,
          messageId: projection.messageId,
          message,
          sessionKey: projection.sessionKey,
          mode: projection.mode,
          projectedAt: projection.projectedAt
        });
        results.push(
          markGatewayOutcomeDispatched(deps.db, {
            ...projection,
            dispatchTarget: dispatched?.dispatchTarget,
            dispatchedAt: attemptedAt
          })
        );
      } catch (error) {
        results.push(
          markGatewayOutcomeDispatchFailed(deps.db, {
            ...projection,
            dispatchError: redactSensitiveText(error instanceof Error ? error.message : String(error)),
            dispatchedAt: attemptedAt
          })
        );
      }
    }

    return {
      attempted: pending.length,
      dispatched: results.filter((result) => result.dispatchStatus === "dispatched").length,
      failed: results.filter((result) => result.dispatchStatus === "failed").length,
      remainingPending: collectPendingGatewayOutcomeProjections(input).length,
      results
    };
  };
  const autoDispatchGatewayOutcomesForRoom = async (roomKey: string) => {
    if (!deps.gatewayOutcomeDispatcher) {
      return null;
    }

    return dispatchPendingGatewayOutcomes({
      roomKey
    });
  };
  const runtime = {
    async ingest(input: RuntimeIngestInput) {
      return ingestMail(input);
    },
    async ingestRaw(input: RuntimeRawIngestInput) {
      const rawMime =
        typeof input.rawMime === "string" || input.rawMime instanceof Uint8Array
          ? input.rawMime
          : typeof input.rawMimeBase64 === "string"
            ? Buffer.from(input.rawMimeBase64, "base64")
            : undefined;

      if (!rawMime) {
        throw new Error("rawMime or rawMimeBase64 is required");
      }

      const envelope = await parseRawMimeEnvelope({
        rawMime,
        providerMessageId: input.providerMessageId,
        threadId: input.threadId,
        envelopeRecipients: input.envelopeRecipients,
        fallbackMailboxAddress: input.mailboxAddress
      });

      return ingestMail({
        accountId: input.accountId,
        mailboxAddress: input.mailboxAddress,
        envelope,
        processImmediately: input.processImmediately
      });
    },
    async ingestGmailNotification(input: RuntimeGmailNotificationInput) {
      const account = requireGmailAccount(input.accountId);
      const signal = input.signal ?? new AbortController().signal;
      const notification = parseGmailPubsubNotification(input.notification);
      if (!mailboxAddressesMatch(notification.emailAddress, account.emailAddress)) {
        throw new Error(`gmail notification mailbox mismatch for account ${account.accountId}`);
      }

      appendProviderEvent(deps.db, {
        accountId: account.accountId,
        provider: account.provider,
        eventType: "provider.notification.received",
        cursorValue: notification.historyId,
        payload: {
          source: "gmail.pubsub",
          emailAddress: notification.emailAddress,
          historyId: notification.historyId,
          pubsubMessageId: notification.messageId ?? null,
          pubsubPublishTime: notification.publishTime ?? null,
          subscription: notification.subscription ?? null
        }
      });

      const batch = await mailIoPlane.fetchGmailNotificationBatch(
        {
          accountId: account.accountId,
          settings: account.settings,
          checkpoint: resolveDurableWatchCheckpoint(account),
          notification,
          signal
        },
        {
          clientFactory: input.clientFactory
        }
      );
      const ingested = await ingestFetchedGmailBatch({
        account,
        notifications: batch.notifications,
        processImmediately: input.processImmediately ?? false,
        signal,
        clientFactory: input.clientFactory
      });

      if (batch.checkpoint) {
        persistWatchCheckpoint(account.accountId, batch.checkpoint, batch.checkpointMetadata, account);
      }
      if ((batch.checkpointMetadata as { fullMailboxRecovery?: unknown } | undefined)?.fullMailboxRecovery === true) {
        appendProviderEvent(deps.db, {
          accountId: account.accountId,
          provider: account.provider,
          eventType: "provider.mailbox.recovery.completed",
          cursorValue: batch.checkpoint,
          payload: {
            source: "gmail.pubsub",
            reason:
              typeof (batch.checkpointMetadata as { recoveryReason?: unknown } | undefined)?.recoveryReason ===
              "string"
                ? (batch.checkpointMetadata as { recoveryReason: string }).recoveryReason
                : "unknown",
            notificationCount:
              typeof (batch.checkpointMetadata as { recoveryCount?: unknown } | undefined)?.recoveryCount ===
              "number"
                ? (batch.checkpointMetadata as { recoveryCount: number }).recoveryCount
                : batch.notifications.length
          }
        });
      }

      return {
        notification,
        checkpoint: batch.checkpoint,
        checkpointMetadata: batch.checkpointMetadata,
        notifications: batch.notifications,
        ingested
      };
    },
    async recoverGmailMailbox(input: RuntimeGmailRecoveryInput) {
      const account = requireGmailAccount(input.accountId);
      const signal = input.signal ?? new AbortController().signal;
      const priorCheckpoint = resolveDurableWatchCheckpoint(account);

      appendProviderEvent(deps.db, {
        accountId: account.accountId,
        provider: account.provider,
        eventType: "provider.mailbox.recovery.started",
        cursorValue: priorCheckpoint,
        payload: {
          source: "runtime.recoverGmailMailbox",
          reason: input.reason ?? "manual"
        }
      });

      const batch = await mailIoPlane.recoverGmailMailbox(
        {
          accountId: account.accountId,
          settings: account.settings,
          checkpoint: priorCheckpoint,
          signal,
          source: "gmail.recovery",
          reason: input.reason ?? "manual"
        },
        {
          clientFactory: input.clientFactory
        }
      );
      const ingested = await ingestFetchedGmailBatch({
        account,
        notifications: batch.notifications,
        processImmediately: input.processImmediately ?? false,
        signal,
        clientFactory: input.clientFactory
      });

      if (batch.checkpoint) {
        persistWatchCheckpoint(account.accountId, batch.checkpoint, batch.checkpointMetadata, account);
      }
      appendProviderEvent(deps.db, {
        accountId: account.accountId,
        provider: account.provider,
        eventType: "provider.mailbox.recovery.completed",
        cursorValue: batch.checkpoint,
        payload: {
          source: "runtime.recoverGmailMailbox",
          reason: input.reason ?? "manual",
          previousCheckpoint: priorCheckpoint ?? null,
          notificationCount:
            typeof (batch.checkpointMetadata as { recoveryCount?: unknown } | undefined)?.recoveryCount === "number"
              ? (batch.checkpointMetadata as { recoveryCount: number }).recoveryCount
              : batch.notifications.length
        }
      });

      return {
        checkpoint: batch.checkpoint,
        checkpointMetadata: batch.checkpointMetadata,
        notifications: batch.notifications,
        ingested
      };
    },
    startOAuthLogin(input: RuntimeOAuthStartInput) {
      const provider = resolveOAuthProvider(input.provider)?.id;
      if (!provider) {
        throw new RuntimeApiError(`unsupported oauth login provider: ${input.provider}`, 400);
      }

      const existing = loadLatestAccount(input.accountId) ?? undefined;
      const redirectUri = normalizeOAuthRedirectUri(input.redirectUri);
      if (!redirectUri) {
        throw new RuntimeApiError("redirectUri is required", 400);
      }

      const codeVerifier = createPkceCodeVerifier();
      const state = createOAuthState();
      const sessionId = randomUUID();
      const createdAt = new Date().toISOString();

      let scopes: string[];
      let providerSettings: Record<string, unknown>;
      let authorizeUrl: string;

      switch (provider) {
        case "gmail":
          providerSettings = buildGmailOAuthSettings(input, existing);
          scopes = input.scopes?.length ? input.scopes : deps.config.gmailOAuth.scopes;
          authorizeUrl = buildGmailOAuthAuthorizeUrl({
            clientId: providerSettings.oauthClientId as string,
            redirectUri,
            state,
            codeChallenge: createPkceCodeChallenge(codeVerifier),
            scopes,
            loginHint: input.loginHint ?? existing?.emailAddress
          });
          break;
        case "outlook":
          providerSettings = buildOutlookOAuthSettings(input, existing);
          scopes = input.scopes?.length ? input.scopes : deps.config.microsoftOAuth.scopes;
          authorizeUrl = buildMicrosoftOAuthAuthorizeUrl({
            clientId: providerSettings.oauthClientId as string,
            redirectUri,
            state,
            codeChallenge: createPkceCodeChallenge(codeVerifier),
            scopes,
            loginHint: input.loginHint ?? existing?.emailAddress,
            tenant: typeof providerSettings.oauthTenant === "string" ? providerSettings.oauthTenant : undefined
          });
          break;
      }

      upsertOAuthLoginSession(deps.db, {
        sessionId,
        provider,
        accountId: input.accountId,
        loginHint: input.loginHint ?? existing?.emailAddress,
        displayName: input.displayName ?? existing?.displayName,
        state,
        codeVerifier,
        redirectUri,
        scopes,
        settings: {
          [provider]: providerSettings
        },
        status: "pending",
        createdAt,
        updatedAt: createdAt
      });

      return {
        ...redactOAuthLoginSession(getOAuthLoginSession(deps.db, sessionId)),
        authorizeUrl
      };
    },
    startGmailOAuthLogin(input: RuntimeGmailOAuthStartInput) {
      return runtime.startOAuthLogin({
        ...input,
        provider: "gmail"
      });
    },
    async completeOAuthLogin(input: RuntimeOAuthCompleteInput) {
      const session = getOAuthLoginSessionByState(deps.db, input.state);
      if (!session) {
        throw new RuntimeApiError("oauth login session not found", 404);
      }

      if (session.status !== "pending") {
        throw new RuntimeApiError(`oauth login session is already ${session.status}`, 409);
      }

      const sessionTtlMs =
        session.provider === "gmail" ? deps.config.gmailOAuth.sessionTtlMs : deps.config.microsoftOAuth.sessionTtlMs;
      const ageMs = Date.now() - Date.parse(session.createdAt);
      if (Number.isFinite(ageMs) && ageMs > sessionTtlMs) {
        const expiredAt = new Date().toISOString();
        upsertOAuthLoginSession(deps.db, {
          ...session,
          status: "expired",
          errorText: "oauth login session expired before callback completed",
          updatedAt: expiredAt
        });
        throw new RuntimeApiError("oauth login session expired", 410);
      }

      if (input.error?.trim()) {
        const failedAt = new Date().toISOString();
        const description = input.errorDescription?.trim();
        upsertOAuthLoginSession(deps.db, {
          ...session,
          status: "failed",
          errorText: description ? `${input.error.trim()}: ${description}` : input.error.trim(),
          updatedAt: failedAt
        });
        throw new RuntimeApiError(
          description ? `${session.provider} oauth denied: ${description}` : `${session.provider} oauth denied: ${input.error.trim()}`,
          400
        );
      }

      if (!input.code?.trim()) {
        throw new RuntimeApiError("oauth callback is missing code", 400);
      }

      const providerSettings =
        session.settings[session.provider] && typeof session.settings[session.provider] === "object"
          ? (session.settings[session.provider] as Record<string, unknown>)
          : {};
      if (typeof providerSettings.oauthClientId !== "string" || providerSettings.oauthClientId.trim().length === 0) {
        throw new RuntimeApiError("oauth login session is missing oauthClientId", 500);
      }

      let account: MailAccountRecord | null;
      let profile: GmailOAuthProfile | MicrosoftOAuthProfile;
      switch (session.provider) {
        case "gmail": {
          const tokenSet = await gmailOAuthClient.exchangeAuthorizationCode({
            clientId: providerSettings.oauthClientId,
            clientSecret:
              typeof providerSettings.oauthClientSecret === "string" ? providerSettings.oauthClientSecret : undefined,
            code: input.code.trim(),
            redirectUri: session.redirectUri,
            codeVerifier: session.codeVerifier,
            signal: input.signal
          });
          profile = await gmailOAuthClient.getProfile({
            accessToken: tokenSet.accessToken,
            signal: input.signal
          });
          account = buildGmailOAuthAccount({
            session,
            tokens: tokenSet,
            profile
          });
          break;
        }
        case "outlook": {
          const tokenSet = await microsoftOAuthClient.exchangeAuthorizationCode({
            clientId: providerSettings.oauthClientId,
            clientSecret:
              typeof providerSettings.oauthClientSecret === "string" ? providerSettings.oauthClientSecret : undefined,
            code: input.code.trim(),
            redirectUri: session.redirectUri,
            codeVerifier: session.codeVerifier,
            tenant: typeof providerSettings.oauthTenant === "string" ? providerSettings.oauthTenant : undefined,
            signal: input.signal
          });
          profile = await microsoftOAuthClient.getProfile({
            idToken: tokenSet.idToken,
            accessToken: tokenSet.accessToken
          });
          account = buildOutlookOAuthAccount({
            session,
            tokens: tokenSet,
            profile
          });
          break;
        }
        default:
          throw new RuntimeApiError(`unsupported oauth login session provider: ${session.provider}`, 400);
      }
      const completedAt = new Date().toISOString();
      upsertOAuthLoginSession(deps.db, {
        ...session,
        status: "completed",
        resolvedEmailAddress: profile.emailAddress,
        errorText: undefined,
        updatedAt: completedAt,
        completedAt
      });

      return {
        session: redactOAuthLoginSession(getOAuthLoginSession(deps.db, session.sessionId)),
        account,
        profile,
        watchReady:
          account?.provider === "gmail"
            ? hasConfiguredGmailSettings(account.settings)
            : account
              ? hasConfiguredImapSettings(account.settings)
              : false
      };
    },
    async completeGmailOAuthLogin(input: RuntimeGmailOAuthCompleteInput) {
      return runtime.completeOAuthLogin(input);
    },
    getOAuthLoginSession(sessionId: string) {
      return redactOAuthLoginSession(getOAuthLoginSession(deps.db, sessionId));
    },
    replay(roomKey: string) {
      return replayRoom(deps.db, roomKey);
    },
    listProjects(accountId?: string) {
      return listProjectAggregates(deps.db, accountId);
    },
    listScheduledMailJobs(input: {
      statuses?: Array<"active" | "paused" | "cancelled" | "completed">;
      dueBefore?: string;
    } = {}) {
      return listScheduledMailJobs(deps.db, input);
    },
    runScheduledMailJobs(now = new Date().toISOString()) {
      return runScheduledMailJobs({
        db: deps.db,
        config: deps.config,
        now
      });
    },
    runScheduledMailJobNow(jobId: string, now = new Date().toISOString()) {
      return runScheduledMailJobNow({
        db: deps.db,
        config: deps.config,
        jobId,
        now
      });
    },
    pauseScheduledMailJob(jobId: string, now = new Date().toISOString()) {
      return pauseScheduledMailJob(deps.db, jobId, now);
    },
    resumeScheduledMailJob(jobId: string, now = new Date().toISOString()) {
      return resumeScheduledMailJob(deps.db, jobId, now);
    },
    cancelScheduledMailJob(jobId: string, reason: string, now = new Date().toISOString()) {
      return cancelScheduledMailJob(deps.db, jobId, reason, now);
    },
    bindGatewaySessionToRoom(input: Parameters<typeof bindGatewaySessionToRoom>[1]) {
      return bindGatewaySessionToRoom(deps.db, input);
    },
    resolveGatewayTurnRoom(input: Parameters<typeof resolveGatewayTurnRoom>[1]) {
      return resolveGatewayTurnRoom(deps.db, input);
    },
    ingestGatewayEvents(events: GatewayRuntimeEvent[]) {
      try {
        return events.map((event, index) => {
          switch (event.type) {
            case "gateway.session.bind":
              return {
                index,
                type: event.type,
                result: bindGatewaySessionToRoom(deps.db, event)
              };
            case "gateway.turn.project":
              return {
                index,
                type: event.type,
                result: projectGatewayTurnToVirtualMail(deps.db, event)
              };
            case "gateway.history.import":
              return {
                index,
                type: event.type,
                result: importGatewayThreadHistory(deps.db, {
                  ...event,
                  stateDir: deps.config.storage.stateDir
                })
              };
            case "gateway.outcome.project": {
              const projected = projectRoomOutcomeToGateway(deps.db, event);
              void autoDispatchGatewayOutcomesForRoom(projected.roomKey);
              return {
                index,
                type: event.type,
                result: projected
              };
            }
          }
        });
      } catch (error) {
        throw coerceRuntimeApiError(error);
      }
    },
    projectGatewayTurnToVirtualMail(input: Parameters<typeof projectGatewayTurnToVirtualMail>[1]) {
      return projectGatewayTurnToVirtualMail(deps.db, input);
    },
    importGatewayThreadHistory(input: Omit<Parameters<typeof importGatewayThreadHistory>[1], "stateDir">) {
      return importGatewayThreadHistory(deps.db, {
        ...input,
        stateDir: deps.config.storage.stateDir
      });
    },
    syncRoomMessageToEmail(input: RuntimeRoomMailSyncInput & { htmlBody?: string; approvalRequired?: boolean }) {
      try {
        return queueRoomMessageEmailSync(deps.db, deps.config, input);
      } catch (error) {
        throw coerceRuntimeApiError(error);
      }
    },
    getGatewayProjectionTrace(roomKey: string) {
      const replay = replayRoom(deps.db, roomKey);
      if (!replay.room) {
        throw new RuntimeApiError(`thread room not found: ${roomKey}`, 404);
      }

      return replay.gatewayProjectionTrace;
    },
    getConsoleTerminology() {
      return consoleTerminology;
    },
    listConsoleRooms(input?: Parameters<typeof listConsoleRoomsView>[1]) {
      return listConsoleRoomsView(deps.db, input);
    },
    getConsoleRoom(roomKey: string) {
      const view = getConsoleRoomView(deps.db, roomKey);
      if (!view) {
        throw new RuntimeApiError(`thread room not found: ${roomKey}`, 404);
      }

      return resolveConsoleBoundaries(view);
    },
    listConsoleApprovals(input?: Parameters<typeof listConsoleApprovalsView>[1]) {
      return listConsoleApprovalsView(deps.db, input);
    },
    listConsoleAccounts() {
      return listConsoleAccountsSnapshot();
    },
    getConsoleAccount(accountId: string) {
      return getConsoleAccountDetail(accountId);
    },
    inspectRuntimeExecution(): {
      runtime: MailRuntimeExecutionBoundary;
      embeddedSessionCount: number;
      bridgeSessionCount: number;
    } {
      const embeddedSessions =
        deps.config.runtime.mode === "embedded" ? listEmbeddedRuntimeSessions(deps.config) : [];
      const bridgeSessions =
        deps.config.runtime.mode === "bridge" ? listBridgeRuntimeSessions(deps.config) : [];
      return {
        runtime: describeRuntimeExecutionBoundary(deps.config, agentExecutor),
        embeddedSessionCount: embeddedSessions.length,
        bridgeSessionCount: bridgeSessions.length
      };
    },
    listEmbeddedRuntimeSessions(input: {
      sessionKey?: string;
      sessionId?: string;
    } = {}): EmbeddedRuntimeSessionSummary[] {
      return listEmbeddedRuntimeSessions(deps.config, input);
    },
    listBridgeRuntimeSessions(input: {
      sessionKey?: string;
      sessionId?: string;
    } = {}) {
      return listBridgeRuntimeSessions(deps.config, input);
    },
    async inspectMailIoBoundary(): Promise<MailIoBoundarySummary> {
      if (mailIoPlane.inspectBoundary) {
        return mailIoPlane.inspectBoundary();
      }

      return {
        mode: deps.config.mailIo.mode === "command" ? "command" : "local",
        label:
          deps.config.mailIo.mode === "command"
            ? deps.config.mailIo.command.trim().split(/\s+/)[0] ?? "local"
            : "in_process",
        protocol: null,
        handshakeStatus: deps.config.mailIo.mode === "command" ? "failed" : "not_applicable",
        capabilities: [],
        checkedAt: null,
        error:
          deps.config.mailIo.mode === "command"
            ? "mail io plane does not expose boundary inspection"
            : null
      };
    },
    getConsoleWorkbench(input: {
      mode?: "connect" | "accounts" | "rooms" | "mailboxes" | "approvals";
      accountId?: string;
      roomKey?: string;
      mailboxId?: string;
      mailboxFilterId?: string;
      roomStatuses?: string[];
      originKinds?: VirtualMessageOriginKind[];
      approvalStatuses?: Array<"requested" | "approved" | "rejected">;
      roomLimit?: number;
      approvalLimit?: number;
      mailboxFeedLimit?: number;
    } = {}) {
      const accounts = listConsoleAccountsSnapshot();
      const rooms = listConsoleRoomsView(deps.db, {
        accountId: input.accountId,
        mailboxId: input.mailboxFilterId ?? input.mailboxId,
        statuses: input.roomStatuses,
        originKinds: input.originKinds,
        limit: input.roomLimit
      });
      const approvals = listConsoleApprovalsView(deps.db, {
        accountId: input.accountId,
        statuses: input.approvalStatuses,
        limit: input.approvalLimit
      });
      const roomDetail = input.roomKey
        ? (() => {
            const view = getConsoleRoomView(deps.db, input.roomKey ?? "");
            if (!view) {
              throw new RuntimeApiError(`thread room not found: ${input.roomKey}`, 404);
            }
            return resolveConsoleBoundaries(view);
          })()
        : null;
      const selectedAccountId =
        input.mode === "connect" && !input.accountId && !input.roomKey && !input.mailboxId
          ? null
          : input.accountId ?? roomDetail?.room.accountId ?? accounts[0]?.accountId ?? null;
      const accountDetail = selectedAccountId ? tryGetConsoleAccountDetail(selectedAccountId) : null;
      const mailboxConsole = selectedAccountId
        ? (() => {
            try {
              return buildPublicMailboxConsole(selectedAccountId);
            } catch (error) {
              if (error instanceof RuntimeApiError && error.statusCode === 404) {
                return null;
              }
              throw error;
            }
          })()
        : null;
      const mailboxFeed =
        selectedAccountId && input.mailboxId
          ? projectMailboxFeed(deps.db, {
              accountId: selectedAccountId,
              mailboxId: input.mailboxId,
              limit: input.mailboxFeedLimit,
              originKinds: input.originKinds
            })
          : [];
      const roomMailboxView =
        input.roomKey && input.mailboxId
          ? projectMailboxView(deps.db, {
              roomKey: input.roomKey,
              mailboxId: input.mailboxId,
              originKinds: input.originKinds
            })
          : [];
      const workspace = buildConsoleWorkbenchWorkspace({
        mode: input.mode,
        selectedAccountId,
        selectedRoomKey: input.roomKey ?? null,
        selectedMailboxId: input.mailboxId ?? null,
        accounts,
        rooms,
        approvals,
        mailboxConsole
      });

      return {
        terminology: consoleTerminology,
        workspace,
        selection: {
          accountId: selectedAccountId,
          roomKey: input.roomKey ?? null,
          mailboxId: input.mailboxId ?? null
        },
        accounts,
        rooms,
        approvals,
        accountDetail,
        roomDetail,
        mailboxConsole,
        mailboxFeed,
        roomMailboxView
      };
    },
    getConsoleWorkbenchHost() {
      const workspace = buildConsoleWorkbenchWorkspace({
        mode: "connect",
        selectedAccountId: null,
        selectedRoomKey: null,
        selectedMailboxId: null,
        accounts: listConsoleAccountsSnapshot(),
        rooms: listConsoleRoomsView(deps.db, {}),
        approvals: listConsoleApprovalsView(deps.db, {}),
        mailboxConsole: null
      });

      return {
        service: deps.config.serviceName,
        integration: workspace.hostIntegration,
        entrypoints: workspace.entrypoints,
        tabs: workspace.tabs.map((tab) => ({
          id: tab.id,
          label: tab.label,
          href: tab.href,
          embeddedHref: tab.embeddedHref ?? tab.href
        }))
      };
    },
    listAgentTemplates() {
      return listConfiguredAgentTemplates();
    },
    getAgentDirectory(input: {
      tenantId: string;
      accountId?: string;
    }) {
      return listAgentDirectory(input);
    },
    listAgentSkills(input: {
      tenantId: string;
      accountId?: string;
      agentId?: string;
    }) {
      return listSkillsForAgents(input);
    },
    inspectAgentSkill(input: {
      tenantId: string;
      agentId: string;
      skillId: string;
    }) {
      return getAgentWorkspaceSkill(deps.config, input.tenantId, input.agentId, input.skillId);
    },
    getHeadcountRecommendations(accountId?: string) {
      return listHeadcountRecommendations(accountId);
    },
    applyAgentTemplate(input: {
      templateId: string;
      accountId: string;
      tenantId?: string;
      now?: string;
    }) {
      const template = getAgentTemplate(input.templateId);
      if (!template) {
        throw new RuntimeApiError(`agent template not found: ${input.templateId}`, 404);
      }

      const now = input.now ?? new Date().toISOString();
      const tenantId = input.tenantId ?? input.accountId;
      const directoryEntries = template.persistentAgents.map((agent) =>
        buildAgentDirectoryEntry({
          templateId: template.templateId,
          agent
        })
      );

      const createdAgents = template.persistentAgents.map((agent) => {
        const workspace = ensureAgentWorkspace(deps.config, tenantId, agent.agentId, {
          profile: {
            displayName: agent.displayName,
            purpose: agent.purpose,
            publicMailboxId: agent.publicMailboxId,
            sourceAlignment: agent.sourceAlignment,
            sourceRefs: agent.sourceRefs,
            roleContract: agent.roleContract,
            collaboratorAgentIds: agent.collaborators.map((entry) => entry.agentId),
            collaboratorNotes: agent.collaborators,
            templateId: template.templateId,
            headcountNotes: template.headcount.notes
          },
          directoryEntries
        });

        for (const mailbox of buildAgentVirtualMailboxes({
          accountId: input.accountId,
          agentId: agent.agentId,
          publicMailboxId: agent.publicMailboxId,
          now,
          visibilityPolicyRef: agent.visibilityPolicyRef,
          capabilityPolicyRef: agent.capabilityPolicyRef
        })) {
          upsertVirtualMailbox(deps.db, mailbox);
        }

        ensurePublicAgentInbox(deps.db, {
          accountId: input.accountId,
          agentId: agent.agentId,
          activeRoomLimit: agent.inbox.activeRoomLimit,
          ackSlaSeconds: agent.inbox.ackSlaSeconds,
          burstCoalesceSeconds: agent.inbox.burstCoalesceSeconds,
          now
        });

        return {
          agentId: agent.agentId,
          displayName: agent.displayName,
          workspace
        };
      });

      for (const target of template.subagentTargets) {
        upsertVirtualMailbox(deps.db, {
          mailboxId: target.mailboxId,
          accountId: input.accountId,
          kind: "system",
          principalId: `principal:${target.mailboxId}`,
          active: true,
          createdAt: now,
          updatedAt: now
        });
        saveSubAgentTarget(deps.db, {
          targetId: target.targetId,
          accountId: input.accountId,
          mailboxId: target.mailboxId,
          openClawAgentId: target.openClawAgentId,
          mode: "burst",
          sandboxMode: target.sandboxMode,
          maxActivePerRoom: target.maxActivePerRoom,
          maxQueuedPerInbox: target.maxQueuedPerInbox,
          allowExternalSend: false,
          resultSchema: target.resultSchema,
          enabled: true,
          createdAt: now,
          updatedAt: now
        });
      }

      const account = getMailAccount(deps.db, input.accountId);
      if (account) {
        upsertMailAccount(deps.db, {
          ...account,
          settings: mergeAgentRoutingIntoAccountSettings(account.settings, {
            templateId: template.templateId,
            defaultFrontAgentId: template.persistentAgents[0]?.agentId,
            durableAgentIds: template.persistentAgents.map((agent) => agent.agentId),
            collaboratorAgentIds: template.persistentAgents.slice(1).map((agent) => agent.agentId),
            updatedAt: now
          }),
          updatedAt: now
        });
      }

      return {
        templateId: template.templateId,
        accountId: input.accountId,
        tenantId,
        createdAgents: createdAgents.map((agent) => ({
          agentId: agent.agentId,
          displayName: agent.displayName,
          soulPath: agent.workspace.soulPath,
          agentsPath: agent.workspace.agentsPath
        })),
        agentDirectory: listAgentDirectory({
          tenantId,
          accountId: input.accountId
        }),
        headcountRecommendations: listHeadcountRecommendations(input.accountId)
      };
    },
    createCustomAgent(input: {
      accountId: string;
      tenantId?: string;
      agentId: string;
      displayName?: string;
      purpose?: string;
      publicMailboxId?: string;
      collaboratorAgentIds?: string[];
      activeRoomLimit?: number;
      ackSlaSeconds?: number;
      burstCoalesceSeconds?: number;
      now?: string;
    }) {
      const now = input.now ?? new Date().toISOString();
      const tenantId = input.tenantId ?? input.accountId;
      const publicMailboxId = input.publicMailboxId?.trim() || `public:${input.agentId}`;
      const existingDirectory = listAgentDirectory({
        tenantId,
        accountId: input.accountId
      });
      const directoryEntries = [
        ...existingDirectory.map((entry) => ({
          agentId: entry.agentId,
          displayName: entry.displayName,
          purpose: entry.purpose,
          publicMailboxId: entry.publicMailboxId,
          virtualMailboxes: entry.virtualMailboxes,
          collaboratorAgentIds: entry.collaboratorAgentIds,
          ...(entry.templateId ? { templateId: entry.templateId } : {})
        })),
        {
          agentId: input.agentId,
          displayName: input.displayName?.trim() || input.agentId,
          purpose:
            input.purpose?.trim() ||
            "Custom durable MailClaws agent for work splitting, review, and reusable inbox ownership.",
          publicMailboxId,
          virtualMailboxes: buildAgentVirtualMailboxes({
            accountId: input.accountId,
            agentId: input.agentId,
            publicMailboxId,
            now
          }).map((mailbox) => mailbox.mailboxId),
          collaboratorAgentIds: input.collaboratorAgentIds ?? []
        }
      ].filter(
        (entry, index, array) => array.findIndex((candidate) => candidate.agentId === entry.agentId) === index
      );

      const workspace = ensureAgentWorkspace(deps.config, tenantId, input.agentId, {
        profile: {
          displayName: input.displayName,
          purpose: input.purpose,
          publicMailboxId,
          collaboratorAgentIds: input.collaboratorAgentIds,
          collaboratorNotes: (input.collaboratorAgentIds ?? []).map((agentId) => ({
            agentId,
            reason: "this durable collaborator can receive internal task mail when the room needs help"
          })),
          templateId: "custom",
          headcountNotes: [
            "Custom agents should own a clear mailbox and a narrow operating contract.",
            "Keep burst subagents for elastic compute; keep durable agents for recurring inbox ownership."
          ]
        },
        directoryEntries
      });

      for (const mailbox of buildAgentVirtualMailboxes({
        accountId: input.accountId,
        agentId: input.agentId,
        publicMailboxId,
        now
      })) {
        upsertVirtualMailbox(deps.db, mailbox);
      }

      ensurePublicAgentInbox(deps.db, {
        accountId: input.accountId,
        agentId: input.agentId,
        activeRoomLimit: input.activeRoomLimit ?? 3,
        ackSlaSeconds: input.ackSlaSeconds ?? 300,
        burstCoalesceSeconds: input.burstCoalesceSeconds ?? 90,
        now
      });

      return {
        accountId: input.accountId,
        tenantId,
        agentId: input.agentId,
        workspace: {
          soulPath: workspace.soulPath,
          agentsPath: workspace.agentsPath
        },
        agentDirectory: listAgentDirectory({
          tenantId,
          accountId: input.accountId
        }),
        headcountRecommendations: listHeadcountRecommendations(input.accountId)
      };
    },
    async installAgentSkill(input: {
      tenantId: string;
      agentId: string;
      source: string;
      skillId?: string;
      title?: string;
      now?: string;
    }) {
      return installAgentWorkspaceSkill(deps.config, input);
    },
    projectRoomOutcomeToGateway(input: Parameters<typeof projectRoomOutcomeToGateway>[1]) {
      try {
        const result = projectRoomOutcomeToGateway(deps.db, input);
        void autoDispatchGatewayOutcomesForRoom(result.roomKey);
        return result;
      } catch (error) {
        throw coerceRuntimeApiError(error);
      }
    },
    async dispatchPendingGatewayOutcomes(input: {
      roomKey?: string;
      limit?: number;
    } = {}) {
      try {
        return await dispatchPendingGatewayOutcomes(input);
      } catch (error) {
        throw coerceRuntimeApiError(error);
      }
    },
    listRooms() {
      return listThreadRooms(deps.db);
    },
    retrieveRoomContext(roomKey: string, query: string, limit?: number) {
      return searchRoomContext(deps.db, {
        roomKey,
        query,
        limit
      });
    },
    recover(now = new Date().toISOString()) {
      return recoverRoomQueue(deps.db, now);
    },
    async deliverOutbox() {
      return mailIoPlane.deliverQueuedOutbox(deps.db, ({ record }) => {
        const resolved = resolveOutboxSender(record.roomKey);
        if (!resolved.sender) {
          return null;
        }

        return {
          sender: resolved.sender,
          threadId: resolved.providerThreadId
        };
      });
    },
    async drainQueue(options: {
      maxRuns?: number;
      now?: string;
    } = {}) {
      const workerPool = createWorkerPool({
        maxGlobalWorkers: Math.min(
          deps.config.queue.maxConcurrentRooms,
          deps.config.queue.maxGlobalWorkers
        ),
        maxWorkersPerRoom: deps.config.queue.maxWorkersPerRoom
      });
      const activeTasks = new Set<Promise<void>>();
      const processed: Awaited<ReturnType<typeof processNextRoomJob>>[] = [];
      const servedRoomsThisCycle = new Map<string, number>();
      const limit = options.maxRuns ?? Number.POSITIVE_INFINITY;
      let scheduled = 0;

      const scheduleNext = () => {
        if (scheduled >= limit) {
          return false;
        }

        const leaseInput = {
          leaseOwner: `mail-orchestrator:${scheduled + 1}`,
          now: options.now ?? new Date().toISOString(),
          leaseDurationMs: 60_000,
          priorityAgingMs: deps.config.queue.priorityAgingMs,
          priorityAgingStep: deps.config.queue.priorityAgingStep,
          roomFairnessPenaltyStep: deps.config.queue.roomFairnessPenaltyStep,
          roomFairnessPenaltyCounts: Object.fromEntries(servedRoomsThisCycle)
        };
        const leased = leaseNextRoomJob(deps.db, leaseInput);

        if (!leased?.messageDedupeKey) {
          return false;
        }

        if (!workerPool.tryAcquire(leased.roomKey)) {
          throw new Error(`worker pool rejected leased room ${leased.roomKey}`);
        }

        scheduled += 1;
        const task = processLeasedRoomJob(
          {
            db: deps.db,
            config: deps.config,
            agentExecutor,
            subAgentTransport
          },
          leased as LeasedRoomJob
        )
          .then((result) => {
            if (result?.status === "completed") {
              return autoDispatchGatewayOutcomesForRoom(result.roomKey).then(() => {
                processed.push(result);
              });
            }
            processed.push(result);
          })
          .finally(() => {
            workerPool.release(leased.roomKey);
            activeTasks.delete(task);
          });
        activeTasks.add(task);
        servedRoomsThisCycle.set(leased.roomKey, (servedRoomsThisCycle.get(leased.roomKey) ?? 0) + 1);
        return true;
      };

      while (activeTasks.size < deps.config.queue.maxConcurrentRooms && scheduleNext()) {
        continue;
      }

      while (activeTasks.size > 0) {
        await Promise.race(activeTasks);

        while (activeTasks.size < deps.config.queue.maxConcurrentRooms && scheduleNext()) {
          continue;
        }
      }

      return {
        processed,
        workerPool: workerPool.snapshot()
      };
    },
    approveOutbox(outboxId: string, now = new Date().toISOString()) {
      const updated = transitionOutbox(deps.db, outboxId, {
        expectedStatus: "pending_approval",
        nextStatus: "queued",
        now
      });
      const approvalRequest = findApprovalRequestByReferenceId(deps.db, outboxId);
      if (approvalRequest) {
        updateApprovalRequestStatus(deps.db, approvalRequest.requestId, {
          status: "approved",
          decidedAt: now
        });
      }
      appendApprovalLedgerEvent(deps.db, updated, "approval.approved", now, {
        previousStatus: "pending_approval",
        nextStatus: "queued"
      });
      return updated;
    },
    rejectOutbox(outboxId: string, now = new Date().toISOString()) {
      const updated = transitionOutbox(deps.db, outboxId, {
        expectedStatus: "pending_approval",
        nextStatus: "rejected",
        now,
        errorText: "rejected by reviewer"
      });
      const approvalRequest = findApprovalRequestByReferenceId(deps.db, outboxId);
      if (approvalRequest) {
        updateApprovalRequestStatus(deps.db, approvalRequest.requestId, {
          status: "rejected",
          decidedAt: now,
          errorText: "rejected by reviewer"
        });
      }
      appendApprovalLedgerEvent(deps.db, updated, "approval.rejected", now, {
        previousStatus: "pending_approval",
        nextStatus: "rejected",
        errorText: "rejected by reviewer"
      });
      return updated;
    },
    resendOutbox(outboxId: string, now = new Date().toISOString()) {
      const record = findControlPlaneOutbox(deps.db, outboxId);
      if (!record) {
        throw new OutboxActionError("outbox item not found", 404);
      }

      if (!["failed", "rejected"].includes(record.status)) {
        throw new OutboxActionError("outbox item is not eligible for resend", 409);
      }

      updateControlPlaneOutboxStatus(deps.db, outboxId, {
        status: "queued",
        updatedAt: now
      });

      return findControlPlaneOutbox(deps.db, outboxId);
    },
    listQuarantine() {
      return listThreadRooms(deps.db).flatMap((room) => {
        const failure = [...listThreadLedgerEvents(deps.db, room.roomKey)]
          .reverse()
          .find((event) => {
            if (event.type !== "room.failed") {
              return false;
            }

            const payload = event.payload as { reasons?: unknown };
            return Array.isArray(payload.reasons) && payload.reasons.length > 0;
          });

        if (!failure) {
          return [];
        }

        return [
          {
            roomKey: room.roomKey,
            accountId: room.accountId,
            stableThreadId: room.stableThreadId,
            revision: room.revision,
            failedAt: failure.createdAt,
            reasons: (failure.payload as { reasons: string[] }).reasons
          }
        ];
      });
    },
    listDeadLetter() {
      const outboxIntents = listControlPlaneOutboxByStatus(deps.db, ["failed", "rejected"]);
      return {
        roomJobs: listRoomQueueJobs(deps.db, {
          statuses: ["failed"]
        }),
        outbox: outboxIntents.map(mapOutboxIntentToMailOutboxRecord),
        outboxIntents
      };
    },
    retryRoomJob(jobId: string, now = new Date().toISOString()) {
      const job = getRoomQueueJob(deps.db, jobId);
      if (!job) {
        throw new RoomJobActionError("room queue job not found", 404);
      }

      if (job.status !== "failed") {
        throw new RoomJobActionError("room queue job is not eligible for retry", 409);
      }

      const room = getThreadRoom(deps.db, job.roomKey);
      if (!room) {
        throw new RoomJobActionError("room for queue job not found", 404);
      }

      if (room.revision > job.revision) {
        throw new RoomJobActionError(
          `room queue job revision ${job.revision} is stale; current room revision is ${room.revision}`,
          409
        );
      }

      const retried = retryFailedRoomJob(deps.db, jobId, {
        now
      });
      if (!retried) {
        throw new RoomJobActionError("room queue job could not be retried", 409);
      }

      saveThreadRoom(deps.db, {
        ...room,
        state: "queued"
      });

      return retried;
    },
    traceApprovals(roomKey: string) {
      const room = getThreadRoom(deps.db, roomKey);
      const outboxIntents = listOutboxIntentsForRoom(deps.db, roomKey);
      const outbox = listControlPlaneOutboxForRoom(deps.db, roomKey).map(mapOutboxIntentToMailOutboxRecord);
      const approvalRequests = listApprovalRequestsForRoom(deps.db, roomKey);
      const approvalEvents = listThreadLedgerEvents(deps.db, roomKey).filter((event) =>
        ["approval.requested", "approval.approved", "approval.rejected"].includes(event.type)
      );

      return {
        room,
        roomKey,
        revision: room?.revision ?? 0,
        pendingCount: approvalRequests.filter((record) => record.status === "requested").length,
        approvalRequests,
        approvalEvents,
        outbox,
        outboxIntents
      };
    },
    requestHandoff(
      roomKey: string,
      input: {
        requestedBy?: string;
        reason?: string;
        now?: string;
      } = {}
    ) {
      const room = getThreadRoom(deps.db, roomKey);
      if (!room) {
        throw new RoomJobActionError("room not found", 404);
      }

      const now = input.now ?? new Date().toISOString();
      const queuedJobs = listRoomQueueJobs(deps.db, {
        statuses: ["queued"]
      }).filter((job) => job.roomKey === roomKey);

      for (const job of queuedJobs) {
        cancelRoomJob(deps.db, job.jobId, {
          cancelledAt: now
        });
      }

      saveThreadRoom(deps.db, {
        ...room,
        state: "handoff"
      });
      appendThreadLedgerEvent(deps.db, {
        roomKey,
        revision: room.revision,
        type: "handoff.requested",
        payload: {
          requestedBy: input.requestedBy ?? "operator",
          reason: input.reason ?? null,
          cancelledQueuedJobIds: queuedJobs.map((job) => job.jobId)
        }
      });

      return {
        room: getThreadRoom(deps.db, roomKey),
        cancelledJobIds: queuedJobs.map((job) => job.jobId)
      };
    },
    releaseHandoff(
      roomKey: string,
      input: {
        releasedBy?: string;
        reason?: string;
        now?: string;
      } = {}
    ) {
      const room = getThreadRoom(deps.db, roomKey);
      if (!room) {
        throw new RoomJobActionError("room not found", 404);
      }

      const now = input.now ?? new Date().toISOString();
      const activeJobs = listRoomQueueJobs(deps.db, {
        statuses: ["queued", "leased"]
      }).filter((job) => job.roomKey === roomKey);
      let resumedJob = activeJobs.find((job) => job.revision === room.revision) ?? null;

      if (!resumedJob) {
        const latestMessage = findLatestMailMessageForThread(deps.db, room.stableThreadId);
        if (latestMessage) {
          resumedJob = enqueueRoomJob(deps.db, {
            jobId: `handoff-release:${room.roomKey}:${room.revision}:${Date.parse(now)}`,
            roomKey,
            revision: room.revision,
            inboundSeq: room.lastInboundSeq,
            messageDedupeKey: latestMessage.dedupeKey,
            priority: 100,
            createdAt: now
          });
        }
      }

      saveThreadRoom(deps.db, {
        ...room,
        state: resumedJob ? "queued" : "idle"
      });
      appendThreadLedgerEvent(deps.db, {
        roomKey,
        revision: room.revision,
        type: "handoff.completed",
        payload: {
          releasedBy: input.releasedBy ?? "operator",
          reason: input.reason ?? null,
          resumedJobId: resumedJob?.jobId ?? null
        }
      });

      return {
        room: getThreadRoom(deps.db, roomKey),
        resumedJob
      };
    },
    upsertVirtualMailbox(mailbox: VirtualMailbox) {
      return upsertVirtualMailbox(deps.db, mailbox);
    },
    upsertPublicAgentInbox(inbox: PublicAgentInbox) {
      savePublicAgentInbox(deps.db, inbox);
      return getPublicAgentInbox(deps.db, {
        inboxId: inbox.inboxId
      });
    },
    ensurePublicAgentInbox(input: Parameters<typeof ensurePublicAgentInbox>[1]) {
      return ensurePublicAgentInbox(deps.db, input);
    },
    getPublicAgentInbox(input: Parameters<typeof getPublicAgentInbox>[1]) {
      return getPublicAgentInbox(deps.db, input);
    },
    listPublicAgentInboxes(accountId: string) {
      return listPublicAgentInboxesForAccount(deps.db, accountId);
    },
    projectPublicAgentInbox(input: Parameters<typeof projectPublicAgentInbox>[1]) {
      return projectPublicAgentInbox(deps.db, input);
    },
    projectInboxItemForRoom(input: Parameters<typeof projectInboxItemForRoom>[1]) {
      return projectInboxItemForRoom(deps.db, input);
    },
    getInboxItem(inboxItemId: string) {
      return getInboxItem(deps.db, inboxItemId);
    },
    getInboxItemForRoom(input: Parameters<typeof getInboxItemForRoom>[1]) {
      return getInboxItemForRoom(deps.db, input);
    },
    listInboxItems(inboxId: string) {
      return listInboxItemsForInbox(deps.db, inboxId);
    },
    triageInboxItem(input: Parameters<typeof markInboxItemTriaged>[1]) {
      return markInboxItemTriaged(deps.db, input);
    },
    schedulePublicAgentInbox(input: Parameters<typeof schedulePublicAgentInbox>[2]) {
      return schedulePublicAgentInbox(deps.db, deps.config, input);
    },
    upsertSubAgentTarget(target: SubAgentTarget) {
      saveSubAgentTarget(deps.db, target);
      return getSubAgentTarget(deps.db, target.targetId);
    },
    getSubAgentTarget(targetId: string) {
      return getSubAgentTarget(deps.db, targetId);
    },
    getSubAgentTargetByMailboxId(mailboxId: string) {
      return getSubAgentTargetByMailboxId(deps.db, mailboxId);
    },
    listSubAgentTargets(accountId: string) {
      return listSubAgentTargetsForAccount(deps.db, accountId);
    },
    listSubAgentRuns(roomKey: string) {
      return listSubAgentRunsForRoom(deps.db, roomKey);
    },
    async dispatchSubAgentMailbox(input: Parameters<typeof dispatchSubAgentMailbox>[3]) {
      if (!subAgentTransport) {
        throw new RuntimeFeatureDisabledError("openclaw subagent bridge is disabled");
      }
      return dispatchSubAgentMailbox(deps.db, deps.config, subAgentTransport, input);
    },
    submitVirtualMessage(input: Parameters<typeof submitVirtualMessage>[1]) {
      const result = submitVirtualMessage(deps.db, input);
      maybeAutoProjectRoomOutcomeToGateway(deps.db, {
        roomKey: result.message.roomKey,
        messageId: result.message.messageId,
        projectedAt: result.message.createdAt
      });
      void autoDispatchGatewayOutcomesForRoom(result.message.roomKey);
      return result;
    },
    replyVirtualMessage(parentMessageId: string, input: Parameters<typeof replyVirtualMessage>[2]) {
      const result = replyVirtualMessage(deps.db, parentMessageId, input);
      maybeAutoProjectRoomOutcomeToGateway(deps.db, {
        roomKey: result.message.roomKey,
        messageId: result.message.messageId,
        projectedAt: result.message.createdAt
      });
      void autoDispatchGatewayOutcomesForRoom(result.message.roomKey);
      return result;
    },
    consumeMailbox(input: Parameters<typeof consumeMailbox>[1]) {
      return consumeMailbox(deps.db, input);
    },
    projectMailboxView(input: Parameters<typeof projectMailboxView>[1]) {
      try {
        return projectMailboxView(deps.db, input);
      } catch (error) {
        throw coerceRuntimeApiError(error);
      }
    },
    projectMailboxFeed(input: Parameters<typeof projectMailboxFeed>[1]) {
      try {
        return projectMailboxFeed(deps.db, input);
      } catch (error) {
        throw coerceRuntimeApiError(error);
      }
    },
    rebuildVirtualMailProjection(roomKey: string) {
      return rebuildVirtualMailProjectionFromLedger(deps.db, roomKey);
    },
    listAccounts() {
      return listMailAccounts(deps.db);
    },
    listPublicAccounts() {
      return listMailAccounts(deps.db).map(redactMailAccount);
    },
    getAccountProviderState(accountId: string, options?: { eventLimit?: number }) {
      const account = getMailAccount(deps.db, accountId);
      if (!account) {
        throw new RuntimeApiError(`mail account not found: ${accountId}`, 404);
      }

      const cursors = listProviderCursors(deps.db, accountId);
      const recentEvents = listProviderEventsForAccount(deps.db, accountId).slice(-(options?.eventLimit ?? 20));

      return {
        account,
        cursors,
        recentEvents,
        summary: summarizeAccountProviderState(account, cursors, recentEvents, {
          globalSmtpConfigured: Boolean(smtpSender)
        })
      };
    },
    getPublicAccountProviderState(accountId: string, options?: { eventLimit?: number }) {
      return buildPublicAccountProviderState(accountId, options);
    },
    getMailboxConsole(accountId: string) {
      return buildMailboxConsole(accountId);
    },
    getPublicMailboxConsole(accountId: string) {
      return buildPublicMailboxConsole(accountId);
    },
    initAgentMemory(
      tenantId: string,
      agentId: string,
      options?: {
        actor?: MemoryNamespaceActor;
      }
    ) {
      assertMemoryManagementAllowed({
        actor: options?.actor,
        action: "init_agent_memory",
        tenantId,
        agentId
      });
      return ensureAgentWorkspace(deps.config, tenantId, agentId);
    },
    readMemoryNamespace(
      input: MemoryNamespaceSpec,
      options?: {
        actor?: MemoryNamespaceActor;
      }
    ) {
      const descriptor = readScopedMemoryNamespace(deps.config, input, options);
      const recordedAt = new Date().toISOString();
      upsertMemoryNamespace(deps.db, descriptor, recordedAt);
      if ("roomKey" in descriptor && typeof descriptor.roomKey === "string") {
        bindMemoryNamespaceToRoom(
          deps.db,
          descriptor.roomKey,
          descriptor.namespaceKey,
          recordedAt
        );
      }
      return descriptor;
    },
    listMemoryDrafts(
      tenantId: string,
      agentId: string,
      options?: {
        actor?: MemoryNamespaceActor;
      }
    ) {
      assertMemoryManagementAllowed({
        actor: options?.actor,
        action: "list_memory_drafts",
        tenantId,
        agentId
      });
      return listAgentMemoryDrafts(deps.config, tenantId, agentId);
    },
    createMemoryDraft(input: {
      tenantId: string;
      agentId: string;
      roomKey: string;
      title: string;
      content?: string;
      actor?: MemoryNamespaceActor;
    }) {
      assertMemoryManagementAllowed({
        actor: input.actor,
        action: "create_memory_draft",
        tenantId: input.tenantId,
        agentId: input.agentId,
        roomKey: input.roomKey
      });
      if (input.content?.trim()) {
        throw new Error("memory drafts must be backed by room memory snapshots");
      }

      const created = createAgentMemoryDraftFromLatestRoomSnapshot(deps.config, input);
      const createdNamespaces = resolveAgentMemoryDraftNamespaces(created.draft);
      const createdAt = created.draft.createdAt;
      upsertMemoryNamespace(deps.db, {
        ...createdNamespaces.sourceNamespace,
        rootDir: path.dirname(created.draft.roomMemoryPath ?? created.draft.roomSnapshotPath ?? ""),
        primaryPath: created.draft.roomMemoryPath ?? "",
        metadataPath: undefined,
        capabilities: getMemoryNamespaceCapabilities(createdNamespaces.sourceNamespace.scope)
      }, createdAt);
      upsertMemoryNamespace(deps.db, {
        ...createdNamespaces.targetNamespace,
        rootDir: ensureAgentWorkspace(deps.config, input.tenantId, input.agentId).agentDir,
        primaryPath: ensureAgentWorkspace(deps.config, input.tenantId, input.agentId).memoryPath,
        metadataPath: undefined,
        capabilities: getMemoryNamespaceCapabilities(createdNamespaces.targetNamespace.scope)
      }, createdAt);
      bindMemoryNamespaceToRoom(deps.db, input.roomKey, createdNamespaces.sourceNamespace.namespaceKey, createdAt);
      bindMemoryNamespaceToRoom(deps.db, input.roomKey, createdNamespaces.targetNamespace.namespaceKey, createdAt);
      upsertMemoryPromotion(deps.db, {
        promotionId: created.draft.draftId,
        roomKey: created.draft.roomKey,
        tenantId: input.tenantId,
        agentId: input.agentId,
        title: created.draft.title,
        status: "requested",
        sourceNamespaceKey: createdNamespaces.sourceNamespace.namespaceKey,
        targetNamespaceKey: createdNamespaces.targetNamespace.namespaceKey,
        roomMemoryPath: created.draft.roomMemoryPath,
        roomSnapshotPath: created.draft.roomSnapshotPath,
        createdAt,
        updatedAt: createdAt
      });
      const room = getThreadRoom(deps.db, input.roomKey);
      appendThreadLedgerEvent(deps.db, {
        roomKey: input.roomKey,
        revision: room?.revision ?? 0,
        type: "memory.promotion.requested",
        payload: {
          draftId: created.draft.draftId,
          tenantId: input.tenantId,
          agentId: input.agentId,
          title: created.draft.title,
          sourceKind: created.draft.sourceKind,
          sourceNamespace: createdNamespaces.sourceNamespace,
          targetNamespace: createdNamespaces.targetNamespace,
          roomMemoryPath: created.draft.roomMemoryPath,
          roomSnapshotPath: created.draft.roomSnapshotPath
        }
      });

      return created;
    },
    reviewMemoryDraft(input: {
      tenantId: string;
      agentId: string;
      draftId: string;
      reviewedBy: string;
      actor?: MemoryNamespaceActor;
    }) {
      assertMemoryManagementAllowed({
        actor: input.actor,
        action: "review_memory_draft",
        tenantId: input.tenantId,
        agentId: input.agentId
      });
      const reviewed = reviewAgentMemoryDraft(deps.config, input);
      upsertMemoryPromotion(deps.db, {
        promotionId: reviewed.draft.draftId,
        roomKey: reviewed.draft.roomKey,
        tenantId: input.tenantId,
        agentId: input.agentId,
        title: reviewed.draft.title,
        status: "reviewed",
        sourceNamespaceKey: reviewed.draft.sourceNamespace?.namespaceKey,
        targetNamespaceKey: reviewed.draft.targetNamespace?.namespaceKey,
        roomMemoryPath: reviewed.draft.roomMemoryPath,
        roomSnapshotPath: reviewed.draft.roomSnapshotPath,
        reviewedBy: reviewed.draft.reviewedBy,
        reviewedAt: reviewed.draft.reviewedAt,
        createdAt: reviewed.draft.createdAt,
        updatedAt: reviewed.draft.reviewedAt ?? reviewed.draft.createdAt
      });
      const room = getThreadRoom(deps.db, reviewed.draft.roomKey);
      appendThreadLedgerEvent(deps.db, {
        roomKey: reviewed.draft.roomKey,
        revision: room?.revision ?? 0,
        type: "memory.promotion.reviewed",
        payload: {
          draftId: reviewed.draft.draftId,
          tenantId: input.tenantId,
          agentId: input.agentId,
          reviewedBy: reviewed.draft.reviewedBy,
          reviewedAt: reviewed.draft.reviewedAt
        }
      });

      return reviewed;
    },
    approveMemoryDraft(input: {
      tenantId: string;
      agentId: string;
      draftId: string;
      actor?: MemoryNamespaceActor;
    }) {
      assertMemoryManagementAllowed({
        actor: input.actor,
        action: "approve_memory_draft",
        tenantId: input.tenantId,
        agentId: input.agentId
      });
      const approved = approveAgentMemoryDraft(deps.config, input);
      const draft = findAgentMemoryDraft(deps.config, input.tenantId, input.agentId, input.draftId).draft;
      const draftNamespaces = resolveAgentMemoryDraftNamespaces(draft);
      upsertMemoryPromotion(deps.db, {
        promotionId: draft.draftId,
        roomKey: draft.roomKey,
        tenantId: input.tenantId,
        agentId: input.agentId,
        title: draft.title,
        status: "approved",
        sourceNamespaceKey: draftNamespaces.sourceNamespace.namespaceKey,
        targetNamespaceKey: draftNamespaces.targetNamespace.namespaceKey,
        roomMemoryPath: draft.roomMemoryPath,
        roomSnapshotPath: draft.roomSnapshotPath,
        reviewedBy: draft.reviewedBy,
        reviewedAt: draft.reviewedAt,
        approvedAt: draft.approvedAt,
        memoryPath: approved.memoryPath,
        createdAt: draft.createdAt,
        updatedAt: draft.approvedAt ?? draft.createdAt
      });
      const room = getThreadRoom(deps.db, draft.roomKey);
      appendThreadLedgerEvent(deps.db, {
        roomKey: draft.roomKey,
        revision: room?.revision ?? 0,
        type: "memory.promotion.approved",
        payload: {
          draftId: draft.draftId,
          tenantId: input.tenantId,
          agentId: input.agentId,
          approvedAt: draft.approvedAt,
          sourceNamespace: draftNamespaces.sourceNamespace,
          targetNamespace: draftNamespaces.targetNamespace,
          memoryPath: approved.memoryPath
        }
      });

      return approved;
    },
    rejectMemoryDraft(input: {
      tenantId: string;
      agentId: string;
      draftId: string;
      actor?: MemoryNamespaceActor;
    }) {
      assertMemoryManagementAllowed({
        actor: input.actor,
        action: "reject_memory_draft",
        tenantId: input.tenantId,
        agentId: input.agentId
      });
      const rejected = rejectAgentMemoryDraft(deps.config, input);
      upsertMemoryPromotion(deps.db, {
        promotionId: rejected.draft.draftId,
        roomKey: rejected.draft.roomKey,
        tenantId: input.tenantId,
        agentId: input.agentId,
        title: rejected.draft.title,
        status: "rejected",
        sourceNamespaceKey: rejected.draft.sourceNamespace?.namespaceKey,
        targetNamespaceKey: rejected.draft.targetNamespace?.namespaceKey,
        roomMemoryPath: rejected.draft.roomMemoryPath,
        roomSnapshotPath: rejected.draft.roomSnapshotPath,
        reviewedBy: rejected.draft.reviewedBy,
        reviewedAt: rejected.draft.reviewedAt,
        rejectedAt: rejected.draft.rejectedAt,
        createdAt: rejected.draft.createdAt,
        updatedAt: rejected.draft.rejectedAt ?? rejected.draft.createdAt
      });
      const room = getThreadRoom(deps.db, rejected.draft.roomKey);
      appendThreadLedgerEvent(deps.db, {
        roomKey: rejected.draft.roomKey,
        revision: room?.revision ?? 0,
        type: "memory.promotion.rejected",
        payload: {
          draftId: rejected.draft.draftId,
          tenantId: input.tenantId,
          agentId: input.agentId,
          rejectedAt: rejected.draft.rejectedAt
        }
      });

      return rejected;
    },
    upsertAccount(input: Omit<MailAccountRecord, "createdAt" | "updatedAt">) {
      return upsertAccountRecord(input);
    },
    startWatchers(options: RuntimeWatcherOptions) {
      const controllers: Record<string, WatcherController<string>> = {};

      for (const account of listMailAccounts(deps.db)) {
        if (account.status !== "active") {
          continue;
        }

        const watchSettings = getWatchSettings(account.settings);
        const durableCheckpoint = resolveDurableWatchCheckpoint(account);

        if (account.provider === "imap" && (options.imap || hasConfiguredImapSettings(account.settings))) {
          controllers[account.accountId] = startImapPoller({
            accountId: account.accountId,
            mailboxAddress: account.emailAddress,
            initialCheckpoint: durableCheckpoint,
            intervalMs: watchSettings.intervalMs,
            processImmediately: options.processImmediately ?? false,
            fetch: ({ checkpoint, signal }) =>
              options.imap?.fetch
                ? options.imap.fetch({
                    accountId: account.accountId,
                    settings: account.settings,
                    checkpoint,
                    signal
                  })
                : mailIoPlane.fetchImapMessages(
                    {
                      accountId: account.accountId,
                      mailboxAddress: account.emailAddress,
                      settings: account.settings,
                      checkpoint,
                      signal
                    },
                    {
                      clientFactory: options.imap?.clientFactory
                    }
                  ),
            ingest: ingestMail,
            onCheckpoint: (checkpoint, metadata) =>
              persistWatchCheckpoint(account.accountId, checkpoint, metadata, account)
          });
          continue;
        }

        const hasExternalGmailHandlers = Boolean(options.gmail?.listen && options.gmail?.fetch);
        if (account.provider === "gmail" && (hasExternalGmailHandlers || hasConfiguredGmailSettings(account.settings))) {
          controllers[account.accountId] = startGmailWatcher({
            accountId: account.accountId,
            mailboxAddress: account.emailAddress,
            initialCheckpoint: durableCheckpoint,
            intervalMs: watchSettings.intervalMs,
            processImmediately: options.processImmediately ?? false,
            listen: ({ checkpoint, signal }) =>
              hasExternalGmailHandlers
                ? options.gmail!.listen!({
                    accountId: account.accountId,
                    settings: loadLatestAccount(account.accountId, account)?.settings ?? account.settings,
                    checkpoint,
                    signal
                  })
                : mailIoPlane.fetchGmailWatchBatch(
                    {
                      accountId: account.accountId,
                      settings: loadLatestAccount(account.accountId, account)?.settings ?? account.settings,
                      checkpoint,
                      signal
                    },
                    {
                      clientFactory: options.gmail?.clientFactory
                    }
                  ),
            fetch: (notification, signal) =>
              hasExternalGmailHandlers
                ? options.gmail!.fetch!({
                    accountId: account.accountId,
                    settings: loadLatestAccount(account.accountId, account)?.settings ?? account.settings,
                    notification,
                    signal
                  })
                : mailIoPlane.fetchGmailMessage(
                    {
                      accountId: account.accountId,
                      settings: loadLatestAccount(account.accountId, account)?.settings ?? account.settings,
                      notification,
                      signal
                    },
                    {
                      clientFactory: options.gmail?.clientFactory
                    }
                  ),
            ingest: ingestMail,
            onCheckpoint: (checkpoint, metadata) =>
              persistWatchCheckpoint(account.accountId, checkpoint, metadata, account)
          });
        }
      }

      return controllers;
    }
  };

  return runtime;
}

function normalizeOAuthRedirectUri(rawRedirectUri: string) {
  const redirectUri = rawRedirectUri.trim();
  if (!redirectUri) {
    return "";
  }

  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new RuntimeApiError("redirectUri must be an absolute http(s) URL", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new RuntimeApiError("redirectUri must use http or https", 400);
  }

  if (!parsed.pathname.endsWith("/callback")) {
    throw new RuntimeApiError("redirectUri must target a callback path", 400);
  }

  parsed.hash = "";
  return parsed.toString();
}

function coerceRuntimeApiError(error: unknown) {
  if (error instanceof RuntimeApiError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.startsWith("thread room not found:") ||
    message.startsWith("virtual mailbox not found:") ||
    message.startsWith("virtual mailbox is inactive:") ||
    message.includes(" belongs to account ")
  ) {
    return new RuntimeApiError(message, 404);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error(message);
}

function transitionOutbox(
  db: DatabaseSync,
  outboxId: string,
  input: {
    expectedStatus: "pending_approval";
    nextStatus: "queued" | "rejected";
    now: string;
    errorText?: string;
  }
): MailOutboxRecord {
  const record = findControlPlaneOutbox(db, outboxId);
  if (!record) {
    throw new OutboxActionError("outbox item not found", 404);
  }

  if (record.status !== input.expectedStatus) {
    throw new OutboxActionError("outbox item is not pending approval", 409);
  }

  updateControlPlaneOutboxStatus(db, outboxId, {
    status: input.nextStatus,
    updatedAt: input.now,
    errorText: input.errorText
  });

  const updated = findControlPlaneOutbox(db, outboxId);
  if (!updated) {
    throw new OutboxActionError("outbox item disappeared after update", 500);
  }
  return updated;
}

function appendApprovalLedgerEvent(
  db: DatabaseSync,
  outbox: MailOutboxRecord,
  type: "approval.approved" | "approval.rejected",
  now: string,
  payload: {
    previousStatus: "pending_approval";
    nextStatus: "queued" | "rejected";
    errorText?: string;
  }
) {
  const room = getThreadRoom(db, outbox.roomKey);
  appendThreadLedgerEvent(db, {
    roomKey: outbox.roomKey,
    revision: room?.revision ?? 0,
    type,
    payload: {
      outboxId: outbox.outboxId,
      runId: outbox.runId ?? null,
      kind: outbox.kind,
      subject: outbox.subject,
      previousStatus: payload.previousStatus,
      status: payload.nextStatus,
      decidedAt: now,
      errorText: payload.errorText ?? null
    }
  });
}

function findControlPlaneOutbox(db: DatabaseSync, referenceId: string): MailOutboxRecord | null {
  const intent = findControlPlaneOutboxByReferenceId(db, referenceId);
  if (intent) {
    return {
      outboxId: intent.legacyOutboxId,
      roomKey: intent.roomKey,
      runId: intent.runId,
      kind: intent.kind,
      status: intent.status,
      subject: intent.subject,
      textBody: intent.textBody,
      htmlBody: intent.htmlBody,
      to: intent.to,
      cc: intent.cc,
      bcc: intent.bcc,
      headers: intent.headers,
      providerMessageId: intent.providerMessageId,
      errorText: intent.errorText,
      createdAt: intent.createdAt,
      updatedAt: intent.updatedAt
    };
  }

  return findMailOutboxById(db, referenceId);
}

function updateControlPlaneOutboxStatus(
  db: DatabaseSync,
  referenceId: string,
  input: {
    status: MailOutboxStatus;
    updatedAt: string;
    providerMessageId?: string;
    errorText?: string;
  }
) {
  const intent = findControlPlaneOutboxByReferenceId(db, referenceId);
  if (intent) {
    const legacyRecord = findMailOutboxById(db, intent.legacyOutboxId);
    if (legacyRecord) {
      updateMailOutboxStatus(db, legacyRecord.outboxId, input);
      return;
    }

    updateOutboxIntentStatus(db, intent.intentId, input);
    return;
  }

  updateMailOutboxStatus(db, referenceId, input);
}

function queueRoomMessageEmailSync(
  db: DatabaseSync,
  config: AppConfig,
  input: {
    roomKey: string;
    messageId: string;
    mailboxAddress?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    body?: string;
    htmlBody?: string;
    kind?: "ack" | "progress" | "final";
    approvalRequired?: boolean;
    createdAt?: string;
  }
) {
  const room = getThreadRoom(db, input.roomKey);
  if (!room) {
    throw new RuntimeApiError(`thread room not found: ${input.roomKey}`, 404);
  }

  const message = getVirtualMessage(db, input.messageId);
  if (!message || message.roomKey !== room.roomKey) {
    throw new RuntimeApiError(`virtual message not found in room ${room.roomKey}: ${input.messageId}`, 404);
  }

  const latestMailMessage = findLatestRoomEmailSyncAnchor(db, room.stableThreadId, input.mailboxAddress);
  const existing = listOutboxIntentsForRoom(db, room.roomKey).find(
    (intent) => intent.headers["X-MailClaw-Sync-Source-Message-Id"] === message.messageId
  );
  if (existing) {
    return mapOutboxIntentToMailOutboxRecord(existing);
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const mailboxAddress =
    input.mailboxAddress?.trim() ||
    room.frontAgentAddress ||
    latestMailMessage?.mailboxAddress ||
    getMailAccount(db, room.accountId)?.emailAddress ||
    "mailclaw@example.com";
  const recipients = buildEmailSyncRecipients({
    latestMailMessage,
    mailboxAddress,
    explicitTo: input.to,
    explicitCc: input.cc,
    explicitBcc: input.bcc
  });
  if (recipients.to.length === 0) {
    throw new RuntimeApiError(
      `room ${room.roomKey} does not have a visible reply recipient for email sync`,
      latestMailMessage ? 409 : 400
    );
  }

  const outboxKind = input.kind ?? resolveOutboxSyncKind(message.kind);
  const displayBody =
    input.body?.trim() ||
    readRoomMessageDisplayBody(db, room.roomKey, message).trim() ||
    message.subject.trim();
  const rendered = latestMailMessage
    ? renderPreToMail(
        {
          subject: input.subject?.trim() || latestMailMessage.rawSubject || message.subject,
          from: mailboxAddress,
          to: recipients.to,
          cc: recipients.cc,
          messageId: `<mailclaw-${randomUUID()}@local>`,
          inReplyTo: latestMailMessage.internetMessageId,
          references: [...latestMailMessage.references, latestMailMessage.internetMessageId]
        },
        {
          kind: outboxKind,
          summary: displayBody,
          draftBody: displayBody
        }
      )
    : {
        kind: outboxKind,
        body: displayBody,
        headers: buildStandaloneEmailSyncHeaders({
          subject: input.subject?.trim() || message.subject,
          from: mailboxAddress,
          to: recipients.to,
          cc: recipients.cc,
          messageId: `<mailclaw-${randomUUID()}@local>`
        })
      };
  const status = input.approvalRequired ?? config.features.approvalGate ? "pending_approval" : "queued";
  const record: MailOutboxRecord = {
    outboxId: randomUUID(),
    roomKey: room.roomKey,
    kind: outboxKind,
    status,
    subject: rendered.headers.Subject,
    textBody: rendered.body,
    htmlBody: input.htmlBody?.trim() || undefined,
    to: recipients.to,
    cc: recipients.cc,
    bcc: recipients.bcc,
    headers: {
      ...rendered.headers,
      "X-MailClaw-Sync-Source-Message-Id": message.messageId,
      "X-MailClaw-Sync-Origin": message.originKind
    },
    createdAt,
    updatedAt: createdAt
  };

  const artifactPath = persistOutboxArtifact(config, {
    accountId: room.accountId,
    stableThreadId: room.stableThreadId,
    outboxId: record.outboxId,
    payload: record
  });
  insertControlPlaneOutboxRecord(db, record);
  persistRoomMessageSyncOutboundIndex(db, {
    accountId: room.accountId,
    stableThreadId: room.stableThreadId,
    mailboxAddress,
    record
  });

  if (record.status === "pending_approval") {
    appendThreadLedgerEvent(db, {
      roomKey: room.roomKey,
      revision: room.revision,
      type: "approval.requested",
      payload: {
        outboxId: record.outboxId,
        runId: null,
        kind: record.kind,
        subject: record.subject,
        to: record.to,
        cc: record.cc,
        bcc: record.bcc,
        status: record.status,
        artifactPath,
        sourceMessageId: message.messageId,
        sourceOriginKind: message.originKind
      }
    });
  }

  appendThreadLedgerEvent(db, {
    roomKey: room.roomKey,
    revision: room.revision,
    type:
      record.kind === "ack"
        ? "mail.ack_sent"
        : record.kind === "progress"
          ? "mail.progress_sent"
          : "mail.final_sent",
    payload: {
      outboxId: record.outboxId,
      subject: record.subject,
      artifactPath,
      sourceMessageId: message.messageId,
      syncMode: "room_message_projection"
    }
  });

  return record;
}

function resolveOutboxSyncKind(kind: VirtualMessage["kind"]): MailOutboxRecord["kind"] {
  if (kind === "progress") {
    return "progress";
  }
  return "final";
}

function readRoomMessageDisplayBody(
  db: DatabaseSync,
  roomKey: string,
  message: VirtualMessage
) {
  if (message.bodyRef && !message.bodyRef.startsWith("virtual-body://") && fs.existsSync(message.bodyRef)) {
    try {
      const text = fs.readFileSync(message.bodyRef, "utf8").trim();
      if (text.length > 0) {
        return text;
      }
    } catch {
      // Fall back to persisted room pre state or the message subject below.
    }
  }

  const latestSnapshot = getLatestRoomPreSnapshot(db, roomKey);
  if (latestSnapshot && latestSnapshot.roomRevision === message.roomRevision) {
    return (latestSnapshot.draftBody ?? latestSnapshot.summary).trim();
  }

  return message.subject.trim();
}

function findLatestRoomEmailSyncAnchor(
  db: DatabaseSync,
  stableThreadId: string,
  mailboxAddress?: string
) {
  const messages = listMailMessagesForThread(db, stableThreadId);
  if (messages.length === 0) {
    return null;
  }

  const normalizedMailboxAddress =
    typeof mailboxAddress === "string" && mailboxAddress.trim().length > 0
      ? normalizeEmailRecipient(mailboxAddress)
      : null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    const fromAddress = typeof message.from === "string" ? normalizeEmailRecipient(message.from) : "";
    if (message.providerMessageId || (normalizedMailboxAddress && fromAddress && fromAddress !== normalizedMailboxAddress)) {
      return message;
    }
  }

  return messages.at(-1) ?? findLatestMailMessageForThread(db, stableThreadId);
}

function buildStandaloneEmailSyncHeaders(input: {
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  messageId: string;
}) {
  validateOutboundRecipients({
    to: input.to,
    cc: input.cc
  });

  return normalizeAndValidateOutboundHeaders({
    From: input.from,
    To: input.to.join(", "),
    ...((input.cc ?? []).length > 0 ? { Cc: (input.cc ?? []).join(", ") } : {}),
    Subject: input.subject,
    "Message-ID": input.messageId,
    "Auto-Submitted": "auto-generated"
  });
}

function buildEmailSyncRecipients(input: {
  latestMailMessage: ReturnType<typeof findLatestMailMessageForThread>;
  mailboxAddress: string;
  explicitTo?: string[];
  explicitCc?: string[];
  explicitBcc?: string[];
}) {
  const explicitTo = uniqueVisibleEmailRecipients(input.explicitTo ?? [], input.mailboxAddress);
  const explicitCc = uniqueVisibleEmailRecipients(input.explicitCc ?? [], input.mailboxAddress);
  const explicitBcc = uniqueVisibleEmailRecipients(input.explicitBcc ?? [], input.mailboxAddress);
  if (explicitTo.length > 0) {
    const toSet = new Set(explicitTo);
    const cc = explicitCc.filter((recipient) => !toSet.has(recipient));
    const bcc = explicitBcc.filter((recipient) => !toSet.has(recipient) && !cc.includes(recipient));
    return {
      to: explicitTo,
      cc,
      bcc
    };
  }

  const message = input.latestMailMessage;
  if (!message) {
    return {
      to: [],
      cc: explicitCc,
      bcc: explicitBcc
    };
  }

  const to = uniqueVisibleEmailRecipients(
    Array.isArray(message.replyTo) && message.replyTo.length > 0
      ? message.replyTo
      : message.from
        ? [message.from]
        : [],
    input.mailboxAddress
  );
  const toSet = new Set(to);
  const cc = uniqueVisibleEmailRecipients(
    [...explicitCc, ...(message.from ? [message.from] : []), ...(message.to ?? []), ...(message.cc ?? [])],
    input.mailboxAddress
  ).filter((recipient) => !toSet.has(recipient));
  const ccSet = new Set(cc);
  const bcc = uniqueVisibleEmailRecipients(explicitBcc, input.mailboxAddress).filter(
    (recipient) => !toSet.has(recipient) && !ccSet.has(recipient)
  );

  return {
    to,
    cc,
    bcc
  };
}

function uniqueEmailRecipients(values: string[]) {
  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const value of values) {
    const normalized = normalizeEmailRecipient(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    recipients.push(normalized);
  }

  return recipients;
}

function uniqueVisibleEmailRecipients(values: string[], mailboxAddress: string) {
  return uniqueEmailRecipients(filterInternalAliasRecipients(values, mailboxAddress)).filter(
    (recipient) => recipient !== normalizeEmailRecipient(mailboxAddress)
  );
}

function normalizeEmailRecipient(value: string) {
  return value.trim().toLowerCase();
}

function persistRoomMessageSyncOutboundIndex(
  db: DatabaseSync,
  input: {
    accountId: string;
    stableThreadId: string;
    mailboxAddress: string;
    record: MailOutboxRecord;
  }
) {
  const dedupeKey = `outbox:${input.record.outboxId}`;
  if (findMailMessageByDedupeKey(db, dedupeKey)) {
    return;
  }

  const internetMessageId = input.record.headers["Message-ID"];
  if (!internetMessageId) {
    return;
  }
  if (!getMailAccount(db, input.accountId)) {
    return;
  }

  const participants = [input.mailboxAddress, ...input.record.to, ...input.record.cc, ...input.record.bcc];
  insertMailMessage(db, {
    dedupeKey,
    accountId: input.accountId,
    stableThreadId: input.stableThreadId,
    internetMessageId,
    inReplyTo: input.record.headers["In-Reply-To"],
    references: parseReferencesHeader(input.record.headers.References),
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

function parseReferencesHeader(value: string | undefined) {
  return value?.split(/\s+/).map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function getWatchSettings(settings: Record<string, unknown>) {
  const watch = settings.watch;
  if (!watch || typeof watch !== "object") {
    return {} as {
      checkpoint?: string;
      historyId?: string;
      expiration?: string;
      uidValidity?: string;
      intervalMs?: number;
    };
  }

  const checkpoint =
    typeof (watch as { checkpoint?: unknown }).checkpoint === "string"
      ? (watch as { checkpoint: string }).checkpoint
      : undefined;
  const intervalMs =
    typeof (watch as { intervalMs?: unknown }).intervalMs === "number"
      ? (watch as { intervalMs: number }).intervalMs
      : undefined;
  const historyId =
    typeof (watch as { historyId?: unknown }).historyId === "string"
      ? (watch as { historyId: string }).historyId
      : undefined;
  const expiration =
    typeof (watch as { expiration?: unknown }).expiration === "string"
      ? (watch as { expiration: string }).expiration
      : undefined;
  const uidValidity =
    typeof (watch as { uidValidity?: unknown }).uidValidity === "string"
      ? (watch as { uidValidity: string }).uidValidity
      : undefined;

  return {
    checkpoint,
    historyId,
    expiration,
    uidValidity,
    intervalMs
  };
}

function mailboxAddressesMatch(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function mergeAgentRoutingIntoAccountSettings(
  currentSettings: Record<string, unknown>,
  input: {
    templateId: string;
    defaultFrontAgentId?: string;
    durableAgentIds: string[];
    collaboratorAgentIds: string[];
    updatedAt: string;
  }
) {
  const settings =
    typeof currentSettings === "object" && currentSettings !== null
      ? { ...currentSettings }
      : {};
  const priorRouting =
    typeof settings.agentRouting === "object" && settings.agentRouting !== null
      ? (settings.agentRouting as Record<string, unknown>)
      : {};

  return {
    ...settings,
    agentRouting: {
      ...priorRouting,
      templateId: input.templateId,
      defaultFrontAgentId: normalizeAgentId(input.defaultFrontAgentId),
      durableAgentIds: uniqueAgentIds(input.durableAgentIds),
      collaboratorAgentIds: uniqueAgentIds(input.collaboratorAgentIds),
      updatedAt: input.updatedAt
    }
  } satisfies Record<string, unknown>;
}

function uniqueAgentIds(values: string[]) {
  return Array.from(
    new Set(values.map((value) => normalizeAgentId(value)).filter((value): value is string => Boolean(value)))
  );
}

function normalizeAgentId(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function readAccountAgentRoutingSettings(settings: Record<string, unknown>) {
  const routing =
    typeof settings.agentRouting === "object" && settings.agentRouting !== null
      ? (settings.agentRouting as Record<string, unknown>)
      : {};

  return {
    defaultFrontAgentId: normalizeAgentId(typeof routing.defaultFrontAgentId === "string" ? routing.defaultFrontAgentId : undefined),
    durableAgentIds: uniqueAgentIds(Array.isArray(routing.durableAgentIds) ? routing.durableAgentIds.filter((v): v is string => typeof v === "string") : []),
    collaboratorAgentIds: uniqueAgentIds(Array.isArray(routing.collaboratorAgentIds) ? routing.collaboratorAgentIds.filter((v): v is string => typeof v === "string") : [])
  };
}

function createEmptyAccountAgentRouting() {
  return {
    defaultFrontAgentId: undefined,
    durableAgentIds: [] as string[],
    collaboratorAgentIds: [] as string[]
  };
}

function shouldExposeDurableAgentId(
  agentId: string,
  routing: ReturnType<typeof readAccountAgentRoutingSettings>
) {
  if (!routing.defaultFrontAgentId && routing.durableAgentIds.length === 0) {
    return true;
  }

  const normalized = normalizeAgentId(agentId);
  if (!normalized) {
    return false;
  }

  if (routing.defaultFrontAgentId === normalized) {
    return true;
  }

  if (routing.durableAgentIds.includes(normalized)) {
    return true;
  }

  if (routing.collaboratorAgentIds.includes(normalized)) {
    return true;
  }

  return false;
}
