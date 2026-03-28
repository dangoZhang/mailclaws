import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { ingestIncomingMail, processNextRoomJob } from "../src/orchestration/service.js";
import { initializeDatabase } from "../src/storage/db.js";
import type { ProviderMailEnvelope } from "../src/providers/types.js";
import type { MailAgentExecutor } from "../src/runtime/agent-executor.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function buildEnvelope(): ProviderMailEnvelope {
  return {
    providerMessageId: "provider-1",
    messageId: "<msg-1@example.com>",
    subject: "Long run",
    from: {
      email: "sender@example.com"
    },
    to: [{ email: "mailclaw@example.com" }],
    text: "Please handle this long task.",
    headers: [
      {
        name: "Message-ID",
        value: "<msg-1@example.com>"
      }
    ]
  };
}

describe("progress reply handling", () => {
  it("emits progress before final when the run exceeds the progress interval", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-progress-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
      MAILCLAW_REPORTING_ACK_TIMEOUT_MS: "8000",
      MAILCLAW_REPORTING_PROGRESS_INTERVAL_MS: "60000"
    });
    const handle = initializeDatabase(config);

    const client: MailAgentExecutor = {
      async executeMailTurn() {
        return {
          startedAt: "2026-03-25T06:00:00.000Z",
          completedAt: "2026-03-25T06:01:05.000Z",
          responseText: "Long task done.",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {}
          }
        };
      }
    };

    ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaw@example.com",
        envelope: buildEnvelope()
      }
    );

    const processed = await processNextRoomJob({
      db: handle.db,
      config,
      agentExecutor: client
    });

    expect(processed?.outbox.map((item) => item.kind)).toEqual(["ack", "progress", "final"]);

    handle.close();
  });
});
