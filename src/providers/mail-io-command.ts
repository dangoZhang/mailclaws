import {
  createConfiguredGmailSender,
  fetchConfiguredGmailMessage,
  fetchConfiguredGmailNotificationBatch,
  fetchConfiguredGmailWatchBatch,
  recoverConfiguredGmailMailbox,
  type GmailApiClientLike,
  type GmailMessage,
  type GmailSendClientLike
} from "./gmail.js";
import { fetchConfiguredImapMessages, type ImapClientConfig, type ImapClientLike } from "./imap.js";
import { createAccountSmtpSender, createSmtpTransportSender, type SmtpTransportFactory } from "./smtp.js";
import type { GmailWatchBatch, ImapPollBatch } from "./watcher.js";

export const MAIL_IO_PROTOCOL_NAME = "mailclaws.mail-io";
export const MAIL_IO_PROTOCOL_VERSION = 1;

export type MailIoCommandCapability =
  | "self_check"
  | "deliver_outbox_message"
  | "fetch_imap_messages"
  | "fetch_gmail_watch_batch"
  | "fetch_gmail_message"
  | "fetch_gmail_notification_batch"
  | "recover_gmail_mailbox";

export const MAIL_IO_COMMAND_CAPABILITIES: readonly MailIoCommandCapability[] = [
  "self_check",
  "deliver_outbox_message",
  "fetch_imap_messages",
  "fetch_gmail_watch_batch",
  "fetch_gmail_message",
  "fetch_gmail_notification_batch",
  "recover_gmail_mailbox"
] as const;

export type MailIoCommandOperation = MailIoCommandCapability | "handshake";

export const MAIL_IO_COMMAND_OPERATIONS: readonly MailIoCommandOperation[] = [
  "handshake",
  ...MAIL_IO_COMMAND_CAPABILITIES
] as const;

export interface MailIoCommandRequest {
  operation: MailIoCommandOperation;
  input: unknown;
}

interface MailIoCommandEnvelope {
  protocol: typeof MAIL_IO_PROTOCOL_NAME;
  version: typeof MAIL_IO_PROTOCOL_VERSION;
  operation: MailIoCommandOperation;
}

export interface MailIoCommandHandshakeResult extends MailIoCommandEnvelope {
  operation: "handshake";
  sidecar: "mailioctl";
  status: "ready";
  capabilities: readonly MailIoCommandCapability[];
}

export interface MailIoCommandSelfCheckResult extends MailIoCommandEnvelope {
  operation: "self_check";
  sidecar: "mailioctl";
  status: "ready";
  checkedAt: string;
  capabilities: readonly MailIoCommandCapability[];
}

export interface MailIoCommandSuccess<TResult> extends MailIoCommandEnvelope {
  ok: true;
  result: TResult;
}

export interface MailIoCommandFailure extends MailIoCommandEnvelope {
  ok: false;
  error: string;
}

export type MailIoCommandResponse<TResult> = MailIoCommandSuccess<TResult> | MailIoCommandFailure;

export interface MailIoCommandHandlerOptions {
  smtpTransportFactory?: SmtpTransportFactory;
  gmailSendClientFactory?: (config: { accessToken: string }) => GmailSendClientLike;
  gmailApiClientFactory?: (config: { accessToken: string }) => GmailApiClientLike;
  imapClientFactory?: (config: Parameters<typeof fetchConfiguredImapMessages>[1] extends [infer T] ? never : never) => ImapClientLike;
}

type DeliverOutboxMessageInput = {
  deliveryContext:
    | {
        provider: "smtp";
        settings?: Record<string, unknown>;
        fallbackFrom?: string;
        transport?: {
          from: string;
          host: string;
          port: number;
          secure: boolean;
          username?: string;
          password?: string;
        };
      }
    | {
        provider: "gmail";
        settings: Record<string, unknown>;
      };
  message: {
    outboxId: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    textBody: string;
    htmlBody?: string;
    headers: Record<string, string>;
    threadId?: string;
  };
};

export function isMailIoCommandOperation(value: string): value is MailIoCommandOperation {
  return (MAIL_IO_COMMAND_OPERATIONS as readonly string[]).includes(value);
}

export async function handleMailIoCommand(
  request: MailIoCommandRequest,
  options: {
    smtpTransportFactory?: SmtpTransportFactory;
    gmailSendClientFactory?: (config: { accessToken: string }) => GmailSendClientLike;
    gmailApiClientFactory?: (config: { accessToken: string }) => GmailApiClientLike;
    imapClientFactory?: (config: ImapClientConfig) => ImapClientLike;
  } = {}
): Promise<
  | MailIoCommandHandshakeResult
  | MailIoCommandSelfCheckResult
  | ReturnType<typeof deliverOutboxMessageFromCommand>
  | Promise<ImapPollBatch>
  | Promise<GmailWatchBatch>
  | Promise<GmailMessage | null>
> {
  switch (request.operation) {
    case "handshake":
      return {
        protocol: MAIL_IO_PROTOCOL_NAME,
        version: MAIL_IO_PROTOCOL_VERSION,
        operation: "handshake",
        sidecar: "mailioctl",
        status: "ready",
        capabilities: [...MAIL_IO_COMMAND_CAPABILITIES]
      };
    case "self_check":
      return {
        protocol: MAIL_IO_PROTOCOL_NAME,
        version: MAIL_IO_PROTOCOL_VERSION,
        operation: "self_check",
        sidecar: "mailioctl",
        status: "ready",
        checkedAt: new Date().toISOString(),
        capabilities: [...MAIL_IO_COMMAND_CAPABILITIES]
      };
    case "deliver_outbox_message":
      return deliverOutboxMessageFromCommand(request.input as DeliverOutboxMessageInput, options);
    case "fetch_imap_messages":
      return fetchConfiguredImapMessages(
        withDefaultSignal(request.input as Parameters<typeof fetchConfiguredImapMessages>[0]),
        options.imapClientFactory
          ? {
              clientFactory: options.imapClientFactory
            }
          : undefined
      );
    case "fetch_gmail_watch_batch":
      return fetchConfiguredGmailWatchBatch(
        withDefaultSignal(request.input as Parameters<typeof fetchConfiguredGmailWatchBatch>[0]),
        options.gmailApiClientFactory
          ? {
              clientFactory: options.gmailApiClientFactory
            }
          : undefined
      );
    case "fetch_gmail_message":
      return fetchConfiguredGmailMessage(
        withDefaultSignal(request.input as Parameters<typeof fetchConfiguredGmailMessage>[0]),
        options.gmailApiClientFactory
          ? {
              clientFactory: options.gmailApiClientFactory
            }
          : undefined
      );
    case "fetch_gmail_notification_batch":
      return fetchConfiguredGmailNotificationBatch(
        withDefaultSignal(request.input as Parameters<typeof fetchConfiguredGmailNotificationBatch>[0]),
        options.gmailApiClientFactory
          ? {
              clientFactory: options.gmailApiClientFactory
            }
          : undefined
      );
    case "recover_gmail_mailbox":
      return recoverConfiguredGmailMailbox(
        withDefaultSignal(request.input as Parameters<typeof recoverConfiguredGmailMailbox>[0]),
        options.gmailApiClientFactory
          ? {
              clientFactory: options.gmailApiClientFactory
            }
          : undefined
      );
    default:
      throw new Error(`unsupported mail io operation: ${String(request.operation)}`);
  }
}

function withDefaultSignal<T extends { signal?: AbortSignal }>(input: T): T {
  if (input.signal) {
    return input;
  }

  return {
    ...input,
    signal: new AbortController().signal
  };
}

export async function runMailIoCommand(
  request: MailIoCommandRequest,
  options: {
    smtpTransportFactory?: SmtpTransportFactory;
    gmailSendClientFactory?: (config: { accessToken: string }) => GmailSendClientLike;
    gmailApiClientFactory?: (config: { accessToken: string }) => GmailApiClientLike;
    imapClientFactory?: (config: ImapClientConfig) => ImapClientLike;
  } = {}
): Promise<MailIoCommandResponse<unknown>> {
  try {
    const result = await handleMailIoCommand(request, options);
    return {
      protocol: MAIL_IO_PROTOCOL_NAME,
      version: MAIL_IO_PROTOCOL_VERSION,
      operation: request.operation,
      ok: true,
      result
    };
  } catch (error) {
    return {
      protocol: MAIL_IO_PROTOCOL_NAME,
      version: MAIL_IO_PROTOCOL_VERSION,
      operation: request.operation,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function deliverOutboxMessageFromCommand(
  input: DeliverOutboxMessageInput,
  options: {
    smtpTransportFactory?: SmtpTransportFactory;
    gmailSendClientFactory?: (config: { accessToken: string }) => GmailSendClientLike;
  }
) {
  const message = input.message;
  if (input.deliveryContext.provider === "gmail") {
    const sender = createConfiguredGmailSender(input.deliveryContext.settings, {
      clientFactory: options.gmailSendClientFactory
    });
    const result = await sender.send(message);
    return {
      providerMessageId: result.providerMessageId,
      providerThreadId: result.providerThreadId
    };
  }

  const sender = input.deliveryContext.transport
    ? createSmtpTransportSender(input.deliveryContext.transport, options.smtpTransportFactory)
    : createAccountSmtpSender(input.deliveryContext.settings ?? {}, {
        fallbackFrom: input.deliveryContext.fallbackFrom,
        transportFactory: options.smtpTransportFactory
      });

  if (!sender) {
    throw new Error("mail io command has no smtp sender configuration");
  }

  const result = await sender.send(message);
  return {
    providerMessageId: result.providerMessageId
  };
}
