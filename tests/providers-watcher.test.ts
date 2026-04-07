import { describe, expect, it, vi } from "vitest";

import {
  startGmailWatcher,
  startImapPoller,
  type GmailWatchBatch,
  type ImapPollBatch
} from "../src/providers/index.js";
import type { RuntimeIngestInput } from "../src/orchestration/runtime.js";

function createAbortableSleepGate() {
  const sleep = vi.fn((_: number, signal: AbortSignal) => {
    return new Promise<void>((resolve) => {
      const onAbort = () => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      };

      signal.addEventListener("abort", onAbort, { once: true });
    });
  });

  return { sleep };
}

describe("provider watcher daemons", () => {
  it("stops and restarts the IMAP poller from the last checkpoint", async () => {
    const ingest = vi.fn(async (input: RuntimeIngestInput) => {
      void input;
      return undefined;
    });
    const { sleep } = createAbortableSleepGate();
    const fetch = vi.fn(async ({ checkpoint }: { checkpoint?: string }): Promise<ImapPollBatch> => {
      if (checkpoint === undefined) {
        return {
          messages: [
            {
              uid: "1",
              subject: "First",
              from: [{ email: "sender@example.com" }],
              to: [{ email: "mailclaws@example.com" }],
              text: "First body"
            }
          ],
          checkpoint: "uid-1",
          done: false
        };
      }

      if (checkpoint === "uid-1") {
        return {
          messages: [
            {
              uid: "2",
              subject: "Second",
              from: [{ email: "sender@example.com" }],
              to: [{ email: "mailclaws@example.com" }],
              text: "Second body"
            }
          ],
          checkpoint: "uid-2",
          done: true
        };
      }

      throw new Error(`unexpected checkpoint ${checkpoint}`);
    });
    const poller = startImapPoller({
      accountId: "acct-1",
      mailboxAddress: "mailclaws@example.com",
      ingest,
      fetch,
      sleep
    });

    await vi.waitFor(() => expect(ingest).toHaveBeenCalledTimes(1));
    expect(poller.checkpoint()).toBe("uid-1");

    await poller.stop();
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpoint: undefined,
        signal: expect.any(AbortSignal)
      })
    );

    await poller.restart();
    await vi.waitFor(() => expect(ingest).toHaveBeenCalledTimes(2));
    expect(poller.checkpoint()).toBe("uid-2");
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        checkpoint: "uid-1",
        signal: expect.any(AbortSignal)
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        checkpoint: undefined,
        signal: expect.any(AbortSignal)
      })
    );

    expect(ingest.mock.calls[0]?.[0]).toMatchObject({
      accountId: "acct-1",
      mailboxAddress: "mailclaws@example.com",
      processImmediately: false,
      envelope: {
        providerMessageId: "1",
        subject: "First",
        text: "First body"
      }
    });
    expect(ingest.mock.calls[1]?.[0]).toMatchObject({
      envelope: {
        providerMessageId: "2",
        subject: "Second",
        text: "Second body"
      }
    });
  });

  it("restarts the Gmail watcher from the last notification cursor", async () => {
    const ingest = vi.fn(async (input: RuntimeIngestInput) => {
      void input;
      return undefined;
    });
    const { sleep } = createAbortableSleepGate();
    const listen = vi.fn(async ({ checkpoint }: { checkpoint?: string }): Promise<GmailWatchBatch> => {
      if (checkpoint === undefined) {
        return {
          notifications: [
            {
              id: "gmail-1",
              cursor: "cursor-1"
            }
          ],
          checkpoint: "cursor-1",
          done: false
        };
      }

      if (checkpoint === "cursor-1") {
        return {
          notifications: [
            {
              id: "gmail-2",
              cursor: "cursor-2"
            }
          ],
          checkpoint: "cursor-2",
          done: true
        };
      }

      throw new Error(`unexpected checkpoint ${checkpoint}`);
    });
    const fetch = vi.fn(async (notification: { id: string }) => ({
      id: notification.id,
      payload: {
        headers: [
          { name: "Message-ID", value: `<${notification.id}@example.com>` },
          { name: "Subject", value: notification.id === "gmail-1" ? "First" : "Second" },
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "mailclaws@example.com" }
        ]
      },
      textBody: notification.id === "gmail-1" ? "First body" : "Second body"
    }));
    const watcher = startGmailWatcher({
      accountId: "acct-1",
      mailboxAddress: "mailclaws@example.com",
      ingest,
      listen,
      fetch,
      sleep
    });

    await vi.waitFor(() => expect(ingest).toHaveBeenCalledTimes(1));
    expect(watcher.checkpoint()).toBe("cursor-1");

    await watcher.stop();
    expect(listen).toHaveBeenCalledWith(
      expect.objectContaining({
        checkpoint: undefined,
        signal: expect.any(AbortSignal)
      })
    );

    await watcher.restart();
    await vi.waitFor(() => expect(ingest).toHaveBeenCalledTimes(2));
    expect(watcher.checkpoint()).toBe("cursor-2");
    expect(listen).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        checkpoint: "cursor-1",
        signal: expect.any(AbortSignal)
      })
    );

    expect(ingest.mock.calls[0]?.[0]).toMatchObject({
      accountId: "acct-1",
      mailboxAddress: "mailclaws@example.com",
      processImmediately: false,
      envelope: {
        providerMessageId: "gmail-1",
        subject: "First",
        text: "First body"
      }
    });
    expect(ingest.mock.calls[1]?.[0]).toMatchObject({
      envelope: {
        providerMessageId: "gmail-2",
        subject: "Second",
        text: "Second body"
      }
    });
  });
});
