import type { AppConfig } from "../config.js";
import type { DatabaseSync } from "node:sqlite";

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
import {
  createAccountSmtpSender,
  deliverQueuedOutbox,
  hasConfiguredAccountSmtpSettings,
  type DeliverQueuedOutboxOptions,
  type DeliverySenderResolver,
  type SmtpSender,
  type SmtpSendResult,
  type SmtpTransportConfig,
  type SmtpTransportFactory
} from "./smtp.js";
import type { GmailWatchBatch, GmailWatchNotification, ImapPollBatch } from "./watcher.js";
import type { MailAccountRecord } from "../storage/repositories/mail-accounts.js";
import { runLocalCommand, type LocalCommandRunner } from "../runtime/local-command-executor.js";
import {
  MAIL_IO_PROTOCOL_NAME,
  MAIL_IO_PROTOCOL_VERSION,
  MAIL_IO_COMMAND_CAPABILITIES,
  type MailIoCommandCapability,
  type MailIoCommandHandshakeResult,
  type MailIoCommandSelfCheckResult,
  type MailIoCommandOperation
} from "./mail-io-command.js";
import type { MailIoBoundarySummary } from "../core/types.js";

export interface MailIoPlane {
  deliverQueuedOutbox(
    db: DatabaseSync,
    sender: SmtpSender | DeliverySenderResolver,
    options?: DeliverQueuedOutboxOptions
  ): ReturnType<typeof deliverQueuedOutbox>;
  fetchImapMessages(
    input: Parameters<typeof fetchConfiguredImapMessages>[0],
    options?: Parameters<typeof fetchConfiguredImapMessages>[1]
  ): Promise<ImapPollBatch>;
  fetchGmailWatchBatch(
    input: Parameters<typeof fetchConfiguredGmailWatchBatch>[0],
    options?: Parameters<typeof fetchConfiguredGmailWatchBatch>[1]
  ): Promise<GmailWatchBatch>;
  fetchGmailMessage(
    input: Parameters<typeof fetchConfiguredGmailMessage>[0],
    options?: Parameters<typeof fetchConfiguredGmailMessage>[1]
  ): Promise<GmailMessage | null>;
  fetchGmailNotificationBatch(
    input: Parameters<typeof fetchConfiguredGmailNotificationBatch>[0],
    options?: Parameters<typeof fetchConfiguredGmailNotificationBatch>[1]
  ): Promise<GmailWatchBatch>;
  recoverGmailMailbox(
    input: Parameters<typeof recoverConfiguredGmailMailbox>[0],
    options?: Parameters<typeof recoverConfiguredGmailMailbox>[1]
  ): Promise<GmailWatchBatch>;
  inspectBoundary?(): Promise<MailIoBoundarySummary> | MailIoBoundarySummary;
}

export interface LocalMailIoPlaneOptions {
  smtpSender: SmtpSender | null;
  smtpTransportFactory?: SmtpTransportFactory;
  gmailSendClientFactory?: (config: { accessToken: string }) => GmailSendClientLike;
}

export interface CommandMailIoPlaneOptions {
  command: string;
  cwd?: string;
  runner?: LocalCommandRunner;
  defaultSmtpConfig: SmtpTransportConfig | null;
  getRoom(input: { roomKey: string }): {
    accountId: string;
    stableThreadId: string;
  } | null;
  getAccount(input: { accountId: string }): MailAccountRecord | null;
  getProviderThreadId(input: { accountId: string; stableThreadId: string }): string | undefined;
}

export function createLocalMailIoPlane(_options: LocalMailIoPlaneOptions): MailIoPlane {
  void _options;
  return {
    deliverQueuedOutbox(db, sender, deliverOptions) {
      return deliverQueuedOutbox(db, sender, deliverOptions);
    },
    fetchImapMessages(input, fetchOptions) {
      return fetchConfiguredImapMessages(input, fetchOptions);
    },
    fetchGmailWatchBatch(input, fetchOptions) {
      return fetchConfiguredGmailWatchBatch(input, fetchOptions);
    },
    fetchGmailMessage(input, fetchOptions) {
      return fetchConfiguredGmailMessage(input, fetchOptions);
    },
    fetchGmailNotificationBatch(input, fetchOptions) {
      return fetchConfiguredGmailNotificationBatch(input, fetchOptions);
    },
    recoverGmailMailbox(input, fetchOptions) {
      return recoverConfiguredGmailMailbox(input, fetchOptions);
    },
    inspectBoundary() {
      return {
        mode: "local",
        label: "in_process",
        protocol: null,
        handshakeStatus: "not_applicable",
        capabilities: [...MAIL_IO_COMMAND_CAPABILITIES],
        checkedAt: null,
        error: null
      } satisfies MailIoBoundarySummary;
    }
  };
}

export function createCommandMailIoPlane(options: CommandMailIoPlaneOptions): MailIoPlane {
  if (!options.command.trim()) {
    throw new Error("MAILCLAW_MAIL_IO_COMMAND is required when mail io mode is command");
  }

  const runner =
    options.runner ??
    ((command: string, input: string) =>
      runLocalCommand(command, input, {
        cwd: options.cwd,
        transportLabel: "mail-io-command"
      }));
  let handshakePromise: Promise<MailIoCommandHandshakeResult> | null = null;
  let lastCommandBoundaryError: string | null = null;
  let lastCommandBoundaryCheckAt: string | null = null;
  const ensureHandshake = () => {
    handshakePromise ??= invokeMailIoHandshake(runner, options.command)
      .then((handshake) => {
        lastCommandBoundaryError = null;
        lastCommandBoundaryCheckAt = new Date().toISOString();
        return handshake;
      })
      .catch((error) => {
        lastCommandBoundaryError = error instanceof Error ? error.message : String(error);
        lastCommandBoundaryCheckAt = new Date().toISOString();
        handshakePromise = null;
        throw error;
      });
    return handshakePromise;
  };
  const invoke = async <TResult>(operation: MailIoCommandCapability, input: unknown) => {
    const handshake = await ensureHandshake();
    if (!handshake.capabilities.includes(operation)) {
      throw new Error(`mail io command does not advertise capability ${operation}`);
    }

    return invokeMailIoCommand<TResult>(runner, options.command, operation, input);
  };

  return {
    async deliverQueuedOutbox(db, _sender, deliverOptions) {
      return deliverQueuedOutbox(
        db,
        async ({ record }) => {
          const deliveryContext = resolveCommandDeliveryContext({
            roomKey: record.roomKey,
            defaultSmtpConfig: options.defaultSmtpConfig,
            getRoom: options.getRoom,
            getAccount: options.getAccount,
            getProviderThreadId: options.getProviderThreadId
          });
          if (!deliveryContext) {
            return null;
          }

          return {
            sender: {
              send: async (message) => {
                const result = await invoke<{
                  providerMessageId?: string;
                }>("deliver_outbox_message", {
                  deliveryContext,
                  message
                });

                return {
                  providerMessageId: result.providerMessageId
                } satisfies SmtpSendResult;
              }
            },
            threadId: deliveryContext.threadId
          };
        },
        deliverOptions
      );
    },
    fetchImapMessages(input) {
      return invoke<ImapPollBatch>(
        "fetch_imap_messages",
        stripNonSerializableFields(input)
      );
    },
    fetchGmailWatchBatch(input) {
      return invoke<GmailWatchBatch>(
        "fetch_gmail_watch_batch",
        stripNonSerializableFields(input)
      );
    },
    fetchGmailMessage(input) {
      return invoke<GmailMessage | null>(
        "fetch_gmail_message",
        stripNonSerializableFields(input)
      );
    },
    fetchGmailNotificationBatch(input) {
      return invoke<GmailWatchBatch>(
        "fetch_gmail_notification_batch",
        stripNonSerializableFields(input)
      );
    },
    recoverGmailMailbox(input) {
      return invoke<GmailWatchBatch>(
        "recover_gmail_mailbox",
        stripNonSerializableFields(input)
      );
    },
    async inspectBoundary() {
      try {
        const result = await invokeMailIoSelfCheck(runner, options.command);
        lastCommandBoundaryError = null;
        lastCommandBoundaryCheckAt = result.checkedAt;
        return {
          mode: "command",
          label: normalizeCommandLabel(options.command),
          protocol: {
            name: result.protocol,
            version: result.version
          },
          handshakeStatus: "ready",
          capabilities: [...result.capabilities],
          checkedAt: result.checkedAt,
          error: null
        } satisfies MailIoBoundarySummary;
      } catch (error) {
        return {
          mode: "command",
          label: normalizeCommandLabel(options.command),
          protocol: {
            name: MAIL_IO_PROTOCOL_NAME,
            version: MAIL_IO_PROTOCOL_VERSION
          },
          handshakeStatus: "failed",
          capabilities: [],
          checkedAt: lastCommandBoundaryCheckAt,
          error: lastCommandBoundaryError ?? (error instanceof Error ? error.message : String(error))
        } satisfies MailIoBoundarySummary;
      }
    }
  };
}

export function resolveLocalDeliverySender(
  input: {
    roomKey: string;
    defaultSender: SmtpSender | null;
    getRoom(input: { roomKey: string }): {
      accountId: string;
      stableThreadId: string;
    } | null;
    getAccount(input: { accountId: string }): MailAccountRecord | null;
    getProviderThreadId(input: { accountId: string; stableThreadId: string }): string | undefined;
    smtpTransportFactory?: SmtpTransportFactory;
    gmailSendClientFactory?: (config: { accessToken: string }) => GmailSendClientLike;
  },
  caches: {
    gmailSenderCache: Map<string, ReturnType<typeof createConfiguredGmailSender>>;
    accountSmtpSenderCache: Map<string, ReturnType<typeof createAccountSmtpSender>>;
  }
) {
  const room = input.getRoom({
    roomKey: input.roomKey
  });
  if (!room) {
    return {
      sender: input.defaultSender,
      room,
      providerThreadId: undefined
    };
  }

  const account = input.getAccount({
    accountId: room.accountId
  });
  const providerThreadId = input.getProviderThreadId({
    accountId: room.accountId,
    stableThreadId: room.stableThreadId
  });

  if (account?.provider === "gmail" && account.settings && typeof account.settings === "object") {
    let sender = caches.gmailSenderCache.get(account.accountId);
    if (!sender && hasConfiguredGmailSenderSettings(account.settings)) {
      sender = createConfiguredGmailSender(account.settings, {
        clientFactory: input.gmailSendClientFactory
      });
      caches.gmailSenderCache.set(account.accountId, sender);
    }

    if (sender) {
      return {
        sender,
        room,
        providerThreadId
      };
    }
  }

  if (account && hasConfiguredAccountSmtpSettings(account.settings, account.emailAddress)) {
    let sender = caches.accountSmtpSenderCache.get(account.accountId);
    if (!sender) {
      sender = createAccountSmtpSender(account.settings, {
        fallbackFrom: account.emailAddress,
        transportFactory: input.smtpTransportFactory
      });
      caches.accountSmtpSenderCache.set(account.accountId, sender);
    }

    return {
      sender,
      room,
      providerThreadId
    };
  }

  return {
    sender: input.defaultSender,
    room,
    providerThreadId
  };
}

function hasConfiguredGmailSenderSettings(settings: Record<string, unknown>) {
  const gmail = settings.gmail;
  return Boolean(
    gmail &&
      typeof gmail === "object" &&
      typeof (gmail as Record<string, unknown>).accessToken === "string" &&
      ((gmail as Record<string, unknown>).accessToken as string).trim().length > 0
  );
}

function resolveCommandDeliveryContext(input: {
  roomKey: string;
  defaultSmtpConfig: SmtpTransportConfig | null;
  getRoom(input: { roomKey: string }): {
    accountId: string;
    stableThreadId: string;
  } | null;
  getAccount(input: { accountId: string }): MailAccountRecord | null;
  getProviderThreadId(input: { accountId: string; stableThreadId: string }): string | undefined;
}) {
  const room = input.getRoom({
    roomKey: input.roomKey
  });
  const account = room
    ? input.getAccount({
        accountId: room.accountId
      })
    : null;
  const threadId = room
    ? input.getProviderThreadId({
        accountId: room.accountId,
        stableThreadId: room.stableThreadId
      })
    : undefined;

  if (account?.provider === "gmail" && account.settings && typeof account.settings === "object") {
    return {
      provider: "gmail" as const,
      threadId,
      settings: account.settings
    };
  }

  if (account && hasConfiguredAccountSmtpSettings(account.settings, account.emailAddress)) {
    return {
      provider: "smtp" as const,
      threadId,
      settings: account.settings,
      fallbackFrom: account.emailAddress
    };
  }

  if (input.defaultSmtpConfig) {
    return {
      provider: "smtp" as const,
      threadId,
      transport: input.defaultSmtpConfig
    };
  }

  return null;
}

async function invokeMailIoCommand<TResult>(
  runner: LocalCommandRunner,
  command: string,
  operation: MailIoCommandOperation,
  input: unknown
) {
  const result = await runner(
    command,
    JSON.stringify({
      operation,
      input
    })
  );

  if (result.exitCode !== 0) {
    throw new Error(
      `mail io command failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`}`
    );
  }

  const trimmed = result.stdout.trim();
  if (!trimmed) {
    throw new Error(`mail io command ${operation} returned an empty response`);
  }

  const payload = JSON.parse(trimmed) as {
    protocol?: string;
    version?: number;
    operation?: string;
    ok?: boolean;
    result?: TResult;
    error?: string;
  };
  if (payload.protocol !== MAIL_IO_PROTOCOL_NAME) {
    throw new Error(
      `mail io command ${operation} returned unexpected protocol ${payload.protocol ?? "unknown"}`
    );
  }
  if (payload.version !== MAIL_IO_PROTOCOL_VERSION) {
    throw new Error(
      `mail io command ${operation} returned unsupported protocol version ${payload.version ?? "unknown"}`
    );
  }
  if (payload.operation !== operation) {
    throw new Error(
      `mail io command ${operation} returned mismatched operation ${payload.operation ?? "unknown"}`
    );
  }
  if (payload.ok === false) {
    throw new Error(payload.error?.trim() || `mail io command ${operation} failed`);
  }
  if (payload.result === undefined) {
    throw new Error(`mail io command ${operation} returned no result`);
  }

  return payload.result;
}

async function invokeMailIoHandshake(
  runner: LocalCommandRunner,
  command: string
): Promise<MailIoCommandHandshakeResult> {
  const result = await invokeMailIoCommand<MailIoCommandHandshakeResult>(runner, command, "handshake", {});
  if (result.operation !== "handshake") {
    throw new Error("mail io command handshake returned an invalid operation");
  }
  if (result.status !== "ready") {
    throw new Error(`mail io command handshake returned unexpected status ${result.status}`);
  }
  if (result.protocol !== MAIL_IO_PROTOCOL_NAME || result.version !== MAIL_IO_PROTOCOL_VERSION) {
    throw new Error("mail io command handshake returned incompatible protocol metadata");
  }
  if (!Array.isArray(result.capabilities) || result.capabilities.length === 0) {
    throw new Error("mail io command handshake returned no capabilities");
  }

  return result;
}

async function invokeMailIoSelfCheck(
  runner: LocalCommandRunner,
  command: string
): Promise<MailIoCommandSelfCheckResult> {
  const result = await invokeMailIoCommand<MailIoCommandSelfCheckResult>(runner, command, "self_check", {});
  if (result.operation !== "self_check") {
    throw new Error("mail io command self_check returned an invalid operation");
  }
  if (result.status !== "ready") {
    throw new Error(`mail io command self_check returned unexpected status ${result.status}`);
  }
  if (result.protocol !== MAIL_IO_PROTOCOL_NAME || result.version !== MAIL_IO_PROTOCOL_VERSION) {
    throw new Error("mail io command self_check returned incompatible protocol metadata");
  }
  if (typeof result.checkedAt !== "string" || result.checkedAt.trim().length === 0) {
    throw new Error("mail io command self_check returned no checkedAt timestamp");
  }

  return result;
}

function stripNonSerializableFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripNonSerializableFields(entry)) as T;
  }

  if (value instanceof AbortSignal) {
    return undefined as T;
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "function") {
      continue;
    }
    const sanitized = stripNonSerializableFields(entry);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }
  return output as T;
}

export function resolveDefaultSmtpTransportConfig(config: AppConfig): SmtpTransportConfig | null {
  if (!config.smtp.host || !config.smtp.from) {
    return null;
  }

  return {
    from: config.smtp.from,
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    username: config.smtp.username || undefined,
    password: config.smtp.password || undefined
  };
}

function normalizeCommandLabel(command: string) {
  return command.trim().split(/\s+/)[0] ?? "local";
}

export type {
  GmailApiClientLike,
  GmailMessage,
  GmailSendClientLike,
  GmailWatchBatch,
  GmailWatchNotification,
  ImapClientConfig,
  ImapClientLike,
  ImapPollBatch
};
