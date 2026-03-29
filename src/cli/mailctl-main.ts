#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import process from "node:process";

import { loadConfig } from "../config.js";
import { type GmailOAuthClientLike } from "../auth/gmail-oauth.js";
import { type MicrosoftOAuthClientLike } from "../auth/microsoft-oauth.js";
import { renderOAuthCallbackHtml } from "../auth/oauth-core.js";
import {
  buildConnectOnboardingPlan,
  listConnectProviderGuides,
  resolveConnectProviderGuide,
  getPasswordPresetProvider,
  getUnsupportedOAuthProviderMessage,
  resolveOAuthProvider
} from "../auth/oauth-providers.js";
import {
  createTerminalPrompter,
  promptInteractiveMailboxLogin,
  type MailctlPrompter
} from "./login-wizard.js";
import {
  acknowledgeSharedFactConflict,
  listSharedFactConflicts
} from "../core/shared-facts.js";
import { runPromptFootprintBenchmark } from "../benchmarks/prompt-footprint.js";
import { createMemoryNamespaceSpec, parseMemoryScope } from "../memory/namespace-spec.js";
import { createMailSidecarRuntime } from "../orchestration/runtime.js";
import { initializeDatabase } from "../storage/db.js";
import type { VirtualMessageOriginKind } from "../core/types.js";

type MailRuntime = ReturnType<typeof createMailSidecarRuntime>;

interface CliOutputMode {
  format: "text" | "json";
  verbose: boolean;
}

interface ParsedCliArgs {
  mode: CliOutputMode;
  help: boolean;
  positionals: string[];
}

export async function runMailctl(
  args: string[],
  deps?: {
    runtime?: MailRuntime;
    config?: ReturnType<typeof loadConfig>;
    stdout?: Pick<NodeJS.WriteStream, "write">;
    stderr?: Pick<NodeJS.WriteStream, "write">;
    gmailOAuthClient?: GmailOAuthClientLike;
    microsoftOAuthClient?: MicrosoftOAuthClientLike;
    openExternal?: (url: string) => Promise<void> | void;
    callbackTimeoutMs?: number;
    prompter?: MailctlPrompter;
  }
) {
  const stdout = deps?.stdout ?? process.stdout;
  const stderr = deps?.stderr ?? process.stderr;
  const parsedArgs = parseCliArgs(args);

  if (parsedArgs.help || parsedArgs.positionals.length === 0) {
    writeUsage(stdout);
    return 0;
  }

  const [command, ...rest] = parsedArgs.positionals;
  if (command === "connect" && rest[0] === "providers") {
    return handleConnectProviders(rest.slice(1), stdout, stderr, parsedArgs.mode);
  }
  if (command === "benchmark") {
    return handleBenchmark(rest, stdout, stderr, parsedArgs.mode);
  }

  const resolved = deps?.runtime
    ? {
        runtime: deps.runtime,
        config: deps.config ?? loadConfig(process.env),
        close: undefined
      }
    : createRuntimeFromEnv({
        gmailOAuthClient: deps?.gmailOAuthClient,
        microsoftOAuthClient: deps?.microsoftOAuthClient
      });
  const runtime = resolved.runtime;
  const mode = parsedArgs.mode;

  try {
    switch (command) {
      case "observe":
        return await handleObserve(runtime, rest, stdout, stderr, mode);
      case "operate":
        return await handleOperate(runtime, rest, stdout, stderr, mode);
      case "connect":
        return await handleConnect(runtime, resolved.config, rest, stdout, stderr, mode, {
          gmailOAuthClient: deps?.gmailOAuthClient,
          microsoftOAuthClient: deps?.microsoftOAuthClient,
          openExternal: deps?.openExternal,
          callbackTimeoutMs: deps?.callbackTimeoutMs,
          prompter: deps?.prompter
        });
      case "rooms":
        return handleRooms(runtime, rest, stdout, stderr, mode);
      case "inboxes":
        return handleInboxes(runtime, rest, stdout, stderr, mode);
      case "replay":
        return handleReplay(runtime, rest, stdout, stderr, mode);
      case "gateway-trace":
        return handleGatewayTrace(runtime, rest, stdout, stderr, mode);
      case "gateway":
        return await handleGateway(runtime, rest, stdout, stderr, mode);
      case "retrieve":
        return handleRetrieve(runtime, rest, stdout, stderr, mode);
      case "recover":
        return handleRecover(runtime, rest, stdout, stderr, mode);
      case "drain":
        return await handleDrain(runtime, rest, stdout, stderr, mode);
      case "deliver-outbox":
        return await handleDeliverOutbox(runtime, stdout, mode);
      case "resend":
        return handleResend(runtime, rest, stdout, stderr, mode);
      case "approve":
        return handleOutboxAction("approve", runtime, rest, stdout, stderr, mode);
      case "reject":
        return handleOutboxAction("reject", runtime, rest, stdout, stderr, mode);
      case "approvals":
        return handleApprovals(runtime, rest, stdout, stderr, mode);
      case "handoff":
        return handleHandoff(runtime, rest, stdout, stderr, mode);
      case "mailbox":
        return handleMailbox(runtime, rest, stdout, stderr, mode);
      case "quarantine":
        writePayload(stdout, mode, runtime.listQuarantine(), renderQuarantine(runtime.listQuarantine()));
        return 0;
      case "dead-letter":
        return handleDeadLetter(runtime, rest, stdout, stderr, mode);
      case "conflicts":
        return handleConflicts(runtime, rest, stdout, stderr, mode);
      case "accounts":
        return handleAccounts(runtime, rest, stdout, stderr, mode);
      case "memory":
        return handleMemory(runtime, rest, stdout, stderr, mode);
      case "login":
        return await handleLogin(runtime, resolved.config, rest, stdout, stderr, mode, {
          gmailOAuthClient: deps?.gmailOAuthClient,
          microsoftOAuthClient: deps?.microsoftOAuthClient,
          openExternal: deps?.openExternal,
          callbackTimeoutMs: deps?.callbackTimeoutMs,
          prompter: deps?.prompter
        });
      default:
        writeUsage(stderr);
        return 1;
    }
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    resolved.close?.();
  }
}

function parseCliArgs(args: string[]): ParsedCliArgs {
  const positionals: string[] = [];
  let help = false;
  let json = false;
  let verbose = false;

  for (const arg of args) {
    switch (arg) {
      case "--json":
        json = true;
        break;
      case "--verbose":
        verbose = true;
        break;
      case "--help":
      case "-h":
        help = true;
        break;
      default:
        positionals.push(arg);
        break;
    }
  }

  return {
    mode: {
      format: json ? "json" : "text",
      verbose
    },
    help,
    positionals
  };
}

function writePayload(
  stdout: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode,
  payload: unknown,
  text: string
) {
  if (mode.format === "json") {
    writeJson(stdout, payload);
    return;
  }

  stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  if (mode.verbose) {
    stdout.write(`\nJSON:\n${JSON.stringify(payload, null, 2)}\n`);
  }
}

function handleRooms(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  _stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  if (mode.format === "json") {
    writeJson(stdout, runtime.listRooms());
    return 0;
  }

  const accountId = args[0];
  const rooms = runtime.listConsoleRooms({
    accountId
  });
  writePayload(stdout, mode, rooms, renderConsoleRooms(rooms));
  return 0;
}

async function handleObserve(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const [subcommand, ...rest] = args;

  switch (subcommand ?? "rooms") {
    case "rooms":
      return handleRooms(runtime, rest, stdout, stderr, mode);
    case "room":
      return handleReplay(runtime, rest, stdout, stderr, mode);
    case "projection":
      return handleGatewayTrace(runtime, rest, stdout, stderr, mode);
    case "accounts":
      return handleAccounts(runtime, rest, stdout, stderr, mode);
    case "workbench":
      return handleObserveWorkbench(runtime, rest, stdout, stderr, mode);
    case "runtime":
      return handleObserveRuntime(runtime, rest, stdout, stderr, mode);
    case "mail-io":
      return handleObserveMailIo(runtime, rest, stdout, stderr, mode);
    case "embedded-sessions":
      return handleObserveEmbeddedSessions(runtime, rest, stdout, stderr, mode);
    case "approvals":
      return handleObserveApprovals(runtime, rest, stdout, stderr, mode);
    case "inboxes":
      return handleObserveInboxes(runtime, rest, stdout, stderr, mode);
    case "mailbox-feed":
      return handleMailbox(runtime, ["feed", ...rest], stdout, stderr, mode);
    case "mailbox-view":
      return handleMailbox(runtime, ["view", ...rest], stdout, stderr, mode);
    default:
      stderr.write(
        "usage: mailctl observe <rooms [accountId]|room <roomKey>|projection <roomKey>|accounts [show <accountId>]|workbench [accountId] [roomKey] [mailboxId]|runtime|mail-io|embedded-sessions [sessionKey]|approvals [room <roomKey>|account <accountId>]|inboxes <accountId>|mailbox-feed <accountId> <mailboxId> [limit] [originKinds]|mailbox-view <roomKey> <mailboxId> [originKinds]>\n"
      );
      return 1;
  }
}

async function handleBenchmark(
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const [subcommand] = args;

  switch (subcommand ?? "prompt-footprint") {
    case "prompt-footprint": {
      const result = await runPromptFootprintBenchmark();
      writePayload(stdout, mode, result, renderPromptFootprintBenchmark(result));
      return 0;
    }
    default:
      stderr.write("usage: mailctl benchmark [prompt-footprint]\n");
      return 1;
  }
}

function handleObserveWorkbench(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  _stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const [accountId, roomKey, mailboxId] = args;
  const payload = runtime.getConsoleWorkbench({
    accountId,
    roomKey,
    mailboxId
  });
  writePayload(stdout, mode, payload, renderConsoleWorkbench(payload));
  return 0;
}

function handleObserveRuntime(
  runtime: MailRuntime,
  _args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  _stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const payload = runtime.inspectRuntimeExecution();
  writePayload(stdout, mode, payload, renderRuntimeExecution(payload));
  return 0;
}

async function handleObserveMailIo(
  runtime: MailRuntime,
  _args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  _stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const payload = await runtime.inspectMailIoBoundary();
  writePayload(stdout, mode, payload, renderMailIoBoundary(payload));
  return 0;
}

function handleObserveEmbeddedSessions(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  _stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const payload = runtime.listEmbeddedRuntimeSessions({
    sessionKey: args[0]
  });
  writePayload(stdout, mode, payload, renderEmbeddedRuntimeSessions(payload));
  return 0;
}

async function handleOperate(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "approve":
      return handleOutboxAction("approve", runtime, rest, stdout, stderr, mode);
    case "reject":
      return handleOutboxAction("reject", runtime, rest, stdout, stderr, mode);
    case "resend":
      return handleResend(runtime, rest, stdout, stderr, mode);
    case "deliver-outbox":
      return handleDeliverOutbox(runtime, stdout, mode);
    case "drain":
      return handleDrain(runtime, rest, stdout, stderr, mode);
    case "recover":
      return handleRecover(runtime, rest, stdout, stderr, mode);
    case "handoff":
      return handleHandoff(runtime, rest, stdout, stderr, mode);
    case "dead-letter":
      return handleDeadLetter(runtime, rest, stdout, stderr, mode);
    case "quarantine":
      writePayload(stdout, mode, runtime.listQuarantine(), renderQuarantine(runtime.listQuarantine()));
      return 0;
    case "mailbox-rebuild":
      return handleMailbox(runtime, ["rebuild", ...rest], stdout, stderr, mode);
    default:
      stderr.write(
        "usage: mailctl operate <approve <outboxId>|reject <outboxId>|resend <outboxId>|deliver-outbox|drain [limit]|recover [timestamp]|handoff <request|release> <roomKey> [actor] [reason]|dead-letter [retry <jobId>]|quarantine|mailbox-rebuild <roomKey>>\n"
      );
      return 1;
  }
}

async function handleConnect(
  runtime: MailRuntime,
  config: ReturnType<typeof loadConfig>,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode,
  deps?: {
    gmailOAuthClient?: GmailOAuthClientLike;
    microsoftOAuthClient?: MicrosoftOAuthClientLike;
    openExternal?: (url: string) => Promise<void> | void;
    callbackTimeoutMs?: number;
    prompter?: MailctlPrompter;
  }
) {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "providers":
      return handleConnectProviders(rest, stdout, stderr, mode);
    case "start":
    case "onboard":
      return handleConnectStart(rest, stdout, mode);
    case "login":
      return handleLogin(runtime, config, rest, stdout, stderr, mode, deps);
    case "accounts":
      return handleAccounts(runtime, rest, stdout, stderr, mode);
    default:
      stderr.write(
        "usage: mailctl connect <providers [provider]|start [emailAddress] [provider]|login ...|accounts [show <accountId>]>\n"
      );
      return 1;
  }
}

function handleConnectProviders(
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const provider = args[0];
  if (!provider) {
    const guides = listConnectProviderGuides();
    writePayload(stdout, mode, guides, renderConnectProviderGuides(guides));
    return 0;
  }

  const guide = resolveConnectProviderGuide(provider);
  if (!guide) {
    stderr.write(`unknown connect provider: ${provider}; run \`mailctl connect providers\` to list available guides\n`);
    return 1;
  }

  writePayload(stdout, mode, guide, renderConnectProviderGuide(guide));
  return 0;
}

function handleConnectStart(
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const first = args[0];
  const second = args[1];
  const emailAddress = first?.includes("@") ? first : second?.includes("@") ? second : undefined;
  const providerHint = first && !first.includes("@") ? first : second && !second.includes("@") ? second : undefined;
  const plan = buildConnectOnboardingPlan({
    emailAddress,
    providerHint
  });

  writePayload(stdout, mode, plan, renderConnectOnboardingPlan(plan));
  return 0;
}

function handleObserveApprovals(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const [scope, scopeId] = args;
  if (!scope) {
    const approvals = runtime.listConsoleApprovals();
    writePayload(stdout, mode, approvals, renderConsoleApprovals(approvals));
    return 0;
  }

  if (scope === "room" && scopeId) {
    const approvals = runtime.listConsoleApprovals({
      roomKey: scopeId
    });
    writePayload(stdout, mode, approvals, renderConsoleApprovals(approvals));
    return 0;
  }

  if (scope === "account" && scopeId) {
    const approvals = runtime.listConsoleApprovals({
      accountId: scopeId
    });
    writePayload(stdout, mode, approvals, renderConsoleApprovals(approvals));
    return 0;
  }

  stderr.write("usage: mailctl observe approvals [room <roomKey>|account <accountId>]\n");
  return 1;
}

function handleObserveInboxes(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const accountId = args[0];
  if (!accountId) {
    stderr.write("usage: mailctl observe inboxes <accountId>\n");
    return 1;
  }

  const account = runtime.getConsoleAccount(accountId);
  writePayload(stdout, mode, account, renderConsoleAccount(account));
  return 0;
}

function handleRecover(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  _stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const payload = runtime.recover(args[0]);
  writePayload(stdout, mode, payload, renderRecoveryResult(payload));
  return 0;
}

async function handleDrain(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  _stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const payload = await runtime.drainQueue({
    maxRuns: args[0] ? Number.parseInt(args[0], 10) : undefined
  });
  writePayload(stdout, mode, payload, renderDrainResult(payload));
  return 0;
}

async function handleDeliverOutbox(
  runtime: MailRuntime,
  stdout: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const payload = await runtime.deliverOutbox();
  writePayload(stdout, mode, payload, `Delivered outbox: sent ${payload.sent}, failed ${payload.failed}`);
  return 0;
}

function handleReplay(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const roomKey = args[0];
  if (!roomKey) {
    stderr.write("usage: mailctl replay <roomKey>\n");
    return 1;
  }

  if (mode.format === "json") {
    writeJson(stdout, runtime.replay(roomKey));
    return 0;
  }

  const room = runtime.getConsoleRoom(roomKey);
  writePayload(stdout, mode, room, renderConsoleRoom(room));
  return 0;
}

function handleGatewayTrace(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const roomKey = args[0];
  if (!roomKey) {
    stderr.write("usage: mailctl gateway-trace <roomKey>\n");
    return 1;
  }

  const trace = runtime.getGatewayProjectionTrace(roomKey);
  writePayload(stdout, mode, trace, renderGatewayTrace(trace));
  return 0;
}

async function handleGateway(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const [subcommand, arg1, arg2, arg3, arg4, arg5, arg6] = args;

  if (subcommand === "resolve" && arg1) {
    const resolved = runtime.resolveGatewayTurnRoom({
      sessionKey: arg1,
      roomKey: arg2
    });
    writePayload(
      stdout,
      mode,
      resolved,
      `Gateway session ${arg1} -> ${resolved.room.roomKey} (${resolved.binding.bindingKind})`
    );
    return 0;
  }

  if (subcommand === "bind" && arg1 && arg2) {
    const binding = runtime.bindGatewaySessionToRoom({
      sessionKey: arg1,
      roomKey: arg2,
      bindingKind: (arg3 as "room" | "work_thread" | "subagent" | undefined) ?? "room",
      sourceControlPlane: arg4 ?? "openclaw",
      workThreadId: arg5,
      parentMessageId: arg6
    });
    writePayload(
      stdout,
      mode,
      binding,
      `Bound gateway session ${binding.sessionKey} to ${binding.roomKey} as ${binding.bindingKind}`
    );
    return 0;
  }

  if (subcommand === "trace" && arg1) {
    return handleGatewayTrace(runtime, [arg1], stdout, stderr, mode);
  }

  if (subcommand === "events" && arg1) {
    const payload = JSON.parse(fs.readFileSync(arg1, "utf8")) as unknown;
    const events = Array.isArray(payload) ? payload : [payload];
    const processed = runtime.ingestGatewayEvents(events.map((event) => parseGatewayCliEvent(event)));
    writePayload(stdout, mode, { processed }, `Gateway events processed: ${processed.length}`);
    return 0;
  }

  if (subcommand === "import-history" && arg1 && arg2 && arg3) {
    const payload = JSON.parse(fs.readFileSync(arg3, "utf8")) as unknown;
    const parsed = parseGatewayHistoryFile(payload);
    const imported = runtime.importGatewayThreadHistory({
      sessionKey: arg1,
      roomKey: arg2,
      sourceControlPlane: arg4 ?? parsed.sourceControlPlane ?? "openclaw",
      bindingKind: (arg5 as "room" | "work_thread" | "subagent" | undefined) ?? parsed.bindingKind,
      frontAgentId: arg6 ?? parsed.frontAgentId,
      turns: parsed.turns
    });
    writePayload(stdout, mode, imported, `Imported ${imported.length} gateway turns into ${arg2}`);
    return 0;
  }

  if (subcommand === "sync-mail" && arg1 && arg2) {
    const to = parseCliOptionalStringList(arg3);
    const cc = parseCliOptionalStringList(arg4);
    const bcc = parseCliOptionalStringList(arg5);
    const payload = runtime.syncRoomMessageToEmail({
      roomKey: arg1,
      messageId: arg2,
      ...(to.length > 0 ? { to } : {}),
      ...(cc.length > 0 ? { cc } : {}),
      ...(bcc.length > 0 ? { bcc } : {})
    });
    writePayload(
      stdout,
      mode,
      payload,
      `Queued governed email sync for ${arg2} as ${payload.outboxId} (${payload.status})`
    );
    return 0;
  }

  if (subcommand === "dispatch") {
    const limit = arg2 ? Number.parseInt(arg2, 10) : undefined;
    if (arg2 && Number.isNaN(limit)) {
      stderr.write("usage: mailctl gateway dispatch [roomKey] [limit]\n");
      return 1;
    }
    return await handleGatewayDispatch(runtime, { roomKey: arg1, limit }, stdout, mode);
  }

  stderr.write(
    "usage: mailctl gateway <resolve <sessionKey> [roomKey]|bind <sessionKey> <roomKey> [bindingKind] [sourceControlPlane] [workThreadId] [parentMessageId]|trace <roomKey>|events <jsonFile>|import-history <sessionKey> <roomKey> <jsonFile> [sourceControlPlane] [bindingKind] [frontAgentId]|sync-mail <roomKey> <messageId> [toCsv] [ccCsv] [bccCsv]|dispatch [roomKey] [limit]>\n"
  );
  return 1;
}

async function handleGatewayDispatch(
  runtime: MailRuntime,
  input: {
    roomKey?: string;
    limit?: number;
  },
  stdout: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const payload = await runtime.dispatchPendingGatewayOutcomes(input);
  writePayload(
    stdout,
    mode,
    payload,
    `Gateway dispatch attempted ${payload.attempted} | dispatched ${payload.dispatched} | failed ${payload.failed}`
  );
  return 0;
}

function parseGatewayCliEvent(event: unknown) {
  const record = typeof event === "object" && event !== null ? (event as Record<string, unknown>) : null;
  if (!record || typeof record.type !== "string") {
    throw new Error("gateway event type is required");
  }

  switch (record.type) {
    case "gateway.session.bind":
      return {
        type: record.type,
        sessionKey: requireCliString(record.sessionKey, "sessionKey"),
        roomKey: requireCliString(record.roomKey, "roomKey"),
        bindingKind: (record.bindingKind as "room" | "work_thread" | "subagent" | undefined) ?? "room",
        sourceControlPlane: typeof record.sourceControlPlane === "string" ? record.sourceControlPlane : "openclaw",
        workThreadId: typeof record.workThreadId === "string" ? record.workThreadId : undefined,
        parentMessageId: typeof record.parentMessageId === "string" ? record.parentMessageId : undefined,
        frontAgentId: typeof record.frontAgentId === "string" ? record.frontAgentId : undefined,
        now: typeof record.now === "string" ? record.now : undefined
      } as const;
    case "gateway.turn.project":
      return {
        type: record.type,
        sessionKey: requireCliString(record.sessionKey, "sessionKey"),
        sourceControlPlane: typeof record.sourceControlPlane === "string" ? record.sourceControlPlane : "openclaw",
        sourceMessageId: typeof record.sourceMessageId === "string" ? record.sourceMessageId : undefined,
        sourceRunId: typeof record.sourceRunId === "string" ? record.sourceRunId : undefined,
        roomKey: typeof record.roomKey === "string" ? record.roomKey : undefined,
        parentMessageId: typeof record.parentMessageId === "string" ? record.parentMessageId : undefined,
        fromPrincipalId: requireCliString(record.fromPrincipalId, "fromPrincipalId"),
        fromMailboxId: requireCliString(record.fromMailboxId, "fromMailboxId"),
        toMailboxIds: parseCliRequiredStringList(record.toMailboxIds, "toMailboxIds"),
        ccMailboxIds: parseCliOptionalStringList(record.ccMailboxIds),
        kind:
          (record.kind as
            | "task"
            | "question"
            | "claim"
            | "evidence"
            | "draft"
            | "review"
            | "approval"
            | "progress"
            | "final_ready"
            | "handoff"
            | "system_notice"
            | undefined) ?? "claim",
        visibility: (record.visibility as "room" | "internal" | "private" | "governance" | undefined) ?? "internal",
        subject: requireCliString(record.subject, "subject"),
        bodyRef: requireCliString(record.bodyRef, "bodyRef"),
        artifactRefs: parseCliOptionalStringList(record.artifactRefs),
        memoryRefs: parseCliOptionalStringList(record.memoryRefs),
        inputsHash: requireCliString(record.inputsHash, "inputsHash"),
        createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
        threadKind: record.threadKind as "room" | "work" | undefined,
        topic: typeof record.topic === "string" ? record.topic : undefined,
        frontAgentId: typeof record.frontAgentId === "string" ? record.frontAgentId : undefined
      } as const;
    case "gateway.outcome.project":
      return {
        type: record.type,
        roomKey: requireCliString(record.roomKey, "roomKey"),
        messageId: requireCliString(record.messageId, "messageId"),
        projectedAt: typeof record.projectedAt === "string" ? record.projectedAt : undefined
      } as const;
    case "gateway.history.import":
      return {
        type: record.type,
        roomKey: requireCliString(record.roomKey, "roomKey"),
        sessionKey: requireCliString(record.sessionKey, "sessionKey"),
        sourceControlPlane: typeof record.sourceControlPlane === "string" ? record.sourceControlPlane : "openclaw",
        frontAgentId: typeof record.frontAgentId === "string" ? record.frontAgentId : undefined,
        bindingKind: (record.bindingKind as "room" | "work_thread" | "subagent" | undefined) ?? "room",
        turns: parseCliGatewayHistoryTurns(record.turns)
      } as const;
    default:
      throw new Error(`unsupported gateway event type: ${record.type}`);
  }
}

function parseGatewayHistoryFile(payload: unknown) {
  if (Array.isArray(payload)) {
    return {
      turns: parseCliGatewayHistoryTurns(payload)
    };
  }

  const record = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null;
  if (!record) {
    throw new Error("gateway history file must be an array of turns or an object with a turns field");
  }

  return {
    turns: parseCliGatewayHistoryTurns(record.turns),
    sourceControlPlane: typeof record.sourceControlPlane === "string" ? record.sourceControlPlane : undefined,
    bindingKind: record.bindingKind as "room" | "work_thread" | "subagent" | undefined,
    frontAgentId: typeof record.frontAgentId === "string" ? record.frontAgentId : undefined
  };
}

function parseCliGatewayHistoryTurns(turns: unknown) {
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new Error("gateway history turns are required");
  }

  return turns.map((turn, index) => {
    const record = typeof turn === "object" && turn !== null ? (turn as Record<string, unknown>) : null;
    if (!record) {
      throw new Error(`gateway history turn ${index + 1} is invalid`);
    }

    return {
      sourceMessageId: typeof record.sourceMessageId === "string" ? record.sourceMessageId : undefined,
      sourceRunId: typeof record.sourceRunId === "string" ? record.sourceRunId : undefined,
      fromPrincipalId: requireCliString(record.fromPrincipalId, `turns[${index}].fromPrincipalId`),
      fromMailboxId: requireCliString(record.fromMailboxId, `turns[${index}].fromMailboxId`),
      toMailboxIds: parseCliRequiredStringList(record.toMailboxIds, `turns[${index}].toMailboxIds`),
      ccMailboxIds: parseCliOptionalStringList(record.ccMailboxIds),
      kind:
        (record.kind as
          | "task"
          | "question"
          | "claim"
          | "evidence"
          | "draft"
          | "review"
          | "approval"
          | "progress"
          | "final_ready"
          | "handoff"
          | "system_notice"
          | undefined) ?? "claim",
      visibility: (record.visibility as "room" | "internal" | "private" | "governance" | undefined) ?? "internal",
      subject: requireCliString(record.subject, `turns[${index}].subject`),
      bodyText: requireCliString(record.bodyText, `turns[${index}].bodyText`),
      createdAt: requireCliString(record.createdAt, `turns[${index}].createdAt`),
      parentMessageId: typeof record.parentMessageId === "string" ? record.parentMessageId : undefined
    };
  });
}

function requireCliString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function parseCliRequiredStringList(value: unknown, field: string) {
  const parsed = parseCliOptionalStringList(value);
  if (parsed.length === 0) {
    throw new Error(`${field} is required`);
  }
  return parsed;
}

function parseCliOptionalStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function handleRetrieve(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const roomKey = args[0];
  const query = args.slice(1).join(" ").trim();
  if (!roomKey || !query) {
    stderr.write("usage: mailctl retrieve <roomKey> <query>\n");
    return 1;
  }

  const results = runtime.retrieveRoomContext(roomKey, query);
  writePayload(stdout, mode, results, renderRetrieveResults(roomKey, query, results));
  return 0;
}

function handleOutboxAction(
  action: "approve" | "reject",
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const outboxId = args[0];
  if (!outboxId) {
    stderr.write(`usage: mailctl ${action} <outboxId>\n`);
    return 1;
  }

  const outbox = action === "approve" ? runtime.approveOutbox(outboxId) : runtime.rejectOutbox(outboxId);
  writePayload(
    stdout,
    mode,
    outbox,
    `${action === "approve" ? "Approved" : "Rejected"} outbox ${outbox.outboxId} -> ${outbox.status}`
  );
  return 0;
}

function handleResend(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const outboxId = args[0];
  if (!outboxId) {
    stderr.write("usage: mailctl resend <outboxId>\n");
    return 1;
  }

  const outbox = runtime.resendOutbox(outboxId);
  if (!outbox) {
    throw new Error(`outbox item not found after resend: ${outboxId}`);
  }
  writePayload(stdout, mode, outbox, `Resent outbox ${outbox.outboxId} -> ${outbox.status}`);
  return 0;
}

function handleAccounts(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const subcommand = args[0] ?? "list";
  if (subcommand === "list") {
    if (mode.format === "json") {
      writeJson(stdout, runtime.listPublicAccounts());
    } else {
      const accounts = runtime.listConsoleAccounts();
      writePayload(stdout, mode, accounts, renderConsoleAccounts(accounts));
    }
    return 0;
  }

  if (subcommand === "show") {
    const accountId = args[1];
    if (!accountId) {
      stderr.write("usage: mailctl accounts show <accountId>\n");
      return 1;
    }

    if (mode.format === "json") {
      writeJson(stdout, runtime.getPublicAccountProviderState(accountId));
    } else {
      const account = runtime.getConsoleAccount(accountId);
      writePayload(stdout, mode, account, renderConsoleAccount(account));
    }
    return 0;
  }

  stderr.write("usage: mailctl accounts [list|show <accountId>]\n");
  return 1;
}

function handleInboxes(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const [subcommand, arg1, arg2, arg3, arg4, arg5] = args;

  if (subcommand === "list") {
    if (!arg1) {
      stderr.write("usage: mailctl inboxes list <accountId>\n");
      return 1;
    }

    const inboxes = runtime.listPublicAgentInboxes(arg1);
    writePayload(stdout, mode, inboxes, renderInboxes(inboxes));
    return 0;
  }

  if (subcommand === "project") {
    if (!arg1 || !arg2) {
      stderr.write(
        "usage: mailctl inboxes project <accountId> <agentId> [activeRoomLimit] [ackSlaSeconds] [burstCoalesceSeconds]\n"
      );
      return 1;
    }

    const projection = runtime.projectPublicAgentInbox({
      accountId: arg1,
      agentId: arg2,
      activeRoomLimit: parseOptionalInteger(arg3),
      ackSlaSeconds: parseOptionalInteger(arg4),
      burstCoalesceSeconds: parseOptionalInteger(arg5)
    });
    writePayload(stdout, mode, projection, renderInboxProjection(projection));
    return 0;
  }

  if (subcommand === "items") {
    if (!arg1) {
      stderr.write("usage: mailctl inboxes items <inboxId>\n");
      return 1;
    }

    const items = runtime.listInboxItems(arg1);
    writePayload(stdout, mode, items, renderInboxItems(items));
    return 0;
  }

  if (subcommand === "console") {
    if (!arg1) {
      stderr.write("usage: mailctl inboxes console <accountId>\n");
      return 1;
    }

    if (mode.format === "json") {
      writeJson(stdout, runtime.getPublicMailboxConsole(arg1));
    } else {
      const account = runtime.getConsoleAccount(arg1);
      writePayload(stdout, mode, account, renderConsoleAccount(account));
    }
    return 0;
  }

  stderr.write(
    "usage: mailctl inboxes <list <accountId>|project <accountId> <agentId> [activeRoomLimit] [ackSlaSeconds] [burstCoalesceSeconds]|items <inboxId>|console <accountId>>\n"
  );
  return 1;
}

function handleConflicts(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const [subcommand, roomKey, conflictKey, ...noteParts] = args;

  if (subcommand === "list") {
    if (!roomKey) {
      stderr.write("usage: mailctl conflicts list <roomKey>\n");
      return 1;
    }

    const replay = runtime.replay(roomKey);
    const conflicts = listSharedFactConflicts({
      roomKey,
      sharedFactsRef: replay.room?.sharedFactsRef
    });
    writePayload(stdout, mode, conflicts, renderConflicts(roomKey, conflicts));
    return 0;
  }

  if (subcommand === "ack") {
    const note = noteParts.join(" ").trim();
    if (!roomKey || !conflictKey || !note) {
      stderr.write("usage: mailctl conflicts ack <roomKey> <conflictKey> <note>\n");
      return 1;
    }

    const replay = runtime.replay(roomKey);
    const acknowledgement = acknowledgeSharedFactConflict({
      roomKey,
      conflictKey,
      note,
      sharedFactsRef: replay.room?.sharedFactsRef
    });
    writePayload(stdout, mode, acknowledgement, `Acknowledged conflict ${conflictKey} for room ${roomKey}`);
    return 0;
  }

  stderr.write("usage: mailctl conflicts <list|ack> <roomKey> [conflictKey] [note]\n");
  return 1;
}

function handleApprovals(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const [subcommand, roomKey] = args;

  if (subcommand === "trace") {
    if (!roomKey) {
      stderr.write("usage: mailctl approvals trace <roomKey>\n");
      return 1;
    }

    const trace = runtime.traceApprovals(roomKey);
    writePayload(stdout, mode, trace, renderApprovalTrace(trace));
    return 0;
  }

  stderr.write("usage: mailctl approvals trace <roomKey>\n");
  return 1;
}

function handleDeadLetter(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const [subcommand, jobId] = args;

  if (!subcommand) {
    const deadLetter = runtime.listDeadLetter();
    writePayload(stdout, mode, deadLetter, renderDeadLetter(deadLetter));
    return 0;
  }

  if (subcommand === "retry") {
    if (!jobId) {
      stderr.write("usage: mailctl dead-letter retry <jobId>\n");
      return 1;
    }

    const retried = runtime.retryRoomJob(jobId);
    writePayload(stdout, mode, retried, `Retried dead-letter room job ${retried.jobId} -> ${retried.status}`);
    return 0;
  }

  stderr.write("usage: mailctl dead-letter [retry <jobId>]\n");
  return 1;
}

function handleHandoff(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const [subcommand, roomKey, actor, ...reasonParts] = args;
  const reason = reasonParts.join(" ").trim();

  if ((subcommand === "request" || subcommand === "release") && roomKey) {
    const result =
      subcommand === "request"
        ? runtime.requestHandoff(roomKey, {
            requestedBy: actor,
            reason: reason || undefined
          })
        : runtime.releaseHandoff(roomKey, {
            releasedBy: actor,
            reason: reason || undefined
          });
    writePayload(
      stdout,
      mode,
      result,
      `${subcommand === "request" ? "Requested" : "Released"} handoff for ${roomKey} -> ${result.room?.state ?? "unknown"}`
    );
    return 0;
  }

  stderr.write("usage: mailctl handoff <request|release> <roomKey> [actor] [reason]\n");
  return 1;
}

function handleMailbox(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const [subcommand, roomKey, mailboxId, arg4, arg5] = args;

  if (subcommand === "view" && roomKey && mailboxId) {
    const view = {
      roomKey,
      mailboxId,
      entries: runtime.projectMailboxView({
        roomKey,
        mailboxId,
        originKinds: parseOptionalOriginKinds(arg4)
      })
    };
    writePayload(stdout, mode, view, renderMailboxView(view));
    return 0;
  }

  if (subcommand === "rebuild" && roomKey) {
    const rebuilt = runtime.rebuildVirtualMailProjection(roomKey);
    writePayload(stdout, mode, rebuilt, `Rebuilt mailbox projection for ${roomKey}: ${rebuilt.messages} messages, ${rebuilt.deliveries} deliveries`);
    return 0;
  }

  if (subcommand === "feed" && roomKey && mailboxId) {
    const feed = runtime.projectMailboxFeed({
      accountId: roomKey,
      mailboxId,
      limit: parseOptionalInteger(arg4),
      originKinds: parseOptionalOriginKinds(arg5)
    });
    writePayload(stdout, mode, feed, renderMailboxFeed(roomKey, mailboxId, feed));
    return 0;
  }

  stderr.write(
    "usage: mailctl mailbox <view <roomKey> <mailboxId> [originKinds]|feed <accountId> <mailboxId> [limit] [originKinds]|rebuild <roomKey>>\n"
  );
  return 1;
}

function handleMemory(
  runtime: MailRuntime,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode
) {
  const [subcommand, tenantId, agentId, arg3, arg4, ...rest] = args;

  if (subcommand === "read") {
    const scope = parseMemoryScope(tenantId);
    const scopeTenantId = agentId;
    if (!scope || !scopeTenantId) {
      stderr.write("usage: mailctl memory read <agent|room|user|scratch> <tenantId> <id> [roomKey]\n");
      return 1;
    }

    try {
      const payload = runtime.readMemoryNamespace(
        createMemoryNamespaceSpec(scope, {
          tenantId: scopeTenantId,
          agentId: scope === "agent" || scope === "scratch" ? arg3 : undefined,
          roomKey: scope === "room" ? arg3 : scope === "scratch" ? arg4 : undefined,
          userId: scope === "user" ? arg3 : undefined
        }),
        {
          actor: {
            kind: "operator"
          }
        }
      );
      writePayload(stdout, mode, payload, `Read ${payload.scope} memory namespace ${payload.namespaceKey}`);
      return 0;
    } catch {
      switch (scope) {
        case "agent":
          stderr.write("usage: mailctl memory read agent <tenantId> <agentId>\n");
          return 1;
        case "room":
          stderr.write("usage: mailctl memory read room <tenantId> <roomKey>\n");
          return 1;
        case "user":
          stderr.write("usage: mailctl memory read user <tenantId> <userId>\n");
          return 1;
        case "scratch":
          stderr.write("usage: mailctl memory read scratch <tenantId> <agentId> <roomKey>\n");
          return 1;
      }
    }
  }

  if (!subcommand || !tenantId || !agentId) {
    stderr.write(
      "usage: mailctl memory <init|list|draft|review|approve|reject|read> <tenantId> <agentId> [...args]\n"
    );
    return 1;
  }

  switch (subcommand) {
    case "init": {
      const payload = runtime.initAgentMemory(tenantId, agentId, {
        actor: {
          kind: "operator"
        }
      });
      writePayload(stdout, mode, payload, `Initialized agent memory for ${tenantId}/${agentId}`);
      return 0;
    }
    case "list": {
      const payload = runtime.listMemoryDrafts(tenantId, agentId, {
        actor: {
          kind: "operator"
        }
      });
      writePayload(stdout, mode, payload, `Memory drafts for ${tenantId}/${agentId}: ${payload.length}`);
      return 0;
    }
    case "draft": {
      const roomKey = arg3;
      const title = arg4;
      if (!roomKey || !title || rest.length > 0) {
        stderr.write("usage: mailctl memory draft <tenantId> <agentId> <roomKey> <title>\n");
        return 1;
      }

      const payload = runtime.createMemoryDraft({
        tenantId,
        agentId,
        roomKey,
        title,
        actor: {
          kind: "operator"
        }
      });
      writePayload(stdout, mode, payload, `Created memory draft ${payload.draft.draftId} for ${tenantId}/${agentId}`);
      return 0;
    }
    case "approve": {
      const draftId = arg3;
      if (!draftId) {
        stderr.write("usage: mailctl memory approve <tenantId> <agentId> <draftId>\n");
        return 1;
      }

      const payload = runtime.approveMemoryDraft({
        tenantId,
        agentId,
        draftId,
        actor: {
          kind: "operator"
        }
      });
      writePayload(stdout, mode, payload, `Approved memory draft ${draftId} for ${tenantId}/${agentId}`);
      return 0;
    }
    case "review": {
      const draftId = arg3;
      const reviewedBy = arg4;
      if (!draftId || !reviewedBy) {
        stderr.write("usage: mailctl memory review <tenantId> <agentId> <draftId> <reviewedBy>\n");
        return 1;
      }

      const payload = runtime.reviewMemoryDraft({
        tenantId,
        agentId,
        draftId,
        reviewedBy,
        actor: {
          kind: "operator"
        }
      });
      writePayload(stdout, mode, payload, `Reviewed memory draft ${draftId} by ${reviewedBy}`);
      return 0;
    }
    case "reject": {
      const draftId = arg3;
      if (!draftId) {
        stderr.write("usage: mailctl memory reject <tenantId> <agentId> <draftId>\n");
        return 1;
      }

      const payload = runtime.rejectMemoryDraft({
        tenantId,
        agentId,
        draftId,
        actor: {
          kind: "operator"
        }
      });
      writePayload(stdout, mode, payload, `Rejected memory draft ${draftId} for ${tenantId}/${agentId}`);
      return 0;
    }
    default:
      stderr.write(
        "usage: mailctl memory <init|list|draft|review|approve|reject|read> <tenantId> <agentId> [...args]\n"
      );
      return 1;
  }
}

async function handleLogin(
  runtime: MailRuntime,
  _config: ReturnType<typeof loadConfig>,
  args: string[],
  stdout: Pick<NodeJS.WriteStream, "write">,
  stderr: Pick<NodeJS.WriteStream, "write">,
  mode: CliOutputMode,
  deps?: {
    gmailOAuthClient?: GmailOAuthClientLike;
    microsoftOAuthClient?: MicrosoftOAuthClientLike;
    openExternal?: (url: string) => Promise<void> | void;
    callbackTimeoutMs?: number;
    prompter?: MailctlPrompter;
  }
) {
  const parsed = parseLoginArgs(args);
  if (!parsed) {
    stderr.write(
      "usage: mailctl connect login [imap|password|qq|icloud|yahoo|163|126] | <gmail|outlook> <accountId> [displayName] [--client-id <id>] [--client-secret <secret>] [--login-hint <email>] [--tenant <tenant>] [--topic-name <topic>] [--user-id <userId>] [--label-ids <csv>] [--scopes <csv>] [--no-browser] [--timeout-seconds <seconds>] | oauth <gmail|outlook> <accountId> [displayName] [--client-id <id>] [--client-secret <secret>] [--login-hint <email>] [--tenant <tenant>] [--topic-name <topic>] [--user-id <userId>] [--label-ids <csv>] [--scopes <csv>] [--no-browser] [--timeout-seconds <seconds>]>\n"
    );
    return 1;
  }

  const passwordPresetProvider = getPasswordPresetProvider(parsed.provider);
  if (passwordPresetProvider) {
    const prompter = deps?.prompter ?? createTerminalPrompter();
    try {
      const result = await promptInteractiveMailboxLogin(prompter, {
        accountId: parsed.accountId,
        displayName: parsed.displayName,
        providerPreset: passwordPresetProvider
      });
      for (const warning of result.warnings) {
        stderr.write(`${warning}\n`);
      }
      const account = runtime.upsertAccount(result.account);
      if (!account) {
        throw new Error(`failed to upsert mailbox account ${result.account.accountId}`);
      }
      writePayload(stdout, mode, account, `Connected mailbox ${account.emailAddress} as ${account.accountId}`);
      return 0;
    } finally {
      prompter.close();
    }
  }

  const oauthProvider = resolveOAuthProvider(parsed.provider);
  if (!oauthProvider) {
    stderr.write(`${getUnsupportedOAuthProviderMessage(parsed.provider)}\n`);
    return 1;
  }

  if (!parsed.accountId) {
    stderr.write(
      `usage: mailctl connect login ${oauthProvider.id} <accountId> [displayName] [--client-id <id>] [--client-secret <secret>] [--login-hint <email>] [--tenant <tenant>] [--topic-name <topic>] [--user-id <userId>] [--label-ids <csv>] [--scopes <csv>] [--no-browser] [--timeout-seconds <seconds>]\n`
    );
    return 1;
  }

  const callbackServer = http.createServer((request, response) => {
    void (async () => {
      try {
        const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
        if (request.method !== "GET" || requestUrl.pathname !== "/callback") {
          response.writeHead(404, {
            "content-type": "text/plain; charset=utf-8"
          });
          response.end("not found");
          return;
        }

        const completed = await runtime.completeOAuthLogin({
          state: requestUrl.searchParams.get("state") ?? "",
          code: requestUrl.searchParams.get("code") ?? undefined,
          error: requestUrl.searchParams.get("error") ?? undefined,
          errorDescription: requestUrl.searchParams.get("error_description") ?? undefined
        });

        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8"
        });
        response.end(
          renderOAuthCallbackHtml({
            providerName: oauthProvider.displayName,
            success: true,
            title: `${oauthProvider.displayName} mailbox connected`,
            message:
              oauthProvider.id === "gmail"
                ? completed.watchReady
                  ? "MailClaw can now ingest and send mail through this Gmail account."
                  : "The mailbox is connected. Add a Gmail Pub/Sub topic if you want watch/recovery to be active."
                : "The mailbox is connected. MailClaw will use IMAP/SMTP with OAuth for this account.",
            accountId: completed.account?.accountId,
            emailAddress: completed.account?.emailAddress
          })
        );
      } catch (error) {
        response.writeHead(error instanceof Error ? 400 : 500, {
          "content-type": "text/html; charset=utf-8"
        });
        response.end(
          renderOAuthCallbackHtml({
            providerName: oauthProvider.displayName,
            success: false,
            title: `${oauthProvider.displayName} mailbox connection failed`,
            message: error instanceof Error ? error.message : String(error)
          })
        );
      }
    })();
  });

  callbackServer.listen(0, "127.0.0.1");
  await once(callbackServer, "listening");

  try {
    const address = callbackServer.address();
    if (address === null || typeof address === "string") {
      throw new Error("failed to allocate oauth callback port");
    }

    const redirectUri = `http://127.0.0.1:${address.port}/callback`;
    const started = runtime.startOAuthLogin({
      provider: oauthProvider.id,
      accountId: parsed.accountId,
      displayName: parsed.displayName,
      loginHint: parsed.loginHint,
      redirectUri,
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret,
      tenant: parsed.tenant,
      topicName: parsed.topicName,
      userId: parsed.userId,
      labelIds: parsed.labelIds,
      scopes: parsed.scopes
    });
    if (!started?.sessionId) {
      throw new Error(`${oauthProvider.displayName.toLowerCase()} oauth start did not return a session id`);
    }

    stderr.write(`Open this URL if the browser does not launch:\n${started.authorizeUrl}\n`);
    if (!parsed.noBrowser) {
      try {
        await (deps?.openExternal ?? openExternalUrl)(started.authorizeUrl);
      } catch (error) {
        stderr.write(`failed to open browser automatically: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }

    const result = await waitForOAuthCompletion(
      runtime,
      started.sessionId,
      deps?.callbackTimeoutMs ?? parsed.timeoutSeconds * 1000
    );
    writePayload(
      stdout,
      mode,
      result,
      `Connected ${result.account.emailAddress} via ${oauthProvider.displayName}; inbound ${result.providerState.ingress.mode}, outbound ${result.providerState.outbound.mode}`
    );
    return 0;
  } finally {
    callbackServer.close();
  }
}

function renderConsoleRooms(rooms: ReturnType<MailRuntime["listConsoleRooms"]>) {
  if (rooms.length === 0) {
    return "No rooms.";
  }

  return [
    `Rooms: ${rooms.length}`,
    ...rooms.map(
      (room) =>
        `${room.roomKey} | ${room.state} | rev ${room.revision} | front ${room.frontAgentAddress ?? "n/a"} | collab ${room.collaboratorAgentAddresses.length} | roles ${room.summonedRoles.length} | approvals ${room.pendingApprovalCount} | activity ${formatTimestamp(room.latestActivityAt)}`
    )
  ].join("\n");
}

function renderConsoleRoom(room: ReturnType<MailRuntime["getConsoleRoom"]>) {
  return [
    `Room ${room.room.roomKey}`,
    `State: ${room.room.state} | Revision: ${room.room.revision} | Latest activity: ${formatTimestamp(room.room.latestActivityAt)}`,
    `Front agent: ${room.room.frontAgentAddress ?? "n/a"} | Public identities: ${room.room.publicAgentAddresses.join(", ") || "none"} | Collaborators: ${room.room.collaboratorAgentAddresses.join(", ") || "none"}`,
    `Summoned roles: ${room.room.summonedRoles.join(", ") || "none"}`,
    `Mailboxes: ${room.mailboxes.length} | Approvals: ${room.approvals.length} | Timeline events: ${room.timeline.length}`,
    `Gateway projection: ${room.gatewayTrace.projectedMessageCount} messages / ${room.gatewayTrace.projectedDeliveryCount} deliveries / pending ${room.gatewayTrace.pendingDispatchCount} / failed ${room.gatewayTrace.failedDispatchCount}`,
    `Recent timeline:`,
    ...room.timeline.slice(0, 8).map((entry) => `  ${entry.at} | ${entry.category} | ${entry.title}`)
  ].join("\n");
}

function renderConsoleAccounts(accounts: ReturnType<MailRuntime["listConsoleAccounts"]>) {
  if (accounts.length === 0) {
    return "No accounts.";
  }

  return [
    `Accounts: ${accounts.length}`,
    ...accounts.map(
      (account) =>
        `${account.accountId} | ${account.provider} | ${account.health} | rooms ${account.roomCount} | approvals ${account.pendingApprovalCount} | ${account.emailAddress}`
    )
  ].join("\n");
}

function renderConsoleAccount(account: ReturnType<MailRuntime["getConsoleAccount"]>) {
  return [
    `Account ${account.account.accountId}`,
    `Mailbox: ${account.account.emailAddress} | Provider: ${account.account.provider} | Health: ${account.account.health}`,
    `Rooms: ${account.rooms.length} | Mailboxes: ${account.mailboxes.length} | Public inboxes: ${account.inboxes.length}`,
    `Inbound: ${account.account.providerState.ingress.mode} | Outbound: ${account.account.providerState.outbound.mode}`,
    `Latest activity: ${formatTimestamp(account.account.latestActivityAt)}`
  ].join("\n");
}

function renderConsoleWorkbench(workbench: ReturnType<MailRuntime["getConsoleWorkbench"]>) {
  return [
    `Workbench selection: account ${workbench.selection.accountId ?? "none"} | room ${workbench.selection.roomKey ?? "none"} | mailbox ${workbench.selection.mailboxId ?? "none"}`,
    `Accounts: ${workbench.accounts.length} | Rooms: ${workbench.rooms.length} | Approvals: ${workbench.approvals.length}`,
    `Account detail: ${workbench.accountDetail?.account.accountId ?? "none"} | Room detail: ${workbench.roomDetail?.room.roomKey ?? "none"}`,
    `Gateway dispatch: pending ${workbench.roomDetail?.gatewayTrace.pendingDispatchCount ?? 0} | failed ${workbench.roomDetail?.gatewayTrace.failedDispatchCount ?? 0}`,
    `Mailbox console: ${workbench.mailboxConsole?.account.accountId ?? "none"} | Mailbox feed entries: ${workbench.mailboxFeed.length}`
  ].join("\n");
}

function renderRuntimeExecution(payload: ReturnType<MailRuntime["inspectRuntimeExecution"]>) {
  const manifest = payload.runtime.policyManifest;
  return [
    `Runtime mode: ${payload.runtime.runtimeKind} (${payload.runtime.runtimeLabel})`,
    `Manifest source: ${payload.runtime.manifestSource} | Backend enforcement: ${payload.runtime.backendEnforcement}`,
    `Namespace validation: ${payload.runtime.namespaceValidation ? "on" : "off"} | Canonical workspace binding: ${payload.runtime.canonicalWorkspaceBinding ? "on" : "off"}`,
    `Policy-bound turn admission: ${payload.runtime.policyAdmissionRequired ? "required" : "optional"} | Embedded sessions: ${payload.embeddedSessionCount}`,
    `Tool policies: ${manifest?.toolPolicies.join(", ") || "none"}`,
    `Sandbox policies: ${manifest?.sandboxPolicies.join(", ") || "none"}`,
    `Network: ${manifest?.networkAccess ?? "none"} | Filesystem: ${manifest?.filesystemAccess ?? "none"} | Outbound: ${manifest?.outboundMode ?? "none"}`
  ].join("\n");
}

function renderMailIoBoundary(payload: Awaited<ReturnType<MailRuntime["inspectMailIoBoundary"]>>) {
  return [
    `Mail I/O mode: ${payload.mode} (${payload.label})`,
    `Handshake: ${payload.handshakeStatus} | Checked at: ${formatTimestamp(payload.checkedAt)}`,
    `Protocol: ${payload.protocol ? `${payload.protocol.name}@v${payload.protocol.version}` : "n/a"}`,
    `Capabilities: ${payload.capabilities.join(", ") || "none"}`,
    `Error: ${payload.error ?? "none"}`
  ].join("\n");
}

function renderEmbeddedRuntimeSessions(payload: ReturnType<MailRuntime["listEmbeddedRuntimeSessions"]>) {
  if (payload.length === 0) {
    return "No embedded runtime sessions.";
  }

  return [
    `Embedded runtime sessions: ${payload.length}`,
    ...payload.map(
      (session) =>
        `${session.sessionId} | turns ${session.turnCount} | entries ${session.transcriptEntryCount} | updated ${formatTimestamp(session.updatedAt)} | ${session.sessionKey}`
    )
  ].join("\n");
}

function renderConsoleApprovals(approvals: ReturnType<MailRuntime["listConsoleApprovals"]>) {
  if (approvals.length === 0) {
    return "No approvals.";
  }

  return [
    `Approvals: ${approvals.length}`,
    ...approvals.map(
      (approval) =>
        `${approval.requestId} | ${approval.status} | outbox ${approval.outboxStatus ?? "none"} | ${approval.roomKey} | ${approval.subject}`
    )
  ].join("\n");
}

function renderConnectProviderGuides(guides: ReturnType<typeof listConnectProviderGuides>) {
  return [
    `Connect providers: ${guides.length}`,
    "Use `mailclaw login` for the generic interactive path; it asks for your email first and works with any IMAP/SMTP mailbox.",
    "Use `mailclaw providers <provider>` for detailed commands and env requirements.",
    "API discovery: GET /api/connect and GET /api/connect/providers",
    ...guides.map(
      (guide) =>
        `${guide.id} | ${guide.displayName} | ${formatConnectSetupKind(guide.setupKind)} | login ${toUserFacingCliCommand(guide.recommendedCommand)}`
    )
  ].join("\n");
}

function renderConnectProviderGuide(guide: ReturnType<typeof resolveConnectProviderGuide> extends infer T
  ? Exclude<T, null>
  : never) {
  return [
    `${guide.displayName} (${guide.id})`,
    `Setup: ${formatConnectSetupKind(guide.setupKind)} | Account mode: ${guide.accountProvider}`,
    `Inbound: ${guide.inboundModes.join(", ")} | Outbound: ${guide.outboundModes.join(", ")}`,
    ...(guide.authApi
      ? [
          `Auth API: ${guide.authApi.startPath}${guide.authApi.callbackPath ? ` | callback ${guide.authApi.callbackPath}` : ""}`,
          `Auth methods: browser ${guide.authApi.browserRedirectMethod ?? "n/a"} | programmatic ${guide.authApi.programmaticMethod ?? "n/a"} | query secret policy ${guide.authApi.querySecretPolicy ?? "n/a"}`
        ]
      : []),
    `Recommended: ${toUserFacingCliCommand(guide.recommendedCommand)}`,
    ...(guide.commands.length > 0
      ? ["Commands:", ...guide.commands.map((command) => `  ${toUserFacingCliCommand(command)}`)]
      : []),
    ...(guide.requiredEnvVars.length > 0 ? [`Required env: ${guide.requiredEnvVars.join(", ")}`] : []),
    ...(guide.optionalEnvVars.length > 0 ? [`Optional env: ${guide.optionalEnvVars.join(", ")}`] : []),
    ...(guide.notes.length > 0 ? ["Notes:", ...guide.notes.map((note) => `  ${note}`)] : [])
  ].join("\n");
}

function renderConnectOnboardingPlan(plan: ReturnType<typeof buildConnectOnboardingPlan>) {
  const loginCommand = toUserFacingCliCommand(plan.commands.login);
  const accountsCommand = toUserFacingCliCommand(plan.commands.observeAccounts);
  const inboxesCommand = toUserFacingCliCommand(plan.commands.observeInboxes);
  const workbenchCommand = toUserFacingCliCommand(plan.commands.observeWorkbench);
  const inspectProviderCommand = toUserFacingCliCommand(plan.commands.inspectProvider);

  return [
    "MailClaw mailbox onboarding",
    `Mailbox: ${plan.input.emailAddress ?? "not specified"}`,
    `Recommended provider: ${plan.recommendation.provider.displayName} (${plan.recommendation.provider.id})`,
    `Why: ${formatOnboardingMatchReason(plan.recommendation.matchReason)} | confidence ${plan.recommendation.confidence}`,
    `1. Login: ${loginCommand}`,
    "2. Send one email to the connected address from another mailbox.",
    `3. Open browser: ${plan.console.browserPath}`,
    `4. Check account: ${accountsCommand}`,
    `5. Check rooms/inbox: ${toUserFacingCliCommand("mailclaw rooms")} | ${inboxesCommand}`,
    `Optional internal mailbox view later: ${workbenchCommand}`,
    ...(plan.alternatives.length > 0
      ? [
          `Fallbacks: ${plan.alternatives
            .map((provider) => `${provider.displayName} (${provider.id}, ${formatConnectSetupKind(provider.setupKind)})`)
            .join(" | ")}`
        ]
      : []),
    `Provider guide: ${inspectProviderCommand}`,
    "Not sure which provider to pick: run `mailclaw login`, enter your mailbox address, and MailClaw will suggest the common host defaults it knows.",
    "Advanced: use `mailctl --help` if you want the full operator/developer command surface.",
    ...(plan.notes.length > 0 ? ["Notes:", ...plan.notes.map((note) => `  - ${note}`)] : [])
  ].join("\n");
}

function renderGatewayTrace(trace: ReturnType<MailRuntime["getGatewayProjectionTrace"]>) {
  return [
    `Gateway projection for ${trace.roomKey}`,
    `Messages: ${trace.messages.length} | Deliveries: ${trace.deliveries.length} | Pending ${trace.outcomeProjections.filter((entry) => entry.dispatchStatus === "pending").length} | Failed ${trace.outcomeProjections.filter((entry) => entry.dispatchStatus === "failed").length}`,
    `Sessions: ${trace.sessionKeys.join(", ") || "none"} | Runs: ${trace.runIds.join(", ") || "none"}`
  ].join("\n");
}

function renderInboxes(inboxes: ReturnType<MailRuntime["listPublicAgentInboxes"]>) {
  if (inboxes.length === 0) {
    return "No public agent inboxes.";
  }

  return [
    `Public inboxes: ${inboxes.length}`,
    ...inboxes.map(
      (inbox) =>
        `${inbox.inboxId} | agent ${inbox.agentId} | active-room-limit ${inbox.activeRoomLimit} | ack ${inbox.ackSlaSeconds}s`
    )
  ].join("\n");
}

function renderInboxProjection(projection: ReturnType<MailRuntime["projectPublicAgentInbox"]>) {
  return [
    `Inbox ${projection.inbox.inboxId} for ${projection.inbox.agentId}`,
    `Items: ${projection.items.length} | Active room limit: ${projection.inbox.activeRoomLimit} | ACK SLA: ${projection.inbox.ackSlaSeconds}s`,
    ...projection.items.slice(0, 8).map(
      (item) =>
        `  ${item.roomKey} | ${item.state} | unread ${item.unreadCount} | effort ${item.estimatedEffort} | urgency ${item.urgency}`
    )
  ].join("\n");
}

function renderInboxItems(items: ReturnType<MailRuntime["listInboxItems"]>) {
  if (items.length === 0) {
    return "No inbox items.";
  }

  return [
    `Inbox items: ${items.length}`,
    ...items.map(
      (item) =>
        `${item.inboxItemId} | room ${item.roomKey} | ${item.state} | unread ${item.unreadCount} | urgency ${item.urgency}`
    )
  ].join("\n");
}

function renderApprovalTrace(trace: ReturnType<MailRuntime["traceApprovals"]>) {
  return [
    `Approval trace for ${trace.roomKey}`,
    `Pending: ${trace.pendingCount} | Requests: ${trace.approvalRequests.length} | Outbox intents: ${trace.outboxIntents.length}`,
    ...trace.approvalEvents.map((event) => `  ${event.createdAt} | ${event.type}`)
  ].join("\n");
}

function renderDeadLetter(deadLetter: ReturnType<MailRuntime["listDeadLetter"]>) {
  return [
    `Dead letter`,
    `Room jobs: ${deadLetter.roomJobs.length} | Outbox: ${deadLetter.outboxIntents.length}`,
    ...deadLetter.roomJobs.map((job) => `  ${job.jobId} | room ${job.roomKey} | rev ${job.revision} | ${job.status}`),
    ...deadLetter.outboxIntents.map((intent) => `  ${intent.intentId} | room ${intent.roomKey} | ${intent.status}`)
  ].join("\n");
}

function renderMailboxView(view: {
  roomKey: string;
  mailboxId: string;
  entries: ReturnType<MailRuntime["projectMailboxView"]>;
}) {
  return [
    `Mailbox view ${view.mailboxId} in ${view.roomKey}`,
    `Entries: ${view.entries.length}`,
    ...view.entries.slice(0, 10).map(
      (entry) =>
        `  ${entry.message.createdAt} | ${entry.message.kind} | ${entry.delivery.status} | ${entry.message.subject}`
    )
  ].join("\n");
}

function renderMailboxFeed(
  accountId: string,
  mailboxId: string,
  feed: ReturnType<MailRuntime["projectMailboxFeed"]>
) {
  return [
    `Mailbox feed ${mailboxId} for ${accountId}`,
    `Entries: ${feed.length}`,
    ...feed.slice(0, 10).map(
      (entry) =>
        `  ${entry.message.createdAt} | ${entry.delivery.roomKey} | ${entry.message.kind} | ${entry.message.subject}`
    )
  ].join("\n");
}

function renderRetrieveResults(roomKey: string, query: string, results: ReturnType<MailRuntime["retrieveRoomContext"]>) {
  return [
    `Retrieved context for ${roomKey}`,
    `Query: ${query}`,
    `Matches: ${results.length}`
  ].join("\n");
}

function renderRecoveryResult(payload: ReturnType<MailRuntime["recover"]>) {
  return `Recovered room queue leases: ${payload.recoveredJobs} jobs | queued ${payload.queuedJobs.length} | leased ${payload.leasedJobs.length}`;
}

function renderDrainResult(payload: Awaited<ReturnType<MailRuntime["drainQueue"]>>) {
  const completed = payload.processed.length;
  return `Drained room queue: ${completed} processed | worker pool active ${payload.workerPool.globalActive} | rooms ${Object.keys(payload.workerPool.roomActive).length}`;
}

function renderQuarantine(payload: ReturnType<MailRuntime["listQuarantine"]>) {
  if (payload.length === 0) {
    return "No quarantined rooms.";
  }

  return [
    `Quarantine: ${payload.length}`,
    ...payload.map((entry) => `${entry.roomKey} | rev ${entry.revision} | ${entry.reasons.join(", ")}`)
  ].join("\n");
}

function renderConflicts(roomKey: string, payload: ReturnType<typeof listSharedFactConflicts>) {
  if (payload.conflictCount === 0) {
    return `No shared fact conflicts for ${roomKey}.`;
  }

  return [
    `Shared fact conflicts for ${roomKey}: ${payload.conflictCount}`,
    ...payload.conflicts.map(
      (conflict) => `${conflict.key} | claims ${conflict.claims.length} | status ${conflict.status ?? "open"}`
    )
  ].join("\n");
}

function renderPromptFootprintBenchmark(
  payload: Awaited<ReturnType<typeof runPromptFootprintBenchmark>>
) {
  const sections = [
    "MailClaw prompt footprint benchmark",
    `Generated at: ${payload.generatedAt}`,
    `Estimate method: ${payload.estimateMethod}`,
    "",
    formatPromptFootprintScenario("Transcript follow-up average", payload.transcriptFollowUpAverage),
    "",
    formatPromptFootprintScenario("Transcript follow-up final turn", payload.transcriptFollowUpFinalTurn),
    "",
    formatPromptFootprintScenario("Multi-agent reducer handoff", payload.multiAgentReducer)
  ];

  return sections.join("\n");
}

function formatPromptFootprintScenario(
  label: string,
  scenario: Awaited<ReturnType<typeof runPromptFootprintBenchmark>>["transcriptFollowUpAverage"]
) {
  return [
    label,
    `  current:  ${scenario.current.estimatedTokens} est. tokens (${scenario.current.characters} chars)`,
    `  baseline: ${scenario.baseline.estimatedTokens} est. tokens (${scenario.baseline.characters} chars)`,
    `  reduction: ${scenario.estimatedReductionPct}%`,
    ...scenario.notes.map((note) => `  note: ${note}`)
  ].join("\n");
}

function formatTimestamp(value: string | null | undefined) {
  return value ?? "n/a";
}

function writeJson(stdout: Pick<NodeJS.WriteStream, "write">, payload: unknown) {
  stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function writeUsage(stream: Pick<NodeJS.WriteStream, "write">) {
  stream.write(
    [
      "usage: mailctl [--json] [--verbose] <observe|operate|connect|benchmark> ...",
      "",
      "observe:",
      "  observe rooms [accountId]",
      "  observe room <roomKey>",
      "  observe projection <roomKey>",
      "  observe accounts [show <accountId>]",
      "  observe workbench [accountId] [roomKey] [mailboxId]",
      "  observe runtime",
      "  observe mail-io",
      "  observe embedded-sessions [sessionKey]",
      "  observe approvals [room <roomKey>|account <accountId>]",
      "  observe inboxes <accountId>",
      "  observe mailbox-feed <accountId> <mailboxId> [limit] [originKinds]",
      "  observe mailbox-view <roomKey> <mailboxId> [originKinds]",
      "",
      "operate:",
      "  operate approve <outboxId>",
      "  operate reject <outboxId>",
      "  operate resend <outboxId>",
      "  operate deliver-outbox",
      "  operate drain [limit]",
      "  operate recover [timestamp]",
      "  operate handoff <request|release> <roomKey> [actor] [reason]",
      "  operate dead-letter [retry <jobId>]",
      "  operate quarantine",
      "  operate mailbox-rebuild <roomKey>",
      "",
      "connect:",
      "  connect providers [provider]",
      "  connect start [emailAddress] [provider]",
      "  connect login                         # interactive wizard for any mailbox",
      "  connect login [imap|password|qq|icloud|yahoo|163|126]",
      "  connect login <gmail|outlook> <accountId> [displayName]",
      "  connect login oauth <gmail|outlook> <accountId> [displayName]",
      "  connect accounts [show <accountId>]",
      "",
      "benchmark:",
      "  benchmark [prompt-footprint]",
      "",
      "compatibility aliases:",
      "  rooms, replay, gateway-trace, gateway, retrieve, recover, drain, deliver-outbox, resend",
      "  approve, reject, approvals, handoff, mailbox, quarantine, dead-letter, conflicts, accounts, memory, login",
      "",
      "gateway:",
      "  gateway resolve <sessionKey> [roomKey]",
      "  gateway bind <sessionKey> <roomKey> [bindingKind] [sourceControlPlane] [workThreadId] [parentMessageId]",
      "  gateway trace <roomKey>",
      "  gateway events <jsonFile>",
      "  gateway import-history <sessionKey> <roomKey> <jsonFile> [sourceControlPlane] [bindingKind] [frontAgentId]",
      "  gateway sync-mail <roomKey> <messageId> [toCsv] [ccCsv] [bccCsv]",
      "  gateway dispatch [roomKey] [limit]"
    ].join("\n") + "\n"
  );
}

function formatConnectSetupKind(kind: ReturnType<typeof listConnectProviderGuides>[number]["setupKind"]) {
  switch (kind) {
    case "browser_oauth":
      return "browser OAuth";
    case "app_password":
      return "IMAP/SMTP app password";
    case "forward_ingest":
      return "forward/raw MIME";
  }
}

function formatOnboardingMatchReason(reason: "provider_hint" | "email_domain" | "default_generic") {
  switch (reason) {
    case "provider_hint":
      return "matched explicit provider hint";
    case "email_domain":
      return "matched mailbox domain";
    case "default_generic":
      return "fell back to generic IMAP";
  }
}

function toUserFacingCliCommand(command: string) {
  return command
    .replace(/^mailctl connect start\b/, "mailclaw onboard")
    .replace(/^mailctl connect login\b/, "mailclaw login")
    .replace(/^mailctl connect providers\b/, "mailclaw providers")
    .replace(/^mailctl connect accounts\b/, "mailclaw accounts")
    .replace(/^mailctl observe accounts\b/, "mailclaw accounts")
    .replace(/^mailctl observe workbench\b/, "mailclaw workbench")
    .replace(/^mailctl observe inboxes\b/, "mailclaw inboxes")
    .replace(/^mailctl observe rooms\b/, "mailclaw rooms")
    .replace(/^mailctl replay\b/, "mailclaw replay");
}

function parseOptionalInteger(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalOriginKinds(value: string | undefined): VirtualMessageOriginKind[] | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(
      (entry): entry is VirtualMessageOriginKind =>
        entry === "provider_mail" || entry === "gateway_chat" || entry === "virtual_internal"
    );

  return parsed.length > 0 ? parsed : undefined;
}

export function createRuntimeFromEnv(options?: {
  gmailOAuthClient?: GmailOAuthClientLike;
  microsoftOAuthClient?: MicrosoftOAuthClientLike;
}): {
  runtime: MailRuntime;
  config: ReturnType<typeof loadConfig>;
  close: () => void;
} {
  const config = loadConfig(process.env);
  const database = initializeDatabase(config);
  const runtime = createMailSidecarRuntime({
    db: database.db,
    config,
    gmailOAuthClient: options?.gmailOAuthClient,
    microsoftOAuthClient: options?.microsoftOAuthClient
  });

  let closed = false;
  const handleProcessExit = () => {
    wrappedRuntime.close();
  };
  const wrappedRuntime = {
    runtime,
    config,
    close() {
      if (closed) {
        return;
      }
      closed = true;
      process.removeListener("exit", handleProcessExit);
      database.close();
    }
  };

  process.once("exit", handleProcessExit);

  return wrappedRuntime;
}

function parseLoginArgs(args: string[]) {
  const values = [...args];
  if (values.length === 0) {
    return {
      provider: "imap",
      accountId: undefined,
      displayName: undefined,
      clientId: undefined,
      clientSecret: undefined,
      loginHint: undefined,
      tenant: undefined,
      topicName: undefined,
      userId: undefined,
      labelIds: undefined,
      scopes: undefined,
      noBrowser: false,
      timeoutSeconds: 300
    };
  }

  let provider: string | undefined;
  if (values[0] === "oauth") {
    provider = values[1];
    values.splice(0, 2);
  } else {
    provider = values.shift();
  }

  if (!provider) {
    return null;
  }

  if (getPasswordPresetProvider(provider)) {
    let accountId: string | undefined;
    let displayName: string | undefined;
    if (values[0] && !values[0]!.startsWith("--")) {
      accountId = values.shift();
    }
    if (values[0] && !values[0]!.startsWith("--")) {
      displayName = values.shift();
    }
    if (values.length > 0) {
      return null;
    }
    return {
      provider,
      accountId,
      displayName,
      clientId: undefined,
      clientSecret: undefined,
      loginHint: undefined,
      tenant: undefined,
      topicName: undefined,
      userId: undefined,
      labelIds: undefined,
      scopes: undefined,
      noBrowser: false,
      timeoutSeconds: 300
    };
  }

  if (!values[0]) {
    return null;
  }

  const accountId = values.shift()!;
  let displayName: string | undefined;
  if (values[0] && !values[0]!.startsWith("--")) {
    displayName = values.shift();
  }

  let clientId: string | undefined;
  let clientSecret: string | undefined;
  let loginHint: string | undefined;
  let tenant: string | undefined;
  let topicName: string | undefined;
  let userId: string | undefined;
  let labelIds: string[] | undefined;
  let scopes: string[] | undefined;
  let noBrowser = false;
  let timeoutSeconds = 300;

  while (values.length > 0) {
    const flag = values.shift();
    switch (flag) {
      case "--client-id":
        clientId = values.shift();
        break;
      case "--client-secret":
        clientSecret = values.shift();
        break;
      case "--login-hint":
        loginHint = values.shift();
        break;
      case "--tenant":
        tenant = values.shift();
        break;
      case "--topic-name":
        topicName = values.shift();
        break;
      case "--user-id":
        userId = values.shift();
        break;
      case "--label-ids":
        labelIds = parseDelimitedStrings(values.shift());
        break;
      case "--scopes":
        scopes = parseDelimitedStrings(values.shift());
        break;
      case "--no-browser":
        noBrowser = true;
        break;
      case "--timeout-seconds": {
        const parsed = parseOptionalInteger(values.shift());
        if (!parsed) {
          return null;
        }
        timeoutSeconds = parsed;
        break;
      }
      default:
        return null;
    }
  }

  return {
    provider,
    accountId,
    displayName,
    clientId,
    clientSecret,
    loginHint,
    tenant,
    topicName,
    userId,
    labelIds,
    scopes,
    noBrowser,
    timeoutSeconds
  };
}

function parseDelimitedStrings(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

async function waitForOAuthCompletion(
  runtime: ReturnType<typeof createMailSidecarRuntime>,
  sessionId: string,
  timeoutMs: number
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const session = runtime.getOAuthLoginSession(sessionId);
    if (session?.status === "completed") {
      const completed = runtime.getOAuthLoginSession(sessionId);
      const accountState = runtime.getPublicAccountProviderState(completed?.accountId ?? "");
      return {
        session: completed,
        account: accountState.account,
        providerState: accountState.summary
      };
    }

    if (session?.status === "failed" || session?.status === "expired") {
      throw new Error(session.errorText ?? `oauth login session ${session.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`timed out waiting for oauth callback after ${Math.ceil(timeoutMs / 1000)}s`);
}

async function openExternalUrl(url: string) {
  const platform = process.platform;
  if (platform === "darwin") {
    await spawnAndWait("open", [url]);
    return;
  }

  if (platform === "win32") {
    await spawnAndWait("cmd", ["/c", "start", "", url]);
    return;
  }

  await spawnAndWait("xdg-open", [url]);
}

function spawnAndWait(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "ignore"
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
      }
    });
  });
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file://").href) {
  void runMailctl(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
