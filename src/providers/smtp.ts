import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import nodemailer from "nodemailer";

import { resolveOAuthAccessToken } from "../auth/oauth-core.js";
import type { AppConfig } from "../config.js";
import { redactSensitiveText } from "../security/redaction.js";
import { updateMailOutboxStatus } from "../storage/repositories/mail-outbox.js";
import {
  claimOutboxIntentForDelivery,
  findControlPlaneOutboxByReferenceId,
  listControlPlaneOutboxByStatus
} from "../storage/repositories/outbox-intents.js";
import {
  findLatestSuccessfulMailOutboxAttempt,
  insertMailOutboxAttempt,
  updateMailOutboxAttempt
} from "../storage/repositories/mail-outbox-attempts.js";
import { getThreadRoom } from "../storage/repositories/thread-rooms.js";
import {
  normalizeAndValidateOutboundHeaders,
  validateOutboundRecipients
} from "../reporting/rfc.js";

export interface SmtpMessage {
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

export interface SmtpSendResult {
  providerMessageId?: string;
}

export interface SmtpSender {
  send(message: SmtpMessage): Promise<SmtpSendResult>;
}

export interface SmtpTransportConfig {
  from: string;
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
  oauth?: Record<string, unknown>;
}

export interface SmtpTransport {
  sendMail(message: {
    from: string;
    to?: string;
    cc?: string;
    bcc?: string;
    subject: string;
    text: string;
    html?: string;
    headers: Record<string, string>;
  }): Promise<{
    messageId?: string;
  }>;
}

export type SmtpTransportFactory = (config: {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass?: string;
    type?: "OAuth2";
    accessToken?: string;
  };
}) => SmtpTransport;

export interface DeliverQueuedOutboxOptions {
  limit?: number;
  now?: () => string;
}

export interface ResolvedDeliverySender {
  sender: SmtpSender;
  threadId?: string;
}

export type DeliverySenderResolver = (input: {
  record: NonNullable<ReturnType<typeof findControlPlaneOutboxByReferenceId>>;
}) => ResolvedDeliverySender | Promise<ResolvedDeliverySender | null> | null;

export async function deliverQueuedOutbox(
  db: DatabaseSync,
  sender: SmtpSender | DeliverySenderResolver,
  options: DeliverQueuedOutboxOptions = {}
) {
  const now = options.now ?? (() => new Date().toISOString());
  const queued = listControlPlaneOutboxByStatus(db, ["queued"], options.limit);
  let sent = 0;
  let failed = 0;

  for (const record of queued) {
    const room = getThreadRoom(db, record.roomKey);
    if (room?.state === "handoff") {
      continue;
    }

    const attemptStartedAt = now();
    const successfulAttempt = findLatestSuccessfulMailOutboxAttempt(db, record.intentId);
    const acceptedProviderMessageId = record.providerMessageId ?? successfulAttempt?.providerMessageId;

    if (acceptedProviderMessageId) {
      updateMailOutboxStatus(db, record.intentId, {
        status: "sent",
        updatedAt: attemptStartedAt,
        providerMessageId: acceptedProviderMessageId,
        errorText: undefined
      });
      continue;
    }

    if (!claimOutboxIntentForDelivery(db, record.intentId, { updatedAt: attemptStartedAt })) {
      continue;
    }
    updateMailOutboxStatus(db, record.intentId, {
      status: "sending",
      updatedAt: attemptStartedAt,
      providerMessageId: undefined,
      errorText: undefined
    });

    const claimedRecord = findControlPlaneOutboxByReferenceId(db, record.intentId);
    if (!claimedRecord) {
      continue;
    }

    const resolvedSender =
      typeof sender === "function" ? await sender({ record: claimedRecord }) : { sender };

    const attemptId = randomUUID();
    insertMailOutboxAttempt(db, {
      attemptId,
      outboxId: claimedRecord.intentId,
      roomKey: claimedRecord.roomKey,
      status: "sending",
      startedAt: attemptStartedAt,
      createdAt: attemptStartedAt
    });

    try {
      if (!resolvedSender?.sender) {
        throw new Error("no delivery sender configured");
      }
      validateOutboundRecipients({
        to: claimedRecord.to,
        cc: claimedRecord.cc,
        bcc: claimedRecord.bcc
      });
      const headers = normalizeAndValidateOutboundHeaders(claimedRecord.headers);
      const result = await resolvedSender.sender.send({
        outboxId: claimedRecord.intentId,
        to: claimedRecord.to,
        cc: claimedRecord.cc,
        bcc: claimedRecord.bcc,
        subject: claimedRecord.subject,
        textBody: claimedRecord.textBody,
        htmlBody: claimedRecord.htmlBody,
        headers,
        threadId: resolvedSender.threadId
      });
      const completedAt = now();
      updateMailOutboxAttempt(db, attemptId, {
        status: "sent",
        providerMessageId: result.providerMessageId,
        completedAt
      });
      updateMailOutboxStatus(db, record.intentId, {
        status: "sent",
        updatedAt: completedAt,
        providerMessageId: result.providerMessageId,
        errorText: undefined
      });
      sent += 1;
    } catch (error) {
      const completedAt = now();
      const errorText = redactDeliveryError(error instanceof Error ? error.message : String(error));
      updateMailOutboxAttempt(db, attemptId, {
        status: "failed",
        errorText,
        completedAt
      });
      updateMailOutboxStatus(db, record.intentId, {
        status: "failed",
        updatedAt: completedAt,
        errorText
      });
      failed += 1;
    }
  }

  return {
    sent,
    failed
  };
}

function redactDeliveryError(message: string) {
  return redactSensitiveText(message);
}

export function createSmtpTransportSender(
  config: SmtpTransportConfig,
  transportFactory: SmtpTransportFactory = createDefaultSmtpTransport,
  options: {
    fetchImpl?: typeof fetch;
  } = {}
): SmtpSender {
  return {
    async send(message) {
      validateOutboundRecipients({
        to: message.to,
        cc: message.cc,
        bcc: message.bcc
      });
      const headers = normalizeAndValidateOutboundHeaders(message.headers);
      const transport = transportFactory({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: await resolveSmtpTransportAuth(config, {
          fetchImpl: options.fetchImpl
        })
      });
      const info = await transport.sendMail({
        from: config.from,
        to: joinRecipients(message.to),
        cc: joinRecipients(message.cc),
        bcc: joinRecipients(message.bcc),
        subject: message.subject,
        text: message.textBody,
        html: message.htmlBody,
        headers
      });

      return {
        providerMessageId: info.messageId
      };
    }
  };
}

export function createConfiguredSmtpSender(
  config: AppConfig,
  transportFactory?: SmtpTransportFactory,
  options: {
    fetchImpl?: typeof fetch;
  } = {}
) {
  if (!config.smtp.host || !config.smtp.from) {
    return null;
  }

  return createSmtpTransportSender(
    {
      from: config.smtp.from,
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      username: config.smtp.username || undefined,
      password: config.smtp.password || undefined
    },
    transportFactory,
    options
  );
}

export function hasConfiguredAccountSmtpSettings(
  settings: Record<string, unknown>,
  fallbackFrom?: string
) {
  return resolveAccountSmtpTransportConfig(settings, fallbackFrom) !== null;
}

export function createAccountSmtpSender(
  settings: Record<string, unknown>,
  input: {
    fallbackFrom?: string;
    transportFactory?: SmtpTransportFactory;
    fetchImpl?: typeof fetch;
  } = {}
) {
  const config = resolveAccountSmtpTransportConfig(settings, input.fallbackFrom);
  if (!config) {
    return null;
  }

  return createSmtpTransportSender(config, input.transportFactory, {
    fetchImpl: input.fetchImpl
  });
}

function createDefaultSmtpTransport(config: {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass?: string;
    type?: "OAuth2";
    accessToken?: string;
  };
}): SmtpTransport {
  return nodemailer.createTransport(config);
}

function joinRecipients(recipients: string[]) {
  return recipients.length > 0 ? recipients.join(", ") : undefined;
}

function resolveAccountSmtpTransportConfig(
  settings: Record<string, unknown>,
  fallbackFrom?: string
): SmtpTransportConfig | null {
  const smtp =
    settings.smtp && typeof settings.smtp === "object" && !Array.isArray(settings.smtp)
      ? (settings.smtp as Record<string, unknown>)
      : null;
  if (!smtp) {
    return null;
  }

  const host = readString(smtp.host);
  const from = readString(smtp.from) ?? normalizeOptionalString(fallbackFrom);
  if (!host || !from) {
    return null;
  }
  const username = readString(smtp.username) ?? from;
  const oauth =
    smtp.oauth && typeof smtp.oauth === "object" && !Array.isArray(smtp.oauth)
      ? (smtp.oauth as Record<string, unknown>)
      : undefined;
  const password = readString(smtp.password);

  return {
    from,
    host,
    port: readPositiveInteger(smtp.port) ?? 587,
    secure: readBoolean(smtp.secure) ?? false,
    username,
    password,
    oauth
  };
}

async function resolveSmtpTransportAuth(
  config: SmtpTransportConfig,
  options: {
    fetchImpl?: typeof fetch;
  } = {}
) {
  if (config.oauth) {
    const accessToken = await resolveOAuthAccessToken(
      {
        accessToken: readString(config.oauth.accessToken),
        refreshToken: readString(config.oauth.refreshToken),
        clientId: readString(config.oauth.clientId),
        clientSecret: readString(config.oauth.clientSecret),
        tokenEndpoint: readString(config.oauth.tokenEndpoint),
        scope: readString(config.oauth.scope),
        expiry: readString(config.oauth.expiry),
        tokenType: readString(config.oauth.tokenType),
        idToken: readString(config.oauth.idToken)
      },
      {
        fetchImpl: options.fetchImpl
      }
    );

    return {
      type: "OAuth2" as const,
      user: config.username ?? config.from,
      accessToken: accessToken.accessToken
    };
  }

  if (config.username && config.password) {
    return {
      user: config.username,
      pass: config.password
    };
  }

  return undefined;
}

function readString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeOptionalString(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readPositiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
}

function readBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}
