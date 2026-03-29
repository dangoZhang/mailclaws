import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { GmailOAuthClientLike } from "../src/auth/gmail-oauth.js";
import type { MicrosoftOAuthClientLike } from "../src/auth/microsoft-oauth.js";
import { createRuntimeFromEnv, runMailctl } from "../src/cli/mailctl-main.js";
import type { MailctlPrompter } from "../src/cli/login-wizard.js";
import { loadConfig } from "../src/config.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import { MAIL_IO_PROTOCOL_NAME, MAIL_IO_PROTOCOL_VERSION } from "../src/providers/mail-io-command.js";
import { enqueueRoomJob, failRoomJob, leaseNextRoomJob } from "../src/queue/thread-queue.js";
import type { MailAgentExecutor } from "../src/runtime/agent-executor.js";
import { createEmbeddedMailRuntimeExecutor } from "../src/runtime/embedded-executor.js";
import type { LocalCommandRunner } from "../src/runtime/local-command-executor.js";
import { initializeDatabase } from "../src/storage/db.js";
import { getMailAccount, upsertMailAccount } from "../src/storage/repositories/mail-accounts.js";
import {
  insertControlPlaneOutboxRecord,
  updateOutboxIntentStatus
} from "../src/storage/repositories/outbox-intents.js";
import { upsertProviderCursor } from "../src/storage/repositories/provider-cursors.js";
import { appendProviderEvent } from "../src/storage/repositories/provider-events.js";
import { saveThreadRoom } from "../src/storage/repositories/thread-rooms.js";
import { buildRoomSessionKey } from "../src/threading/session-key.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function createFixture(
  options: {
    approvalGate?: boolean;
    env?: Record<string, string>;
    mailIoCommandRunner?: LocalCommandRunner;
    gmailOAuthClient?: GmailOAuthClientLike;
    microsoftOAuthClient?: MicrosoftOAuthClientLike;
  } = {}
) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-mailctl-"));
  tempDirs.push(tempDir);

  const config = loadConfig({
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
    MAILCLAW_FEATURE_MAIL_INGEST: "true",
    MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
    MAILCLAW_FEATURE_APPROVAL_GATE: options.approvalGate ? "true" : "false",
    MAILCLAW_GMAIL_OAUTH_CLIENT_ID: "test-client-id",
    MAILCLAW_MICROSOFT_OAUTH_CLIENT_ID: "test-ms-client-id",
    ...options.env
  });
  const handle = initializeDatabase(config);
  const executor: MailAgentExecutor = {
    async executeMailTurn() {
      return {
        startedAt: "2026-03-25T03:00:00.000Z",
        completedAt: "2026-03-25T03:00:01.000Z",
        responseText: "CLI reply.",
        request: {
          url: "http://127.0.0.1:11437/v1/responses",
          method: "POST",
          headers: {},
          body: {}
        }
      };
    }
  };

  return {
    config,
    handle,
    runtime: createMailSidecarRuntime({
      db: handle.db,
      config,
      agentExecutor: executor,
      mailIoCommandRunner: options.mailIoCommandRunner,
      gmailOAuthClient: options.gmailOAuthClient,
      microsoftOAuthClient: options.microsoftOAuthClient
    })
  };
}

function createWritableBuffer() {
  let value = "";

  return {
    stream: {
      write(chunk: string) {
        value += chunk;
        return true;
      }
    },
    read() {
      return value;
    }
  };
}

function createPrompter(answers: string[]): MailctlPrompter {
  const queue = [...answers];
  return {
    async ask() {
      return queue.shift() ?? "";
    },
    close() {}
  };
}

function runJsonMailctl(
  args: string[],
  deps: Parameters<typeof runMailctl>[1]
) {
  return runMailctl(["--json", ...args], deps);
}

function buildInboundPayload() {
  return {
    accountId: "acct-1",
    mailboxAddress: "mailclaw@example.com",
    envelope: {
      providerMessageId: "provider-1",
      messageId: "<msg-1@example.com>",
      subject: "CLI room",
      from: {
        email: "sender@example.com"
      },
      to: [{ email: "mailclaw@example.com" }],
      text: "Hello from mailctl",
      headers: [
        {
          name: "Message-ID",
          value: "<msg-1@example.com>"
        }
      ]
    }
  };
}

describe("mailctl", () => {
  it("lists rooms and replays a room", async () => {
    const fixture = createFixture();
    const ingested = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: true
    });
    const replayBeforeRender = fixture.runtime.replay(ingested.ingested.roomKey);
    saveThreadRoom(fixture.handle.db, {
      ...replayBeforeRender.room!,
      frontAgentAddress: "assistant@ai.example.com",
      publicAgentAddresses: ["assistant@ai.example.com", "research@ai.example.com"],
      collaboratorAgentAddresses: ["research@ai.example.com"],
      summonedRoles: ["mail-researcher", "mail-drafter"]
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const roomsExitCode = await runJsonMailctl(["rooms"], {
      runtime: fixture.runtime,
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(roomsExitCode).toBe(0);
    expect(JSON.parse(stdout.read())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey: ingested.ingested.roomKey
        })
      ])
    );

    const replayStdout = createWritableBuffer();
    const replayExitCode = await runJsonMailctl(["replay", ingested.ingested.roomKey], {
      runtime: fixture.runtime,
      stdout: replayStdout.stream,
      stderr: stderr.stream
    });

    expect(replayExitCode).toBe(0);
    expect(JSON.parse(replayStdout.read())).toMatchObject({
      room: {
        roomKey: ingested.ingested.roomKey,
        frontAgentAddress: "assistant@ai.example.com",
        collaboratorAgentAddresses: ["research@ai.example.com"],
        summonedRoles: ["mail-researcher", "mail-drafter"]
      }
    });

    const textStdout = createWritableBuffer();
    const textExitCode = await runMailctl(["observe", "room", ingested.ingested.roomKey], {
      runtime: fixture.runtime,
      stdout: textStdout.stream,
      stderr: stderr.stream
    });

    expect(textExitCode).toBe(0);
    expect(textStdout.read()).toContain("Front agent: assistant@ai.example.com");
    expect(textStdout.read()).toContain("Collaborators: research@ai.example.com");
    expect(textStdout.read()).toContain("Summoned roles: mail-researcher, mail-drafter");

    fixture.handle.close();
  });

  it("prints grouped help without requiring a runtime and renders observe rooms as text by default", async () => {
    const helpStdout = createWritableBuffer();
    const helpStderr = createWritableBuffer();

    const helpExitCode = await runMailctl(["--help"], {
      stdout: helpStdout.stream,
      stderr: helpStderr.stream
    });

    expect(helpExitCode).toBe(0);
    expect(helpStdout.read()).toContain("usage: mailctl [--json] [--verbose] <observe|operate|connect|benchmark> ...");
    expect(helpStdout.read()).toContain("observe:");
    expect(helpStdout.read()).toContain("observe workbench [accountId] [roomKey] [mailboxId]");
    expect(helpStdout.read()).toContain("observe mail-io");
    expect(helpStdout.read()).toContain("connect providers [provider]");
    expect(helpStderr.read()).toBe("");

    const fixture = createFixture();
    const ingested = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: true
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runMailctl(["observe", "rooms"], {
      runtime: fixture.runtime,
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(exitCode).toBe(0);
    expect(stdout.read()).toContain("Rooms:");
    expect(stdout.read()).toContain(ingested.ingested.roomKey);
    expect(stderr.read()).toBe("");

    fixture.handle.close();
  });

  it("runs the prompt-footprint benchmark without requiring a runtime", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runMailctl(["benchmark", "prompt-footprint"], {
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe("");
    expect(stdout.read()).toContain("MailClaw prompt footprint benchmark");
    expect(stdout.read()).toContain("Transcript follow-up average");
    expect(stdout.read()).toContain("Multi-agent reducer handoff");

    const jsonStdout = createWritableBuffer();
    const jsonExitCode = await runMailctl(["--json", "benchmark", "prompt-footprint"], {
      stdout: jsonStdout.stream,
      stderr: stderr.stream
    });

    expect(jsonExitCode).toBe(0);
    expect(JSON.parse(jsonStdout.read())).toMatchObject({
      transcriptFollowUpAverage: {
        current: {
          estimatedTokens: expect.any(Number)
        }
      },
      multiAgentReducer: {
        estimatedReductionPct: expect.any(Number)
      }
    });
  });

  it("lists connect providers without requiring a runtime and renders detailed guidance for a specific provider", async () => {
    const listStdout = createWritableBuffer();
    const listStderr = createWritableBuffer();

    const listExitCode = await runMailctl(["connect", "providers"], {
      stdout: listStdout.stream,
      stderr: listStderr.stream
    });

    expect(listExitCode).toBe(0);
    expect(listStdout.read()).toContain("Connect providers:");
    expect(listStdout.read()).toContain("API discovery: GET /api/connect and GET /api/connect/providers");
    expect(listStdout.read()).toContain(
      "gmail | Gmail | browser OAuth | login mailclaw login gmail <accountId> [displayName]"
    );
    expect(listStdout.read()).toContain("forward | Forward / raw MIME fallback");
    expect(listStderr.read()).toBe("");

    const detailStdout = createWritableBuffer();
    const detailStderr = createWritableBuffer();
    const detailExitCode = await runMailctl(["--json", "connect", "providers", "gmail"], {
      stdout: detailStdout.stream,
      stderr: detailStderr.stream
    });

    expect(detailExitCode).toBe(0);
    expect(JSON.parse(detailStdout.read())).toMatchObject({
      id: "gmail",
      accountProvider: "gmail",
      setupKind: "browser_oauth",
      authApi: {
        startPath: "/api/auth/gmail/start",
        callbackPath: "/api/auth/gmail/callback",
        browserRedirectMethod: "GET",
        programmaticMethod: "POST",
        querySecretPolicy: "forbidden"
      },
      recommendedCommand: "mailctl connect login gmail <accountId> [displayName]",
      requiredEnvVars: expect.arrayContaining(["MAILCLAW_GMAIL_OAUTH_CLIENT_ID"]),
      inboundModes: expect.arrayContaining(["gmail_watch", "gmail_history_recovery"]),
      outboundModes: expect.arrayContaining(["gmail_api_send"])
    });
    expect(detailStderr.read()).toBe("");
  });

  it("renders a mailbox-first onboarding plan for common providers", async () => {
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runMailctl(["connect", "start", "person@gmail.com"], {
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(exitCode).toBe(0);
    expect(stdout.read()).toContain("MailClaw mailbox onboarding");
    expect(stdout.read()).toContain("Recommended provider: Gmail (gmail)");
    expect(stdout.read()).toContain("1. Login: mailclaw login gmail acct-person-gmail-com \"person\"");
    expect(stdout.read()).toContain("2. Send one email to the connected address from another mailbox.");
    expect(stdout.read()).toContain("3. Open browser: /workbench/mail");
    expect(stdout.read()).toContain("5. Check rooms/inbox: mailclaw rooms | mailclaw inboxes acct-person-gmail-com");
    expect(stdout.read()).toContain("Optional internal mailbox view later: mailclaw workbench acct-person-gmail-com");
    expect(stderr.read()).toBe("");

    const jsonStdout = createWritableBuffer();
    const jsonExitCode = await runMailctl(["--json", "connect", "start", "employee@custom.example"], {
      stdout: jsonStdout.stream,
      stderr: stderr.stream
    });

    expect(jsonExitCode).toBe(0);
    expect(JSON.parse(jsonStdout.read())).toMatchObject({
      input: {
        emailAddress: "employee@custom.example",
        accountIdSuggestion: "acct-employee-custom-example"
      },
      recommendation: {
        provider: {
          id: "imap"
        },
        matchReason: "email_domain"
      },
      migration: {
        openClawUsers: {
          inspectRuntime: "mailctl observe runtime"
        }
      },
      commands: {
        login: "mailctl connect login",
        observeWorkbench: "mailctl observe workbench acct-employee-custom-example"
      }
    });
  });

  it("renders runtime boundary and embedded session inspection surfaces", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-mailctl-embedded-"));
    tempDirs.push(tempDir);
    const config = loadConfig({
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_RUNTIME_MODE: "embedded"
    });
    const handle = initializeDatabase(config);
    const executor = createEmbeddedMailRuntimeExecutor(config, {
      adapter: {
        adapterId: "inspect-adapter",
        policyManifest: {
          toolPolicies: ["mail-orchestrator"],
          sandboxPolicies: ["mail-room-orchestrator"],
          networkAccess: "allowlisted",
          filesystemAccess: "workspace-read",
          outboundMode: "approval_required"
        },
        async executeMailTurn() {
          return {
            responseText: "Embedded reply."
          };
        }
      }
    });
    await executor.executeMailTurn({
      sessionKey: "hook:mail:acct:thread:embedded-cli",
      inputText: "hello from embedded cli"
    });
    const runtime = createMailSidecarRuntime({
      db: handle.db,
      config,
      agentExecutor: executor
    });

    const runtimeStdout = createWritableBuffer();
    const runtimeStderr = createWritableBuffer();
    const runtimeExitCode = await runMailctl(["observe", "runtime"], {
      runtime,
      stdout: runtimeStdout.stream,
      stderr: runtimeStderr.stream
    });

    expect(runtimeExitCode).toBe(0);
    expect(runtimeStdout.read()).toContain("Runtime mode: embedded (inspect-adapter)");
    expect(runtimeStdout.read()).toContain("Manifest source: executor");
    expect(runtimeStdout.read()).toContain("Embedded sessions: 1");
    expect(runtimeStderr.read()).toBe("");

    const sessionsStdout = createWritableBuffer();
    const sessionsExitCode = await runMailctl(["observe", "embedded-sessions"], {
      runtime,
      stdout: sessionsStdout.stream,
      stderr: runtimeStderr.stream
    });

    expect(sessionsExitCode).toBe(0);
    expect(sessionsStdout.read()).toContain("Embedded runtime sessions: 1");
    expect(sessionsStdout.read()).toContain("hook:mail:acct:thread:embedded-cli");

    handle.close();
  });

  it("renders mail io boundary inspection through observe mail-io", async () => {
    const fixture = createFixture({
      env: {
        MAILCLAW_MAIL_IO_MODE: "command",
        MAILCLAW_MAIL_IO_COMMAND: "mail-io-sidecar"
      },
      mailIoCommandRunner: async (_command, input) => {
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
      }
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runMailctl(["observe", "mail-io"], {
      runtime: fixture.runtime,
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(exitCode).toBe(0);
    expect(stdout.read()).toContain("Mail I/O mode: command (mail-io-sidecar)");
    expect(stdout.read()).toContain("Handshake: ready | Checked at: 2026-03-28T00:00:00.000Z");
    expect(stdout.read()).toContain(`Protocol: ${MAIL_IO_PROTOCOL_NAME}@v${MAIL_IO_PROTOCOL_VERSION}`);
    expect(stdout.read()).toContain("Capabilities: self_check, fetch_imap_messages, deliver_outbox_message");
    expect(stderr.read()).toBe("");

    fixture.handle.close();
  });

  it("renders the aggregated workbench snapshot through observe workbench", async () => {
    const fixture = createFixture({
      approvalGate: true
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
    const ingested = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: true
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runMailctl(["observe", "workbench", "acct-1", ingested.ingested.roomKey], {
      runtime: fixture.runtime,
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(exitCode).toBe(0);
    expect(stdout.read()).toContain("Workbench selection: account acct-1");
    expect(stdout.read()).toContain(`room ${ingested.ingested.roomKey}`);
    expect(stdout.read()).toContain("Mailbox feed entries:");
    expect(stderr.read()).toBe("");

    fixture.handle.close();
  });

  it("binds and traces gateway room projections from the CLI", async () => {
    const fixture = createFixture();
    const roomKey = buildRoomSessionKey("acct-1", "thread-gateway-cli");
    saveThreadRoom(fixture.handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-gateway-cli",
      parentSessionKey: "gateway-session-cli-parent",
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
      createdAt: "2026-03-27T00:00:00.000Z",
      updatedAt: "2026-03-27T00:00:00.000Z"
    });
    fixture.runtime.upsertVirtualMailbox({
      mailboxId: "internal:assistant:orchestrator",
      accountId: "acct-1",
      principalId: "principal:assistant",
      kind: "internal_role",
      role: "orchestrator",
      active: true,
      createdAt: "2026-03-27T00:00:00.000Z",
      updatedAt: "2026-03-27T00:00:00.000Z"
    });

    const bindStdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const bindExit = await runJsonMailctl(
      ["gateway", "bind", "gateway-session-cli", roomKey],
      {
        runtime: fixture.runtime,
        stdout: bindStdout.stream,
        stderr: stderr.stream
      }
    );

    expect(bindExit).toBe(0);
    expect(JSON.parse(bindStdout.read())).toMatchObject({
      sessionKey: "gateway-session-cli",
      roomKey,
      bindingKind: "room"
    });

    fixture.runtime.projectGatewayTurnToVirtualMail({
      sessionKey: "gateway-session-cli",
      sourceControlPlane: "openclaw",
      sourceMessageId: "gateway-cli-turn-1",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "public:assistant",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "question",
      visibility: "internal",
      subject: "Gateway CLI message",
      bodyRef: "body://gateway/cli-message",
      inputsHash: "hash-gateway-cli-message"
    });

    const traceStdout = createWritableBuffer();
    const traceExit = await runJsonMailctl(["gateway", "trace", roomKey], {
      runtime: fixture.runtime,
      stdout: traceStdout.stream,
      stderr: stderr.stream
    });

    expect(traceExit).toBe(0);
    expect(JSON.parse(traceStdout.read())).toMatchObject({
      roomKey,
      sessionKeys: ["gateway-session-cli"]
    });

    fixture.handle.close();
  });

  it("lists accounts and approves pending outbox items", async () => {
    const fixture = createFixture({
      approvalGate: true
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    upsertMailAccount(fixture.handle.db, {
      accountId: "acct-1",
      provider: "imap",
      emailAddress: "mailclaw@example.com",
      status: "active",
      settings: {},
      createdAt: "2026-03-25T00:00:00.000Z",
      updatedAt: "2026-03-25T00:00:00.000Z"
    });

    const ingested = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: true
    });
    const pendingOutbox = ingested.processed?.outbox[0];
    expect(pendingOutbox?.status).toBe("pending_approval");
    const accountsExitCode = await runJsonMailctl(["accounts"], {
      runtime: fixture.runtime,
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(accountsExitCode).toBe(0);
    expect(JSON.parse(stdout.read())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: "acct-1"
        })
      ])
    );

    upsertProviderCursor(fixture.handle.db, {
      accountId: "acct-1",
      provider: "imap",
      cursorKind: "watch",
      cursorValue: "25",
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
      cursorValue: "25",
      payload: {
        cursorKind: "watch",
        previousCheckpoint: "24"
      },
      createdAt: "2026-03-25T00:00:02.000Z"
    });

    const accountShowStdout = createWritableBuffer();
    const accountShowExitCode = await runJsonMailctl(["accounts", "show", "acct-1"], {
      runtime: fixture.runtime,
      stdout: accountShowStdout.stream,
      stderr: stderr.stream
    });

    expect(accountShowExitCode).toBe(0);
    expect(JSON.parse(accountShowStdout.read())).toMatchObject({
      account: {
        accountId: "acct-1",
        provider: "imap"
      },
      cursors: expect.arrayContaining([
        expect.objectContaining({
          cursorKind: "watch",
          cursorValue: "25"
        })
      ]),
      recentEvents: expect.arrayContaining([
        expect.objectContaining({
          eventType: "provider.cursor.advanced"
        })
      ]),
      summary: expect.objectContaining({
        watch: expect.objectContaining({
          checkpoint: "25",
          expiration: "2099-03-25T00:00:00.000Z",
          expired: false
        }),
        latestCursorAdvancedAt: "2026-03-25T00:00:02.000Z"
      })
    });

    const approveStdout = createWritableBuffer();
    const approveExitCode = await runJsonMailctl(["approve", pendingOutbox?.outboxId ?? ""], {
      runtime: fixture.runtime,
      stdout: approveStdout.stream,
      stderr: stderr.stream
    });

    expect(approveExitCode).toBe(0);
    expect(JSON.parse(approveStdout.read())).toMatchObject({
      outboxId: pendingOutbox?.outboxId,
      status: "queued"
    });

    const traceStdout = createWritableBuffer();
    const traceExitCode = await runJsonMailctl(["approvals", "trace", ingested.ingested.roomKey], {
      runtime: fixture.runtime,
      stdout: traceStdout.stream,
      stderr: stderr.stream
    });

    expect(traceExitCode).toBe(0);
    expect(JSON.parse(traceStdout.read())).toMatchObject({
      roomKey: ingested.ingested.roomKey,
      approvalRequests: expect.arrayContaining([
        expect.objectContaining({
          requestId: pendingOutbox?.outboxId,
          status: "approved"
        })
      ]),
      approvalEvents: expect.arrayContaining([
        expect.objectContaining({
          type: "approval.requested",
          payload: expect.objectContaining({
            outboxId: pendingOutbox?.outboxId
          })
        }),
        expect.objectContaining({
          type: "approval.approved",
          payload: expect.objectContaining({
            outboxId: pendingOutbox?.outboxId,
            status: "queued"
          })
        })
      ])
    });

    fixture.handle.close();
  });

  it("runs the interactive password mailbox login wizard and saves an imap account", async () => {
    const fixture = createFixture();
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runJsonMailctl(["login"], {
      runtime: fixture.runtime,
      stdout: stdout.stream,
      stderr: stderr.stream,
      prompter: createPrompter([
        "user@gmail.com",
        "app-password-1",
        "acct-user-gmail",
        "Support",
        "imap.gmail.com",
        "993",
        "yes",
        "INBOX",
        "smtp.gmail.com",
        "465",
        "yes",
        "user@gmail.com"
      ])
    });

    expect(exitCode).toBe(0);
    expect(stderr.read()).toContain("Gmail password login usually needs an app password");
    expect(JSON.parse(stdout.read())).toMatchObject({
      accountId: "acct-user-gmail",
      provider: "imap",
      emailAddress: "user@gmail.com",
      displayName: "Support",
      settings: {
        imap: {
          host: "imap.gmail.com",
          port: 993,
          secure: true,
          username: "user@gmail.com",
          password: "app-password-1",
          mailbox: "INBOX"
        },
        smtp: {
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          username: "user@gmail.com",
          password: "app-password-1",
          from: "user@gmail.com"
        }
      }
    });

    fixture.handle.close();
  });

  it("closes env-backed runtimes between sequential connect commands", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-mailctl-env-"));
    tempDirs.push(tempDir);
    const env = {
      ...process.env,
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
      MAILCLAW_GMAIL_OAUTH_CLIENT_ID: "test-client-id",
      MAILCLAW_MICROSOFT_OAUTH_CLIENT_ID: "test-ms-client-id"
    };
    const previousEnv = { ...process.env };
    Object.assign(process.env, env);
    const onboardingStdout = createWritableBuffer();
    const onboardingStderr = createWritableBuffer();
    const loginStdout = createWritableBuffer();
    const loginStderr = createWritableBuffer();

    try {
      const startExitCode = await runMailctl(["connect", "start", "user@qq.com"], {
        stdout: onboardingStdout.stream,
        stderr: onboardingStderr.stream
      });

      expect(startExitCode).toBe(0);
      expect(onboardingStderr.read()).toBe("");
      expect(onboardingStdout.read()).toContain("1. Login: mailclaw login qq acct-user-qq-com \"user\"");

      const loginExitCode = await runMailctl(["connect", "login", "qq"], {
        stdout: loginStdout.stream,
        stderr: loginStderr.stream,
        prompter: createPrompter([
          "user@qq.com",
          "app-password-qq",
          "acct-user-qq-com",
          "QQ User",
          "imap.qq.com",
          "993",
          "yes",
          "INBOX",
          "smtp.qq.com",
          "465",
          "yes",
          "user@qq.com"
        ])
      });

      expect(loginExitCode).toBe(0);
      expect(loginStderr.read()).toContain("QQ Mail typically requires an authorization code");
      expect(loginStdout.read()).toContain("Connected mailbox user@qq.com as acct-user-qq-com");
    } finally {
      process.env = previousEnv;
    }
  });

  it("allows env-backed runtime handles to close more than once", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-mailctl-close-"));
    tempDirs.push(tempDir);
    const previousEnv = { ...process.env };
    Object.assign(process.env, {
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true",
      MAILCLAW_FEATURE_OPENCLAW_BRIDGE: "true",
      MAILCLAW_GMAIL_OAUTH_CLIENT_ID: "test-client-id",
      MAILCLAW_MICROSOFT_OAUTH_CLIENT_ID: "test-ms-client-id"
    });

    try {
      const runtimeHandle = createRuntimeFromEnv();
      expect(() => runtimeHandle.close()).not.toThrow();
      expect(() => runtimeHandle.close()).not.toThrow();
    } finally {
      process.env = previousEnv;
    }
  });

  it("drains queued room jobs with the default embedded runtime without closing env-backed runtimes early", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaw-mailctl-drain-"));
    tempDirs.push(tempDir);
    const previousEnv = { ...process.env };
    Object.assign(process.env, {
      MAILCLAW_STATE_DIR: tempDir,
      MAILCLAW_SQLITE_PATH: path.join(tempDir, "mailclaw.sqlite"),
      MAILCLAW_FEATURE_MAIL_INGEST: "true"
    });

    try {
      const config = loadConfig(process.env);
      const handle = initializeDatabase(config);
      const runtime = createMailSidecarRuntime({
        db: handle.db,
        config,
        agentExecutor: {
          async executeMailTurn() {
            return {
              startedAt: "2026-03-25T05:00:00.000Z",
              completedAt: "2026-03-25T05:00:01.000Z",
              responseText: "Drained.",
              request: {
                url: "http://127.0.0.1:11437/v1/responses",
                method: "POST",
                headers: {},
                body: {}
              }
            };
          }
        }
      });
      runtime.upsertAccount({
        accountId: "acct-1",
        provider: "imap",
        emailAddress: "user@example.com",
        status: "active",
        settings: {
          imap: {
            host: "imap.example.com",
            port: 993,
            secure: true,
            username: "user@example.com",
            password: "app-password",
            mailbox: "INBOX"
          },
          smtp: {
            host: "smtp.example.com",
            port: 465,
            secure: true,
            username: "user@example.com",
            password: "app-password",
            from: "user@example.com"
          }
        }
      });
      await runtime.ingest({
        accountId: "acct-1",
        mailboxAddress: "user@example.com",
        processImmediately: false,
        envelope: {
          providerMessageId: "provider-1",
          messageId: "<msg-1@example.com>",
          subject: "Drain repro",
          from: {
            email: "sender@example.com"
          },
          to: [{ email: "user@example.com" }],
          text: "Hello from drain repro",
          headers: [
            {
              name: "Message-ID",
              value: "<msg-1@example.com>"
            }
          ]
        }
      });
      handle.close();

      const stdout = createWritableBuffer();
      const stderr = createWritableBuffer();
      const exitCode = await runMailctl(["drain", "5"], {
        stdout: stdout.stream,
        stderr: stderr.stream
      });

      expect(exitCode).toBe(0);
      expect(stdout.read()).toContain("Drained room queue: 1 processed");
      expect(stderr.read()).not.toContain("database is not open");
    } finally {
      process.env = previousEnv;
    }
  });

  it("completes a gmail oauth login flow through the CLI loopback callback", async () => {
    const fixture = createFixture({
      gmailOAuthClient: {
        async exchangeAuthorizationCode(input) {
          expect(input.code).toBe("oauth-code-1");
          return {
            accessToken: "access-token-1",
            refreshToken: "refresh-token-1",
            expiresAt: "2026-03-26T12:00:00.000Z",
            scope: "scope-a scope-b",
            tokenType: "Bearer"
          };
        },
        async refreshAccessToken() {
          throw new Error("not used in this test");
        },
        async getProfile(input) {
          expect(input.accessToken).toBe("access-token-1");
          return {
            emailAddress: "user@gmail.com",
            historyId: "777"
          };
        }
      }
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runJsonMailctl(
      [
        "login",
        "gmail",
        "acct-gmail",
        "Support",
        "--topic-name",
        "projects/example/topics/mailclaw",
        "--label-ids",
        "INBOX,IMPORTANT"
      ],
      {
        runtime: fixture.runtime,
        stdout: stdout.stream,
        stderr: stderr.stream,
        openExternal: async (url) => {
          const authorizeUrl = new URL(url);
          const state = authorizeUrl.searchParams.get("state");
          const redirectUri = authorizeUrl.searchParams.get("redirect_uri");
          if (!state || !redirectUri) {
            throw new Error("expected state and redirect_uri in authorize url");
          }

          await fetch(`${redirectUri}?state=${encodeURIComponent(state)}&code=oauth-code-1`);
        },
        callbackTimeoutMs: 2_000
      }
    );

    expect(exitCode).toBe(0);
    expect(stderr.read()).toContain("Open this URL if the browser does not launch:");
    const json = JSON.parse(stdout.read()) as {
      account: {
        accountId: string;
        emailAddress: string;
        provider: string;
        settings: {
          gmail: {
            oauthClientConfigured: boolean;
            topicName: string;
            labelIds: string[];
          };
        };
      };
      providerState: {
        ingress: {
          mode: string;
        };
      };
    };

    expect(json.account).toMatchObject({
      accountId: "acct-gmail",
      emailAddress: "user@gmail.com",
      provider: "gmail",
      settings: {
        gmail: {
          oauthClientConfigured: true,
          topicName: "projects/example/topics/mailclaw",
          labelIds: ["INBOX", "IMPORTANT"]
        }
      }
    });
    expect(json.providerState.ingress.mode).toBe("gmail_watch");
    expect(getMailAccount(fixture.handle.db, "acct-gmail")).toMatchObject({
      accountId: "acct-gmail",
      emailAddress: "user@gmail.com",
      provider: "gmail"
    });

    fixture.handle.close();
  });

  it("completes an outlook oauth login flow through the CLI loopback callback", async () => {
    const fixture = createFixture({
      microsoftOAuthClient: {
        async exchangeAuthorizationCode(input) {
          expect(input.code).toBe("oauth-code-2");
          expect(input.tenant).toBe("common");
          return {
            accessToken: "outlook-access-token-1",
            refreshToken: "outlook-refresh-token-1",
            expiresAt: "2026-03-26T12:00:00.000Z",
            scope: "openid profile email offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send",
            tokenType: "Bearer",
            idToken: "header.payload.signature"
          };
        },
        async refreshAccessToken() {
          throw new Error("not used in this test");
        },
        async getProfile() {
          return {
            emailAddress: "user@outlook.com",
            displayName: "Outlook User",
            tenantId: "tenant-1"
          };
        }
      }
    });
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const exitCode = await runJsonMailctl(
      ["login", "outlook", "acct-outlook", "Support"],
      {
        runtime: fixture.runtime,
        stdout: stdout.stream,
        stderr: stderr.stream,
        openExternal: async (url) => {
          const authorizeUrl = new URL(url);
          const state = authorizeUrl.searchParams.get("state");
          const redirectUri = authorizeUrl.searchParams.get("redirect_uri");
          if (!state || !redirectUri) {
            throw new Error("expected state and redirect_uri in authorize url");
          }

          await fetch(`${redirectUri}?state=${encodeURIComponent(state)}&code=oauth-code-2`);
        },
        callbackTimeoutMs: 2_000
      }
    );

    expect(exitCode).toBe(0);
    expect(stderr.read()).toContain("Open this URL if the browser does not launch:");
    const json = JSON.parse(stdout.read()) as {
      account: {
        accountId: string;
        emailAddress: string;
        provider: string;
        settings: {
          imap: {
            host: string;
            oauth: {
              clientConfigured: boolean;
              tokenEndpoint: string;
            };
          };
          smtp: {
            host: string;
            oauth: {
              clientConfigured: boolean;
              tokenEndpoint: string;
            };
          };
        };
      };
      providerState: {
        ingress: {
          mode: string;
        };
        outbound: {
          mode: string;
        };
      };
    };

    expect(json.account).toMatchObject({
      accountId: "acct-outlook",
      emailAddress: "user@outlook.com",
      provider: "imap",
      settings: {
        imap: {
          host: "outlook.office365.com",
          oauth: {
            clientConfigured: true,
            tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token"
          }
        },
        smtp: {
          host: "smtp.office365.com",
          oauth: {
            clientConfigured: true,
            tokenEndpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token"
          }
        }
      }
    });
    expect(json.providerState.ingress.mode).toBe("imap_watch");
    expect(json.providerState.outbound.mode).toBe("account_smtp");
    expect(getMailAccount(fixture.handle.db, "acct-outlook")).toMatchObject({
      accountId: "acct-outlook",
      emailAddress: "user@outlook.com",
      provider: "imap"
    });

    fixture.handle.close();
  });

  it("lists, projects, and inspects public agent inboxes through the CLI", async () => {
    const fixture = createFixture();
    const stderr = createWritableBuffer();

    upsertMailAccount(fixture.handle.db, {
      accountId: "acct-1",
      provider: "forward",
      emailAddress: "mailclaw@example.com",
      status: "active",
      settings: {},
      createdAt: "2026-03-26T00:00:00.000Z",
      updatedAt: "2026-03-26T00:00:00.000Z"
    });

    await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: false
    });

    const listStdout = createWritableBuffer();
    const listExitCode = await runJsonMailctl(["inboxes", "list", "acct-1"], {
      runtime: fixture.runtime,
      stdout: listStdout.stream,
      stderr: stderr.stream
    });

    expect(listExitCode).toBe(0);
    const listed = JSON.parse(listStdout.read()) as Array<{
      inboxId: string;
      agentId: string;
    }>;
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "mailclaw@example.com"
        })
      ])
    );

    const projectStdout = createWritableBuffer();
    const projectExitCode = await runJsonMailctl(
      ["inboxes", "project", "acct-1", "mailclaw@example.com", "2", "45", "90"],
      {
        runtime: fixture.runtime,
        stdout: projectStdout.stream,
        stderr: stderr.stream
      }
    );

    expect(projectExitCode).toBe(0);
    expect(JSON.parse(projectStdout.read())).toMatchObject({
      inbox: {
        agentId: "mailclaw@example.com"
      },
      items: [
        expect.objectContaining({
          roomKey: expect.any(String),
          state: expect.any(String)
        })
      ]
    });

    const itemsStdout = createWritableBuffer();
    const itemsExitCode = await runJsonMailctl(["inboxes", "items", listed[0]!.inboxId], {
      runtime: fixture.runtime,
      stdout: itemsStdout.stream,
      stderr: stderr.stream
    });

    expect(itemsExitCode).toBe(0);
    expect(JSON.parse(itemsStdout.read())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "mailclaw@example.com",
          state: expect.any(String)
        })
      ])
    );

    const consoleStdout = createWritableBuffer();
    const consoleExitCode = await runJsonMailctl(["inboxes", "console", "acct-1"], {
      runtime: fixture.runtime,
      stdout: consoleStdout.stream,
      stderr: stderr.stream
    });

    expect(consoleExitCode).toBe(0);
    expect(JSON.parse(consoleStdout.read())).toMatchObject({
      account: {
        accountId: "acct-1"
      },
      publicAgentInboxes: expect.arrayContaining([
        expect.objectContaining({
          inbox: expect.objectContaining({
            agentId: "mailclaw@example.com"
          })
        })
      ])
    });

    fixture.handle.close();
  });

  it("drains queued room jobs through the CLI", async () => {
    const fixture = createFixture();
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: false
    });

    const drainExitCode = await runJsonMailctl(["drain", "1"], {
      runtime: fixture.runtime,
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(drainExitCode).toBe(0);
    expect(JSON.parse(stdout.read())).toMatchObject({
      processed: [
        {
          status: "completed"
        }
      ]
    });

    fixture.handle.close();
  });

  it("requests and releases handoff through the CLI", async () => {
    const fixture = createFixture();
    const stderr = createWritableBuffer();
    const ingested = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: true
    });

    const requestStdout = createWritableBuffer();
    const requestExitCode = await runJsonMailctl(
      ["handoff", "request", ingested.ingested.roomKey, "ops@example.com", "manual", "takeover"],
      {
        runtime: fixture.runtime,
        stdout: requestStdout.stream,
        stderr: stderr.stream
      }
    );

    expect(requestExitCode).toBe(0);
    expect(JSON.parse(requestStdout.read())).toMatchObject({
      room: {
        roomKey: ingested.ingested.roomKey,
        state: "handoff"
      }
    });

    const blocked = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: true,
      envelope: {
        ...buildInboundPayload().envelope,
        providerMessageId: "provider-2",
        messageId: "<msg-2@example.com>",
        text: "Reply during handoff.",
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
    });
    expect(blocked.ingested.reasons).toEqual(["handoff_active"]);
    expect(blocked.processed).toBeNull();

    const releaseStdout = createWritableBuffer();
    const releaseExitCode = await runJsonMailctl(
      ["handoff", "release", ingested.ingested.roomKey, "ops@example.com", "resume"],
      {
        runtime: fixture.runtime,
        stdout: releaseStdout.stream,
        stderr: stderr.stream
      }
    );

    expect(releaseExitCode).toBe(0);
    expect(JSON.parse(releaseStdout.read())).toMatchObject({
      room: {
        roomKey: ingested.ingested.roomKey,
        state: "queued"
      },
      resumedJob: expect.objectContaining({
        roomKey: ingested.ingested.roomKey,
        status: "queued"
      })
    });

    fixture.handle.close();
  });

  it("shows and rebuilds mailbox projections through the CLI", async () => {
    const fixture = createFixture();
    const stderr = createWritableBuffer();
    const roomKey = buildRoomSessionKey("acct-1", "thread-mailbox-cli");

    saveThreadRoom(fixture.handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-mailbox-cli",
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
      topic: "Mailbox CLI",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:researcher"],
      kind: "task",
      visibility: "internal",
      subject: "Inspect mailbox via CLI",
      bodyRef: "body://virtual/mailctl-task",
      roomRevision: 1,
      inputsHash: "hash-mailctl-task",
      createdAt: "2026-03-26T00:01:00.000Z"
    });

    const viewStdout = createWritableBuffer();
    const viewExitCode = await runJsonMailctl(
      ["mailbox", "view", roomKey, "internal:assistant:researcher"],
      {
        runtime: fixture.runtime,
        stdout: viewStdout.stream,
        stderr: stderr.stream
      }
    );

    expect(viewExitCode).toBe(0);
    expect(JSON.parse(viewStdout.read())).toMatchObject({
      roomKey,
      mailboxId: "internal:assistant:researcher",
      entries: [
        {
          message: {
            kind: "task"
          }
        }
      ]
    });

    const feedStdout = createWritableBuffer();
    const feedExitCode = await runJsonMailctl(
      ["mailbox", "feed", "acct-1", "internal:assistant:researcher", "1"],
      {
        runtime: fixture.runtime,
        stdout: feedStdout.stream,
        stderr: stderr.stream
      }
    );

    expect(feedExitCode).toBe(0);
    expect(JSON.parse(feedStdout.read())).toEqual([
      expect.objectContaining({
        message: expect.objectContaining({
          kind: "task"
        })
      })
    ]);

    fixture.handle.db.prepare("DELETE FROM mailbox_deliveries WHERE room_key = ?;").run(roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_messages WHERE room_key = ?;").run(roomKey);
    fixture.handle.db.prepare("DELETE FROM virtual_threads WHERE room_key = ?;").run(roomKey);

    const rebuildStdout = createWritableBuffer();
    const rebuildExitCode = await runJsonMailctl(["mailbox", "rebuild", roomKey], {
      runtime: fixture.runtime,
      stdout: rebuildStdout.stream,
      stderr: stderr.stream
    });

    expect(rebuildExitCode).toBe(0);
    expect(JSON.parse(rebuildStdout.read())).toMatchObject({
      roomKey,
      threads: 1,
      messages: 1,
      deliveries: 1
    });

    fixture.handle.close();
  });

  it("manages memory promotion drafts through the CLI", async () => {
    const fixture = createFixture();
    const stderr = createWritableBuffer();
    const ingested = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: true
    });

    const initStdout = createWritableBuffer();
    const initExitCode = await runJsonMailctl(["memory", "init", "acct-1", "assistant"], {
      runtime: fixture.runtime,
      config: fixture.config,
      stdout: initStdout.stream,
      stderr: stderr.stream
    });

    expect(initExitCode).toBe(0);
    expect(JSON.parse(initStdout.read())).toMatchObject({
      agentDir: expect.stringContaining("/tenants/acct-1/agents/assistant"),
      rolesDir: expect.stringContaining("/tenants/acct-1/agents/assistant/roles"),
      defaultSkills: expect.arrayContaining([
        expect.objectContaining({
          skillId: "mail-read"
        }),
        expect.objectContaining({
          skillId: "mail-write"
        })
      ])
    });

    const draftStdout = createWritableBuffer();
    const draftExitCode = await runJsonMailctl(
      [
        "memory",
        "draft",
        "acct-1",
        "assistant",
        ingested.ingested.roomKey,
        "Approved"
      ],
      {
        runtime: fixture.runtime,
        config: fixture.config,
        stdout: draftStdout.stream,
        stderr: stderr.stream
      }
    );

    expect(draftExitCode).toBe(0);
    const drafted = JSON.parse(draftStdout.read()) as {
      draft: {
        draftId: string;
      };
    };

    const approveStdout = createWritableBuffer();
    const reviewStdout = createWritableBuffer();
    const reviewExitCode = await runJsonMailctl(
      ["memory", "review", "acct-1", "assistant", drafted.draft.draftId, "reviewer@example.com"],
      {
        runtime: fixture.runtime,
        config: fixture.config,
        stdout: reviewStdout.stream,
        stderr: stderr.stream
      }
    );

    expect(reviewExitCode).toBe(0);
    expect(JSON.parse(reviewStdout.read())).toMatchObject({
      draft: {
        reviewedBy: "reviewer@example.com"
      }
    });

    const approveExitCode = await runJsonMailctl(
      ["memory", "approve", "acct-1", "assistant", drafted.draft.draftId],
      {
        runtime: fixture.runtime,
        config: fixture.config,
        stdout: approveStdout.stream,
        stderr: stderr.stream
      }
    );

    expect(approveExitCode).toBe(0);
    expect(JSON.parse(approveStdout.read())).toMatchObject({
      draft: {
        status: "approved"
      }
    });
    const replayStdout = createWritableBuffer();
    const replayExitCode = await runJsonMailctl(["replay", ingested.ingested.roomKey], {
      runtime: fixture.runtime,
      stdout: replayStdout.stream,
      stderr: stderr.stream
    });

    expect(replayExitCode).toBe(0);
    expect(JSON.parse(replayStdout.read())).toMatchObject({
      memoryPromotions: expect.arrayContaining([
        expect.objectContaining({
          promotionId: drafted.draft.draftId,
          status: "approved",
          sourceNamespaceKey: `room:acct-1:${ingested.ingested.roomKey}`,
          targetNamespaceKey: "agent:acct-1:assistant"
        })
      ]),
      memoryNamespaces: expect.arrayContaining([
        expect.objectContaining({
          namespaceKey: `room:acct-1:${ingested.ingested.roomKey}`,
          scope: "room"
        }),
        expect.objectContaining({
          namespaceKey: "agent:acct-1:assistant",
          scope: "agent"
        })
      ]),
      ledger: expect.arrayContaining([
        expect.objectContaining({
          type: "memory.promotion.requested",
          payload: expect.objectContaining({
            draftId: drafted.draft.draftId,
            sourceNamespace: expect.objectContaining({
              scope: "room",
              namespaceKey: `room:acct-1:${ingested.ingested.roomKey}`
            }),
            targetNamespace: expect.objectContaining({
              scope: "agent",
              namespaceKey: "agent:acct-1:assistant"
            })
          })
        }),
        expect.objectContaining({
          type: "memory.promotion.reviewed",
          payload: expect.objectContaining({
            draftId: drafted.draft.draftId
          })
        }),
        expect.objectContaining({
          type: "memory.promotion.approved",
          payload: expect.objectContaining({
            draftId: drafted.draft.draftId,
            targetNamespace: expect.objectContaining({
              scope: "agent",
              namespaceKey: "agent:acct-1:assistant"
            })
          })
        })
      ])
    });

    fixture.handle.close();
  });

  it("enforces runtime ACLs for memory draft lifecycle outside the operator CLI path", async () => {
    const fixture = createFixture();
    const ingested = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: true
    });

    expect(() =>
      fixture.runtime.createMemoryDraft({
        tenantId: "acct-1",
        agentId: "assistant",
        roomKey: ingested.ingested.roomKey,
        title: "Scoped",
        actor: {
          kind: "agent",
          tenantId: "acct-1",
          agentId: "assistant",
          roomKey: ingested.ingested.roomKey
        }
      })
    ).not.toThrow();

    expect(() =>
      fixture.runtime.createMemoryDraft({
        tenantId: "acct-1",
        agentId: "assistant",
        roomKey: ingested.ingested.roomKey,
        title: "Wrong room",
        actor: {
          kind: "agent",
          tenantId: "acct-1",
          agentId: "assistant",
          roomKey: "mail:acct-1:thread:other"
        }
      })
    ).toThrow("room mismatch");

    const created = fixture.runtime.createMemoryDraft({
      tenantId: "acct-1",
      agentId: "assistant-2",
      roomKey: ingested.ingested.roomKey,
      title: "Needs operator review",
      actor: {
        kind: "operator"
      }
    });

    expect(() =>
      fixture.runtime.reviewMemoryDraft({
        tenantId: "acct-1",
        agentId: "assistant-2",
        draftId: created.draft.draftId,
        reviewedBy: "agent-self",
        actor: {
          kind: "agent",
          tenantId: "acct-1",
          agentId: "assistant-2",
          roomKey: ingested.ingested.roomKey
        }
      })
    ).toThrow("requires explicit operator access");

    expect(() =>
      fixture.runtime.approveMemoryDraft({
        tenantId: "acct-1",
        agentId: "assistant-2",
        draftId: created.draft.draftId,
        actor: {
          kind: "agent",
          tenantId: "acct-1",
          agentId: "assistant-2",
          roomKey: ingested.ingested.roomKey
        }
      })
    ).toThrow("requires explicit operator access");

    const reviewed = fixture.runtime.reviewMemoryDraft({
      tenantId: "acct-1",
      agentId: "assistant-2",
      draftId: created.draft.draftId,
      reviewedBy: "reviewer@example.com",
      actor: {
        kind: "operator"
      }
    });
    const approved = fixture.runtime.approveMemoryDraft({
      tenantId: "acct-1",
      agentId: "assistant-2",
      draftId: created.draft.draftId,
      actor: {
        kind: "operator"
      }
    });

    expect(reviewed.draft.reviewedBy).toBe("reviewer@example.com");
    expect(approved.draft.status).toBe("approved");

    fixture.handle.close();
  });

  it("retrieves room-local context through the CLI", async () => {
    const fixture = createFixture();
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();

    const ingested = await fixture.runtime.ingest({
      accountId: "acct-1",
      mailboxAddress: "mailclaw@example.com",
      processImmediately: false,
      envelope: {
        providerMessageId: "provider-retrieve-1",
        messageId: "<msg-retrieve-1@example.com>",
        subject: "Retrieve room",
        from: {
          email: "sender@example.com"
        },
        to: [{ email: "mailclaw@example.com" }],
        text: "Atlas follow-up",
        attachments: [
          {
            filename: "atlas.txt",
            mimeType: "text/plain",
            data: "Atlas rollout checklist"
          }
        ],
        headers: [
          {
            name: "Message-ID",
            value: "<msg-retrieve-1@example.com>"
          }
        ]
      }
    });

    const retrieveExitCode = await runJsonMailctl(["retrieve", ingested.ingested.roomKey, "Atlas"], {
      runtime: fixture.runtime,
      config: fixture.config,
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(retrieveExitCode).toBe(0);
    expect(JSON.parse(stdout.read())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey: ingested.ingested.roomKey
        })
      ])
    );

    fixture.handle.close();
  });

  it("reads explicit memory namespaces through the CLI", async () => {
    const fixture = createFixture();
    const stderr = createWritableBuffer();
    const ingested = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: true
    });

    const roomStdout = createWritableBuffer();
    const roomExitCode = await runJsonMailctl(["memory", "read", "room", "acct-1", ingested.ingested.roomKey], {
      runtime: fixture.runtime,
      config: fixture.config,
      stdout: roomStdout.stream,
      stderr: stderr.stream
    });
    expect(roomExitCode).toBe(0);
    expect(JSON.parse(roomStdout.read())).toMatchObject({
      scope: "room",
      namespaceKey: `room:acct-1:${ingested.ingested.roomKey}`,
      capabilities: expect.objectContaining({
        canSourcePromotionDrafts: true,
        canReceiveApprovedPromotions: false
      }),
      primaryPath: expect.stringContaining("/tenants/acct-1/rooms/"),
      content: expect.stringContaining("CLI reply.")
    });

    const scratchStdout = createWritableBuffer();
    const scratchExitCode = await runJsonMailctl(
      ["memory", "read", "scratch", "acct-1", "assistant", ingested.ingested.roomKey],
      {
        runtime: fixture.runtime,
        config: fixture.config,
        stdout: scratchStdout.stream,
        stderr: stderr.stream
      }
    );
    expect(scratchExitCode).toBe(0);
    expect(JSON.parse(scratchStdout.read())).toMatchObject({
      scope: "scratch",
      namespaceKey: `scratch:acct-1:assistant:${ingested.ingested.roomKey}`,
      capabilities: expect.objectContaining({
        isEphemeral: true,
        storesMetadata: true
      }),
      metadata: expect.objectContaining({
        roomKey: ingested.ingested.roomKey
      })
    });

    fixture.handle.close();
  });

  it("rejects direct memory draft content through the CLI", async () => {
    const fixture = createFixture();
    const stdout = createWritableBuffer();
    const stderr = createWritableBuffer();
    const ingested = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: true
    });

    const draftExitCode = await runJsonMailctl(
      [
        "memory",
        "draft",
        "acct-1",
        "assistant",
        ingested.ingested.roomKey,
        "Approved",
        "manual note"
      ],
      {
        runtime: fixture.runtime,
        config: fixture.config,
        stdout: stdout.stream,
        stderr: stderr.stream
      }
    );

    expect(draftExitCode).toBe(1);
    expect(stdout.read()).toBe("");
    expect(stderr.read()).toContain("usage: mailctl memory draft <tenantId> <agentId> <roomKey> <title>");

    fixture.handle.close();
  });

  it("resends failed outbox items through the CLI", async () => {
    const fixture = createFixture();
    const stderr = createWritableBuffer();

    const ingested = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: true
    });
    const outboxId = ingested.processed?.outbox[0]?.outboxId ?? "";
    updateOutboxIntentStatus(fixture.handle.db, outboxId, {
      status: "failed",
      updatedAt: "2026-03-25T03:00:10.000Z",
      errorText: "temporary smtp failure"
    });
    const stdout = createWritableBuffer();
    const resendExitCode = await runJsonMailctl(["resend", outboxId], {
      runtime: fixture.runtime,
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(resendExitCode).toBe(0);
    const resent = JSON.parse(stdout.read()) as {
      outboxId: string;
      status: string;
      errorText?: string;
    };
    expect(resent).toMatchObject({
      outboxId,
      status: "queued"
    });
    expect(resent.errorText).toBeUndefined();

    fixture.handle.close();
  });

  it("lists quarantined rooms and dead-letter items through the CLI", async () => {
    const fixture = createFixture();
    const stderr = createWritableBuffer();

    const blocked = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      senderPolicy: {
        allowDomains: ["trusted.example"]
      },
      processImmediately: false
    });
    expect(blocked.ingested.status).toBe("blocked");

    const queued = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      envelope: {
        ...buildInboundPayload().envelope,
        providerMessageId: "provider-dead-letter-1",
        messageId: "<msg-dead-letter-1@example.com>",
        headers: [
          {
            name: "Message-ID",
            value: "<msg-dead-letter-1@example.com>"
          }
        ]
      },
      processImmediately: false
    });

    const leased = leaseNextRoomJob(fixture.handle.db, {
      leaseOwner: "test",
      now: new Date(Date.now() + 1_000).toISOString(),
      leaseDurationMs: 60_000
    });
    expect(leased?.jobId).toBeTruthy();
    failRoomJob(fixture.handle.db, leased?.jobId ?? "", {
      failedAt: "2026-03-25T03:11:00.000Z"
    });

    const processed = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      envelope: {
        ...buildInboundPayload().envelope,
        providerMessageId: "provider-dead-letter-2",
        messageId: "<msg-dead-letter-2@example.com>",
        headers: [
          {
            name: "Message-ID",
            value: "<msg-dead-letter-2@example.com>"
          }
        ]
      },
      processImmediately: true
    });
    const failedOutboxId = processed.processed?.outbox[0]?.outboxId ?? "";
    updateOutboxIntentStatus(fixture.handle.db, failedOutboxId, {
      status: "failed",
      updatedAt: "2026-03-25T03:12:00.000Z",
      errorText: "smtp bounce"
    });
    const quarantineStdout = createWritableBuffer();
    const quarantineExitCode = await runJsonMailctl(["quarantine"], {
      runtime: fixture.runtime,
      stdout: quarantineStdout.stream,
      stderr: stderr.stream
    });

    expect(quarantineExitCode).toBe(0);
    expect(JSON.parse(quarantineStdout.read())).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roomKey: blocked.ingested.roomKey
        })
      ])
    );

    const deadLetterStdout = createWritableBuffer();
    const deadLetterExitCode = await runJsonMailctl(["dead-letter"], {
      runtime: fixture.runtime,
      stdout: deadLetterStdout.stream,
      stderr: stderr.stream
    });

    expect(deadLetterExitCode).toBe(0);
    expect(JSON.parse(deadLetterStdout.read())).toMatchObject({
      roomJobs: expect.arrayContaining([
        expect.objectContaining({
          roomKey: queued.ingested.roomKey,
          status: "failed"
        })
      ]),
      outbox: expect.arrayContaining([
        expect.objectContaining({
          outboxId: failedOutboxId,
          status: "failed"
        })
      ]),
      outboxIntents: expect.arrayContaining([
        expect.objectContaining({
          intentId: failedOutboxId,
          status: "failed"
        })
      ])
    });

    fixture.handle.close();
  });

  it("surfaces failed intent-backed outbox rows through dead-letter without a legacy mirror", async () => {
    const fixture = createFixture();
    const stderr = createWritableBuffer();
    const roomKey = buildRoomSessionKey("acct-1", "thread-legacy-dead-letter");

    saveThreadRoom(fixture.handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-legacy-dead-letter",
      parentSessionKey: roomKey,
      state: "done",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 1
    });
    insertControlPlaneOutboxRecord(fixture.handle.db, {
      outboxId: "outbox-intent-dead-letter",
      roomKey,
      kind: "final",
      status: "failed",
      subject: "Intent dead-letter",
      textBody: "Intent failed body",
      to: ["intent@example.com"],
      cc: [],
      bcc: [],
      headers: {},
      errorText: "intent failure",
      createdAt: "2026-03-25T03:30:00.000Z",
      updatedAt: "2026-03-25T03:30:00.000Z"
    });

    const deadLetterStdout = createWritableBuffer();
    const deadLetterExitCode = await runJsonMailctl(["dead-letter"], {
      runtime: fixture.runtime,
      stdout: deadLetterStdout.stream,
      stderr: stderr.stream
    });

    expect(deadLetterExitCode).toBe(0);
    expect(JSON.parse(deadLetterStdout.read())).toMatchObject({
      outbox: expect.arrayContaining([
        expect.objectContaining({
          outboxId: "outbox-intent-dead-letter",
          status: "failed",
          errorText: "intent failure"
        })
      ]),
      outboxIntents: expect.arrayContaining([
        expect.objectContaining({
          intentId: "outbox-intent-dead-letter",
          status: "failed",
          errorText: "intent failure"
        })
      ])
    });

    fixture.handle.close();
  });

  it("retries failed room jobs through the CLI", async () => {
    const fixture = createFixture();
    const stderr = createWritableBuffer();
    const roomKey = buildRoomSessionKey("acct-1", "thread-retry");

    saveThreadRoom(fixture.handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-retry",
      parentSessionKey: roomKey,
      state: "queued",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 0
    });
    enqueueFailedJob(fixture.handle.db, roomKey, "job-retry");

    const leased = leaseNextRoomJob(fixture.handle.db, {
      leaseOwner: "test",
      now: "2026-03-25T03:10:00.000Z",
      leaseDurationMs: 60_000
    });
    expect(leased?.jobId).toBeTruthy();

    failRoomJob(fixture.handle.db, leased?.jobId ?? "", {
      failedAt: "2026-03-25T03:11:00.000Z"
    });
    saveThreadRoom(fixture.handle.db, {
      roomKey,
      accountId: "acct-1",
      stableThreadId: "thread-retry",
      parentSessionKey: roomKey,
      state: "failed",
      revision: 1,
      lastInboundSeq: 1,
      lastOutboundSeq: 0
    });

    const retryStdout = createWritableBuffer();
    const retryExitCode = await runJsonMailctl(["dead-letter", "retry", leased?.jobId ?? ""], {
      runtime: fixture.runtime,
      stdout: retryStdout.stream,
      stderr: stderr.stream
    });

    expect(retryExitCode).toBe(0);
    expect(JSON.parse(retryStdout.read())).toMatchObject({
      jobId: leased?.jobId,
      status: "queued"
    });

    expect(fixture.runtime.listDeadLetter().roomJobs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: leased?.jobId
        })
      ])
    );
    expect(fixture.runtime.replay(roomKey).room?.state).toBe("queued");

    fixture.handle.close();
  });

  it("lists shared-facts conflicts and records manual acknowledgements", async () => {
    const fixture = createFixture();
    const stderr = createWritableBuffer();

    const ingested = await fixture.runtime.ingest({
      ...buildInboundPayload(),
      processImmediately: false
    });
    const replay = fixture.runtime.replay(ingested.ingested.roomKey);
    const sharedFactsRef = replay.room?.sharedFactsRef;

    if (!sharedFactsRef) {
      throw new Error("expected sharedFactsRef");
    }

    const seededFacts = {
      roomKey: ingested.ingested.roomKey,
      conflicts: [
        {
          key: "atlas-owner",
          claims: [
            {
              claim: "Atlas owner is Dana.",
              role: "mail-researcher",
              evidenceRef: "artifact:atlas/chunk:1"
            },
            {
              claim: "Atlas owner is Lee.",
              role: "mail-attachment-reader",
              evidenceRef: "artifact:atlas/chunk:2"
            }
          ]
        }
      ]
    };
    fs.writeFileSync(sharedFactsRef, JSON.stringify(seededFacts, null, 2), "utf8");

    const listStdout = createWritableBuffer();
    const listExitCode = await runJsonMailctl(["conflicts", "list", ingested.ingested.roomKey], {
      runtime: fixture.runtime,
      config: fixture.config,
      stdout: listStdout.stream,
      stderr: stderr.stream
    });

    expect(listExitCode).toBe(0);
    expect(JSON.parse(listStdout.read())).toMatchObject({
      roomKey: ingested.ingested.roomKey,
      conflictCount: 1,
      conflicts: [
        {
          key: "atlas-owner"
        }
      ]
    });

    const ackStdout = createWritableBuffer();
    const ackExitCode = await runJsonMailctl(
      [
        "conflicts",
        "ack",
        ingested.ingested.roomKey,
        "atlas-owner",
        "manual",
        "review",
        "requested"
      ],
      {
        runtime: fixture.runtime,
        config: fixture.config,
        stdout: ackStdout.stream,
        stderr: stderr.stream
      }
    );

    expect(ackExitCode).toBe(0);
    const ackPayload = JSON.parse(ackStdout.read()) as {
      status: string;
      resolutionPath: string;
    };
    expect(ackPayload.status).toBe("acknowledged");
    expect(fs.existsSync(ackPayload.resolutionPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(ackPayload.resolutionPath, "utf8"))).toMatchObject({
      roomKey: ingested.ingested.roomKey,
      conflictKey: "atlas-owner",
      status: "acknowledged",
      note: "manual review requested"
    });

    const replayStdout = createWritableBuffer();
    const replayExitCode = await runJsonMailctl(["replay", ingested.ingested.roomKey], {
      runtime: fixture.runtime,
      config: fixture.config,
      stdout: replayStdout.stream,
      stderr: stderr.stream
    });

    expect(replayExitCode).toBe(0);
    expect(JSON.parse(replayStdout.read())).toMatchObject({
      room: {
        roomKey: ingested.ingested.roomKey
      },
      sharedFacts: {
        conflicts: [
          {
            key: "atlas-owner",
            status: "acknowledged",
            acknowledgements: [
              expect.objectContaining({
                conflictKey: "atlas-owner",
                status: "acknowledged",
                note: "manual review requested"
              })
            ]
          }
        ]
      }
    });

    fixture.handle.close();
  });
});

function enqueueFailedJob(db: Parameters<typeof leaseNextRoomJob>[0], roomKey: string, jobId: string) {
  enqueueRoomJob(db, {
    jobId,
    roomKey,
    revision: 1,
    inboundSeq: 1,
    messageDedupeKey: `${jobId}-dedupe`,
    priority: 100,
    createdAt: "2026-03-25T03:09:00.000Z"
  });
}
