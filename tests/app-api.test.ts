import http from "node:http";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

import { afterEach, describe, expect, it } from "vitest";

import { createAppServer } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { MAIL_IO_PROTOCOL_NAME, MAIL_IO_PROTOCOL_VERSION } from "../src/providers/mail-io-command.js";
import type { SmtpSender } from "../src/providers/smtp.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import { enqueueRoomJob, failRoomJob, leaseNextRoomJob } from "../src/queue/thread-queue.js";
import { initializeDatabase } from "../src/storage/db.js";
import { upsertMailAccount } from "../src/storage/repositories/mail-accounts.js";
import { upsertProviderCursor } from "../src/storage/repositories/provider-cursors.js";
import { appendProviderEvent } from "../src/storage/repositories/provider-events.js";
import { saveThreadRoom } from "../src/storage/repositories/thread-rooms.js";
import type { MailAgentExecutor } from "../src/runtime/agent-executor.js";
import type { LocalCommandRunner } from "../src/runtime/local-command-executor.js";
import { buildRoomSessionKey } from "../src/threading/session-key.js";
import { createMailLab } from "./helpers/mail-lab.js";

const servers: Array<ReturnType<typeof createAppServer>> = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        })
    )
  );

  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createFixture(options: {
  sender?: SmtpSender;
  env?: Record<string, string>;
  mailIoCommandRunner?: LocalCommandRunner;
  gatewayOutcomeDispatcher?: NonNullable<
    Parameters<typeof createMailSidecarRuntime>[0]["gatewayOutcomeDispatcher"]
  >;
} = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-api-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
    MAILCLAW_FEATURE_MAIL_INGEST: "true",
    MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
    ...options.env
  });
  const handle = initializeDatabase(config);
  const client: MailAgentExecutor = {
    async executeMailTurn() {
      return {
        startedAt: "2026-03-25T03:00:00.000Z",
        completedAt: "2026-03-25T03:00:12.000Z",
        responseText: "API reply.",
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
    agentExecutor: client,
    smtpSender: options.sender,
    mailIoCommandRunner: options.mailIoCommandRunner,
    gatewayOutcomeDispatcher: options.gatewayOutcomeDispatcher
  });

  return {
    config,
    handle,
    runtime
  };
}

function buildInboundPayload() {
  return {
    accountId: "acct-1",
    mailboxAddress: "mailclaw@example.com",
    envelope: {
      providerMessageId: "provider-1",
      messageId: "<msg-1@example.com>",
      subject: "API room",
      from: {
        email: "sender@example.com"
      },
      to: [{ email: "mailclaw@example.com" }],
      text: "Hello from the API",
      headers: [
        {
          name: "Message-ID",
          value: "<msg-1@example.com>"
        }
      ]
    }
  };
}

function extractModuleScript(html: string) {
  return html.match(new RegExp('<script type="module">([\\s\\S]+)<\\/script>'))?.[1] ?? "";
}

describe("app api", () => {
  it("ingests mail through the HTTP api and exposes replay", async () => {
    const fixture = createFixture();
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const inboundResponse = await fetch(`${baseUrl}/api/inbound?processImmediately=true`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(buildInboundPayload())
    });
    const inboundJson = (await inboundResponse.json()) as {
      ingested: { roomKey: string };
      processed: { status: string } | null;
    };

    expect(inboundResponse.status).toBe(200);
    expect(inboundJson.processed?.status).toBe("completed");

    const replayResponse = await fetch(
      `${baseUrl}/api/rooms/${encodeURIComponent(inboundJson.ingested.roomKey)}/replay`
    );
    const replayJson = (await replayResponse.json()) as {
      room: { state: string };
      outbox: unknown[];
      preSnapshots: Array<{ kind: string; summary: string }>;
    };

    expect(replayResponse.status).toBe(200);
    expect(replayJson.room.state).toBe("done");
    expect(replayJson.outbox).toHaveLength(2);
    expect(replayJson.preSnapshots).toEqual([
      expect.objectContaining({
        kind: "final",
        summary: "API reply."
      })
    ]);

    fixture.handle.close();
  });

  it("ingests raw MIME through the HTTP api for forward-style providers", async () => {
    const fixture = createFixture();
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const lab = createMailLab("raw-http");
    const rawEnvelope = lab.newMail({
      subject: "Raw HTTP room",
      text: "Hello from raw HTTP.",
      to: [{ email: "mailclaw@example.com" }]
    });

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const inboundResponse = await fetch(`${baseUrl}/api/inbound/raw?processImmediately=true`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        accountId: "acct-1",
        mailboxAddress: "mailclaw@example.com",
        rawMime: rawEnvelope.rawMime
      })
    });
    const inboundJson = (await inboundResponse.json()) as {
      ingested: { roomKey: string };
      processed: { status: string } | null;
    };

    expect(inboundResponse.status).toBe(200);
    expect(inboundJson.processed?.status).toBe("completed");

    const replayResponse = await fetch(
      `${baseUrl}/api/rooms/${encodeURIComponent(inboundJson.ingested.roomKey)}/replay`
    );
    const replayJson = (await replayResponse.json()) as {
      room: { state: string };
      ledger: Array<{ type: string }>;
    };

    expect(replayResponse.status).toBe(200);
    expect(replayJson.room.state).toBe("done");
    expect(replayJson.ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "mail.inbound_normalized"
        })
      ])
    );

    fixture.handle.close();
  });

  it("exposes connect provider setup guides without requiring a runtime", async () => {
    const fixture = createFixture();
    const server = createAppServer({
      config: fixture.config
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const discoveryResponse = await fetch(`${baseUrl}/api/connect`);
    const discoveryJson = (await discoveryResponse.json()) as {
      api: {
        providersPath: string;
        providerDetailPathTemplate: string;
        onboardingPath: string;
        oauthStartPathTemplate: string;
        oauthCallbackPathTemplate: string;
      };
      providerCount: number;
      supportedOAuthProviders: Array<{ id: string }>;
      providers: Array<{ id: string; setupKind: string }>;
    };
    const listResponse = await fetch(`${baseUrl}/api/connect/providers`);
    const listJson = (await listResponse.json()) as Array<{
      id: string;
      displayName: string;
      setupKind: string;
    }>;

    expect(discoveryResponse.status).toBe(200);
    expect(discoveryJson).toMatchObject({
      api: {
        providersPath: "/api/connect/providers",
        providerDetailPathTemplate: "/api/connect/providers/:provider",
        onboardingPath: "/api/connect/onboarding",
        oauthStartPathTemplate: "/api/auth/:provider/start",
        oauthCallbackPathTemplate: "/api/auth/:provider/callback"
      },
      supportedOAuthProviders: expect.arrayContaining([
        expect.objectContaining({ id: "gmail" }),
        expect.objectContaining({ id: "outlook" })
      ]),
      providers: expect.arrayContaining([
        expect.objectContaining({ id: "gmail", setupKind: "browser_oauth" }),
        expect.objectContaining({ id: "forward", setupKind: "forward_ingest" })
      ])
    });
    expect(typeof discoveryJson.providerCount).toBe("number");
    expect(discoveryJson.providerCount).toBeGreaterThanOrEqual(discoveryJson.providers.length);

    expect(listResponse.status).toBe(200);
    expect(listJson).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "gmail",
          displayName: "Gmail",
          setupKind: "browser_oauth"
        }),
        expect.objectContaining({
          id: "forward",
          displayName: "Forward / raw MIME fallback",
          setupKind: "forward_ingest"
        })
      ])
    );

    const detailResponse = await fetch(`${baseUrl}/api/connect/providers/gmail`);
    const detailJson = (await detailResponse.json()) as {
      id: string;
      accountProvider: string;
      inboundModes: string[];
      requiredEnvVars: string[];
    };

    expect(detailResponse.status).toBe(200);
    expect(detailJson).toMatchObject({
      id: "gmail",
      accountProvider: "gmail",
      authApi: expect.objectContaining({
        startPath: "/api/auth/gmail/start",
        callbackPath: "/api/auth/gmail/callback",
        querySecretPolicy: "forbidden"
      }),
      inboundModes: expect.arrayContaining(["gmail_watch", "gmail_history_recovery"]),
      requiredEnvVars: expect.arrayContaining(["MAILCLAW_GMAIL_OAUTH_CLIENT_ID"])
    });

    const onboardingResponse = await fetch(`${baseUrl}/api/connect/onboarding?emailAddress=person@gmail.com`);
    const onboardingJson = (await onboardingResponse.json()) as {
      input: {
        emailAddress: string;
        accountIdSuggestion: string;
      };
      recommendation: {
        provider: {
          id: string;
        };
        matchReason: string;
      };
      commands: {
        login: string;
        observeWorkbench: string;
      };
      console: {
        browserPath: string;
      };
      migration: {
        openClawUsers: {
          startCommand: string;
          inspectRuntime: string;
        };
      };
    };

    expect(onboardingResponse.status).toBe(200);
    expect(onboardingJson).toMatchObject({
      input: {
        emailAddress: "person@gmail.com",
        accountIdSuggestion: "acct-person-gmail-com"
      },
      recommendation: {
        provider: {
          id: "gmail"
        },
        matchReason: "email_domain"
      },
      commands: {
        login: 'pnpm mailctl connect login gmail acct-person-gmail-com "person"',
        observeWorkbench: "pnpm mailctl observe workbench acct-person-gmail-com"
      },
      console: {
        browserPath: "/console"
      },
      migration: {
        openClawUsers: {
          startCommand:
            "MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true MAILCLAW_FEATURE_MAIL_INGEST=true pnpm dev",
          inspectRuntime: "pnpm mailctl observe runtime"
        }
      }
    });

    fixture.handle.close();
  });

  it("exposes runtime execution inspection surfaces through the HTTP api", async () => {
    const fixture = createFixture();
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const executionResponse = await fetch(`${baseUrl}/api/runtime/execution`);
    const executionJson = (await executionResponse.json()) as {
      runtime: { runtimeKind: string; backendEnforcement: string; runtimeLabel: string };
      embeddedSessionCount: number;
      bridgeSessionCount: number;
    };

    expect(executionResponse.status).toBe(200);
    expect(executionJson).toMatchObject({
      runtime: {
        runtimeKind: "bridge",
        backendEnforcement: "external_runtime",
        runtimeLabel: "127.0.0.1:11437"
      },
      embeddedSessionCount: 0,
      bridgeSessionCount: 0
    });

    const embeddedSessionsResponse = await fetch(`${baseUrl}/api/runtime/embedded-sessions`);
    const embeddedSessionsJson = (await embeddedSessionsResponse.json()) as unknown[];
    const bridgeSessionsResponse = await fetch(`${baseUrl}/api/runtime/bridge-sessions`);
    const bridgeSessionsJson = (await bridgeSessionsResponse.json()) as unknown[];

    expect(embeddedSessionsResponse.status).toBe(200);
    expect(embeddedSessionsJson).toEqual([]);
    expect(bridgeSessionsResponse.status).toBe(200);
    expect(bridgeSessionsJson).toEqual([]);

    fixture.handle.close();
  });

  it("exposes mail io sidecar inspection through the HTTP api", async () => {
    const mailIoCommandRunner: LocalCommandRunner = async (_command, input) => {
      const payload = JSON.parse(input) as {
        operation: string;
      };
      if (payload.operation !== "self_check") {
        throw new Error(`unexpected mail io operation ${payload.operation}`);
      }

      return {
        stdout: JSON.stringify({
          protocol: MAIL_IO_PROTOCOL_NAME,
          version: MAIL_IO_PROTOCOL_VERSION,
          operation: "self_check",
          ok: true,
          result: {
            protocol: MAIL_IO_PROTOCOL_NAME,
            version: MAIL_IO_PROTOCOL_VERSION,
            operation: "self_check",
            sidecar: "mailioctl",
            status: "ready",
            checkedAt: "2026-03-28T00:00:00.000Z",
            capabilities: ["self_check", "fetch_imap_messages", "deliver_outbox_message"]
          }
        }),
        stderr: "",
        exitCode: 0
      };
    };
    const fixture = createFixture({
      env: {
        MAILCLAW_MAIL_IO_MODE: "command",
        MAILCLAW_MAIL_IO_COMMAND: "mail-io-sidecar"
      },
      mailIoCommandRunner
    });
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${baseUrl}/api/runtime/mail-io`);
    const json = (await response.json()) as {
      mode: string;
      label: string;
      protocol: { name: string; version: number } | null;
      handshakeStatus: string;
      capabilities: string[];
      checkedAt: string | null;
      error: string | null;
    };

    expect(response.status).toBe(200);
    expect(json).toEqual({
      mode: "command",
      label: "mail-io-sidecar",
      protocol: {
        name: MAIL_IO_PROTOCOL_NAME,
        version: MAIL_IO_PROTOCOL_VERSION
      },
      handshakeStatus: "ready",
      capabilities: ["self_check", "fetch_imap_messages", "deliver_outbox_message"],
      checkedAt: "2026-03-28T00:00:00.000Z",
      error: null
    });

    fixture.handle.close();
  });

  it("exposes public agent inboxes and inbox items through the HTTP api", async () => {
    const fixture = createFixture();
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const inboundResponse = await fetch(`${baseUrl}/api/inbound?processImmediately=false`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(buildInboundPayload())
    });
    const inboundJson = (await inboundResponse.json()) as {
      ingested: { roomKey: string };
    };

    expect(inboundResponse.status).toBe(200);

    const inboxesResponse = await fetch(`${baseUrl}/api/accounts/acct-1/inboxes`);
    const inboxesJson = (await inboxesResponse.json()) as Array<{
      inboxId: string;
      accountId: string;
      agentId: string;
    }>;

    expect(inboxesResponse.status).toBe(200);
    expect(inboxesJson).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: "acct-1",
          agentId: "mailclaw@example.com"
        })
      ])
    );

    const projectedResponse = await fetch(
      `${baseUrl}/api/accounts/acct-1/inboxes/${encodeURIComponent("mailclaw@example.com")}/project`
    );
    const projectedJson = (await projectedResponse.json()) as {
      inbox: { inboxId: string; agentId: string };
      items: Array<{ roomKey: string; participantRole: string }>;
    };

    expect(projectedResponse.status).toBe(200);
    expect(projectedJson).toMatchObject({
      inbox: {
        agentId: "mailclaw@example.com"
      }
    });
    expect(projectedJson.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey: inboundJson.ingested.roomKey,
          participantRole: "front"
        })
      ])
    );

    const inboxItemsResponse = await fetch(
      `${baseUrl}/api/inboxes/${encodeURIComponent(projectedJson.inbox.inboxId)}/items`
    );
    const inboxItemsJson = (await inboxItemsResponse.json()) as Array<{
      roomKey: string;
      participantRole: string;
    }>;

    expect(inboxItemsResponse.status).toBe(200);
    expect(inboxItemsJson).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey: inboundJson.ingested.roomKey,
          participantRole: "front"
        })
      ])
    );

    fixture.handle.close();
  });

  it("exposes an aggregated mailbox console and cross-room mailbox feed through the HTTP api", async () => {
    const fixture = createFixture();
    upsertMailAccount(fixture.handle.db, {
      accountId: "acct-1",
      provider: "forward",
      emailAddress: "mailclaw@example.com",
      status: "active",
      settings: {
        smtp: {
          host: "smtp.forward.example"
        }
      },
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z"
    });
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const inboundResponse = await fetch(`${baseUrl}/api/inbound?processImmediately=false`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(buildInboundPayload())
    });
    const inboundJson = (await inboundResponse.json()) as {
      ingested: { roomKey: string };
    };

    expect(inboundResponse.status).toBe(200);

    fixture.runtime.upsertVirtualMailbox({
      mailboxId: "internal:assistant:orchestrator",
      accountId: "acct-1",
      principalId: "principal:assistant",
      kind: "internal_role",
      role: "orchestrator",
      active: true,
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z"
    });
    fixture.runtime.upsertVirtualMailbox({
      mailboxId: "internal:assistant:researcher",
      accountId: "acct-1",
      principalId: "principal:assistant",
      kind: "internal_role",
      role: "researcher",
      active: true,
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z"
    });
    fixture.runtime.submitVirtualMessage({
      roomKey: inboundJson.ingested.roomKey,
      threadKind: "work",
      topic: "Console feed",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher"],
      kind: "task",
      visibility: "internal",
      subject: "Research this room",
      bodyRef: "body://virtual/console-feed-task",
      roomRevision: 1,
      inputsHash: "hash-console-feed-task",
      createdAt: "2026-03-26T00:01:00.000Z"
    });

    const consoleResponse = await fetch(`${baseUrl}/api/accounts/acct-1/mailbox-console`);
    const consoleJson = (await consoleResponse.json()) as {
      account: { accountId: string };
      providerState: { summary: { ingress: { mode: string }; outbound: { mode: string } } };
      publicAgentInboxes: Array<{ inbox: { agentId: string }; items: Array<{ roomKey: string }> }>;
      virtualMailboxes: Array<{ mailboxId: string; kind: string }>;
    };

    expect(consoleResponse.status).toBe(200);
    expect(consoleJson).toMatchObject({
      account: {
        accountId: "acct-1"
      },
      providerState: {
        summary: {
          ingress: {
            mode: "raw_mime_forward"
          },
          outbound: {
            mode: "account_smtp"
          }
        }
      },
      virtualMailboxes: expect.arrayContaining([
        expect.objectContaining({
          mailboxId: "internal:assistant:researcher",
          kind: "internal_role"
        })
      ])
    });
    expect(consoleJson.publicAgentInboxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inbox: expect.objectContaining({
            agentId: "mailclaw@example.com"
          }),
          items: expect.arrayContaining([
            expect.objectContaining({
              roomKey: inboundJson.ingested.roomKey
            })
          ])
        })
      ])
    );

    const feedResponse = await fetch(
      `${baseUrl}/api/accounts/acct-1/mailboxes/${encodeURIComponent("internal:assistant:researcher")}/feed?limit=1`
    );
    const feedJson = (await feedResponse.json()) as Array<{ message: { kind: string; subject: string } }>;

    expect(feedResponse.status).toBe(200);
    expect(feedJson).toEqual([
      expect.objectContaining({
        message: expect.objectContaining({
          kind: "task",
          subject: "Research this room"
        })
      })
    ]);

    const workbenchResponse = await fetch(
      `${baseUrl}/api/console/workbench?mode=mailboxes&accountId=acct-1&mailboxId=${encodeURIComponent("internal:assistant:researcher")}&mailboxFeedLimit=1`
    );
    const workbenchJson = (await workbenchResponse.json()) as {
      workspace: {
        activeTab: string;
        mailboxWorkspace: null | {
          accountId: string;
          mailboxCount: number;
          browserPaths: { account: string; mailbox: string | null };
        };
      };
      selection: { accountId: string | null; roomKey?: string | null; mailboxId: string | null };
      accountDetail: {
        boundaries: {
          mailboxClient: boolean;
          workbenchMailboxTab: boolean;
        };
      } | null;
      roomMailboxView: Array<{
        delivery: { roomKey: string; mailboxId: string };
        message: { subject: string; kind: string };
      }>;
      mailboxFeed: Array<{ message: { subject: string } }>;
    };

    expect(workbenchResponse.status).toBe(200);
    expect(workbenchJson.workspace).toMatchObject({
      activeTab: "mailboxes",
      mailboxWorkspace: {
        accountId: "acct-1",
        mailboxCount: expect.any(Number),
        browserPaths: {
          account: "/console/accounts/acct-1",
          mailbox: "/console/mailboxes/acct-1/internal%3Aassistant%3Aresearcher"
        }
      }
    });
    expect(workbenchJson.selection).toMatchObject({
      accountId: "acct-1",
      mailboxId: "internal:assistant:researcher"
    });
    expect(workbenchJson.accountDetail?.boundaries).toMatchObject({
      mailboxClient: true,
      workbenchMailboxTab: true
    });
    expect(workbenchJson.roomMailboxView).toEqual([]);
    expect(workbenchJson.mailboxFeed).toEqual([
      expect.objectContaining({
        message: expect.objectContaining({
          subject: "Research this room"
        })
      })
    ]);

    const roomPinnedWorkbenchResponse = await fetch(
      `${baseUrl}/api/console/workbench?mode=mailboxes&accountId=acct-1&roomKey=${encodeURIComponent(inboundJson.ingested.roomKey)}&mailboxId=${encodeURIComponent("internal:assistant:researcher")}`
    );
    const roomPinnedWorkbenchJson = (await roomPinnedWorkbenchResponse.json()) as typeof workbenchJson;

    expect(roomPinnedWorkbenchResponse.status).toBe(200);
    expect(roomPinnedWorkbenchJson.selection).toMatchObject({
      accountId: "acct-1",
      roomKey: inboundJson.ingested.roomKey,
      mailboxId: "internal:assistant:researcher"
    });
    expect(roomPinnedWorkbenchJson.roomMailboxView).toEqual([
      expect.objectContaining({
        delivery: expect.objectContaining({
          roomKey: inboundJson.ingested.roomKey,
          mailboxId: "internal:assistant:researcher"
        }),
        message: expect.objectContaining({
          kind: "task",
          subject: "Research this room"
        })
      })
    ]);

    fixture.handle.close();
  });

  it("returns 404 for missing account or mailbox inspection surfaces", async () => {
    const fixture = createFixture();
    upsertMailAccount(fixture.handle.db, {
      accountId: "acct-1",
      provider: "forward",
      emailAddress: "mailclaw@example.com",
      status: "active",
      settings: {},
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z"
    });
    fixture.runtime.upsertVirtualMailbox({
      mailboxId: "internal:assistant:researcher",
      accountId: "acct-1",
      principalId: "principal:assistant",
      kind: "internal_role",
      role: "researcher",
      active: true,
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z"
    });
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const missingConsoleResponse = await fetch(`${baseUrl}/api/accounts/missing/mailbox-console`);
    const missingConsoleJson = (await missingConsoleResponse.json()) as {
      status: string;
      error: string;
    };

    expect(missingConsoleResponse.status).toBe(404);
    expect(missingConsoleJson).toEqual({
      status: "error",
      error: "mail account not found: missing"
    });

    const missingFeedResponse = await fetch(
      `${baseUrl}/api/accounts/acct-2/mailboxes/${encodeURIComponent("internal:assistant:researcher")}/feed`
    );
    const missingFeedJson = (await missingFeedResponse.json()) as {
      status: string;
      error: string;
    };

    expect(missingFeedResponse.status).toBe(404);
    expect(missingFeedJson).toEqual({
      status: "error",
      error: "virtual mailbox internal:assistant:researcher belongs to account acct-1, expected acct-2"
    });

    fixture.handle.close();
  });

  it("surfaces automatic gateway round-trip in console boundaries when a dispatcher is configured", async () => {
    const fixture = createFixture({
      gatewayOutcomeDispatcher: async ({ message }) => ({
        dispatchTarget: `openclaw://boundary/${message.messageId}`
      })
    });
    upsertMailAccount(fixture.handle.db, {
      accountId: "acct-1",
      provider: "forward",
      emailAddress: "mailclaw@example.com",
      status: "active",
      settings: {},
      createdAt: "2026-03-27T00:00:00.000Z",
      updatedAt: "2026-03-27T00:00:00.000Z"
    });
    const roomKey = buildRoomSessionKey("acct-1", "thread-console-boundaries");
    saveThreadRoom(fixture.handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-console-boundaries",
      parentSessionKey: roomKey,
      state: "idle",
      revision: 2,
      lastInboundSeq: 1,
      lastOutboundSeq: 0
    });

    const workbench = fixture.runtime.getConsoleWorkbench({
      accountId: "acct-1",
      roomKey
    }) as {
      accountDetail: { boundaries: { automaticGatewayRoundTrip: boolean } } | null;
      roomDetail: { boundaries: { automaticGatewayRoundTrip: boolean } } | null;
    };

    expect(workbench.accountDetail?.boundaries.automaticGatewayRoundTrip).toBe(true);
    expect(workbench.roomDetail?.boundaries.automaticGatewayRoundTrip).toBe(true);

    fixture.handle.close();
  });

  it("exposes stable console DTOs for rooms, approvals, and accounts", async () => {
    const fixture = createFixture({
      env: {
        MAILCLAW_FEATURE_APPROVAL_GATE: "true"
      }
    });
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const inboundResponse = await fetch(`${baseUrl}/api/inbound?processImmediately=true`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(buildInboundPayload())
    });
    const inboundJson = (await inboundResponse.json()) as {
      ingested: { roomKey: string };
    };
    const roomSnapshot = fixture.runtime.replay(inboundJson.ingested.roomKey).room;
    saveThreadRoom(fixture.handle.db, {
      ...roomSnapshot!,
      frontAgentAddress: "assistant@ai.example.com",
      publicAgentAddresses: ["assistant@ai.example.com", "research@ai.example.com"],
      collaboratorAgentAddresses: ["research@ai.example.com"],
      summonedRoles: ["mail-researcher"]
    });

    upsertMailAccount(fixture.handle.db, {
      accountId: "acct-1",
      provider: "forward",
      emailAddress: "mailclaw@example.com",
      status: "active",
      settings: {
        smtp: {
          host: "smtp.forward.example"
        }
      },
      createdAt: "2026-03-27T00:09:00.000Z",
      updatedAt: "2026-03-27T00:09:00.000Z"
    });
    upsertProviderCursor(fixture.handle.db, {
      accountId: "acct-1",
      provider: "forward",
      cursorKind: "watch",
      cursorValue: "watch-cursor-1",
      metadata: {
        watchExpiration: "2099-01-01T00:00:00.000Z"
      },
      createdAt: "2026-03-27T00:10:00.000Z",
      updatedAt: "2026-03-27T00:10:00.000Z"
    });
    appendProviderEvent(fixture.handle.db, {
      accountId: "acct-1",
      provider: "forward",
      roomKey: inboundJson.ingested.roomKey,
      eventType: "provider.cursor.advanced",
      payload: {
        cursor: "watch-cursor-1"
      },
      createdAt: "2026-03-27T00:11:00.000Z"
    });

    const terminologyResponse = await fetch(`${baseUrl}/api/console/terminology`);
    const terminologyJson = (await terminologyResponse.json()) as {
      room: string;
      virtualMail: string;
      mailbox: string;
    };

    expect(terminologyResponse.status).toBe(200);
    expect(terminologyJson).toMatchObject({
      room: "room",
      virtualMail: "virtual mail",
      mailbox: "mailbox"
    });

    const roomsResponse = await fetch(`${baseUrl}/api/console/rooms?accountId=acct-1`);
    const roomsJson = (await roomsResponse.json()) as Array<{
      roomKey: string;
      accountId: string;
      pendingApprovalCount: number;
      gatewayProjected: boolean;
      originKinds: string[];
    }>;

    expect(roomsResponse.status).toBe(200);
    expect(roomsJson).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey: inboundJson.ingested.roomKey,
          accountId: "acct-1",
          pendingApprovalCount: 2,
          gatewayProjected: false
        })
      ])
    );

    const roomResponse = await fetch(
      `${baseUrl}/api/console/rooms/${encodeURIComponent(inboundJson.ingested.roomKey)}`
    );
    const roomJson = (await roomResponse.json()) as {
      room: { roomKey: string; pendingApprovalCount: number; preSnapshotCount: number };
      preSnapshots: Array<{ kind: string }>;
      timeline: Array<{ category: string }>;
      approvals: Array<{ status: string }>;
      counts: { approvals: number; preSnapshots: number };
    };

    expect(roomResponse.status).toBe(200);
    expect(roomJson.room).toMatchObject({
      roomKey: inboundJson.ingested.roomKey,
      pendingApprovalCount: 2,
      preSnapshotCount: 1,
      frontAgentAddress: "assistant@ai.example.com",
      collaboratorAgentAddresses: ["research@ai.example.com"],
      summonedRoles: ["mail-researcher"]
    });
    expect(roomJson.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "approval"
        }),
        expect.objectContaining({
          category: "ledger"
        })
      ])
    );
    expect(roomJson.counts.approvals).toBe(2);
    expect(roomJson.counts.preSnapshots).toBe(1);
    expect(roomJson.preSnapshots).toEqual([
      expect.objectContaining({
        kind: "final"
      })
    ]);
    expect(roomJson.approvals).toHaveLength(2);

    const approvalsResponse = await fetch(`${baseUrl}/api/console/approvals?accountId=acct-1&statuses=requested`);
    const approvalsJson = (await approvalsResponse.json()) as Array<{
      roomKey: string;
      accountId: string;
      status: string;
      outboxStatus: string;
    }>;

    expect(approvalsResponse.status).toBe(200);
    expect(approvalsJson).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey: inboundJson.ingested.roomKey,
          accountId: "acct-1",
          status: "requested",
          outboxStatus: "pending_approval"
        })
      ])
    );

    const accountsResponse = await fetch(`${baseUrl}/api/console/accounts`);
    const accountsJson = (await accountsResponse.json()) as Array<{
      accountId: string;
      pendingApprovalCount: number;
      providerState: {
        lastEventType: string | null;
        latestCursorAdvancedAt: string | null;
      };
      health: string;
    }>;

    expect(accountsResponse.status).toBe(200);
    expect(accountsJson).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: "acct-1",
          pendingApprovalCount: 2,
          providerState: expect.objectContaining({
            latestCursorAdvancedAt: "2026-03-27T00:11:00.000Z"
          }),
          health: "healthy"
        })
      ])
    );

    const accountResponse = await fetch(`${baseUrl}/api/console/accounts/acct-1`);
    const accountJson = (await accountResponse.json()) as {
      account: { accountId: string; pendingApprovalCount: number };
      rooms: Array<{ roomKey: string }>;
      mailboxes: Array<{ mailboxId: string }>;
      inboxes: Array<{ agentId: string }>;
    };

    expect(accountResponse.status).toBe(200);
    expect(accountJson.account).toMatchObject({
      accountId: "acct-1",
      pendingApprovalCount: 2
    });
    expect(accountJson.rooms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey: inboundJson.ingested.roomKey
        })
      ])
    );
    expect(accountJson.inboxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "mailclaw@example.com"
        })
      ])
    );

    const workbenchResponse = await fetch(
      `${baseUrl}/api/console/workbench?accountId=acct-1&roomKey=${encodeURIComponent(inboundJson.ingested.roomKey)}&approvalStatuses=requested`
    );
    const workbenchJson = (await workbenchResponse.json()) as {
      workspace: {
        activeTab: string;
        tabs: Array<{ id: string; href: string; active: boolean }>;
        connect: {
          browserPath: string;
          onboardingApiPath: string;
          recommendedStartCommand: string;
        };
      };
      selection: { accountId: string | null; roomKey: string | null; mailboxId: string | null };
      accounts: Array<{ accountId: string }>;
      rooms: Array<{ roomKey: string }>;
      approvals: Array<{ status: string }>;
      accountDetail: { account: { accountId: string } } | null;
      roomDetail:
        | {
            room: { roomKey: string; mailTaskKind: string | null; mailTaskStage: string | null };
            tasks: Array<{ kind: string; stage: string; status: string }>;
            counts: { taskNodes: number };
          }
        | null;
      mailboxConsole: { account: { accountId: string } } | null;
      mailboxFeed: unknown[];
    };

    expect(workbenchResponse.status).toBe(200);
    expect(workbenchJson.workspace).toMatchObject({
      activeTab: "rooms",
      connect: {
        browserPath: "/console/connect",
        onboardingApiPath: "/api/connect/onboarding",
        recommendedStartCommand: "pnpm mailctl connect start you@example.com"
      },
      tabs: expect.arrayContaining([
        expect.objectContaining({ id: "connect", href: "/console/connect" }),
        expect.objectContaining({ id: "rooms", active: true })
      ])
    });
    expect(workbenchJson.selection).toMatchObject({
      accountId: "acct-1",
      roomKey: inboundJson.ingested.roomKey,
      mailboxId: null
    });
    expect(workbenchJson.accounts).toEqual(
      expect.arrayContaining([expect.objectContaining({ accountId: "acct-1" })])
    );
    expect(workbenchJson.rooms).toEqual(
      expect.arrayContaining([expect.objectContaining({ roomKey: inboundJson.ingested.roomKey })])
    );
    expect(workbenchJson.approvals).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "requested" })])
    );
    expect(workbenchJson.accountDetail).toMatchObject({
      account: {
        accountId: "acct-1"
      }
    });
    expect(workbenchJson.roomDetail).toMatchObject({
      room: {
        roomKey: inboundJson.ingested.roomKey,
        mailTaskKind: expect.any(String),
        mailTaskStage: expect.any(String),
        preSnapshotCount: expect.any(Number)
      },
      counts: {
        taskNodes: expect.any(Number),
        preSnapshots: expect.any(Number)
      }
    });
    expect(workbenchJson.roomDetail?.tasks.length).toBeGreaterThan(0);
    expect(workbenchJson.mailboxConsole).toMatchObject({
      account: {
        accountId: "acct-1"
      }
    });
    expect(workbenchJson.mailboxFeed).toEqual([]);

    fixture.handle.close();
  });

  it("serves the operator console shell on stable deep-link routes", async () => {
    const fixture = createFixture();
    upsertMailAccount(fixture.handle.db, {
      accountId: "acct-1",
      provider: "forward",
      emailAddress: "mailclaw@example.com",
      status: "active",
      settings: {},
      createdAt: "2026-03-27T00:00:00.000Z",
      updatedAt: "2026-03-27T00:00:00.000Z"
    });
    fixture.runtime.upsertVirtualMailbox({
      mailboxId: "public:mailclaw",
      accountId: "acct-1",
      principalId: "principal:mailclaw",
      kind: "public",
      active: true,
      createdAt: "2026-03-27T00:00:00.000Z",
      updatedAt: "2026-03-27T00:00:00.000Z"
    });
    const ingested = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: false
    });
    const projectedInbox = fixture.runtime.getMailboxConsole("acct-1").publicAgentInboxes[0];
    expect(projectedInbox).toBeDefined();
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const consoleResponse = await fetch(`${baseUrl}/console/accounts/acct-1`);
    const consoleHtml = await consoleResponse.text();

    expect(consoleResponse.status).toBe(200);
    expect(consoleResponse.headers.get("content-type")).toContain("text/html");
    expect(consoleHtml).toContain("MailClaw Operator Console");
    expect(consoleHtml).toContain('"apiBasePath":"/api"');
    expect(consoleHtml).toContain("Approval status");
    expect(consoleHtml).toContain("/console/accounts/:accountId");
    expect(() => new vm.Script(extractModuleScript(consoleHtml))).not.toThrow();

    const roomResponse = await fetch(`${baseUrl}/console/rooms/${encodeURIComponent(ingested.ingested.roomKey)}`);
    const roomHtml = await roomResponse.text();

    expect(roomResponse.status).toBe(200);
    expect(roomHtml).toContain(encodeURIComponent(ingested.ingested.roomKey));
    expect(roomHtml).toContain("Gateway Projection");
    expect(() => new vm.Script(extractModuleScript(roomHtml))).not.toThrow();

    const inboxResponse = await fetch(
      `${baseUrl}/console/inboxes/acct-1/${encodeURIComponent(projectedInbox!.inbox.inboxId)}`
    );
    const inboxHtml = await inboxResponse.text();

    expect(inboxResponse.status).toBe(200);
    expect(inboxHtml).toContain(encodeURIComponent(projectedInbox!.inbox.inboxId));
    expect(inboxHtml).toContain("/console/inboxes/:accountId/:inboxId");
    expect(inboxHtml).toContain("Inbox Items");
    expect(() => new vm.Script(extractModuleScript(inboxHtml))).not.toThrow();

    const mailboxResponse = await fetch(
      `${baseUrl}/console/mailboxes/acct-1/${encodeURIComponent("public:mailclaw")}`
    );
    const mailboxHtml = await mailboxResponse.text();

    expect(mailboxResponse.status).toBe(200);
    expect(mailboxHtml).toContain(encodeURIComponent("public:mailclaw"));
    expect(mailboxHtml).toContain("/console/mailboxes/:accountId/:mailboxId");
    expect(() => new vm.Script(extractModuleScript(mailboxHtml))).not.toThrow();

    const connectResponse = await fetch(`${baseUrl}/console/connect`);
    const connectHtml = await connectResponse.text();

    expect(connectResponse.status).toBe(200);
    expect(connectHtml).toContain("/console/connect");
    expect(connectHtml).toContain("Connect Mailbox");
    expect(() => new vm.Script(extractModuleScript(connectHtml))).not.toThrow();

    fixture.handle.close();
  });

  it("filters mailbox inspection by origin kind and exposes gateway projection traces", async () => {
    const fixture = createFixture();
    const roomKey = buildRoomSessionKey("acct-1", "thread-gateway-projection");
    saveThreadRoom(fixture.handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-gateway-projection",
      parentSessionKey: roomKey,
      state: "idle",
      revision: 3,
      lastInboundSeq: 1,
      lastOutboundSeq: 0
    });
    fixture.runtime.upsertVirtualMailbox({
      mailboxId: "internal:assistant:orchestrator",
      accountId: "acct-1",
      principalId: "principal:assistant",
      kind: "internal_role",
      role: "orchestrator",
      active: true,
      createdAt: "2026-03-27T01:00:00.000Z",
      updatedAt: "2026-03-27T01:00:00.000Z"
    });
    fixture.runtime.upsertVirtualMailbox({
      mailboxId: "internal:assistant:researcher",
      accountId: "acct-1",
      principalId: "principal:assistant",
      kind: "internal_role",
      role: "researcher",
      active: true,
      createdAt: "2026-03-27T01:00:00.000Z",
      updatedAt: "2026-03-27T01:00:00.000Z"
    });
    fixture.runtime.bindGatewaySessionToRoom({
      sessionKey: "session-api-1",
      roomKey,
      bindingKind: "room",
      sourceControlPlane: "openclaw"
    });

    const task = fixture.runtime.submitVirtualMessage({
      roomKey,
      threadKind: "work",
      topic: "Gateway trace api",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher"],
      kind: "task",
      visibility: "internal",
      subject: "Project gateway result",
      bodyRef: "body://virtual/api-task",
      roomRevision: 3,
      inputsHash: "hash-api-task",
      createdAt: "2026-03-27T01:01:00.000Z"
    });
    fixture.runtime.replyVirtualMessage(task.message.messageId, {
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:researcher",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "claim",
      visibility: "internal",
      originKind: "gateway_chat",
      projectionMetadata: {
        origin: {
          kind: "gateway_chat",
          controlPlane: "openclaw",
          sessionKey: "session-api-1",
          runId: "run-api-1",
          frontAgentId: "research-agent",
          sourceMessageId: task.message.messageId
        }
      },
      bodyRef: "body://virtual/api-claim",
      roomRevision: 3,
      inputsHash: "hash-api-claim",
      createdAt: "2026-03-27T01:02:00.000Z"
    });
    const finalReady = fixture.runtime.submitVirtualMessage({
      roomKey,
      threadKind: "work",
      topic: "Gateway api final ready",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "final_ready",
      visibility: "internal",
      subject: "Final ready for gateway api",
      bodyRef: "body://virtual/api-final",
      roomRevision: 3,
      inputsHash: "hash-api-final",
      createdAt: "2026-03-27T01:03:00.000Z"
    });

    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const mailboxViewResponse = await fetch(
      `${baseUrl}/api/rooms/${encodeURIComponent(roomKey)}/mailboxes/${encodeURIComponent("internal:assistant:orchestrator")}?originKinds=gateway_chat`
    );
    const mailboxViewJson = (await mailboxViewResponse.json()) as {
      entries: Array<{ message: { originKind: string } }>;
    };

    expect(mailboxViewResponse.status).toBe(200);
    expect(mailboxViewJson.entries).toHaveLength(1);
    expect(mailboxViewJson.entries[0]?.message.originKind).toBe("gateway_chat");

    const traceResponse = await fetch(
      `${baseUrl}/api/rooms/${encodeURIComponent(roomKey)}/gateway-projection-trace`
    );
    const traceJson = (await traceResponse.json()) as {
      messageIds: string[];
      sessionKeys: string[];
      controlPlanes: string[];
      outcomeProjections: Array<{
        messageId: string;
        mode: string;
      }>;
      outcomeModes: string[];
    };

    expect(traceResponse.status).toBe(200);
    expect(traceJson.messageIds).toHaveLength(1);
    expect(traceJson.sessionKeys).toEqual(["session-api-1"]);
    expect(traceJson.controlPlanes).toEqual(["openclaw"]);
    expect(traceJson.outcomeProjections).toEqual([
      expect.objectContaining({
        messageId: finalReady.message.messageId,
        mode: "session_reply",
        dispatchStatus: "pending"
      })
    ]);
    expect(traceJson.outcomeModes).toEqual(["session_reply"]);

    fixture.handle.close();
  });

  it("drains pending gateway outcomes through the HTTP api and surfaces dispatch state in workbench", async () => {
    let dispatchCount = 0;
    const fixture = createFixture({
      gatewayOutcomeDispatcher: async () => {
        dispatchCount += 1;
        if (dispatchCount === 2) {
          throw new Error("gateway dispatch failed password=gateway-secret Bearer gateway-token");
        }

        return {
          dispatchTarget: "openclaw://session/http"
        };
      }
    });
    const roomKey = buildRoomSessionKey("acct-1", "thread-gateway-dispatch-http");
    saveThreadRoom(fixture.handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-gateway-dispatch-http",
      parentSessionKey: "gateway-session-http-parent",
      frontAgentAddress: "assistant@ai.example.com",
      state: "idle",
      revision: 3,
      lastInboundSeq: 1,
      lastOutboundSeq: 0
    });
    fixture.runtime.upsertVirtualMailbox({
      mailboxId: "internal:assistant:orchestrator",
      accountId: "acct-1",
      principalId: "principal:assistant",
      kind: "internal_role",
      role: "orchestrator",
      active: true,
      createdAt: "2026-03-27T01:00:00.000Z",
      updatedAt: "2026-03-27T01:00:00.000Z"
    });

    const success = fixture.runtime.submitVirtualMessage({
      roomKey,
      threadKind: "work",
      topic: "HTTP gateway success",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "final_ready",
      visibility: "internal",
      subject: "HTTP success",
      bodyRef: "body://gateway/http-success",
      roomRevision: 3,
      inputsHash: "hash-http-success",
      createdAt: "2026-03-27T01:04:00.000Z"
    });
    const failed = fixture.runtime.submitVirtualMessage({
      roomKey,
      threadKind: "work",
      topic: "HTTP gateway failure",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "final_ready",
      visibility: "internal",
      subject: "HTTP failure",
      bodyRef: "body://gateway/http-failure",
      roomRevision: 3,
      inputsHash: "hash-http-failure",
      createdAt: "2026-03-27T01:05:00.000Z"
    });
    fixture.runtime.projectRoomOutcomeToGateway({
      roomKey,
      messageId: success.message.messageId
    });
    fixture.runtime.projectRoomOutcomeToGateway({
      roomKey,
      messageId: failed.message.messageId
    });

    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const dispatchResponse = await fetch(`${baseUrl}/api/gateway/outcomes/dispatch`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        roomKey
      })
    });
    const dispatchJson = (await dispatchResponse.json()) as {
      attempted: number;
      dispatched: number;
      failed: number;
    };

    expect(dispatchResponse.status).toBe(200);
    expect(dispatchJson).toMatchObject({
      attempted: 0,
      dispatched: 0,
      failed: 0
    });

    const traceResponse = await fetch(
      `${baseUrl}/api/rooms/${encodeURIComponent(roomKey)}/gateway-projection-trace`
    );
    const traceJson = (await traceResponse.json()) as {
      outcomeProjections: Array<{
        messageId: string;
        dispatchStatus: string;
        dispatchTarget?: string;
        dispatchError?: string;
      }>;
    };

    expect(traceJson.outcomeProjections).toHaveLength(2);
    expect(
      traceJson.outcomeProjections.filter((projection) =>
        projection.dispatchStatus === "dispatched" && projection.dispatchTarget === "openclaw://session/http"
      )
    ).toHaveLength(1);
    expect(
      traceJson.outcomeProjections.filter((projection) =>
        projection.dispatchStatus === "failed" &&
        projection.dispatchError === "gateway dispatch failed password=[redacted] Bearer=[redacted]"
      )
    ).toHaveLength(1);

    const workbenchResponse = await fetch(
      `${baseUrl}/api/console/workbench?accountId=acct-1&roomKey=${encodeURIComponent(roomKey)}`
    );
    const workbenchJson = (await workbenchResponse.json()) as {
      roomDetail: null | {
        room: {
          pendingGatewayDispatchCount: number;
          failedGatewayDispatchCount: number;
        };
        gatewayTrace: {
          pendingDispatchCount: number;
          failedDispatchCount: number;
        };
      };
    };

    expect(workbenchResponse.status).toBe(200);
    expect(workbenchJson.roomDetail).toMatchObject({
      room: {
        pendingGatewayDispatchCount: 0,
        failedGatewayDispatchCount: 1
      },
      gatewayTrace: {
        pendingDispatchCount: 0,
        failedDispatchCount: 1
      }
    });

    fixture.handle.close();
  });

  it("binds and resolves gateway sessions through the HTTP api", async () => {
    const fixture = createFixture();
    const roomKey = buildRoomSessionKey("acct-1", "thread-gateway-http");
    saveThreadRoom(fixture.handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-gateway-http",
      parentSessionKey: "gateway-session-http-parent",
      state: "idle",
      revision: 3,
      lastInboundSeq: 1,
      lastOutboundSeq: 0
    });

    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const bindResponse = await fetch(
      `${baseUrl}/api/gateway/sessions/${encodeURIComponent("gateway-session-http")}/bind`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          roomKey,
          bindingKind: "room",
          sourceControlPlane: "openclaw"
        })
      }
    );
    const bindJson = (await bindResponse.json()) as {
      sessionKey: string;
      roomKey: string;
    };

    expect(bindResponse.status).toBe(200);
    expect(bindJson).toMatchObject({
      sessionKey: "gateway-session-http",
      roomKey
    });

    const resolveResponse = await fetch(
      `${baseUrl}/api/gateway/sessions/${encodeURIComponent("gateway-session-http")}`
    );
    const resolveJson = (await resolveResponse.json()) as {
      room: { roomKey: string };
      binding: { sessionKey: string };
    };

    expect(resolveResponse.status).toBe(200);
    expect(resolveJson).toMatchObject({
      room: {
        roomKey
      },
      binding: {
        sessionKey: "gateway-session-http"
      }
    });

    fixture.handle.close();
  });

  it("ingests batched gateway events through the HTTP api", async () => {
    const fixture = createFixture();
    const roomKey = buildRoomSessionKey("acct-1", "thread-gateway-events");
    saveThreadRoom(fixture.handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-gateway-events",
      parentSessionKey: "gateway-session-events-parent",
      state: "idle",
      revision: 3,
      lastInboundSeq: 1,
      lastOutboundSeq: 0
    });
    fixture.runtime.upsertVirtualMailbox({
      mailboxId: "public:assistant",
      accountId: "acct-1",
      principalId: "principal:assistant",
      kind: "public",
      active: true,
      createdAt: "2026-03-27T01:10:00.000Z",
      updatedAt: "2026-03-27T01:10:00.000Z"
    });
    fixture.runtime.upsertVirtualMailbox({
      mailboxId: "internal:assistant:orchestrator",
      accountId: "acct-1",
      principalId: "principal:assistant",
      kind: "internal_role",
      role: "orchestrator",
      active: true,
      createdAt: "2026-03-27T01:10:00.000Z",
      updatedAt: "2026-03-27T01:10:00.000Z"
    });
    const finalReady = fixture.runtime.submitVirtualMessage({
      roomKey,
      threadKind: "work",
      topic: "Gateway api outcome",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "final_ready",
      visibility: "internal",
      subject: "Gateway batch final ready",
      bodyRef: "body://virtual/gateway-events-final",
      roomRevision: 3,
      inputsHash: "hash-gateway-events-final",
      createdAt: "2026-03-27T01:11:00.000Z"
    });

    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const eventsResponse = await fetch(`${baseUrl}/api/gateway/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        events: [
          {
            type: "gateway.session.bind",
            sessionKey: "gateway-session-events",
            roomKey,
            bindingKind: "room",
            sourceControlPlane: "openclaw",
            frontAgentId: "assistant"
          },
          {
            type: "gateway.turn.project",
            sessionKey: "gateway-session-events",
            sourceControlPlane: "openclaw",
            sourceMessageId: "gateway-event-turn-1",
            fromPrincipalId: "principal:assistant",
            fromMailboxId: "public:assistant",
            toMailboxIds: ["internal:assistant:orchestrator"],
            kind: "question",
            visibility: "internal",
            subject: "Gateway batch question",
            bodyRef: "body://gateway/batch-question",
            inputsHash: "hash-gateway-batch-question"
          },
          {
            type: "gateway.outcome.project",
            roomKey,
            messageId: finalReady.message.messageId
          }
        ]
      })
    });
    const eventsJson = (await eventsResponse.json()) as {
      processed: Array<{
        type: string;
        result: Record<string, unknown>;
      }>;
    };

    expect(eventsResponse.status).toBe(200);
    expect(eventsJson.processed).toHaveLength(3);
    expect(eventsJson.processed[0]).toMatchObject({
      type: "gateway.session.bind",
      result: {
        sessionKey: "gateway-session-events",
        roomKey
      }
    });
    expect(eventsJson.processed[1]).toMatchObject({
      type: "gateway.turn.project",
      result: {
        message: {
          originKind: "gateway_chat",
          subject: "Gateway batch question"
        }
      }
    });
    expect(eventsJson.processed[2]).toMatchObject({
      type: "gateway.outcome.project",
      result: {
        roomKey,
        sessionKey: "gateway-session-events-parent",
        mode: "session_reply"
      }
    });

    fixture.handle.close();
  });

  it("requests and releases handoff through the HTTP api", async () => {
    const fixture = createFixture();
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const firstInbound = await fetch(`${baseUrl}/api/inbound?processImmediately=true`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(buildInboundPayload())
    });
    const firstInboundJson = (await firstInbound.json()) as {
      ingested: { roomKey: string };
    };
    const roomKey = firstInboundJson.ingested.roomKey;

    const handoffResponse = await fetch(`${baseUrl}/api/rooms/${encodeURIComponent(roomKey)}/handoff`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        requestedBy: "ops@example.com",
        reason: "Human follow-up requested"
      })
    });
    const handoffJson = (await handoffResponse.json()) as {
      room: { state: string };
      cancelledJobIds: string[];
    };

    expect(handoffResponse.status).toBe(200);
    expect(handoffJson.room.state).toBe("handoff");

    const blockedInbound = await fetch(`${baseUrl}/api/inbound?processImmediately=true`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ...buildInboundPayload(),
        envelope: {
          ...buildInboundPayload().envelope,
          providerMessageId: "provider-2",
          messageId: "<msg-2@example.com>",
          text: "Following up while handoff is active.",
          headers: [
            {
              name: "Message-ID",
              value: "<msg-2@example.com>"
            },
            {
              name: "In-Reply-To",
              value: "<msg-1@example.com>"
            },
            {
              name: "References",
              value: "<msg-1@example.com>"
            }
          ]
        }
      })
    });
    const blockedJson = (await blockedInbound.json()) as {
      ingested: { roomKey: string; reasons?: string[]; status?: string };
      processed: unknown;
    };

    expect(blockedInbound.status).toBe(200);
    expect(blockedJson.ingested.roomKey).toBe(roomKey);
    expect(blockedJson.ingested.reasons).toEqual(["handoff_active"]);
    expect(blockedJson.processed).toBeNull();

    const releaseResponse = await fetch(`${baseUrl}/api/rooms/${encodeURIComponent(roomKey)}/handoff/release`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        releasedBy: "ops@example.com",
        reason: "Resume automation"
      })
    });
    const releaseJson = (await releaseResponse.json()) as {
      room: { state: string };
      resumedJob: { roomKey: string; status: string } | null;
    };

    expect(releaseResponse.status).toBe(200);
    expect(releaseJson.room.state).toBe("queued");
    expect(releaseJson.resumedJob).toMatchObject({
      roomKey,
      status: "queued"
    });

    const drained = await fixture.runtime.drainQueue({
      maxRuns: 1
    });
    expect(drained.processed).toHaveLength(1);

    const replayResponse = await fetch(`${baseUrl}/api/rooms/${encodeURIComponent(roomKey)}/replay`);
    const replayJson = (await replayResponse.json()) as {
      room: { state: string };
      outbox: unknown[];
      ledger: Array<{ type: string }>;
    };

    expect(replayJson.room.state).toBe("done");
    expect(replayJson.outbox).toHaveLength(4);
    expect(replayJson.ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "handoff.requested"
        }),
        expect.objectContaining({
          type: "handoff.completed"
        })
      ])
    );

    fixture.handle.close();
  });

  it("exposes mailbox debug view and rebuild through the HTTP api", async () => {
    const fixture = createFixture();
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const roomKey = buildRoomSessionKey("acct-1", "thread-mailbox-api");
    saveThreadRoom(fixture.handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-mailbox-api",
      parentSessionKey: roomKey,
      state: "idle",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 0
    });
    fixture.runtime.upsertVirtualMailbox({
      mailboxId: "internal:assistant:orchestrator",
      accountId: "acct-1",
      principalId: "principal:assistant",
      kind: "internal_role",
      role: "orchestrator",
      active: true,
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z"
    });
    fixture.runtime.upsertVirtualMailbox({
      mailboxId: "internal:assistant:researcher",
      accountId: "acct-1",
      principalId: "principal:assistant",
      kind: "internal_role",
      role: "researcher",
      active: true,
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z"
    });
    fixture.runtime.submitVirtualMessage({
      roomKey,
      threadKind: "work",
      topic: "Mailbox debug",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher"],
      kind: "task",
      visibility: "internal",
      subject: "Inspect mailbox view",
      bodyRef: "body://virtual/debug-task",
      roomRevision: 1,
      inputsHash: "hash-debug-task",
      createdAt: "2026-03-26T00:01:00.000Z"
    });

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const viewResponse = await fetch(
      `${baseUrl}/api/rooms/${encodeURIComponent(roomKey)}/mailboxes/${encodeURIComponent("internal:assistant:researcher")}`
    );
    const viewJson = (await viewResponse.json()) as {
      roomKey: string;
      mailboxId: string;
      entries: Array<{ message: { kind: string } }>;
    };

    expect(viewResponse.status).toBe(200);
    expect(viewJson).toMatchObject({
      roomKey,
      mailboxId: "internal:assistant:researcher"
    });
    expect(viewJson.entries).toEqual([
      expect.objectContaining({
        message: expect.objectContaining({
          kind: "task"
        })
      })
    ]);

    fixture.handle.db.prepare("DELETE FROM mailbox_deliveries WHERE room_key = ?;").run(roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_messages WHERE room_key = ?;").run(roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_threads WHERE room_key = ?;").run(roomKey);

    const rebuildResponse = await fetch(
      `${baseUrl}/api/rooms/${encodeURIComponent(roomKey)}/mailboxes/rebuild`,
      {
        method: "POST"
      }
    );
    const rebuildJson = (await rebuildResponse.json()) as {
      roomKey: string;
      threads: number;
      messages: number;
      deliveries: number;
    };

    expect(rebuildResponse.status).toBe(200);
    expect(rebuildJson).toMatchObject({
      roomKey,
      threads: 1,
      messages: 1,
      deliveries: 1
    });

    fixture.handle.close();
  });

  it("recovers expired leases through the HTTP api", async () => {
    const fixture = createFixture();
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: false
    });

    const leaseNow = new Date(Date.now() + 1_000).toISOString();
    const recoveryNow = new Date(Date.parse(leaseNow) + 2_000).toISOString();

    leaseNextRoomJob(fixture.handle.db, {
      leaseOwner: "orch-1",
      now: leaseNow,
      leaseDurationMs: 1000
    });

    const recoveryResponse = await fetch(`${baseUrl}/api/recovery/room-queue`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        now: recoveryNow
      })
    });
    const recoveryJson = (await recoveryResponse.json()) as {
      recoveredJobs: number;
    };

    expect(recoveryResponse.status).toBe(200);
    expect(recoveryJson.recoveredJobs).toBe(1);

    fixture.handle.close();
  });

  it("rejects stale dead-letter room job retries through the HTTP api", async () => {
    const fixture = createFixture();
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const roomKey = buildRoomSessionKey("acct-1", "thread-stale-retry");

    saveThreadRoom(fixture.handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-stale-retry",
      parentSessionKey: roomKey,
      state: "failed",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 0
    });
    enqueueRoomJob(fixture.handle.db, {
      jobId: "job-stale-retry",
      roomKey,
      revision: 1,
      inboundSeq: 1,
      messageDedupeKey: "job-stale-retry-dedupe",
      priority: 100,
      createdAt: "2026-03-25T02:59:00.000Z"
    });
    const failedJob = leaseNextRoomJob(fixture.handle.db, {
      leaseOwner: "orch-1",
      now: "2026-03-25T03:00:00.000Z",
      leaseDurationMs: 60_000
    });

    expect(failedJob?.revision).toBe(1);
    failRoomJob(fixture.handle.db, failedJob?.jobId ?? "", {
      failedAt: "2026-03-25T03:01:00.000Z"
    });
    saveThreadRoom(fixture.handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-stale-retry",
      parentSessionKey: roomKey,
      state: "queued",
      revision: 2,
      lastInboundSeq: 2,
      lastOutboundSeq: 0
    });

    const retryResponse = await fetch(
      `${baseUrl}/api/dead-letter/room-jobs/${encodeURIComponent(failedJob?.jobId ?? "")}/retry`,
      {
        method: "POST"
      }
    );
    const retryJson = (await retryResponse.json()) as { error: string };

    expect(retryResponse.status).toBe(409);
    expect(retryJson.error).toContain("revision 1 is stale");
    expect(retryJson.error).toContain("current room revision is 2");

    fixture.handle.close();
  });

  it("rejects inbound processing when the feature flag is disabled", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-api-disabled-"));
    tempDirs.push(tempDir);

    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "false"
    });
    const handle = initializeDatabase(config);
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config
    });
    const server = createAppServer({
      config,
      mailApi: runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/inbound`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(buildInboundPayload())
    });
    const json = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(json.error).toContain("mail ingest is disabled");

    handle.close();
  });

  it("stores and lists mail accounts through the HTTP api", async () => {
    const fixture = createFixture();
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const createResponse = await fetch(`${baseUrl}/api/accounts`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        accountId: "acct-1",
        provider: "imap",
        emailAddress: "mailclaw@example.com",
        displayName: "MailClaw",
        status: "active",
        settings: {
          host: "imap.example.com"
        }
      })
    });

    expect(createResponse.status).toBe(200);

    const listResponse = await fetch(`${baseUrl}/api/accounts`);
    const listJson = (await listResponse.json()) as Array<{ accountId: string }>;

    expect(listResponse.status).toBe(200);
    expect(listJson).toHaveLength(1);
    expect(listJson[0]?.accountId).toBe("acct-1");

    upsertProviderCursor(fixture.handle.db, {
      accountId: "acct-1",
      provider: "imap",
      cursorKind: "watch",
      cursorValue: "77",
      metadata: {
        source: "test",
        watchExpiration: "2099-03-25T00:00:00.000Z"
      },
      createdAt: "2026-03-25T00:00:00.000Z",
      updatedAt: "2026-03-25T00:00:01.000Z"
    });
    appendProviderEvent(fixture.handle.db, {
      accountId: "acct-1",
      provider: "imap",
      eventType: "provider.cursor.advanced",
      cursorValue: "77",
      payload: {
        cursorKind: "watch",
        previousCheckpoint: "76"
      },
      createdAt: "2026-03-25T00:00:02.000Z"
    });

    const providerStateResponse = await fetch(`${baseUrl}/api/accounts/acct-1/provider-state`);
    const providerStateJson = (await providerStateResponse.json()) as {
      account: { accountId: string; provider: string };
      cursors: Array<{ cursorKind: string; cursorValue: string }>;
      recentEvents: Array<{ eventType: string }>;
      summary: {
        watch: { checkpoint: string; expired: boolean | null };
        latestCursorAdvancedAt: string | null;
      };
    };

    expect(providerStateResponse.status).toBe(200);
    expect(providerStateJson).toMatchObject({
      account: {
        accountId: "acct-1",
        provider: "imap"
      },
      cursors: expect.arrayContaining([
        expect.objectContaining({
          cursorKind: "watch",
          cursorValue: "77"
        })
      ]),
      recentEvents: expect.arrayContaining([
        expect.objectContaining({
          eventType: "provider.cursor.advanced"
        })
      ]),
      summary: expect.objectContaining({
        ingress: expect.objectContaining({
          mode: "imap_watch"
        }),
        outbound: expect.objectContaining({
          mode: "disabled"
        }),
        watch: expect.objectContaining({
          checkpoint: "77",
          expired: false
        }),
        latestCursorAdvancedAt: "2026-03-25T00:00:02.000Z"
      })
    });

    fixture.handle.close();
  });

  it("redacts credential material from account creation responses", async () => {
    const fixture = createFixture();
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const createResponse = await fetch(`${baseUrl}/api/accounts`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        accountId: "acct-secret-create",
        provider: "gmail",
        emailAddress: "secret-create@example.com",
        displayName: "Secret Create",
        status: "active",
        settings: {
          gmail: {
            oauthClientId: "create-client-id",
            oauthAccessToken: "create-access-token-secret",
            oauthRefreshToken: "create-refresh-token-secret",
            oauthClientSecret: "create-client-secret"
          },
          smtp: {
            host: "smtp.example.com",
            password: "create-smtp-password"
          }
        }
      })
    });
    const createJson = await createResponse.json();
    const payload = JSON.stringify(createJson);

    expect(createResponse.status).toBe(200);
    expect(payload).not.toContain("create-access-token-secret");
    expect(payload).not.toContain("create-refresh-token-secret");
    expect(payload).not.toContain("create-client-secret");
    expect(payload).not.toContain("create-smtp-password");
    expect(createJson).toMatchObject({
      accountId: "acct-secret-create",
      settings: {
        gmail: {
          oauthClientConfigured: true
        }
      }
    });

    fixture.handle.close();
  });

  it("reports forward-style account capabilities through provider-state", async () => {
    const fixture = createFixture();
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const createResponse = await fetch(`${baseUrl}/api/accounts`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        accountId: "acct-forward",
        provider: "forward",
        emailAddress: "assistant@forward.example",
        status: "active",
        settings: {
          smtp: {
            host: "smtp.forward.example",
            port: 2525,
            secure: false
          }
        }
      })
    });

    expect(createResponse.status).toBe(200);

    const providerStateResponse = await fetch(`${baseUrl}/api/accounts/acct-forward/provider-state`);
    const providerStateJson = (await providerStateResponse.json()) as {
      summary: {
        ingress: { mode: string; rawMimeEndpoint: string; mailboxAddress: string };
        outbound: { mode: string; fromAddress: string | null };
      };
    };

    expect(providerStateResponse.status).toBe(200);
    expect(providerStateJson.summary).toMatchObject({
      ingress: {
        mode: "raw_mime_forward",
        rawMimeEndpoint: "/api/inbound/raw",
        mailboxAddress: "assistant@forward.example"
      },
      outbound: {
        mode: "account_smtp",
        fromAddress: "assistant@forward.example"
      }
    });

    fixture.handle.close();
  });

  it("redacts provider credentials from public account, provider-state, and mailbox-console surfaces", async () => {
    const fixture = createFixture();
    upsertMailAccount(fixture.handle.db, {
      accountId: "acct-secret",
      provider: "gmail",
      emailAddress: "secret@example.com",
      displayName: "Secret Account",
      status: "active",
      settings: {
        gmail: {
          topicName: "projects/test/topics/mailclaw",
          userId: "me",
          labelIds: ["INBOX"],
          oauthAccessToken: "access-token-secret",
          oauthRefreshToken: "refresh-token-secret",
          oauthClientId: "gmail-client-id",
          oauthClientSecret: "gmail-client-secret",
          watch: {
            historyId: "99",
            expiration: "2099-03-25T00:00:00.000Z"
          }
        },
        imap: {
          host: "imap.example.com",
          mailbox: "INBOX",
          password: "imap-password-secret",
          oauth: {
            accessToken: "imap-access-secret",
            refreshToken: "imap-refresh-secret",
            clientId: "imap-client-id",
            clientSecret: "imap-client-secret",
            tokenEndpoint: "https://login.example.com/token"
          }
        },
        smtp: {
          host: "smtp.example.com",
          user: "secret@example.com",
          password: "smtp-password-secret",
          oauth: {
            accessToken: "smtp-access-secret",
            refreshToken: "smtp-refresh-secret",
            clientId: "smtp-client-id",
            clientSecret: "smtp-client-secret",
            tokenEndpoint: "https://login.example.com/token"
          }
        }
      },
      createdAt: "2026-03-25T00:00:00.000Z",
      updatedAt: "2026-03-25T00:00:00.000Z"
    });

    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const accountsResponse = await fetch(`${baseUrl}/api/accounts`);
    const providerStateResponse = await fetch(`${baseUrl}/api/accounts/acct-secret/provider-state`);
    const mailboxConsoleResponse = await fetch(`${baseUrl}/api/accounts/acct-secret/mailbox-console`);

    const accountsJson = await accountsResponse.json();
    const providerStateJson = await providerStateResponse.json();
    const mailboxConsoleJson = await mailboxConsoleResponse.json();
    const publicPayload = JSON.stringify({
      accountsJson,
      providerStateJson,
      mailboxConsoleJson
    });

    expect(accountsResponse.status).toBe(200);
    expect(providerStateResponse.status).toBe(200);
    expect(mailboxConsoleResponse.status).toBe(200);
    expect(publicPayload).not.toContain("access-token-secret");
    expect(publicPayload).not.toContain("refresh-token-secret");
    expect(publicPayload).not.toContain("gmail-client-secret");
    expect(publicPayload).not.toContain("imap-password-secret");
    expect(publicPayload).not.toContain("smtp-password-secret");
    expect(publicPayload).not.toContain("smtp-client-secret");
    expect(providerStateJson).toMatchObject({
      account: {
        accountId: "acct-secret",
        settings: {
          gmail: expect.objectContaining({
            oauthClientConfigured: true
          }),
          imap: expect.objectContaining({
            oauth: expect.objectContaining({
              clientConfigured: true
            })
          }),
          smtp: expect.objectContaining({
            oauth: expect.objectContaining({
              clientConfigured: true
            })
          })
        }
      }
    });

    fixture.handle.close();
  });

  it("redacts secret-like provider cursor metadata and event payloads from provider-state", async () => {
    const fixture = createFixture();
    upsertMailAccount(fixture.handle.db, {
      accountId: "acct-provider-redact",
      provider: "gmail",
      emailAddress: "provider-redact@example.com",
      status: "active",
      settings: {
        gmail: {
          topicName: "projects/test/topics/mailclaw"
        }
      },
      createdAt: "2026-03-25T00:00:00.000Z",
      updatedAt: "2026-03-25T00:00:00.000Z"
    });
    upsertProviderCursor(fixture.handle.db, {
      accountId: "acct-provider-redact",
      provider: "gmail",
      cursorKind: "watch",
      cursorValue: "history:101",
      metadata: {
        oauthRefreshToken: "provider-refresh-secret",
        note: "Bearer provider-token-secret",
        nested: {
          clientSecret: "provider-client-secret"
        }
      },
      createdAt: "2026-03-25T00:00:00.000Z",
      updatedAt: "2026-03-25T00:00:00.000Z"
    });
    appendProviderEvent(fixture.handle.db, {
      accountId: "acct-provider-redact",
      provider: "gmail",
      eventType: "provider.event.received",
      payload: {
        password: "provider-password-secret",
        oauthAccessToken: "provider-access-secret",
        detail: "Bearer provider-event-secret"
      },
      createdAt: "2026-03-25T00:00:01.000Z"
    });

    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${baseUrl}/api/accounts/acct-provider-redact/provider-state`);
    const mailboxConsoleResponse = await fetch(`${baseUrl}/api/accounts/acct-provider-redact/mailbox-console`);
    const json = await response.json();
    const mailboxConsoleJson = await mailboxConsoleResponse.json();
    const payload = JSON.stringify({
      json,
      mailboxConsoleJson
    });

    expect(response.status).toBe(200);
    expect(mailboxConsoleResponse.status).toBe(200);
    expect(payload).not.toContain("provider-refresh-secret");
    expect(payload).not.toContain("provider-client-secret");
    expect(payload).not.toContain("provider-password-secret");
    expect(payload).not.toContain("provider-access-secret");
    expect(payload).not.toContain("provider-token-secret");
    expect(payload).not.toContain("provider-event-secret");
    expect(json).toMatchObject({
      cursors: [
        expect.objectContaining({
          metadata: expect.objectContaining({
            oauthRefreshToken: "[redacted]",
            note: "Bearer=[redacted]",
            nested: expect.objectContaining({
              clientSecret: "[redacted]"
            })
          })
        })
      ],
      recentEvents: [
        expect.objectContaining({
          payload: expect.objectContaining({
            password: "[redacted]",
            oauthAccessToken: "[redacted]",
            detail: "Bearer=[redacted]"
          })
        })
      ]
    });
    expect(mailboxConsoleJson.providerState).toMatchObject({
      cursors: [
        expect.objectContaining({
          metadata: expect.objectContaining({
            oauthRefreshToken: "[redacted]"
          })
        })
      ]
    });

    fixture.handle.close();
  });

  it("starts a Gmail OAuth login session through the HTTP api", async () => {
    const fixture = createFixture();
    const forwarded: Array<{
      provider: string;
      accountId: string;
      displayName?: string;
      loginHint?: string;
      redirectUri: string;
      tenant?: string;
      topicName?: string;
      userId?: string;
      labelIds?: string[];
      scopes?: string[];
    }> = [];
    const runtime = {
      ...fixture.runtime,
      startOAuthLogin(input: {
        provider: string;
        accountId: string;
        displayName?: string;
        loginHint?: string;
        redirectUri: string;
        tenant?: string;
        topicName?: string;
        userId?: string;
        labelIds?: string[];
        scopes?: string[];
      }) {
        forwarded.push(input);
        return {
          sessionId: "oauth-session-1",
          provider: input.provider,
          accountId: input.accountId,
          redirectUri: input.redirectUri,
          status: "pending",
          authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=test"
        };
      }
    } as ReturnType<typeof createMailSidecarRuntime>;
    const server = createAppServer({
      config: fixture.config,
      mailApi: runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/gmail/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        accountId: "acct-gmail",
        displayName: "Support",
        loginHint: "user@gmail.com",
        topicName: "projects/example/topics/mailclaw",
        labelIds: ["INBOX", "IMPORTANT"],
        scopes: ["scope-a", "scope-b"]
      })
    });
    const json = (await response.json()) as {
      sessionId: string;
      authorizeUrl: string;
      status: string;
    };

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      sessionId: "oauth-session-1",
      status: "pending",
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=test"
    });
    expect(forwarded).toEqual([
      {
        provider: "gmail",
        accountId: "acct-gmail",
        displayName: "Support",
        loginHint: "user@gmail.com",
        redirectUri: `http://127.0.0.1:${address.port}/api/auth/gmail/callback`,
        tenant: undefined,
        topicName: "projects/example/topics/mailclaw",
        userId: undefined,
        labelIds: ["INBOX", "IMPORTANT"],
        scopes: ["scope-a", "scope-b"]
      }
    ]);

    fixture.handle.close();
  });

  it("derives the default oauth redirectUri from the bound server socket instead of the Host header", async () => {
    const fixture = createFixture();
    const forwarded: Array<{ redirectUri: string }> = [];
    const runtime = {
      ...fixture.runtime,
      startOAuthLogin(input: { redirectUri: string }) {
        forwarded.push(input);
        return {
          sessionId: "oauth-session-host-test",
          provider: "gmail",
          accountId: "acct-gmail",
          redirectUri: input.redirectUri,
          status: "pending",
          authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=test"
        };
      }
    } as ReturnType<typeof createMailSidecarRuntime>;
    const server = createAppServer({
      config: fixture.config,
      mailApi: runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const request = http.request(
        {
          method: "GET",
          host: "127.0.0.1",
          port: address.port,
          path: "/api/auth/gmail/start?accountId=acct-gmail",
          headers: {
            host: "evil.example.com"
          }
        },
        (incoming) => resolve(incoming)
      );
      request.on("error", reject);
      request.end();
    });

    expect(response.statusCode).toBe(302);
    expect(forwarded).toEqual([
      expect.objectContaining({
        redirectUri: `http://127.0.0.1:${address.port}/api/auth/gmail/callback`
      })
    ]);

    fixture.handle.close();
  });

  it("prefers MAILCLAW_PUBLIC_BASE_URL for default oauth redirectUri derivation", async () => {
    const fixture = createFixture({
      env: {
        MAILCLAW_PUBLIC_BASE_URL: "https://mail.example.com/base/"
      }
    });
    const forwarded: Array<{ redirectUri: string }> = [];
    const runtime = {
      ...fixture.runtime,
      startOAuthLogin(input: { redirectUri: string }) {
        forwarded.push(input);
        return {
          sessionId: "oauth-session-public-base",
          provider: "gmail",
          accountId: "acct-gmail",
          redirectUri: input.redirectUri,
          status: "pending",
          authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=test"
        };
      }
    } as ReturnType<typeof createMailSidecarRuntime>;
    const server = createAppServer({
      config: fixture.config,
      mailApi: runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/gmail/start?accountId=acct-gmail`, {
      redirect: "manual"
    });

    expect(response.status).toBe(302);
    expect(forwarded).toEqual([
      expect.objectContaining({
        redirectUri: "https://mail.example.com/api/auth/gmail/callback"
      })
    ]);

    fixture.handle.close();
  });

  it("rejects GET oauth start when clientSecret is passed in query parameters", async () => {
    const fixture = createFixture();
    let startCalled = false;
    const runtime = {
      ...fixture.runtime,
      startOAuthLogin() {
        startCalled = true;
        return {
          sessionId: "should-not-be-called",
          provider: "gmail",
          accountId: "acct-gmail",
          redirectUri: "http://localhost/callback",
          status: "pending",
          authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=test"
        };
      }
    } as ReturnType<typeof createMailSidecarRuntime>;
    const server = createAppServer({
      config: fixture.config,
      mailApi: runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/auth/gmail/start?accountId=acct-gmail&clientSecret=top-secret`
    );
    const json = (await response.json()) as {
      status: string;
      error: string;
    };

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      status: "error",
      error:
        "clientSecret is not accepted on GET /api/auth/.../start; use POST /api/auth/.../start or env-backed CLI login"
    });
    expect(startCalled).toBe(false);

    fixture.handle.close();
  });

  it("rejects invalid explicit oauth redirectUri values", async () => {
    const fixture = createFixture({
      env: {
        MAILCLAW_GMAIL_OAUTH_CLIENT_ID: "client-id-1"
      }
    });
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/gmail/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        accountId: "acct-gmail",
        redirectUri: "javascript:alert(1)"
      })
    });
    const json = (await response.json()) as {
      status: string;
      error: string;
    };

    expect(response.status).toBe(400);
    expect(json).toMatchObject({
      status: "error",
      error: "redirectUri must use http or https"
    });

    fixture.handle.close();
  });

  it("starts an Outlook OAuth login session through the HTTP api", async () => {
    const fixture = createFixture();
    const forwarded: Array<{
      provider: string;
      accountId: string;
      displayName?: string;
      loginHint?: string;
      redirectUri: string;
      tenant?: string;
      topicName?: string;
      userId?: string;
      labelIds?: string[];
      scopes?: string[];
    }> = [];
    const runtime = {
      ...fixture.runtime,
      startOAuthLogin(input: {
        provider: string;
        accountId: string;
        displayName?: string;
        loginHint?: string;
        redirectUri: string;
        tenant?: string;
        topicName?: string;
        userId?: string;
        labelIds?: string[];
        scopes?: string[];
      }) {
        forwarded.push(input);
        return {
          sessionId: "oauth-session-outlook-1",
          provider: input.provider,
          accountId: input.accountId,
          redirectUri: input.redirectUri,
          status: "pending",
          authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=test"
        };
      }
    } as ReturnType<typeof createMailSidecarRuntime>;
    const server = createAppServer({
      config: fixture.config,
      mailApi: runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/outlook/start`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        accountId: "acct-outlook",
        displayName: "Support",
        loginHint: "user@outlook.com",
        tenant: "common"
      })
    });
    const json = (await response.json()) as {
      sessionId: string;
      authorizeUrl: string;
      status: string;
    };

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      sessionId: "oauth-session-outlook-1",
      status: "pending",
      authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=test"
    });
    expect(forwarded).toEqual([
      {
        provider: "outlook",
        accountId: "acct-outlook",
        displayName: "Support",
        loginHint: "user@outlook.com",
        redirectUri: `http://127.0.0.1:${address.port}/api/auth/outlook/callback`,
        tenant: "common",
        topicName: undefined,
        userId: undefined,
        labelIds: undefined,
        scopes: undefined
      }
    ]);

    fixture.handle.close();
  });

  it("renders a Gmail OAuth callback completion page through the HTTP api", async () => {
    const fixture = createFixture();
    const forwarded: Array<{
      state: string;
      code?: string;
      error?: string;
      errorDescription?: string;
    }> = [];
    const runtime = {
      ...fixture.runtime,
      async completeOAuthLogin(input: {
        state: string;
        code?: string;
        error?: string;
        errorDescription?: string;
      }) {
        forwarded.push(input);
        return {
          session: {
            sessionId: "oauth-session-1",
            accountId: "acct-gmail"
          },
          account: {
            accountId: "acct-gmail",
            emailAddress: "user@gmail.com"
          },
          profile: {
            emailAddress: "user@gmail.com"
          },
          watchReady: true
        };
      }
    } as ReturnType<typeof createMailSidecarRuntime>;
    const server = createAppServer({
      config: fixture.config,
      mailApi: runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/auth/gmail/callback?state=oauth-state-1&code=oauth-code-1`
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Gmail mailbox connected");
    expect(html).toContain("acct-gmail");
    expect(html).toContain("user@gmail.com");
    expect(forwarded).toEqual([
      {
        state: "oauth-state-1",
        code: "oauth-code-1",
        error: undefined,
        errorDescription: undefined
      }
    ]);

    fixture.handle.close();
  });

  it("accepts gmail pubsub notifications through the HTTP api", async () => {
    const fixture = createFixture();
    const forwarded: Array<{
      accountId: string;
      processImmediately?: boolean;
      notification: unknown;
    }> = [];
    const runtime = {
      ...fixture.runtime,
      async ingestGmailNotification(input: {
        accountId: string;
        processImmediately?: boolean;
        notification: unknown;
      }) {
        forwarded.push(input);
        return {
          notification: {
            emailAddress: "assistant@example.com",
            historyId: "101"
          },
          checkpoint: "101",
          checkpointMetadata: {
            source: "gmail.pubsub"
          },
          notifications: [],
          ingested: []
        };
      }
    } as ReturnType<typeof createMailSidecarRuntime>;
    const server = createAppServer({
      config: fixture.config,
      mailApi: runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/accounts/acct-gmail/gmail/notifications?processImmediately=true`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          message: {
            data: Buffer.from(
              JSON.stringify({
                emailAddress: "assistant@example.com",
                historyId: "101"
              })
            ).toString("base64url")
          },
          subscription: "projects/example/subscriptions/mailclaw"
        })
      }
    );
    const json = (await response.json()) as {
      checkpoint: string;
      checkpointMetadata: {
        source: string;
      };
    };

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      checkpoint: "101",
      checkpointMetadata: {
        source: "gmail.pubsub"
      }
    });
    expect(forwarded).toEqual([
      {
        accountId: "acct-gmail",
        processImmediately: true,
        notification: {
          message: {
            data: Buffer.from(
              JSON.stringify({
                emailAddress: "assistant@example.com",
                historyId: "101"
              })
            ).toString("base64url")
          },
          subscription: "projects/example/subscriptions/mailclaw"
        }
      }
    ]);

    fixture.handle.close();
  });

  it("triggers gmail mailbox recovery through the HTTP api", async () => {
    const fixture = createFixture();
    const forwarded: Array<{
      accountId: string;
      processImmediately?: boolean;
      reason?: string;
    }> = [];
    const runtime = {
      ...fixture.runtime,
      async recoverGmailMailbox(input: {
        accountId: string;
        processImmediately?: boolean;
        reason?: string;
      }) {
        forwarded.push(input);
        return {
          checkpoint: "180",
          checkpointMetadata: {
            source: "gmail.recovery"
          },
          notifications: [],
          ingested: []
        };
      }
    } as ReturnType<typeof createMailSidecarRuntime>;
    const server = createAppServer({
      config: fixture.config,
      mailApi: runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/accounts/acct-gmail/gmail/recover?processImmediately=true`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          reason: "manual"
        })
      }
    );
    const json = (await response.json()) as {
      checkpoint: string;
      checkpointMetadata: {
        source: string;
      };
    };

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      checkpoint: "180",
      checkpointMetadata: {
        source: "gmail.recovery"
      }
    });
    expect(forwarded).toEqual([
      {
        accountId: "acct-gmail",
        processImmediately: true,
        reason: "manual"
      }
    ]);

    fixture.handle.close();
  });

  it("delivers queued outbox mail through the HTTP api", async () => {
    const deliveries: string[] = [];
    const fixture = createFixture({
      sender: {
        async send(message) {
          deliveries.push(message.subject);
          return {
            providerMessageId: `<${message.subject}@smtp.local>`
          };
        }
      }
    });
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    await fetch(`${baseUrl}/api/inbound?processImmediately=true`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(buildInboundPayload())
    });

    const deliveryResponse = await fetch(`${baseUrl}/api/outbox/deliver`, {
      method: "POST"
    });
    const deliveryJson = (await deliveryResponse.json()) as { sent: number; failed: number };

    expect(deliveryResponse.status).toBe(200);
    expect(deliveryJson.sent).toBe(2);
    expect(deliveryJson.failed).toBe(0);
    expect(deliveries).toHaveLength(2);

    fixture.handle.close();
  });

  it("approves pending outbox mail and allows delivery", async () => {
    const deliveries: string[] = [];
    const fixture = createFixture({
      sender: {
        async send(message) {
          deliveries.push(message.outboxId);
          return {};
        }
      },
      env: {
        MAILCLAW_FEATURE_APPROVAL_GATE: "true"
      }
    });
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const inboundResponse = await fetch(`${baseUrl}/api/inbound?processImmediately=true`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(buildInboundPayload())
    });
    const inboundJson = (await inboundResponse.json()) as {
      ingested: { roomKey: string };
    };
    const replayBeforeApprove = await fetch(
      `${baseUrl}/api/rooms/${encodeURIComponent(inboundJson.ingested.roomKey)}/replay`
    );
    const replayBeforeApproveJson = (await replayBeforeApprove.json()) as {
      outbox: Array<{ outboxId: string; status: string }>;
    };
    const outboxId = replayBeforeApproveJson.outbox[0]?.outboxId;

    expect(replayBeforeApproveJson.outbox[0]?.status).toBe("pending_approval");

    const approveResponse = await fetch(`${baseUrl}/api/outbox/${encodeURIComponent(outboxId ?? "")}/approve`, {
      method: "POST"
    });
    const approveJson = (await approveResponse.json()) as { status: string };

    expect(approveResponse.status).toBe(200);
    expect(approveJson.status).toBe("queued");

    const approvalsResponse = await fetch(
      `${baseUrl}/api/rooms/${encodeURIComponent(inboundJson.ingested.roomKey)}/approvals`
    );
    const approvalsJson = (await approvalsResponse.json()) as {
      approvalEvents: Array<{ type: string; payload: { outboxId?: string; status?: string } }>;
    };

    expect(approvalsResponse.status).toBe(200);
    expect(approvalsJson.approvalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "approval.requested",
          payload: expect.objectContaining({
            outboxId
          })
        }),
        expect.objectContaining({
          type: "approval.approved",
          payload: expect.objectContaining({
            outboxId,
            status: "queued"
          })
        })
      ])
    );

    const deliverResponse = await fetch(`${baseUrl}/api/outbox/deliver`, {
      method: "POST"
    });
    const deliverJson = (await deliverResponse.json()) as { sent: number; failed: number };

    expect(deliverResponse.status).toBe(200);
    expect(deliverJson.sent).toBe(1);
    expect(deliveries).toEqual([outboxId]);

    fixture.handle.close();
  });

  it("rejects pending approval mail and keeps it out of delivery", async () => {
    const deliveries: string[] = [];
    const fixture = createFixture({
      sender: {
        async send(message) {
          deliveries.push(message.outboxId);
          return {};
        }
      },
      env: {
        MAILCLAW_FEATURE_APPROVAL_GATE: "true"
      }
    });
    const server = createAppServer({
      config: fixture.config,
      mailApi: fixture.runtime
    });

    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Expected address info");
    }

    const baseUrl = `http://127.0.0.1:${address.port}`;
    const inboundResponse = await fetch(`${baseUrl}/api/inbound?processImmediately=true`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(buildInboundPayload())
    });
    const inboundJson = (await inboundResponse.json()) as {
      ingested: { roomKey: string };
    };
    const replayBeforeReject = await fetch(
      `${baseUrl}/api/rooms/${encodeURIComponent(inboundJson.ingested.roomKey)}/replay`
    );
    const replayBeforeRejectJson = (await replayBeforeReject.json()) as {
      outbox: Array<{ outboxId: string; status: string }>;
    };
    const outboxId = replayBeforeRejectJson.outbox[0]?.outboxId;

    const rejectResponse = await fetch(`${baseUrl}/api/outbox/${encodeURIComponent(outboxId ?? "")}/reject`, {
      method: "POST"
    });
    const rejectJson = (await rejectResponse.json()) as { status: string };

    expect(rejectResponse.status).toBe(200);
    expect(rejectJson.status).toBe("rejected");

    const approvalsResponse = await fetch(
      `${baseUrl}/api/rooms/${encodeURIComponent(inboundJson.ingested.roomKey)}/approvals`
    );
    const approvalsJson = (await approvalsResponse.json()) as {
      approvalEvents: Array<{ type: string; payload: { outboxId?: string; status?: string } }>;
    };

    expect(approvalsResponse.status).toBe(200);
    expect(approvalsJson.approvalEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "approval.requested",
          payload: expect.objectContaining({
            outboxId
          })
        }),
        expect.objectContaining({
          type: "approval.rejected",
          payload: expect.objectContaining({
            outboxId,
            status: "rejected"
          })
        })
      ])
    );

    const deliverResponse = await fetch(`${baseUrl}/api/outbox/deliver`, {
      method: "POST"
    });
    const deliverJson = (await deliverResponse.json()) as { sent: number; failed: number };

    expect(deliverResponse.status).toBe(200);
    expect(deliverJson.sent).toBe(0);
    expect(deliveries).toEqual([]);

    fixture.handle.close();
  });
});
