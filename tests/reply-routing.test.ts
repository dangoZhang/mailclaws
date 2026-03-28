import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { replayRoom } from "../src/core/replay.js";
import { ingestIncomingMail, processNextRoomJob } from "../src/orchestration/service.js";
import { initializeDatabase } from "../src/storage/db.js";
import { upsertMailAccount } from "../src/storage/repositories/mail-accounts.js";
import type { MailAgentExecutor } from "../src/runtime/agent-executor.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("reply routing", () => {
  it("preserves reply-all participants without leaking bcc recipients", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-reply-routing-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true"
    });
    const handle = initializeDatabase(config);
    const executor: MailAgentExecutor = {
      async executeMailTurn() {
        return {
          startedAt: "2026-03-25T09:00:00.000Z",
          completedAt: "2026-03-25T09:00:02.000Z",
          responseText: "Reply drafted.",
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
        envelope: {
          providerMessageId: "provider-1",
          messageId: "<msg-1@example.com>",
          subject: "Threaded reply",
          from: {
            email: "alice@example.com"
          },
          to: [{ email: "mailclaw@example.com" }, { email: "bob@example.com" }],
          cc: [{ email: "carol@example.com" }, { email: "mailclaw@example.com" }],
          bcc: [{ email: "hidden@example.com" }],
          replyTo: [{ email: "support@example.com" }],
          headers: [
            {
              name: "Message-ID",
              value: "<msg-1@example.com>"
            }
          ],
          text: "Please reply all."
        }
      }
    );

    const processed = await processNextRoomJob({
      db: handle.db,
      config,
      agentExecutor: executor
    });

    expect(processed?.outbox).toHaveLength(1);
    expect(processed?.outbox[0]?.to).toEqual(["support@example.com"]);
    expect(processed?.outbox[0]?.cc).toEqual(["alice@example.com", "bob@example.com", "carol@example.com"]);
    expect(processed?.outbox[0]?.bcc).toEqual([]);
    expect(processed?.outbox[0]?.headers.Cc).toBe(
      "alice@example.com, bob@example.com, carol@example.com"
    );

    const replay = replayRoom(handle.db, processed?.roomKey ?? "");
    expect(replay.room).toMatchObject({
      frontAgentAddress: "mailclaw@example.com",
      publicAgentAddresses: ["mailclaw@example.com"],
      collaboratorAgentAddresses: []
    });
    expect(replay.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          emailAddress: "mailclaw@example.com",
          participantType: "agent",
          visibility: "visible"
        }),
        expect.objectContaining({
          emailAddress: "hidden@example.com",
          participantType: "human",
          visibility: "bcc"
        })
      ])
    );

    handle.close();
  });

  it("uses canonical public aliases for replies and strips internal worker aliases", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-alias-routing-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true"
    });
    const handle = initializeDatabase(config);
    const executor: MailAgentExecutor = {
      async executeMailTurn() {
        return {
          startedAt: "2026-03-25T09:00:00.000Z",
          completedAt: "2026-03-25T09:00:02.000Z",
          responseText: "Reply drafted.",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {}
          }
        };
      }
    };

    upsertMailAccount(handle.db, {
      accountId: "acct-1",
      provider: "imap",
      emailAddress: "assistant@ai.example.com",
      status: "active",
      settings: {
        routing: {
          publicAliases: ["research@ai.example.com"],
          plusRoleAliases: {
            review: "mail-reviewer"
          }
        }
      },
      createdAt: "2026-03-25T08:00:00.000Z",
      updatedAt: "2026-03-25T08:00:00.000Z"
    });

    ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "assistant@ai.example.com",
        envelope: {
          providerMessageId: "provider-1",
          envelopeRecipients: ["research@ai.example.com"],
          messageId: "<msg-1@example.com>",
          subject: "Threaded reply",
          from: {
            email: "alice@example.com"
          },
          to: [
            { email: "assistant+review@ai.example.com" },
            { email: "bob@example.com" }
          ],
          cc: [
            { email: "research@ai.example.com" },
            { email: "carol@example.com" }
          ],
          replyTo: [{ email: "support@example.com" }],
          headers: [
            {
              name: "Message-ID",
              value: "<msg-1@example.com>"
            }
          ],
          text: "Please reply all."
        }
      }
    );

    const processed = await processNextRoomJob({
      db: handle.db,
      config,
      agentExecutor: executor
    });

    expect(processed?.outbox).toHaveLength(1);
    expect(processed?.outbox[0]?.headers.From).toBe("research@ai.example.com");
    expect(processed?.outbox[0]?.to).toEqual(["support@example.com"]);
    expect(processed?.outbox[0]?.cc).toEqual(["alice@example.com", "bob@example.com", "carol@example.com"]);

    const replay = replayRoom(handle.db, processed?.roomKey ?? "");
    expect(replay.room).toMatchObject({
      frontAgentAddress: "research@ai.example.com",
      publicAgentAddresses: ["research@ai.example.com", "assistant@ai.example.com"],
      collaboratorAgentAddresses: []
    });
    expect(replay.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          emailAddress: "research@ai.example.com",
          participantType: "agent",
          visibility: "visible",
          role: "front-agent"
        }),
        expect.objectContaining({
          emailAddress: "assistant+review@ai.example.com",
          participantType: "agent",
          visibility: "internal"
        }),
        expect.objectContaining({
          participantType: "agent",
          visibility: "internal",
          role: "mail-reviewer"
        })
      ])
    );

    handle.close();
  });

  it("persists additional public agent aliases as visible collaborator agents", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-collaborator-routing-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true"
    });
    const handle = initializeDatabase(config);
    const executor: MailAgentExecutor = {
      async executeMailTurn() {
        return {
          startedAt: "2026-03-25T09:00:00.000Z",
          completedAt: "2026-03-25T09:00:02.000Z",
          responseText: "Reply drafted.",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {}
          }
        };
      }
    };

    upsertMailAccount(handle.db, {
      accountId: "acct-1",
      provider: "imap",
      emailAddress: "assistant@ai.example.com",
      status: "active",
      settings: {
        routing: {
          publicAliases: ["research@ai.example.com", "ops@ai.example.com"]
        }
      },
      createdAt: "2026-03-25T08:00:00.000Z",
      updatedAt: "2026-03-25T08:00:00.000Z"
    });

    ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "assistant@ai.example.com",
        envelope: {
          providerMessageId: "provider-2",
          messageId: "<msg-2@example.com>",
          subject: "Collaborator routing",
          from: {
            email: "alice@example.com"
          },
          to: [{ email: "assistant@ai.example.com" }],
          cc: [{ email: "research@ai.example.com" }, { email: "ops@ai.example.com" }],
          headers: [
            {
              name: "Message-ID",
              value: "<msg-2@example.com>"
            }
          ],
          text: "Please include the research and ops agents."
        }
      }
    );

    const processed = await processNextRoomJob({
      db: handle.db,
      config,
      agentExecutor: executor
    });

    const replay = replayRoom(handle.db, processed?.roomKey ?? "");
    expect(replay.room).toMatchObject({
      frontAgentAddress: "assistant@ai.example.com",
      publicAgentAddresses: [
        "assistant@ai.example.com",
        "research@ai.example.com",
        "ops@ai.example.com"
      ],
      collaboratorAgentAddresses: [
        "research@ai.example.com",
        "ops@ai.example.com"
      ]
    });
    expect(replay.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          emailAddress: "assistant@ai.example.com",
          participantType: "agent",
          visibility: "visible",
          role: "front-agent"
        }),
        expect.objectContaining({
          emailAddress: "research@ai.example.com",
          participantType: "agent",
          visibility: "visible",
          role: "collaborator-agent"
        }),
        expect.objectContaining({
          emailAddress: "ops@ai.example.com",
          participantType: "agent",
          visibility: "visible",
          role: "collaborator-agent"
        })
      ])
    );
    expect(replay.participants).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          emailAddress: "research@ai.example.com",
          participantType: "human"
        }),
        expect.objectContaining({
          emailAddress: "ops@ai.example.com",
          participantType: "human"
        })
      ])
    );

    handle.close();
  });

  it("keeps the original front agent identity stable across later replies", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-front-agent-stability-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true"
    });
    const handle = initializeDatabase(config);
    const sessionKeys: string[] = [];
    const executor: MailAgentExecutor = {
      async executeMailTurn(request) {
        sessionKeys.push(request.sessionKey);
        return {
          startedAt: "2026-03-25T09:00:00.000Z",
          completedAt: "2026-03-25T09:00:02.000Z",
          responseText: "Reply drafted.",
          request: {
            url: "http://127.0.0.1:11437/v1/responses",
            method: "POST",
            headers: {},
            body: {}
          }
        };
      }
    };

    upsertMailAccount(handle.db, {
      accountId: "acct-1",
      provider: "imap",
      emailAddress: "assistant@ai.example.com",
      status: "active",
      settings: {
        routing: {
          publicAliases: ["research@ai.example.com"]
        }
      },
      createdAt: "2026-03-25T08:00:00.000Z",
      updatedAt: "2026-03-25T08:00:00.000Z"
    });

    const first = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "assistant@ai.example.com",
        envelope: {
          providerMessageId: "provider-front-1",
          envelopeRecipients: ["research@ai.example.com"],
          messageId: "<front-1@example.com>",
          subject: "Front agent stability",
          from: {
            email: "alice@example.com"
          },
          to: [{ email: "research@ai.example.com" }],
          headers: [
            {
              name: "Message-ID",
              value: "<front-1@example.com>"
            }
          ],
          text: "Please route this through research."
        }
      }
    );

    await processNextRoomJob({
      db: handle.db,
      config,
      agentExecutor: executor
    });

    const second = ingestIncomingMail(
      {
        db: handle.db,
        config
      },
      {
        accountId: "acct-1",
        mailboxAddress: "assistant@ai.example.com",
        envelope: {
          providerMessageId: "provider-front-2",
          messageId: "<front-2@example.com>",
          subject: "Re: Front agent stability",
          from: {
            email: "alice@example.com"
          },
          to: [{ email: "assistant@ai.example.com" }],
          cc: [{ email: "research@ai.example.com" }],
          headers: [
            {
              name: "Message-ID",
              value: "<front-2@example.com>"
            },
            {
              name: "In-Reply-To",
              value: "<front-1@example.com>"
            },
            {
              name: "References",
              value: "<front-1@example.com>"
            }
          ],
          text: "Following up on the same thread."
        }
      }
    );

    const processed = await processNextRoomJob({
      db: handle.db,
      config,
      agentExecutor: executor
    });

    expect(second.roomKey).toBe(first.roomKey);
    expect(processed?.outbox[0]?.headers.From).toBe("research@ai.example.com");
    expect(sessionKeys).toHaveLength(2);
    expect(sessionKeys[0]).toBe(sessionKeys[1]);
    expect(sessionKeys[0]).toContain(":front:research%40ai.example.com:thread:");

    const replay = replayRoom(handle.db, first.roomKey);
    expect(replay.room).toMatchObject({
      frontAgentAddress: "research@ai.example.com",
      publicAgentAddresses: ["research@ai.example.com", "assistant@ai.example.com"],
      collaboratorAgentAddresses: ["assistant@ai.example.com"]
    });
    expect(replay.participants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          emailAddress: "research@ai.example.com",
          participantType: "agent",
          visibility: "visible",
          role: "front-agent"
        }),
        expect.objectContaining({
          emailAddress: "assistant@ai.example.com",
          participantType: "agent",
          visibility: "visible",
          role: "collaborator-agent"
        }),
        expect.objectContaining({
          participantType: "agent",
          visibility: "internal",
          role: "mail-orchestrator"
        })
      ])
    );

    handle.close();
  });
});
