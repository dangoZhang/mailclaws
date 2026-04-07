import {
  normalizeAndValidateOutboundHeaders,
  validateOutboundRecipients
} from "../reporting/rfc.js";
import {
  createGmailOAuthClient,
  type GmailOAuthClientLike
} from "../auth/gmail-oauth.js";
import type { ProviderAddress, ProviderAttachment, ProviderHeader, ProviderMailEnvelope } from "./types.js";
import type { GmailWatchBatch, GmailWatchNotification } from "./watcher.js";

export interface GmailMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
  textBody?: string;
  htmlBody?: string;
  attachments?: GmailAttachment[];
  raw?: unknown;
}

export interface GmailAttachment {
  filename?: string;
  mimeType?: string;
  size?: number;
  contentId?: string;
  disposition?: string;
  data?: string | Uint8Array;
}

export interface GmailWatchResponse {
  historyId?: string;
  expiration?: string;
}

export interface GmailPubsubPushEnvelope {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
    attributes?: Record<string, string>;
  };
  subscription?: string;
}

export interface GmailPubsubNotification {
  emailAddress: string;
  historyId: string;
  messageId?: string;
  publishTime?: string;
  subscription?: string;
  attributes?: Record<string, string>;
  raw?: unknown;
}

export interface GmailHistoryResponse {
  historyId?: string;
  history?: GmailHistoryRecord[];
  nextPageToken?: string;
}

export interface GmailListMessagesResponse {
  messages?: Array<{
    id?: string;
    threadId?: string;
  }>;
  nextPageToken?: string;
}

export interface GmailHistoryRecord {
  id?: string;
  messagesAdded?: Array<{
    message?: {
      id?: string;
      threadId?: string;
    };
  }>;
}

export interface GmailApiClientLike {
  watch(input: {
    userId: string;
    topicName: string;
    labelIds?: string[];
    labelFilterAction?: "include" | "exclude";
    includeSpamTrash?: boolean;
    signal: AbortSignal;
  }): Promise<GmailWatchResponse>;
  listHistory(input: {
    userId: string;
    startHistoryId: string;
    pageToken?: string;
    historyTypes?: string[];
    signal: AbortSignal;
  }): Promise<GmailHistoryResponse>;
  listMessages(input: {
    userId: string;
    pageToken?: string;
    maxResults?: number;
    labelIds?: string[];
    includeSpamTrash?: boolean;
    signal: AbortSignal;
  }): Promise<GmailListMessagesResponse>;
  getMessage(input: { userId: string; messageId: string; signal: AbortSignal }): Promise<GmailMessage>;
}

export interface GmailSendResponse {
  id?: string;
  threadId?: string;
}

export interface GmailSendClientLike {
  sendMessage(input: {
    userId: string;
    raw: string;
    threadId?: string;
    signal?: AbortSignal;
  }): Promise<GmailSendResponse>;
}

export interface GmailSenderMessage {
  outboxId: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  headers: Record<string, string>;
  threadId?: string;
}

export interface GmailSenderResult {
  providerMessageId?: string;
  providerThreadId?: string;
}

export interface GmailSender {
  send(message: GmailSenderMessage): Promise<GmailSenderResult>;
}

export interface ConfiguredGmailWatchInput {
  accountId: string;
  settings: Record<string, unknown>;
  checkpoint?: string;
  signal: AbortSignal;
  now?: () => Date;
  source?: string;
  recoverOnHistoryInvalidation?: boolean;
}

export interface ConfiguredGmailFetchInput {
  accountId: string;
  settings: Record<string, unknown>;
  notification: GmailWatchNotification;
  signal: AbortSignal;
}

export interface ConfiguredGmailOptions {
  clientFactory?: (config: { accessToken: string }) => GmailApiClientLike;
  oauthClient?: GmailOAuthClientLike;
}

export interface ConfiguredGmailSenderOptions {
  clientFactory?: (config: { accessToken: string }) => GmailSendClientLike;
  oauthClient?: GmailOAuthClientLike;
}

export interface ConfiguredGmailNotificationInput {
  accountId: string;
  settings: Record<string, unknown>;
  checkpoint?: string;
  notification: GmailPubsubNotification | GmailPubsubPushEnvelope | { data: string };
  signal: AbortSignal;
  now?: () => Date;
}

export interface ConfiguredGmailRecoveryInput {
  accountId: string;
  settings: Record<string, unknown>;
  checkpoint?: string;
  signal: AbortSignal;
  now?: () => Date;
  source?: string;
  reason?: string;
  historyInvalidated?: boolean;
  invalidatedCheckpoint?: string;
}

export function mapGmailMessageToEnvelope(message: GmailMessage): ProviderMailEnvelope {
  const headers = message.payload?.headers ?? [];

  return {
    providerMessageId: message.id,
    threadId: message.threadId,
    envelopeRecipients: extractEnvelopeRecipients(headers),
    messageId: readHeader(headers, "Message-ID"),
    subject: readHeader(headers, "Subject") ?? "",
    from: parseAddress(readHeader(headers, "From")),
    to: parseAddressList(readHeader(headers, "To")),
    cc: parseAddressList(readHeader(headers, "Cc")),
    bcc: parseAddressList(readHeader(headers, "Bcc")),
    replyTo: parseAddressList(readHeader(headers, "Reply-To")),
    date: parseDate(message.internalDate, readHeader(headers, "Date")),
    headers: headers.map((header) => ({
      name: header.name,
      value: header.value
    })) satisfies ProviderHeader[],
    text: message.textBody,
    html: message.htmlBody,
    attachments: mapAttachments(message.attachments),
    raw: message.raw ?? message
  };
}

function extractEnvelopeRecipients(headers: Array<{ name: string; value: string }>) {
  return [readHeader(headers, "Delivered-To"), readHeader(headers, "X-Original-To")]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function mapAttachments(attachments?: GmailAttachment[]): ProviderAttachment[] {
  return (attachments ?? []).map((attachment) => ({
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    contentId: attachment.contentId,
    disposition: attachment.disposition,
    data: attachment.data
  }));
}

function readHeader(headers: Array<{ name: string; value: string }>, name: string) {
  return headers.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value;
}

function parseDate(internalDate?: string, headerDate?: string) {
  if (internalDate) {
    const numeric = Number.parseInt(internalDate, 10);
    if (Number.isFinite(numeric)) {
      return new Date(numeric).toISOString();
    }
  }

  return headerDate;
}

function parseAddressList(value?: string) {
  return splitAddressList(value).map(parseAddress).filter((address) => address.email.length > 0);
}

function parseAddress(value?: string): ProviderAddress {
  if (!value) {
    return {
      email: "unknown@example.invalid"
    };
  }

  const emailMatch = value.match(/<([^>]+)>/);
  if (!emailMatch) {
    return {
      email: value.trim()
    };
  }

  return {
    name: value
      .slice(0, emailMatch.index)
      .replace(/"/g, "")
      .trim() || undefined,
    email: emailMatch[1]?.trim() ?? "unknown@example.invalid"
  };
}

function splitAddressList(value?: string) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function fetchConfiguredGmailWatchBatch(
  input: ConfiguredGmailWatchInput,
  options: ConfiguredGmailOptions = {}
): Promise<GmailWatchBatch> {
  if (input.signal.aborted) {
    return {
      notifications: [],
      checkpoint: input.checkpoint,
      done: true
    };
  }

  const settings = resolveConfiguredGmailSettings(input.settings);
  const accessToken = await resolveConfiguredGmailAccessToken(settings, options.oauthClient, input.signal);
  const client = (options.clientFactory ?? createGmailApiClient)({
    accessToken
  });

  let watchHistoryId = settings.watch.historyId;
  let watchExpiration = settings.watch.expiration;
  const nowMs = (input.now ?? (() => new Date()))().getTime();
  const watchExpirationMs = parseTimestampMs(settings.watch.expiration);
  const shouldRenewWatch = !watchExpirationMs || watchExpirationMs <= nowMs + settings.watch.renewBeforeMs;

  if (shouldRenewWatch) {
    const watch = await client.watch({
      userId: settings.userId,
      topicName: settings.topicName,
      labelIds: settings.labelIds,
      labelFilterAction: settings.labelFilterAction,
      includeSpamTrash: settings.includeSpamTrash,
      signal: input.signal
    });
    watchHistoryId = watch.historyId ?? watchHistoryId;
    watchExpiration = watch.expiration ?? watchExpiration;
  }

  const startHistoryId = input.checkpoint ?? watchHistoryId;
  if (!startHistoryId) {
    return {
      notifications: [],
      checkpoint: watchHistoryId,
      checkpointMetadata: {
        source: input.source ?? "gmail.watch",
        watchHistoryId,
        watchExpiration
      },
      done: true
    };
  }

  try {
    const notifications = new Map<string, GmailWatchNotification>();
    let pageToken: string | undefined;
    let latestHistoryId: string = startHistoryId;

    do {
      const response = await client.listHistory({
        userId: settings.userId,
        startHistoryId,
        pageToken,
        historyTypes: ["messageAdded"],
        signal: input.signal
      });
      if (response.historyId) {
        latestHistoryId = response.historyId;
      }

      for (const history of response.history ?? []) {
        if (history.id) {
          latestHistoryId = history.id;
        }
        for (const added of history.messagesAdded ?? []) {
          const messageId = added.message?.id;
          if (!messageId || notifications.has(messageId)) {
            continue;
          }

          notifications.set(messageId, {
            id: messageId,
            cursor: history.id ?? response.historyId ?? latestHistoryId,
            threadId: added.message?.threadId
          });
        }
      }

      pageToken = response.nextPageToken;
    } while (pageToken && !input.signal.aborted);

    return {
      notifications: [...notifications.values()],
      checkpoint: latestHistoryId,
      checkpointMetadata: {
        source: input.source ?? "gmail.watch",
        watchHistoryId: watchHistoryId ?? latestHistoryId,
        watchExpiration
      },
      done: true
    };
  } catch (error) {
    if (!isGmailHistoryInvalidationError(error)) {
      throw error;
    }

    const fallbackCheckpoint = watchHistoryId ?? startHistoryId;
    if (input.recoverOnHistoryInvalidation) {
      return recoverConfiguredGmailMailbox(
        {
          accountId: input.accountId,
          settings: input.settings,
          checkpoint: fallbackCheckpoint,
          signal: input.signal,
          now: input.now,
          source: input.source ?? "gmail.watch",
          reason: "history_invalidated",
          historyInvalidated: true,
          invalidatedCheckpoint: startHistoryId
        },
        options
      );
    }
    const backfill = await listBackfillNotifications({
      client,
      userId: settings.userId,
      labelIds: settings.labelIds,
      includeSpamTrash: settings.includeSpamTrash,
      maxMessages: settings.watch.backfillMaxMessages,
      signal: input.signal
    });
    return {
      notifications: backfill.notifications,
      checkpoint: fallbackCheckpoint,
      checkpointMetadata: {
        source: input.source ?? "gmail.watch",
        watchHistoryId: fallbackCheckpoint,
        watchExpiration,
        historyInvalidated: true,
        invalidatedCheckpoint: startHistoryId,
        backfillCompleted: true,
        backfillCount: backfill.notifications.length,
        backfillSource: "gmail.messages.list"
      },
      done: true
    };
  }
}

export function parseGmailPubsubNotification(
  input: GmailPubsubNotification | GmailPubsubPushEnvelope | { data: string }
): GmailPubsubNotification {
  if (isDirectGmailPubsubNotification(input)) {
    return {
      ...input
    };
  }

  const envelope = asRecord(input);
  const message = asRecord(envelope?.message);
  const data =
    readString(message, "data") ??
    readString(envelope, "data");
  if (!data) {
    throw new Error("missing Gmail Pub/Sub message data");
  }

  const decoded = decodePubsubPayload(data);
  const emailAddress = readString(decoded, "emailAddress");
  const historyId = readString(decoded, "historyId");
  if (!emailAddress || !historyId) {
    throw new Error("invalid Gmail Pub/Sub notification payload");
  }

  return {
    emailAddress,
    historyId,
    messageId: readString(message, "messageId"),
    publishTime: readString(message, "publishTime"),
    subscription: readString(envelope, "subscription"),
    attributes: readStringRecord(message?.attributes),
    raw: input
  };
}

export async function fetchConfiguredGmailNotificationBatch(
  input: ConfiguredGmailNotificationInput,
  options: ConfiguredGmailOptions = {}
): Promise<GmailWatchBatch> {
  if (input.signal.aborted) {
    return {
      notifications: [],
      checkpoint: input.checkpoint,
      done: true
    };
  }

  const notification = parseGmailPubsubNotification(input.notification);
  if (input.checkpoint && compareOrderedCursorValues(input.checkpoint, notification.historyId) >= 0) {
    return {
      notifications: [],
      checkpoint: input.checkpoint,
      checkpointMetadata: {
        source: "gmail.pubsub",
        notificationHistoryId: notification.historyId,
        notificationEmailAddress: notification.emailAddress,
        pubsubMessageId: notification.messageId,
        pubsubPublishTime: notification.publishTime,
        pubsubSubscription: notification.subscription
      },
      done: true
    };
  }

  const batch =
    input.checkpoint === undefined
      ? await recoverConfiguredGmailMailbox(
          {
            accountId: input.accountId,
            settings: input.settings,
            checkpoint: notification.historyId,
            signal: input.signal,
            now: input.now,
            source: "gmail.pubsub",
            reason: "missing_checkpoint"
          },
          options
        )
      : await fetchConfiguredGmailWatchBatch(
          {
            accountId: input.accountId,
            settings: input.settings,
            checkpoint: input.checkpoint,
            signal: input.signal,
            now: input.now,
            source: "gmail.pubsub",
            recoverOnHistoryInvalidation: true
          },
          options
        );

  return {
    ...batch,
    checkpointMetadata: {
      ...(batch.checkpointMetadata ?? {}),
      source: "gmail.pubsub",
      notificationHistoryId: notification.historyId,
      notificationEmailAddress: notification.emailAddress,
      pubsubMessageId: notification.messageId,
      pubsubPublishTime: notification.publishTime,
      pubsubSubscription: notification.subscription
    }
  };
}

export async function recoverConfiguredGmailMailbox(
  input: ConfiguredGmailRecoveryInput,
  options: ConfiguredGmailOptions = {}
): Promise<GmailWatchBatch> {
  if (input.signal.aborted) {
    return {
      notifications: [],
      checkpoint: input.checkpoint,
      done: true
    };
  }

  const settings = resolveConfiguredGmailSettings(input.settings);
  const accessToken = await resolveConfiguredGmailAccessToken(settings, options.oauthClient, input.signal);
  const client = (options.clientFactory ?? createGmailApiClient)({
    accessToken
  });
  const watch = await client.watch({
    userId: settings.userId,
    topicName: settings.topicName,
    labelIds: settings.labelIds,
    labelFilterAction: settings.labelFilterAction,
    includeSpamTrash: settings.includeSpamTrash,
    signal: input.signal
  });
  const recoveryCheckpoint = watch.historyId ?? input.checkpoint ?? settings.watch.historyId;
  const recovery = await listMailboxNotifications({
    client,
    userId: settings.userId,
    labelIds: settings.labelIds,
    includeSpamTrash: settings.includeSpamTrash,
    signal: input.signal
  });

  return {
    notifications: recovery.notifications,
    checkpoint: recoveryCheckpoint,
    checkpointMetadata: {
      source: input.source ?? "gmail.recovery",
      watchHistoryId: recoveryCheckpoint,
      watchExpiration: watch.expiration ?? settings.watch.expiration,
      fullMailboxRecovery: true,
      recoveryCompleted: true,
      recoveryCount: recovery.notifications.length,
      recoverySource: "gmail.messages.list",
      ...(input.reason ? { recoveryReason: input.reason } : {}),
      ...(input.historyInvalidated ? { historyInvalidated: true } : {}),
      ...(input.invalidatedCheckpoint ? { invalidatedCheckpoint: input.invalidatedCheckpoint } : {})
    },
    done: true
  };
}

export async function fetchConfiguredGmailMessage(
  input: ConfiguredGmailFetchInput,
  options: ConfiguredGmailOptions = {}
) {
  if (input.signal.aborted) {
    return null;
  }

  const settings = resolveConfiguredGmailSettings(input.settings);
  const accessToken = await resolveConfiguredGmailAccessToken(settings, options.oauthClient, input.signal);
  const client = (options.clientFactory ?? createGmailApiClient)({
    accessToken
  });

  try {
    return await client.getMessage({
      userId: settings.userId,
      messageId: input.notification.id,
      signal: input.signal
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export function hasConfiguredGmailSettings(settings: Record<string, unknown>) {
  try {
    resolveConfiguredGmailSettings(settings);
    return true;
  } catch {
    return false;
  }
}

export function hasConfiguredGmailSenderSettings(settings: Record<string, unknown>) {
  try {
    resolveConfiguredGmailSendSettings(settings);
    return true;
  } catch {
    return false;
  }
}

export function createConfiguredGmailSender(
  settings: Record<string, unknown>,
  options: ConfiguredGmailSenderOptions = {}
): GmailSender {
  const resolved = resolveConfiguredGmailSendSettings(settings);
  let currentAccessToken = resolved.accessToken;
  let client = currentAccessToken
    ? (options.clientFactory ?? createGmailSendClient)({
        accessToken: currentAccessToken
      })
    : null;

  return {
    async send(message) {
      const accessToken = await resolveConfiguredGmailAccessToken(resolved, options.oauthClient, resolved.signal);
      if (!client || accessToken !== currentAccessToken) {
        client = (options.clientFactory ?? createGmailSendClient)({
          accessToken
        });
        currentAccessToken = accessToken;
      }
      validateOutboundRecipients({
        to: message.to,
        cc: message.cc,
        bcc: message.bcc
      });
      const headers = normalizeAndValidateOutboundHeaders(message.headers);
      const raw = encodeGmailRawMessage(
        buildRawMimeMessage({
          headers,
          textBody: message.textBody,
          htmlBody: message.htmlBody
        })
      );
      const result = await client.sendMessage({
        userId: resolved.userId,
        raw,
        threadId: message.threadId,
        signal: resolved.signal
      });

      return {
        providerMessageId: result.id,
        providerThreadId: result.threadId
      };
    }
  };
}

function resolveConfiguredGmailSettings(settings: Record<string, unknown>) {
  const providerSettings = resolveSettingsObject(settings);
  const topicName = readOptionalString(providerSettings, "topicName");
  if (!topicName) {
    throw new Error("missing Gmail setting: topicName");
  }

  const tokenSettings = resolveGmailTokenSettings(providerSettings);
  const watchSettings = readOptionalObject(providerSettings, "watch");
  const labelFilterAction: "include" | "exclude" =
    readOptionalString(providerSettings, "labelFilterAction") === "exclude" ? "exclude" : "include";

  return {
    ...tokenSettings,
    topicName,
    userId: readOptionalString(providerSettings, "userId") ?? "me",
    labelIds: readOptionalStringArray(providerSettings, "labelIds"),
    labelFilterAction,
    includeSpamTrash: readOptionalBoolean(providerSettings, "includeSpamTrash") ?? false,
    watch: {
      historyId: readOptionalString(watchSettings, "historyId"),
      expiration: readOptionalString(watchSettings, "expiration"),
      renewBeforeMs: readOptionalNumber(watchSettings, "renewBeforeMs") ?? 24 * 60 * 60 * 1000,
      backfillMaxMessages: readOptionalNumber(watchSettings, "backfillMaxMessages") ?? 100
    }
  };
}

function resolveSettingsObject(settings: Record<string, unknown>) {
  const nested = settings.gmail;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }

  return settings;
}

function resolveConfiguredGmailSendSettings(settings: Record<string, unknown>) {
  const providerSettings = resolveSettingsObject(settings);
  const tokenSettings = resolveGmailTokenSettings(providerSettings);

  return {
    ...tokenSettings,
    userId: readOptionalString(providerSettings, "userId") ?? "me",
    signal: undefined as AbortSignal | undefined
  };
}

function resolveGmailTokenSettings(providerSettings: Record<string, unknown>) {
  const accessToken =
    readOptionalString(providerSettings, "oauthAccessToken") ??
    readOptionalString(providerSettings, "accessToken");
  const refreshToken = readOptionalString(providerSettings, "oauthRefreshToken");
  const clientId = readOptionalString(providerSettings, "oauthClientId");
  const clientSecret = readOptionalString(providerSettings, "oauthClientSecret");
  const accessTokenExpiresAt = readOptionalString(providerSettings, "oauthExpiry");
  const tokenType = readOptionalString(providerSettings, "oauthTokenType");
  const scope = readOptionalString(providerSettings, "oauthScope");

  if (!accessToken && !refreshToken) {
    throw new Error("missing Gmail setting: oauthAccessToken");
  }

  if (refreshToken && !clientId) {
    throw new Error("missing Gmail setting: oauthClientId");
  }

  return {
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    accessTokenExpiresAt,
    tokenType,
    scope
  };
}

function readOptionalObject(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readOptionalString(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalNumber(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalBoolean(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalStringArray(settings: Record<string, unknown>, key: string) {
  const value = settings[key];
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : undefined;
}

function parseTimestampMs(value?: string) {
  if (!value) {
    return undefined;
  }

  const numeric = Number.parseInt(value, 10);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function resolveConfiguredGmailAccessToken(
  settings: {
    accessToken?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    accessTokenExpiresAt?: string;
  },
  oauthClient: GmailOAuthClientLike | undefined,
  signal?: AbortSignal
) {
  const accessTokenExpiresAt = parseTimestampMs(settings.accessTokenExpiresAt);
  const canReuseAccessToken =
    typeof settings.accessToken === "string" &&
    settings.accessToken.trim().length > 0 &&
    (!accessTokenExpiresAt || accessTokenExpiresAt > Date.now() + 60_000);
  if (canReuseAccessToken) {
    return settings.accessToken!.trim();
  }

  if (!settings.refreshToken || !settings.clientId) {
    if (typeof settings.accessToken === "string" && settings.accessToken.trim().length > 0) {
      return settings.accessToken.trim();
    }

    throw new Error("missing Gmail setting: oauthRefreshToken");
  }

  const refreshed = await (oauthClient ?? createGmailOAuthClient()).refreshAccessToken({
    clientId: settings.clientId,
    clientSecret: settings.clientSecret,
    refreshToken: settings.refreshToken,
    signal
  });
  return refreshed.accessToken;
}

async function listBackfillNotifications(input: {
  client: GmailApiClientLike;
  userId: string;
  labelIds?: string[];
  includeSpamTrash?: boolean;
  maxMessages: number;
  signal: AbortSignal;
}) {
  return listMailboxNotifications(input);
}

async function listMailboxNotifications(input: {
  client: GmailApiClientLike;
  userId: string;
  labelIds?: string[];
  includeSpamTrash?: boolean;
  maxMessages?: number;
  signal: AbortSignal;
}) {
  const notifications = new Map<string, GmailWatchNotification>();
  let pageToken: string | undefined;

  while (!input.signal.aborted && (input.maxMessages === undefined || notifications.size < input.maxMessages)) {
    const response = await input.client.listMessages({
      userId: input.userId,
      pageToken,
      maxResults:
        input.maxMessages === undefined
          ? 500
          : Math.max(1, Math.min(500, input.maxMessages - notifications.size)),
      labelIds: input.labelIds,
      includeSpamTrash: input.includeSpamTrash,
      signal: input.signal
    });

    for (const message of response.messages ?? []) {
      const messageId = message.id;
      if (!messageId || notifications.has(messageId)) {
        continue;
      }

      notifications.set(messageId, {
        id: messageId,
        threadId: message.threadId
      });
    }

    if (!response.nextPageToken || (input.maxMessages !== undefined && notifications.size >= input.maxMessages)) {
      break;
    }

    pageToken = response.nextPageToken;
  }

  return {
    notifications: [...notifications.values()]
  };
}

function isGmailHistoryInvalidationError(error: unknown) {
  const status = readErrorStatus(error);
  return status === 404;
}

function isNotFoundError(error: unknown) {
  return readErrorStatus(error) === 404;
}

function readErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;
  if (typeof status === "number") {
    return status;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : undefined;
}

function isDirectGmailPubsubNotification(input: unknown): input is GmailPubsubNotification {
  const value = input as GmailPubsubNotification;
  return (
    typeof value?.emailAddress === "string" &&
    value.emailAddress.trim().length > 0 &&
    typeof value.historyId === "string" &&
    value.historyId.trim().length > 0
  );
}

function decodePubsubPayload(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = normalized.length % 4;
  const padded = remainder === 0 ? normalized : normalized.padEnd(normalized.length + (4 - remainder), "=");
  const decoded = Buffer.from(padded, "base64").toString("utf8");
  const parsed = JSON.parse(decoded) as unknown;
  const payload = asRecord(parsed);
  if (!payload) {
    throw new Error("invalid Gmail Pub/Sub notification payload");
  }

  return payload;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: Record<string, unknown> | undefined, key: string) {
  const entry = value?.[key];
  return typeof entry === "string" && entry.trim().length > 0 ? entry.trim() : undefined;
}

function readStringRecord(value: unknown) {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const entries = Object.entries(record).flatMap(([key, entry]) =>
    typeof entry === "string" ? [[key, entry] as const] : []
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function compareOrderedCursorValues(left: string, right: string) {
  const normalizedLeft = left.trim();
  const normalizedRight = right.trim();
  if (/^\d+$/.test(normalizedLeft) && /^\d+$/.test(normalizedRight)) {
    if (normalizedLeft.length !== normalizedRight.length) {
      return normalizedLeft.length - normalizedRight.length;
    }

    return normalizedLeft.localeCompare(normalizedRight);
  }

  return normalizedLeft.localeCompare(normalizedRight);
}

function buildRawMimeMessage(input: {
  headers: Record<string, string>;
  textBody: string;
  htmlBody?: string;
}) {
  const lines = Object.entries(input.headers).map(([name, value]) => `${name}: ${value}`);

  if (input.htmlBody) {
    const boundary = `mailclaws-${Math.random().toString(16).slice(2)}`;
    lines.push("MIME-Version: 1.0");
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset="UTF-8"');
    lines.push("");
    lines.push(input.textBody);
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset="UTF-8"');
    lines.push("");
    lines.push(input.htmlBody);
    lines.push(`--${boundary}--`);
    lines.push("");
    return lines.join("\r\n");
  }

  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("");
  lines.push(input.textBody);
  lines.push("");
  return lines.join("\r\n");
}

function encodeGmailRawMessage(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function createGmailSendClient(config: { accessToken: string }): GmailSendClientLike {
  return {
    async sendMessage(input) {
      const response = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(input.userId)}/messages/send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            raw: input.raw,
            ...(input.threadId ? { threadId: input.threadId } : {})
          }),
          signal: input.signal
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(
          `gmail send failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
        ) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }

      const json = (await response.json()) as Record<string, unknown>;
      return {
        id: typeof json.id === "string" ? json.id : undefined,
        threadId: typeof json.threadId === "string" ? json.threadId : undefined
      };
    }
  };
}

function createGmailApiClient(config: { accessToken: string }): GmailApiClientLike {
  const request = async <T>(
    path: string,
    input: {
      method: "GET" | "POST";
      query?: Record<string, string | undefined>;
      body?: Record<string, unknown>;
      signal: AbortSignal;
    }
  ) => {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/${path}`);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value && value.trim().length > 0) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json"
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal
    });
    if (!response.ok) {
      const message = await response.text();
      const error = new Error(`gmail api ${response.status}: ${message}`);
      (error as { status?: number }).status = response.status;
      throw error;
    }

    return (await response.json()) as T;
  };

  return {
    watch(input) {
      return request<GmailWatchResponse>(`users/${encodeURIComponent(input.userId)}/watch`, {
        method: "POST",
        body: {
          topicName: input.topicName,
          labelIds: input.labelIds,
          labelFilterAction: input.labelFilterAction,
          includeSpamTrash: input.includeSpamTrash
        },
        signal: input.signal
      });
    },
    listHistory(input) {
      return request<GmailHistoryResponse>(`users/${encodeURIComponent(input.userId)}/history`, {
        method: "GET",
        query: {
          startHistoryId: input.startHistoryId,
          pageToken: input.pageToken,
          historyTypes: input.historyTypes?.join(",")
        },
        signal: input.signal
      });
    },
    listMessages(input) {
      return request<GmailListMessagesResponse>(`users/${encodeURIComponent(input.userId)}/messages`, {
        method: "GET",
        query: {
          pageToken: input.pageToken,
          maxResults: input.maxResults ? String(input.maxResults) : undefined,
          labelIds: input.labelIds?.join(","),
          includeSpamTrash: input.includeSpamTrash ? "true" : undefined
        },
        signal: input.signal
      });
    },
    getMessage(input) {
      return request<GmailMessage>(`users/${encodeURIComponent(input.userId)}/messages/${encodeURIComponent(input.messageId)}`, {
        method: "GET",
        query: {
          format: "full"
        },
        signal: input.signal
      });
    }
  };
}
