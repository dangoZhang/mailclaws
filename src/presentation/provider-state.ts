import {
  hasConfiguredGmailSenderSettings,
  hasConfiguredGmailSettings
} from "../providers/gmail.js";
import { hasConfiguredAccountSmtpSettings } from "../providers/smtp.js";
import type { MailAccountRecord } from "../storage/repositories/mail-accounts.js";
import type { ProviderCursorRecord } from "../storage/repositories/provider-cursors.js";
import type { ProviderEventRecord } from "../storage/repositories/provider-events.js";

export interface AccountProviderStateSummary {
  provider: string;
  ingress:
    | {
        mode: "gmail_auth_only" | "gmail_watch" | "imap_watch" | "raw_mime_forward" | "manual";
        acceptsRawMime: boolean;
        mailboxAddress: string;
        rawMimeEndpoint: string;
      }
    | {
        mode: "manual";
        acceptsRawMime: boolean;
        mailboxAddress: string;
        rawMimeEndpoint: string;
      };
  outbound:
    | {
        mode: "gmail_api" | "account_smtp" | "global_smtp";
        fromAddress: string;
      }
    | {
        mode: "disabled";
        fromAddress: null;
      };
  cursorKinds: string[];
  recentEventCount: number;
  lastEventType: string | null;
  lastEventAt: string | null;
  watch: {
    checkpoint: string | null;
    historyId: string | null;
    expiration: string | null;
    uidValidity: string | null;
    expired: boolean | null;
  };
  latestCursorAdvancedAt: string | null;
  latestCursorInvalidatedAt: string | null;
  latestNotificationAt: string | null;
  latestBackfillCompletedAt: string | null;
  latestRecoveryStartedAt: string | null;
  latestRecoveryCompletedAt: string | null;
}

export function summarizeAccountProviderState(
  account: MailAccountRecord,
  cursors: ProviderCursorRecord[],
  recentEvents: ProviderEventRecord[],
  options: {
    globalSmtpConfigured: boolean;
    now?: number;
  }
): AccountProviderStateSummary {
  const watchCursor = cursors.find((cursor) => cursor.cursorKind === "watch") ?? null;
  const latestEvent = recentEvents.at(-1) ?? null;
  const latestCursorAdvanced = findLatestProviderEvent(recentEvents, "provider.cursor.advanced");
  const latestCursorInvalidated = findLatestProviderEvent(recentEvents, "provider.cursor.invalidated");
  const latestNotification = findLatestProviderEvent(recentEvents, "provider.notification.received");
  const latestBackfillCompleted = findLatestProviderEvent(recentEvents, "provider.backfill.completed");
  const latestRecoveryStarted = findLatestProviderEvent(recentEvents, "provider.mailbox.recovery.started");
  const latestRecoveryCompleted = findLatestProviderEvent(
    recentEvents,
    "provider.mailbox.recovery.completed"
  );
  const watchSettings = getWatchSettings(account.settings);
  const gmailSettings =
    account.settings.gmail && typeof account.settings.gmail === "object"
      ? (account.settings.gmail as Record<string, unknown>)
      : null;
  const gmailWatch =
    gmailSettings?.watch && typeof gmailSettings.watch === "object"
      ? (gmailSettings.watch as Record<string, unknown>)
      : null;
  const watchExpiration = firstString(
    (watchCursor?.metadata ?? {})["watchExpiration"],
    watchSettings.expiration,
    gmailWatch?.expiration
  );
  const watchHistoryId = firstString(
    (watchCursor?.metadata ?? {})["watchHistoryId"],
    watchSettings.historyId,
    gmailWatch?.historyId
  );
  const watchUidValidity = firstString(
    (watchCursor?.metadata ?? {})["uidValidity"],
    watchSettings.uidValidity
  );
  const now = options.now ?? Date.now();

  return {
    provider: account.provider,
    ingress: summarizeInboundAccountMode(account),
    outbound: summarizeOutboundAccountMode(account, {
      globalSmtpConfigured: options.globalSmtpConfigured
    }),
    cursorKinds: cursors.map((cursor) => cursor.cursorKind),
    recentEventCount: recentEvents.length,
    lastEventType: latestEvent?.eventType ?? null,
    lastEventAt: latestEvent?.createdAt ?? null,
    watch: {
      checkpoint: watchCursor?.cursorValue ?? watchSettings.checkpoint ?? null,
      historyId: watchHistoryId ?? null,
      expiration: watchExpiration ?? null,
      uidValidity: watchUidValidity ?? null,
      expired: watchExpiration ? Date.parse(watchExpiration) <= now : null
    },
    latestCursorAdvancedAt: latestCursorAdvanced?.createdAt ?? null,
    latestCursorInvalidatedAt: latestCursorInvalidated?.createdAt ?? null,
    latestNotificationAt: latestNotification?.createdAt ?? null,
    latestBackfillCompletedAt: latestBackfillCompleted?.createdAt ?? null,
    latestRecoveryStartedAt: latestRecoveryStarted?.createdAt ?? null,
    latestRecoveryCompletedAt: latestRecoveryCompleted?.createdAt ?? null
  };
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

function summarizeInboundAccountMode(account: MailAccountRecord) {
  switch (account.provider) {
    case "gmail":
      if (!hasConfiguredGmailSettings(account.settings)) {
        return {
          mode: "gmail_auth_only",
          acceptsRawMime: true,
          mailboxAddress: account.emailAddress,
          rawMimeEndpoint: "/api/inbound/raw"
        } as const;
      }
      return {
        mode: "gmail_watch",
        acceptsRawMime: true,
        mailboxAddress: account.emailAddress,
        rawMimeEndpoint: "/api/inbound/raw"
      } as const;
    case "imap":
      return {
        mode: "imap_watch",
        acceptsRawMime: true,
        mailboxAddress: account.emailAddress,
        rawMimeEndpoint: "/api/inbound/raw"
      } as const;
    case "forward":
      return {
        mode: "raw_mime_forward",
        acceptsRawMime: true,
        mailboxAddress: account.emailAddress,
        rawMimeEndpoint: "/api/inbound/raw"
      } as const;
    default:
      return {
        mode: "manual",
        acceptsRawMime: true,
        mailboxAddress: account.emailAddress,
        rawMimeEndpoint: "/api/inbound/raw"
      } as const;
  }
}

function summarizeOutboundAccountMode(
  account: MailAccountRecord,
  options: {
    globalSmtpConfigured: boolean;
  }
) {
  if (account.provider === "gmail" && hasConfiguredGmailSenderSettings(account.settings)) {
    return {
      mode: "gmail_api",
      fromAddress: account.emailAddress
    } as const;
  }

  if (hasConfiguredAccountSmtpSettings(account.settings, account.emailAddress)) {
    return {
      mode: "account_smtp",
      fromAddress: account.emailAddress
    } as const;
  }

  if (options.globalSmtpConfigured) {
    return {
      mode: "global_smtp",
      fromAddress: account.emailAddress
    } as const;
  }

  return {
    mode: "disabled",
    fromAddress: null
  } as const;
}

function findLatestProviderEvent(events: ProviderEventRecord[], eventType: string) {
  return [...events].reverse().find((event) => event.eventType === eventType) ?? null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}
