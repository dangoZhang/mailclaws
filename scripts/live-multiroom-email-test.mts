import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { loadConfig } from "../src/config.js";
import { createMailSidecarRuntime } from "../src/orchestration/runtime.js";
import { initializeDatabase } from "../src/storage/db.js";
import { upsertMailAccount } from "../src/storage/repositories/mail-accounts.js";
import { saveThreadRoom } from "../src/storage/repositories/thread-rooms.js";

const execFile = promisify(execFileCallback);

const baseUrl = process.env.MAILCLAW_TEST_BASE_URL?.trim() || "http://127.0.0.1:3031";
const stateDir = process.env.MAILCLAW_STATE_DIR?.trim();
const sqlitePath = process.env.MAILCLAW_SQLITE_PATH?.trim();
const mailboxAddress = process.env.MAILCLAW_LIVE_QQ_ADDRESS?.trim();
const mailboxPassword = process.env.MAILCLAW_LIVE_QQ_AUTH_CODE?.trim();
const roomCount = Number.parseInt(process.env.MAILCLAW_TEST_ROOM_COUNT?.trim() || "4", 10);
const accountId = process.env.MAILCLAW_TEST_ACCOUNT_ID?.trim() || "acct-live-qq";
const templateId = process.env.MAILCLAW_TEST_TEMPLATE_ID?.trim() || "diplomat-front-desk";

if (!stateDir || !sqlitePath) {
  throw new Error("MAILCLAW_STATE_DIR and MAILCLAW_SQLITE_PATH are required");
}

if (!mailboxAddress || !mailboxPassword) {
  throw new Error("MAILCLAW_LIVE_QQ_ADDRESS and MAILCLAW_LIVE_QQ_AUTH_CODE are required");
}

if (!Number.isInteger(roomCount) || roomCount <= 0) {
  throw new Error(`MAILCLAW_TEST_ROOM_COUNT must be a positive integer, received: ${String(roomCount)}`);
}

interface IngestResponse {
  ingested: {
    roomKey: string;
  };
  processed?: {
    status?: string;
  } | null;
}

interface ReplayWorkerSession {
  role: string;
  state: string;
}

interface ReplayOutboxEntry {
  outboxId: string;
  kind: string;
  status: string;
  subject: string;
  textBody: string;
  to: string[];
}

interface ReplayPayload {
  room: {
    roomKey: string;
    state: string;
    frontAgentId?: string;
    frontAgentAddress?: string;
    publicAgentIds?: string[];
    collaboratorAgentIds?: string[];
  } | null;
  workerSessions: ReplayWorkerSession[];
  virtualMessages: Array<{ kind: string; subject: string }>;
  attachments: Array<{ filename: string }>;
  outbox: ReplayOutboxEntry[];
  outboxAttempts: Array<{ outboxId: string; status: string; providerMessageId?: string }>;
}

interface RoomReport {
  roomIndex: number;
  roomKey: string;
  finalOutboxId: string;
  finalStatus: string;
  frontAgentId: string | null;
  workerRoles: string[];
  virtualKinds: string[];
  attachmentNames: string[];
  bodySnippet: string;
}

async function main() {
  await ensureHealthy();
  await upsertMailboxAccount();
  await applyTemplate();

  const queuedRooms = await enqueueScenarioRooms(roomCount);
  const drainResult = await runMailctlJson(["operate", "drain"]);

  const roomReports: RoomReport[] = [];
  for (const queuedRoom of queuedRooms) {
    const replay = await api<ReplayPayload>("GET", `/api/rooms/${encodeURIComponent(queuedRoom.roomKey)}/replay`);
    const finalOutbox = replay.outbox.find((entry) => entry.kind === "final");
    if (!finalOutbox) {
      throw new Error(`room ${queuedRoom.roomKey} did not produce a final outbox item`);
    }

    const workerRoles = [...new Set(replay.workerSessions.map((entry) => entry.role))].sort();
    const virtualKinds = [...new Set(replay.virtualMessages.map((entry) => entry.kind))].sort();
    const attachmentNames = replay.attachments.map((entry) => entry.filename).sort();

    roomReports.push({
      roomIndex: queuedRoom.roomIndex,
      roomKey: queuedRoom.roomKey,
      finalOutboxId: finalOutbox.outboxId,
      finalStatus: finalOutbox.status,
      frontAgentId: replay.room?.frontAgentId ?? null,
      workerRoles,
      virtualKinds,
      attachmentNames,
      bodySnippet: compact(finalOutbox.textBody, 120)
    });
  }

  const reportBody = buildReport({
    baseUrl,
    accountId,
    templateId,
    roomReports,
    drainResult
  });

  const isolatedSummary = await sendSummaryEmailIsolated(reportBody);

  const output = {
    backend: baseUrl,
    accountId,
    templateId,
    roomCount,
    drainProcessedCount: Array.isArray(drainResult.processed) ? drainResult.processed.length : null,
    summaryRoomKey: isolatedSummary.roomKey,
    summaryOutboxId: isolatedSummary.outboxId,
    summaryDelivery: isolatedSummary.delivery,
    summaryOutboxStatus: isolatedSummary.outboxStatus,
    rooms: roomReports
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

async function ensureHealthy() {
  const response = await fetch(`${baseUrl}/healthz`);
  if (!response.ok) {
    throw new Error(`backend health check failed: ${response.status}`);
  }
}

async function upsertMailboxAccount() {
  return api("POST", "/api/accounts", {
    accountId,
    provider: "imap",
    emailAddress: mailboxAddress,
    displayName: "QQ Live",
    status: "active",
    settings: {
      imap: {
        host: "imap.qq.com",
        port: 993,
        secure: true,
        username: mailboxAddress,
        password: mailboxPassword,
        mailbox: "INBOX"
      },
      smtp: {
        host: "smtp.qq.com",
        port: 465,
        secure: true,
        username: mailboxAddress,
        password: mailboxPassword,
        from: mailboxAddress
      }
    }
  });
}

async function applyTemplate() {
  return api("POST", `/api/console/agent-templates/${encodeURIComponent(templateId)}/apply`, {
    accountId
  });
}

async function enqueueScenarioRooms(count: number) {
  const queuedRooms: Array<{ roomIndex: number; roomKey: string }> = [];
  for (let index = 1; index <= count; index += 1) {
    const token = `${Date.now()}-${index}`;
    const response = await api<IngestResponse>("POST", "/api/inbound?processImmediately=false", {
      accountId,
      mailboxAddress,
      envelope: {
        providerMessageId: `live-parallel-provider-${token}`,
        messageId: `<live-parallel-${token}@mailclaws.test>`,
        subject: `Parallel Offline Room ${index}`,
        from: {
          email: `scenario-${index}@example.test`
        },
        to: [{ email: mailboxAddress }],
        text:
          `Parallel room ${index}. ` +
          "Please produce one concise reply that combines pricing and security. " +
          "Use the attachments so workers can split the job and finish offline.",
        attachments: [
          {
            filename: `pricing-${index}.txt`,
            contentType: "text/plain",
            contentBase64: Buffer.from(`Pricing for room ${index}: pilot starts at $12k.`, "utf8").toString("base64")
          },
          {
            filename: `security-${index}.txt`,
            contentType: "text/plain",
            contentBase64: Buffer.from(
              `Security for room ${index}: requires SSO, audit logs, and review.`,
              "utf8"
            ).toString("base64")
          }
        ],
        headers: [
          {
            name: "Message-ID",
            value: `<live-parallel-${token}@mailclaws.test>`
          }
        ]
      }
    });

    queuedRooms.push({
      roomIndex: index,
      roomKey: response.ingested.roomKey
    });
  }
  return queuedRooms;
}

function buildReport(input: {
  baseUrl: string;
  accountId: string;
  templateId: string;
  roomReports: RoomReport[];
  drainResult: Record<string, unknown>;
}) {
  const lines = [
    "MailClaws parallel/offline test report",
    "",
    `Backend: ${input.baseUrl}`,
    `Account: ${input.accountId}`,
    `Template: ${input.templateId}`,
    `Rooms: ${input.roomReports.length}`,
    `Drain processed: ${Array.isArray(input.drainResult.processed) ? input.drainResult.processed.length : "unknown"}`,
    ""
  ];

  for (const report of input.roomReports) {
    lines.push(
      [
        `Room ${report.roomIndex}`,
        `roomKey=${report.roomKey}`,
        `frontAgent=${report.frontAgentId ?? "unknown"}`,
        `outbox=${report.finalOutboxId}`,
        `status=${report.finalStatus}`,
        `workers=${report.workerRoles.join(",") || "none"}`,
        `virtual=${report.virtualKinds.join(",") || "none"}`,
        `attachments=${report.attachmentNames.join(",") || "none"}`,
        `snippet=${report.bodySnippet}`
      ].join(" | ")
    );
  }

  lines.push("");
  lines.push("Result: multi-room parallel queue drain completed and the summary email was queued for real SMTP delivery.");
  return lines.join("\n");
}

async function sendSummaryEmailIsolated(reportBody: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailclaws-summary-send-"));
  const sqlite = path.join(tempDir, "mailclaws.sqlite");
  const reportPath = path.join(tempDir, "report.txt");
  fs.writeFileSync(reportPath, reportBody, "utf8");

  const config = loadConfig({
    ...process.env,
    MAILCLAW_STATE_DIR: tempDir,
    MAILCLAW_SQLITE_PATH: sqlite
  });
  const handle = initializeDatabase(config);
  const runtime = createMailSidecarRuntime({
    db: handle.db,
    config
  });

  try {
    upsertMailAccount(handle.db, {
      accountId: "acct-summary-send",
      provider: "imap",
      emailAddress: mailboxAddress,
      displayName: "QQ Live",
      status: "active",
      settings: {
        imap: {
          host: "imap.qq.com",
          port: 993,
          secure: true,
          username: mailboxAddress,
          password: mailboxPassword,
          mailbox: "INBOX"
        },
        smtp: {
          host: "smtp.qq.com",
          port: 465,
          secure: true,
          username: mailboxAddress,
          password: mailboxPassword,
          from: mailboxAddress
        }
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const roomKey = `hook:mail:acct-summary-send:thread:summary-${Date.now()}`;
    saveThreadRoom(handle.db, {
      roomKey,
      accountId: "acct-summary-send",
      stableThreadId: `summary-${Date.now()}`,
      parentSessionKey: `gateway-summary-${Date.now()}`,
      frontAgentAddress: mailboxAddress,
      state: "idle",
      revision: 1,
      lastInboundSeq: 0,
      lastOutboundSeq: 0
    });
    runtime.upsertVirtualMailbox({
      mailboxId: "internal:assistant:orchestrator",
      accountId: "acct-summary-send",
      principalId: "principal:assistant",
      kind: "internal_role",
      role: "orchestrator",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const finalReady = runtime.submitVirtualMessage({
      roomKey,
      threadKind: "work",
      topic: "Parallel offline live summary",
      fromPrincipalId: "principal:assistant",
      fromMailboxId: "internal:assistant:orchestrator",
      toMailboxIds: ["internal:assistant:orchestrator"],
      kind: "final_ready",
      visibility: "internal",
      subject: "MailClaws Parallel Offline Test Report",
      bodyRef: reportPath,
      roomRevision: 1,
      inputsHash: `summary-${Date.now()}`,
      createdAt: new Date().toISOString()
    });

    const synced = runtime.syncRoomMessageToEmail({
      roomKey,
      messageId: finalReady.message.messageId,
      to: [mailboxAddress]
    });
    const delivery = await runtime.deliverOutbox();
    const replay = runtime.replay(roomKey);
    const outbox = replay.outbox.find((entry) => entry.outboxId === synced.outboxId);

    return {
      roomKey,
      outboxId: synced.outboxId,
      delivery,
      outboxStatus: outbox?.status ?? null
    };
  } finally {
    handle.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runMailctlJson(args: string[]) {
  const { stdout, stderr } = await execFile(
    "pnpm",
    ["--silent", "mailctl", "--json", ...args],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MAILCLAW_STATE_DIR: stateDir,
        MAILCLAW_SQLITE_PATH: sqlitePath
      }
    }
  );

  const payload = stdout.trim();
  if (!payload) {
    throw new Error(`mailctl returned empty stdout${stderr.trim() ? `: ${stderr.trim()}` : ""}`);
  }

  const jsonStart = payload.indexOf("{");
  if (jsonStart < 0) {
    throw new Error(`mailctl did not return JSON: ${payload}`);
  }

  return JSON.parse(payload.slice(jsonStart)) as Record<string, unknown>;
}

async function api<T = unknown>(method: string, pathname: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`${method} ${pathname} failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

function compact(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
