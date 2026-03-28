import { setTimeout as delay } from "node:timers/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import type { MailAgentExecutor } from "../src/runtime/agent-executor.js";
import { initializeDatabase } from "../src/storage/db.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("runtime drainQueue", () => {
  it("processes multiple rooms up to the configured concurrency cap", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-runtime-drain-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
      MAILCLAW_QUEUE_MAX_CONCURRENT_ROOMS: "2",
      MAILCLAW_QUEUE_MAX_GLOBAL_WORKERS: "2"
    });
    const handle = initializeDatabase(config);
    let active = 0;
    let maxActive = 0;
    const executor: MailAgentExecutor = {
      async executeMailTurn() {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await delay(25);
        active -= 1;

        return {
          startedAt: "2026-03-25T03:00:00.000Z",
          completedAt: "2026-03-25T03:00:01.000Z",
          responseText: "Drained.",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {}
          }
        };
      }
    };
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      agentExecutor: executor
    });

    for (const id of ["1", "2", "3"]) {
      await runtime.ingest({
        accountId: "acct-1",
        mailboxAddress: "mailclaw@example.com",
        processImmediately: false,
        envelope: {
          providerMessageId: `provider-${id}`,
          messageId: `<msg-${id}@example.com>`,
          subject: `Room ${id}`,
          from: {
            email: `sender-${id}@example.com`
          },
          to: [{ email: "mailclaw@example.com" }],
          text: `Hello ${id}`,
          headers: [
            {
              name: "Message-ID",
              value: `<msg-${id}@example.com>`
            }
          ]
        }
      });
    }

    const drained = await runtime.drainQueue();

    expect(drained.processed).toHaveLength(3);
    expect(maxActive).toBe(2);
    expect(drained.workerPool.globalActive).toBe(0);

    handle.close();
  });

  it("round-robins queued rooms instead of draining the same room back-to-back", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-runtime-fairness-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
      MAILCLAW_QUEUE_MAX_CONCURRENT_ROOMS: "1",
      MAILCLAW_QUEUE_MAX_GLOBAL_WORKERS: "1"
    });
    const handle = initializeDatabase(config);
    const runtimeRef: {
      current?: ReturnType<typeof createMailSidecarRuntime>;
    } = {};
    let followUpQueued = false;
    const executor: MailAgentExecutor = {
      async executeMailTurn() {
        if (!followUpQueued) {
          followUpQueued = true;
          await runtimeRef.current?.ingest({
            accountId: "acct-1",
            mailboxAddress: "mailclaw@example.com",
            processImmediately: false,
            envelope: {
              providerMessageId: "provider-a-2",
              messageId: "<msg-a-2@example.com>",
              subject: "Room A",
              from: {
                email: "sender-a@example.com"
              },
              to: [{ email: "mailclaw@example.com" }],
              text: "Hello A2",
              headers: [
                {
                  name: "Message-ID",
                  value: "<msg-a-2@example.com>"
                },
                {
                  name: "In-Reply-To",
                  value: "<msg-a-1@example.com>"
                },
                {
                  name: "References",
                  value: "<msg-a-1@example.com>"
                }
              ]
            }
          });
        }

        return {
          startedAt: "2026-03-25T03:10:00.000Z",
          completedAt: "2026-03-25T03:10:01.000Z",
          responseText: "Drained.",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {}
          }
        };
      }
    };
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      agentExecutor: executor
    });
    runtimeRef.current = runtime;

    const roomAFirst = await runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: "mailclaw@example.com",
      processImmediately: false,
      envelope: {
        providerMessageId: "provider-a-1",
        messageId: "<msg-a-1@example.com>",
        subject: "Room A",
        from: {
          email: "sender-a@example.com"
        },
        to: [{ email: "mailclaw@example.com" }],
        text: "Hello A1",
        headers: [
          {
            name: "Message-ID",
            value: "<msg-a-1@example.com>"
          }
        ]
      }
    });

    const roomB = await runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: "mailclaw@example.com",
      processImmediately: false,
      envelope: {
        providerMessageId: "provider-b-1",
        messageId: "<msg-b-1@example.com>",
        subject: "Room B",
        from: {
          email: "sender-b@example.com"
        },
        to: [{ email: "mailclaw@example.com" }],
        text: "Hello B1",
        headers: [
          {
            name: "Message-ID",
            value: "<msg-b-1@example.com>"
          }
        ]
      }
    });

    const drained = await runtime.drainQueue();
    const order = drained.processed.map((result) => result?.roomKey);

    expect(order).toHaveLength(3);
    expect(order[0]).toBe(roomAFirst.ingested.roomKey);
    expect(order[1]).toBe(roomB.ingested.roomKey);
    expect(order[2]).toBe(roomAFirst.ingested.roomKey);

    handle.close();
  });

  it("avoids draining the same room twice in a row when another room is queued", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-runtime-fairness-cycle-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
      MAILCLAW_QUEUE_MAX_CONCURRENT_ROOMS: "1",
      MAILCLAW_QUEUE_MAX_GLOBAL_WORKERS: "1",
      MAILCLAW_QUEUE_PRIORITY_AGING_MS: "999999"
    });
    const handle = initializeDatabase(config);
    const runtimeRef: {
      current?: ReturnType<typeof createMailSidecarRuntime>;
    } = {};
    let enqueuedFollowUp = false;
    const executor: MailAgentExecutor = {
      async executeMailTurn() {
        if (!enqueuedFollowUp) {
          enqueuedFollowUp = true;
          await runtimeRef.current?.ingest({
            accountId: "acct-1",
            mailboxAddress: "mailclaw@example.com",
            processImmediately: false,
            envelope: {
              providerMessageId: "provider-a-2",
              messageId: "<msg-a-2@example.com>",
              subject: "Room A",
              from: {
                email: "sender-a@example.com"
              },
              to: [{ email: "mailclaw@example.com" }],
              text: "Hello A2",
              headers: [
                {
                  name: "Message-ID",
                  value: "<msg-a-2@example.com>"
                },
                {
                  name: "In-Reply-To",
                  value: "<msg-a-1@example.com>"
                },
                {
                  name: "References",
                  value: "<msg-a-1@example.com>"
                }
              ]
            }
          });
        }

        return {
          startedAt: "2026-03-25T03:20:00.000Z",
          completedAt: "2026-03-25T03:20:01.000Z",
          responseText: "Drained.",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {}
          }
        };
      }
    };
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      agentExecutor: executor
    });
    runtimeRef.current = runtime;

    const roomAFirst = await runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: "mailclaw@example.com",
      processImmediately: false,
      envelope: {
        providerMessageId: "provider-a-1",
        messageId: "<msg-a-1@example.com>",
        subject: "Room A",
        from: {
          email: "sender-a@example.com"
        },
        to: [{ email: "mailclaw@example.com" }],
        text: "Hello A1",
        headers: [
          {
            name: "Message-ID",
            value: "<msg-a-1@example.com>"
          }
        ]
      }
    });

    const roomB = await runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: "mailclaw@example.com",
      processImmediately: false,
      envelope: {
        providerMessageId: "provider-b-1",
        messageId: "<msg-b-1@example.com>",
        subject: "Room B",
        from: {
          email: "sender-b@example.com"
        },
        to: [{ email: "mailclaw@example.com" }],
        text: "Hello B1",
        headers: [
          {
            name: "Message-ID",
            value: "<msg-b-1@example.com>"
          }
        ]
      }
    });

    const drained = await runtime.drainQueue({
      maxRuns: 3
    });
    const order = drained.processed.map((result) => result?.roomKey);

    expect(order).toHaveLength(3);
    expect(order[0]).toBe(roomAFirst.ingested.roomKey);
    expect(order[1]).toBe(roomB.ingested.roomKey);
    expect(order[2]).toBe(roomAFirst.ingested.roomKey);

    handle.close();
  });

  it("lets a heavily prioritized room outrank fairness penalties during a drain cycle", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-runtime-weighted-fairness-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
      MAILCLAW_QUEUE_MAX_CONCURRENT_ROOMS: "1",
      MAILCLAW_QUEUE_MAX_GLOBAL_WORKERS: "1",
      MAILCLAW_QUEUE_ROOM_FAIRNESS_PENALTY_STEP: "100"
    });
    const handle = initializeDatabase(config);
    const runtimeRef: {
      current?: ReturnType<typeof createMailSidecarRuntime>;
    } = {};
    let runCount = 0;
    const executor: MailAgentExecutor = {
      async executeMailTurn() {
        runCount += 1;

        if (runCount === 1) {
          await runtimeRef.current?.ingest({
            accountId: "acct-1",
            mailboxAddress: "mailclaw@example.com",
            processImmediately: false,
            envelope: {
              providerMessageId: "provider-a-2",
              messageId: "<msg-a-2@example.com>",
              subject: "Room A",
              from: {
                email: "sender-a@example.com"
              },
              to: [{ email: "mailclaw@example.com" }],
              text: "Hello A2",
              headers: [
                {
                  name: "Message-ID",
                  value: "<msg-a-2@example.com>"
                },
                {
                  name: "In-Reply-To",
                  value: "<msg-a-1@example.com>"
                },
                {
                  name: "References",
                  value: "<msg-a-1@example.com>"
                }
              ]
            }
          });
          handle.db
            .prepare(
              `
                UPDATE room_queue_jobs
                SET priority = 250
                WHERE room_key = ? AND status = 'queued';
              `
            )
            .run(roomAFirst.ingested.roomKey);
        }

        return {
          startedAt: "2026-03-25T03:30:00.000Z",
          completedAt: "2026-03-25T03:30:01.000Z",
          responseText: "Drained.",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {}
          }
        };
      }
    };
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      agentExecutor: executor
    });
    runtimeRef.current = runtime;

    const roomAFirst = await runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: "mailclaw@example.com",
      processImmediately: false,
      envelope: {
        providerMessageId: "provider-a-1",
        messageId: "<msg-a-1@example.com>",
        subject: "urgent urgent urgent urgent urgent urgent urgent urgent urgent urgent",
        from: {
          email: "sender-a@example.com"
        },
        to: [{ email: "mailclaw@example.com" }],
        text: "Hello A1",
        headers: [
          {
            name: "Message-ID",
            value: "<msg-a-1@example.com>"
          }
        ]
      }
    });

    const roomB = await runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: "mailclaw@example.com",
      processImmediately: false,
      envelope: {
        providerMessageId: "provider-b-1",
        messageId: "<msg-b-1@example.com>",
        subject: "Room B",
        from: {
          email: "sender-b@example.com"
        },
        to: [{ email: "mailclaw@example.com" }],
        text: "Hello B1",
        headers: [
          {
            name: "Message-ID",
            value: "<msg-b-1@example.com>"
          }
        ]
      }
    });
    handle.db
      .prepare(
        `
          UPDATE room_queue_jobs
          SET priority = ?
          WHERE room_key = ? AND status = 'queued';
        `
      )
      .run(250, roomAFirst.ingested.roomKey);
    handle.db
      .prepare(
        `
          UPDATE room_queue_jobs
          SET priority = ?
          WHERE room_key = ? AND status = 'queued';
        `
      )
      .run(100, roomB.ingested.roomKey);

    const drained = await runtime.drainQueue({
      maxRuns: 3
    });
    const order = drained.processed.map((result) => result?.roomKey);

    expect(runCount).toBe(3);
    expect(order).toEqual([roomAFirst.ingested.roomKey, roomAFirst.ingested.roomKey, roomB.ingested.roomKey]);

    handle.close();
  });
});
