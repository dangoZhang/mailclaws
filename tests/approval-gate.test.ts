import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { replayRoom } from "../src/core/replay.js";
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
    subject: "Pricing review",
    from: {
      email: "sender@example.com"
    },
    to: [
      {
        email: "mailclaws@example.com"
      }
    ],
    text: "Can you draft a reply?",
    headers: [
      {
        name: "Message-ID",
        value: "<msg-1@example.com>"
      }
    ]
  };
}

describe("approval gate orchestration", () => {
  it("marks outbound replies as pending approval when the gate is enabled", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-approval-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaws.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
      MAILCLAW_FEATURE_APPROVAL_GATE: "true"
    });
    const handle = initializeDatabase(config);

    const client: MailAgentExecutor = {
      async executeMailTurn() {
        return {
          startedAt: "2026-03-25T02:00:00.000Z",
          completedAt: "2026-03-25T02:00:05.000Z",
          responseText: "Draft ready.",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {}
          }
        };
      }
    };

    const ingested = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "mailclaws@example.com",
        envelope: buildEnvelope()
      }
    );

    const processed = await processNextRoomJob({
      db: handle.db,
      config,
      agentExecutor: client
    });

    expect(ingested.status).toBe("queued");
    expect(processed?.outbox).toHaveLength(1);
    expect(processed?.outbox[0]?.status).toBe("pending_approval");
    const replay = replayRoom(handle.db, processed?.roomKey ?? "");
    expect(replay.approvalRequests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: processed?.outbox[0]?.outboxId,
          status: "requested"
        })
      ])
    );
    expect(replay.ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "approval.requested",
          payload: expect.objectContaining({
            outboxId: processed?.outbox[0]?.outboxId,
            status: "pending_approval"
          })
        })
      ])
    );

    handle.close();
  });
});
