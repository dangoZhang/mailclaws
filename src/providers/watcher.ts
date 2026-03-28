import { setTimeout as delay } from "node:timers/promises";

import type { RuntimeIngestInput } from "../orchestration/runtime.js";
import { mapGmailMessageToEnvelope, type GmailMessage } from "./gmail.js";
import { mapImapMessageToEnvelope, type ImapFetchedMessage } from "./imap.js";
import type { ProviderMailEnvelope } from "./types.js";

export interface WatcherRunResult<TCheckpoint> {
  checkpoint?: TCheckpoint;
  stopped: boolean;
}

export interface WatcherController<TCheckpoint> {
  stop(): Promise<WatcherRunResult<TCheckpoint>>;
  restart(options?: { checkpoint?: TCheckpoint }): Promise<WatcherRunResult<TCheckpoint>>;
  checkpoint(): TCheckpoint | undefined;
}

export interface ImapPollBatch {
  messages: ImapFetchedMessage[];
  checkpoint?: string;
  checkpointMetadata?: Record<string, unknown>;
  done?: boolean;
}

export interface GmailWatchNotification {
  id: string;
  cursor?: string;
  threadId?: string;
}

export interface GmailWatchBatch {
  notifications: GmailWatchNotification[];
  checkpoint?: string;
  checkpointMetadata?: Record<string, unknown>;
  done?: boolean;
}

export interface StartImapPollerOptions {
  accountId: string;
  mailboxAddress: string;
  fetch(input: { checkpoint?: string; signal: AbortSignal }): Promise<ImapPollBatch>;
  ingest(input: RuntimeIngestInput): Promise<unknown>;
  onCheckpoint?: (checkpoint: string, metadata?: Record<string, unknown>) => void | Promise<void>;
  intervalMs?: number;
  initialCheckpoint?: string;
  processImmediately?: boolean;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  mapMessage?: (message: ImapFetchedMessage) => ProviderMailEnvelope;
}

export interface StartGmailWatcherOptions {
  accountId: string;
  mailboxAddress: string;
  listen(input: { checkpoint?: string; signal: AbortSignal }): Promise<GmailWatchBatch>;
  fetch(notification: GmailWatchNotification, signal: AbortSignal): Promise<GmailMessage | null>;
  ingest(input: RuntimeIngestInput): Promise<unknown>;
  onCheckpoint?: (checkpoint: string, metadata?: Record<string, unknown>) => void | Promise<void>;
  intervalMs?: number;
  initialCheckpoint?: string;
  processImmediately?: boolean;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  mapMessage?: (message: GmailMessage) => ProviderMailEnvelope;
}

export function startImapPoller(options: StartImapPollerOptions): WatcherController<string> {
  return createWatcherController<string>(options.initialCheckpoint, async ({ checkpoint, signal, updateCheckpoint }) => {
    const sleep = options.sleep ?? defaultSleep;
    let cursor = checkpoint;

    while (!signal.aborted) {
      const batch = await options.fetch({ checkpoint: cursor, signal });
      const messages = batch.messages ?? [];

      for (const message of messages) {
        const envelope = (options.mapMessage ?? mapImapMessageToEnvelope)(message);
        await options.ingest({
          accountId: options.accountId,
          mailboxAddress: options.mailboxAddress,
          envelope,
          processImmediately: options.processImmediately ?? false
        });
      }

      const nextCheckpoint = batch.checkpoint ?? inferImapCheckpoint(messages);
      if (nextCheckpoint !== undefined) {
        cursor = nextCheckpoint;
        updateCheckpoint(nextCheckpoint);
        await options.onCheckpoint?.(nextCheckpoint, batch.checkpointMetadata);
      }

      if (batch.done) {
        break;
      }

      await sleep(options.intervalMs ?? 1_000, signal);
    }

    return {
      checkpoint: cursor,
      stopped: signal.aborted
    };
  });
}

export function startGmailWatcher(options: StartGmailWatcherOptions): WatcherController<string> {
  return createWatcherController<string>(options.initialCheckpoint, async ({ checkpoint, signal, updateCheckpoint }) => {
    const sleep = options.sleep ?? defaultSleep;
    let cursor = checkpoint;

    while (!signal.aborted) {
      const batch = await options.listen({ checkpoint: cursor, signal });
      const notifications = batch.notifications ?? [];

      for (const notification of notifications) {
        const fetched = await options.fetch(notification, signal);
        if (!fetched) {
          continue;
        }

        const envelope = (options.mapMessage ?? mapGmailMessageToEnvelope)(fetched);
        await options.ingest({
          accountId: options.accountId,
          mailboxAddress: options.mailboxAddress,
          envelope,
          processImmediately: options.processImmediately ?? false
        });
      }

      const nextCheckpoint = batch.checkpoint ?? inferGmailCheckpoint(notifications);
      if (nextCheckpoint !== undefined) {
        cursor = nextCheckpoint;
        updateCheckpoint(nextCheckpoint);
        await options.onCheckpoint?.(nextCheckpoint, batch.checkpointMetadata);
      }

      if (batch.done) {
        break;
      }

      await sleep(options.intervalMs ?? 1_000, signal);
    }

    return {
      checkpoint: cursor,
      stopped: signal.aborted
    };
  });
}

function createWatcherController<TCheckpoint>(
  initialCheckpoint: TCheckpoint | undefined,
  runner: (context: {
    checkpoint?: TCheckpoint;
    signal: AbortSignal;
    updateCheckpoint(checkpoint: TCheckpoint): void;
  }) => Promise<WatcherRunResult<TCheckpoint>>
): WatcherController<TCheckpoint> {
  let checkpoint = initialCheckpoint;
  let abortController = new AbortController();
  let currentRun: Promise<WatcherRunResult<TCheckpoint>> | null = null;

  const startRun = () => {
    abortController = new AbortController();

    const run = (async () => {
      try {
        return await runner({
          checkpoint,
          signal: abortController.signal,
          updateCheckpoint(nextCheckpoint) {
            checkpoint = nextCheckpoint;
          }
        });
      } catch (error) {
        if (isAbortError(error) || abortController.signal.aborted) {
          return {
            checkpoint,
            stopped: true
          };
        }

        throw error;
      }
    })();

    const wrappedRun = run.finally(() => {
      if (currentRun === wrappedRun) {
        currentRun = null;
      }
    });
    currentRun = wrappedRun;

    return currentRun;
  };

  void startRun();

  const stop = async () => {
    if (!currentRun) {
      return {
        checkpoint,
        stopped: true
      };
    }

    abortController.abort();
    return currentRun;
  };

  return {
    stop,
    async restart(options?: { checkpoint?: TCheckpoint }) {
      await stop();

      if (options?.checkpoint !== undefined) {
        checkpoint = options.checkpoint;
      }

      return startRun();
    },
    checkpoint() {
      return checkpoint;
    }
  };
}

function inferImapCheckpoint(messages: ImapFetchedMessage[]) {
  const lastMessage = messages.at(-1);
  if (!lastMessage) {
    return undefined;
  }

  return String(lastMessage.uid);
}

function inferGmailCheckpoint(notifications: GmailWatchNotification[]) {
  const lastNotification = notifications.at(-1);
  if (!lastNotification) {
    return undefined;
  }

  return lastNotification.cursor ?? lastNotification.id;
}

function defaultSleep(ms: number, signal: AbortSignal) {
  return delay(ms, undefined, { signal });
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || (error as { code?: string }).code === "ABORT_ERR")
  );
}
