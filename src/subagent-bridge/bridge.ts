import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { AppConfig } from "../config.js";
import {
  consumeMailbox,
  consumeMailboxDelivery,
  markVirtualMessageStale,
  replyVirtualMessage
} from "../core/virtual-mail.js";
import type { MailboxDelivery, SubAgentRun, SubAgentTarget, VirtualMessage } from "../core/types.js";
import { getThreadRoom } from "../storage/repositories/thread-rooms.js";
import { getVirtualMailbox } from "../storage/repositories/virtual-mailboxes.js";
import { getVirtualMessage } from "../storage/repositories/virtual-messages.js";
import { appendThreadLedgerEvent } from "../storage/repositories/thread-ledger.js";
import { persistSubAgentArtifact } from "../storage/artifacts.js";
import {
  findLatestSubAgentRunForThread,
  insertSubAgentRun,
  listSubAgentRunsForRoom,
  updateSubAgentRun
} from "../storage/repositories/subagent-runs.js";
import { getSubAgentTargetByMailboxId } from "../storage/repositories/subagent-targets.js";
import { getMailboxDelivery, insertMailboxDelivery } from "../storage/repositories/mailbox-deliveries.js";
import type { OpenClawSubAgentTransport, WatchBurstSubAgentResult } from "./openclaw.js";
import { buildSubAgentSessionKey } from "../threading/session-key.js";
import {
  normalizeSubAgentReply,
  resolveNormalizedSubAgentMessageKind
} from "./normalizer.js";
import { bindGatewaySessionToRoom } from "../gateway/projection-adapter.js";

export interface DispatchSubAgentMailboxInput {
  mailboxId: string;
  consumerId: string;
  batchSize?: number;
  roomKey?: string;
  now?: string;
  leaseDurationMs?: number;
}

export interface DispatchSubAgentMailboxResult {
  delivery: MailboxDelivery;
  run: SubAgentRun;
  resultMessageId?: string;
}

export async function dispatchSubAgentMailbox(
  db: DatabaseSync,
  config: AppConfig,
  transport: OpenClawSubAgentTransport,
  input: DispatchSubAgentMailboxInput
): Promise<DispatchSubAgentMailboxResult[]> {
  if (!inferMailboxAccountId(db, input.mailboxId)) {
    throw new Error(`virtual mailbox not found: ${input.mailboxId}`);
  }

  const target = requireTarget(db, input.mailboxId);
  if (!target.enabled) {
    return [];
  }

  const deliveries = consumeMailbox(db, {
    mailboxId: input.mailboxId,
    consumerId: input.consumerId,
    batchSize: input.batchSize ?? 1,
    roomKey: input.roomKey,
    now: input.now,
    leaseDurationMs: input.leaseDurationMs
  });

  const results: DispatchSubAgentMailboxResult[] = [];
  for (const delivery of deliveries) {
    results.push(
      await processSubAgentDelivery(db, config, transport, {
        target,
        delivery,
        consumerId: input.consumerId
      })
    );
  }

  return results;
}

async function processSubAgentDelivery(
  db: DatabaseSync,
  config: AppConfig,
  transport: OpenClawSubAgentTransport,
  input: {
    target: SubAgentTarget;
    delivery: MailboxDelivery;
    consumerId: string;
  }
): Promise<DispatchSubAgentMailboxResult> {
  const taskMessage = getVirtualMessage(db, input.delivery.messageId);
  if (!taskMessage) {
    throw new Error(`virtual message not found: ${input.delivery.messageId}`);
  }
  if (taskMessage.kind !== "task") {
    throw new Error(`subagent mailbox ${input.target.mailboxId} only accepts task messages`);
  }
  if (taskMessage.fromMailboxId.startsWith("subagent:")) {
    throw new Error("nested subagent delegation is disabled");
  }

  const room = getThreadRoom(db, taskMessage.roomKey);
  if (!room) {
    throw new Error(`thread room not found: ${taskMessage.roomKey}`);
  }

  const activeRuns = listSubAgentRunsForRoom(db, room.roomKey).filter(
    (run) =>
      run.targetId === input.target.targetId &&
      run.workThreadId === taskMessage.threadId &&
      (run.status === "accepted" || run.status === "running")
  );
  if (activeRuns.length >= input.target.maxActivePerRoom) {
    throw new Error(
      `subagent target ${input.target.targetId} exceeded max active per room for thread ${taskMessage.threadId}`
    );
  }

  const childInputText = buildSubAgentInput(taskMessage, room.parentSessionKey);
  let run: SubAgentRun;
  let watched: Awaited<ReturnType<typeof watchSubAgentRun>>;
  try {
    run =
      input.target.mode === "bound"
        ? createBoundSubAgentRun(db, {
            room,
            taskMessage,
            target: input.target,
            inputText: childInputText,
            now: input.delivery.updatedAt ?? input.delivery.createdAt
          })
        : await createBurstSubAgentRun(db, transport, {
            room,
            taskMessage,
            target: input.target,
            inputText: childInputText
          });
    watched =
      input.target.mode === "bound"
        ? await runBoundSubAgentRun(db, config, transport, {
            roomKey: room.roomKey,
            run,
            taskMessage,
            target: input.target
          })
        : await watchSubAgentRun(db, config, transport, {
            roomKey: room.roomKey,
            run,
            taskMessage,
            target: input.target
          });
  } catch (error) {
    insertMailboxDelivery(db, {
      ...input.delivery,
      status: "blocked",
      leaseOwner: undefined,
      leaseUntil: undefined,
      updatedAt: new Date().toISOString()
    });
    throw error;
  }

  const currentDelivery = getMailboxDelivery(db, input.delivery.deliveryId);
  if (
    currentDelivery &&
    currentDelivery.status !== "stale" &&
    currentDelivery.status !== "vetoed" &&
    currentDelivery.status !== "superseded" &&
    currentDelivery.status !== "consumed"
  ) {
    consumeMailboxDelivery(db, {
      deliveryId: input.delivery.deliveryId,
      consumerId: input.consumerId,
      consumedAt: watched.run.completedAt ?? watched.run.updatedAt
    });
  }

  return {
    delivery: input.delivery,
    run: watched.run,
    resultMessageId: watched.resultMessageId
  };
}

async function createBurstSubAgentRun(
  db: DatabaseSync,
  transport: OpenClawSubAgentTransport,
  input: {
    room: NonNullable<ReturnType<typeof getThreadRoom>>;
    taskMessage: VirtualMessage;
    target: SubAgentTarget;
    inputText: string;
  }
) {
  const accepted = await transport.spawnBurst({
    parentSessionKey: input.room.parentSessionKey,
    targetAgentId: input.target.openClawAgentId,
    inputText: input.inputText,
    model: input.target.model,
    thinking: input.target.thinking,
    timeoutSeconds: input.target.runTimeoutSeconds,
    sandboxMode: input.target.sandboxMode
  });

  return persistAcceptedRun(db, {
    roomKey: input.room.roomKey,
    taskMessage: input.taskMessage,
    target: input.target,
    runId: accepted.runId,
    childSessionKey: accepted.childSessionKey,
    childSessionId: accepted.childSessionId,
    startedAt: accepted.acceptedAt,
    request: accepted.request.body
  });
}

function createBoundSubAgentRun(
  db: DatabaseSync,
  input: {
    room: NonNullable<ReturnType<typeof getThreadRoom>>;
    taskMessage: VirtualMessage;
    target: SubAgentTarget;
    inputText: string;
    now: string;
  }
) {
  const latestRun = findLatestSubAgentRunForThread(db, {
    roomKey: input.room.roomKey,
    targetId: input.target.targetId,
    workThreadId: input.taskMessage.threadId
  });
  const childSessionKey = resolveBoundChildSessionKey({
    room: input.room,
    taskMessage: input.taskMessage,
    target: input.target,
    latestRun,
    now: input.now
  });
  const startedAt = input.now;

  return persistAcceptedRun(db, {
    roomKey: input.room.roomKey,
    taskMessage: input.taskMessage,
    target: input.target,
    runId: randomUUID(),
    childSessionKey,
    childSessionId: latestRun?.childSessionKey === childSessionKey ? latestRun.childSessionId : undefined,
    startedAt,
    request: {
      mode: "bound",
      childSessionKey,
      targetAgentId: input.target.openClawAgentId,
      ...(latestRun ? { priorRunId: latestRun.runId } : {})
    }
  });
}

function persistAcceptedRun(
  db: DatabaseSync,
  input: {
    roomKey: string;
    taskMessage: VirtualMessage;
    target: SubAgentTarget;
    runId: string;
    childSessionKey: string;
    childSessionId?: string;
    startedAt: string;
    request: Record<string, unknown>;
  }
) {
  const run: SubAgentRun = {
    runId: input.runId,
    roomKey: input.roomKey,
    workThreadId: input.taskMessage.threadId,
    parentMessageId: input.taskMessage.messageId,
    targetId: input.target.targetId,
    childSessionKey: input.childSessionKey,
    childSessionId: input.childSessionId,
    roomRevision: input.taskMessage.roomRevision,
    inputsHash: input.taskMessage.inputsHash,
    status: "accepted",
    request: input.request,
    startedAt: input.startedAt,
    createdAt: input.startedAt,
    updatedAt: input.startedAt
  };
  insertSubAgentRun(db, run);
  bindGatewaySessionToRoom(db, {
    sessionKey: run.childSessionKey,
    roomKey: input.roomKey,
    bindingKind: "subagent",
    workThreadId: run.workThreadId,
    parentMessageId: run.parentMessageId,
    sourceControlPlane: "openclaw",
    frontAgentId: input.target.openClawAgentId,
    now: input.startedAt
  });
  appendThreadLedgerEvent(db, {
    roomKey: input.roomKey,
    revision: input.taskMessage.roomRevision,
    type: "subagent.run.accepted",
    payload: {
      runId: run.runId,
      targetId: input.target.targetId,
      mailboxId: input.target.mailboxId,
      parentMessageId: input.taskMessage.messageId,
      childSessionKey: run.childSessionKey,
      mode: input.target.mode
    }
  });

  return run;
}

async function watchSubAgentRun(
  db: DatabaseSync,
  config: AppConfig,
  transport: OpenClawSubAgentTransport,
  input: {
    roomKey: string;
    run: SubAgentRun;
    taskMessage: VirtualMessage;
    target: SubAgentTarget;
  }
) {
  let watched: WatchBurstSubAgentResult;
  try {
    updateSubAgentRun(db, input.run.runId, {
      status: "running",
      updatedAt: new Date().toISOString()
    });
    watched = await transport.watchBurst({
      childSessionKey: input.run.childSessionKey,
      runId: input.run.runId
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    const errorText = error instanceof Error ? error.message : String(error);
    const latestRoom = getThreadRoom(db, input.roomKey);
    const stale = (latestRoom?.revision ?? input.taskMessage.roomRevision) > input.taskMessage.roomRevision;
    updateSubAgentRun(db, input.run.runId, {
      status: stale ? "stale" : "failed",
      errorText,
      completedAt,
      updatedAt: completedAt
    });
    appendThreadLedgerEvent(db, {
      roomKey: input.roomKey,
      revision: stale ? (latestRoom?.revision ?? input.taskMessage.roomRevision) : input.taskMessage.roomRevision,
      type: stale ? "subagent.run.stale" : "subagent.run.failed",
      payload: {
        runId: input.run.runId,
        targetId: input.target.targetId,
        parentMessageId: input.taskMessage.messageId,
        errorText,
        ...(stale ? { supersededByRevision: latestRoom?.revision } : {})
      }
    });
    const resultMessageId = emitSubAgentReply(db, config, {
      taskMessage: input.taskMessage,
      target: input.target,
      childSessionKey: input.run.childSessionKey,
      childSessionId: input.run.childSessionId,
      runId: input.run.runId,
      watched: {
        status: "failed",
        responseText: errorText,
        completedAt,
        request: {
          url: "",
          method: "GET",
          headers: {}
        }
      },
      stale,
      supersededByRevision: latestRoom?.revision
    });
    updateSubAgentRun(db, input.run.runId, {
      status: stale ? "stale" : "failed",
      resultMessageId,
      errorText,
      completedAt,
      updatedAt: completedAt
    });

    return {
      run: {
        ...input.run,
        status: stale ? ("stale" as const) : ("failed" as const),
        resultMessageId,
        errorText,
        completedAt,
        updatedAt: completedAt
      },
      resultMessageId
    };
  }

  const latestRoom = getThreadRoom(db, input.roomKey);
  const stale = (latestRoom?.revision ?? input.taskMessage.roomRevision) > input.taskMessage.roomRevision;
  if (stale) {
    markVirtualMessageStale(db, {
      messageId: input.taskMessage.messageId,
      supersededByRevision: latestRoom?.revision,
      staleAt: watched.completedAt
    });
  }

  const resultMessageId = emitSubAgentReply(db, config, {
    taskMessage: input.taskMessage,
    target: input.target,
    childSessionKey: input.run.childSessionKey,
    childSessionId: watched.childSessionId ?? input.run.childSessionId,
    runId: input.run.runId,
    watched: stale ? { ...watched, status: "failed", responseText: watched.responseText } : watched,
    stale,
    supersededByRevision: latestRoom?.revision
  });

  const finalStatus: SubAgentRun["status"] =
    stale ? "stale" : watched.status === "timeout" ? "timeout" : watched.status === "failed" ? "failed" : "completed";
  updateSubAgentRun(db, input.run.runId, {
    status: finalStatus,
    resultMessageId,
    ...(watched.status === "failed" ? { errorText: watched.responseText } : {}),
    announceSummary: watched.announceSummary,
    completedAt: watched.completedAt,
    updatedAt: watched.completedAt
  });
  appendThreadLedgerEvent(db, {
    roomKey: input.roomKey,
    revision: stale ? (latestRoom?.revision ?? input.taskMessage.roomRevision) : input.taskMessage.roomRevision,
    type: stale ? "subagent.run.stale" : watched.status === "failed" ? "subagent.run.failed" : "subagent.run.completed",
    payload: {
      runId: input.run.runId,
      targetId: input.target.targetId,
      parentMessageId: input.taskMessage.messageId,
      resultMessageId,
      childSessionKey: input.run.childSessionKey,
      ...(stale ? { supersededByRevision: latestRoom?.revision } : {}),
      ...(watched.announceSummary ? { announceSummary: watched.announceSummary } : {})
    }
  });

  return {
    run: {
      ...input.run,
      childSessionId: watched.childSessionId ?? input.run.childSessionId,
      status: finalStatus,
      resultMessageId,
      announceSummary: watched.announceSummary,
      ...(watched.status === "failed" ? { errorText: watched.responseText } : {}),
      completedAt: watched.completedAt,
      updatedAt: watched.completedAt
    },
    resultMessageId
  };
}

async function runBoundSubAgentRun(
  db: DatabaseSync,
  config: AppConfig,
  transport: OpenClawSubAgentTransport,
  input: {
    roomKey: string;
    run: SubAgentRun;
    taskMessage: VirtualMessage;
    target: SubAgentTarget;
  }
) {
  let watched: WatchBurstSubAgentResult;
  try {
    updateSubAgentRun(db, input.run.runId, {
      status: "running",
      updatedAt: new Date().toISOString()
    });
    watched = await transport.runBound({
      childSessionKey: input.run.childSessionKey,
      targetAgentId: input.target.openClawAgentId,
      inputText: buildSubAgentInput(input.taskMessage, input.run.childSessionKey),
      model: input.target.model,
      thinking: input.target.thinking,
      sandboxMode: input.target.sandboxMode
    });
  } catch (error) {
    const completedAt = new Date().toISOString();
    const errorText = error instanceof Error ? error.message : String(error);
    const latestRoom = getThreadRoom(db, input.roomKey);
    const stale = (latestRoom?.revision ?? input.taskMessage.roomRevision) > input.taskMessage.roomRevision;
    updateSubAgentRun(db, input.run.runId, {
      status: stale ? "stale" : "failed",
      errorText,
      completedAt,
      updatedAt: completedAt
    });
    appendThreadLedgerEvent(db, {
      roomKey: input.roomKey,
      revision: stale ? (latestRoom?.revision ?? input.taskMessage.roomRevision) : input.taskMessage.roomRevision,
      type: stale ? "subagent.run.stale" : "subagent.run.failed",
      payload: {
        runId: input.run.runId,
        targetId: input.target.targetId,
        parentMessageId: input.taskMessage.messageId,
        childSessionKey: input.run.childSessionKey,
        errorText,
        mode: "bound",
        ...(stale ? { supersededByRevision: latestRoom?.revision } : {})
      }
    });
    const resultMessageId = emitSubAgentReply(db, config, {
      taskMessage: input.taskMessage,
      target: input.target,
      childSessionKey: input.run.childSessionKey,
      childSessionId: input.run.childSessionId,
      runId: input.run.runId,
      watched: {
        status: "failed",
        responseText: errorText,
        completedAt,
        request: {
          url: "",
          method: "POST",
          headers: {},
          body: {
            mode: "bound",
            childSessionKey: input.run.childSessionKey
          }
        }
      },
      stale,
      supersededByRevision: latestRoom?.revision
    });
    updateSubAgentRun(db, input.run.runId, {
      status: stale ? "stale" : "failed",
      resultMessageId,
      errorText,
      completedAt,
      updatedAt: completedAt
    });

    return {
      run: {
        ...input.run,
        status: stale ? ("stale" as const) : ("failed" as const),
        resultMessageId,
        errorText,
        completedAt,
        updatedAt: completedAt
      },
      resultMessageId
    };
  }

  const latestRoom = getThreadRoom(db, input.roomKey);
  const stale = (latestRoom?.revision ?? input.taskMessage.roomRevision) > input.taskMessage.roomRevision;
  if (stale) {
    markVirtualMessageStale(db, {
      messageId: input.taskMessage.messageId,
      supersededByRevision: latestRoom?.revision,
      staleAt: watched.completedAt
    });
  }

  const resultMessageId = emitSubAgentReply(db, config, {
    taskMessage: input.taskMessage,
    target: input.target,
    childSessionKey: input.run.childSessionKey,
    childSessionId: watched.childSessionId ?? input.run.childSessionId,
    runId: input.run.runId,
    watched: stale ? { ...watched, status: "failed", responseText: watched.responseText } : watched,
    stale,
    supersededByRevision: latestRoom?.revision
  });
  const finalStatus: SubAgentRun["status"] =
    stale ? "stale" : watched.status === "timeout" ? "timeout" : watched.status === "failed" ? "failed" : "completed";
  updateSubAgentRun(db, input.run.runId, {
    status: finalStatus,
    childSessionId: watched.childSessionId ?? input.run.childSessionId,
    resultMessageId,
    ...(watched.status === "failed" ? { errorText: watched.responseText } : {}),
    announceSummary: watched.announceSummary,
    completedAt: watched.completedAt,
    updatedAt: watched.completedAt
  });
  appendThreadLedgerEvent(db, {
    roomKey: input.roomKey,
    revision: stale ? (latestRoom?.revision ?? input.taskMessage.roomRevision) : input.taskMessage.roomRevision,
    type: stale ? "subagent.run.stale" : watched.status === "failed" ? "subagent.run.failed" : "subagent.run.completed",
    payload: {
      runId: input.run.runId,
      targetId: input.target.targetId,
      parentMessageId: input.taskMessage.messageId,
      resultMessageId,
      childSessionKey: input.run.childSessionKey,
      mode: "bound",
      ...(stale ? { supersededByRevision: latestRoom?.revision } : {}),
      ...(watched.announceSummary ? { announceSummary: watched.announceSummary } : {})
    }
  });

  return {
    run: {
      ...input.run,
      childSessionId: watched.childSessionId ?? input.run.childSessionId,
      status: finalStatus,
      resultMessageId,
      announceSummary: watched.announceSummary,
      ...(watched.status === "failed" ? { errorText: watched.responseText } : {}),
      completedAt: watched.completedAt,
      updatedAt: watched.completedAt
    },
    resultMessageId
  };
}

function emitSubAgentReply(
  db: DatabaseSync,
  config: AppConfig,
  input: {
    taskMessage: VirtualMessage;
    target: SubAgentTarget;
    childSessionKey: string;
    childSessionId?: string;
    runId: string;
    watched: WatchBurstSubAgentResult;
    stale?: boolean;
    supersededByRevision?: number;
  }
) {
  const room = getThreadRoom(db, input.taskMessage.roomKey);
  if (!room) {
    throw new Error(`thread room not found: ${input.taskMessage.roomKey}`);
  }

  const normalized = normalizeSubAgentReply(input.watched.responseText, {
    resultSchema: input.target.resultSchema,
    status: input.stale
      ? "stale"
      : input.watched.status === "timeout"
        ? "timeout"
        : input.watched.status === "failed"
          ? "failed"
          : "completed",
    fallbackSummary:
      input.stale && input.supersededByRevision
        ? `Subagent result became stale at room revision ${input.supersededByRevision}.`
        : undefined
  });
  const artifactPath = persistSubAgentArtifact(config, {
    accountId: room.accountId,
    stableThreadId: room.stableThreadId,
    runId: input.runId,
    payload: {
      normalized,
      child: {
        runId: input.runId,
        sessionKey: input.childSessionKey,
        sessionId: input.childSessionId
      },
      announceSummary: input.watched.announceSummary,
      rawResponseText: input.watched.responseText
    }
  });
  const artifactRefs = Array.from(
    new Set(normalized.facts.flatMap((fact) => (fact.evidenceRef ? [fact.evidenceRef] : [])))
  );
  const memoryRefs = [`subagent-run:${input.runId}`, `child-session:${input.childSessionKey}`];
  const resultMessage = replyVirtualMessage(db, input.taskMessage.messageId, {
    fromPrincipalId: getVirtualMailbox(db, input.target.mailboxId)?.principalId ?? input.target.targetId,
    fromMailboxId: input.target.mailboxId,
    toMailboxIds: [input.taskMessage.fromMailboxId],
    kind: resolveNormalizedSubAgentMessageKind(input.target.resultSchema, normalized.status),
    visibility: "internal",
    originKind: "gateway_chat",
    projectionMetadata: {
      origin: {
        kind: "gateway_chat",
        controlPlane: "openclaw",
        sessionKey: input.childSessionKey,
        runId: input.runId,
        frontAgentId: input.target.openClawAgentId,
        sourceMessageId: input.taskMessage.messageId
      }
    },
    subject: `${input.target.targetId} result`,
    bodyRef: artifactPath,
    artifactRefs,
    memoryRefs,
    roomRevision: input.stale ? (room.revision ?? input.taskMessage.roomRevision) : input.taskMessage.roomRevision,
    inputsHash: hashSubAgentResult(input.taskMessage.inputsHash, input.runId, normalized.summary),
    createdAt: input.watched.completedAt
  });

  return resultMessage.message.messageId;
}

function buildSubAgentInput(taskMessage: VirtualMessage, parentSessionKey: string) {
  return [
    "You are handling an internal MailClaws subagent task.",
    "You are a single-run compute worker. Do not assume a durable SOUL.md, identity memory, or long-lived mailbox persona.",
    "Return only internal analysis output. Never send external email or invoke external side effects.",
    "Your result only becomes business truth after MailClaws normalizes it into a single-parent internal reply mail.",
    "Respond with JSON when possible: { summary, status, facts[], openQuestions[], recommendedAction, draftReply }.",
    `Parent or child session: ${parentSessionKey}`,
    `Task message id: ${taskMessage.messageId}`,
    `Room revision: ${taskMessage.roomRevision}`,
    `Subject: ${taskMessage.subject}`,
    `Body ref: ${taskMessage.bodyRef}`,
    `Artifact refs: ${taskMessage.artifactRefs.join(", ") || "(none)"}`,
    `Memory refs: ${taskMessage.memoryRefs.join(", ") || "(none)"}`
  ].join("\n");
}

function inferMailboxAccountId(db: DatabaseSync, mailboxId: string) {
  return getVirtualMailbox(db, mailboxId)?.accountId;
}

function requireTarget(db: DatabaseSync, mailboxId: string) {
  const target = getSubAgentTargetByMailboxId(db, mailboxId);
  if (!target) {
    throw new Error(`subagent target not found for mailbox ${mailboxId}`);
  }
  if (target.mode !== "burst" && target.mode !== "bound") {
    throw new Error(`subagent target ${target.targetId} requires unsupported mode ${target.mode}`);
  }
  if (target.allowExternalSend) {
    throw new Error(`subagent target ${target.targetId} cannot allow external send`);
  }
  return target;
}

function resolveBoundChildSessionKey(input: {
  room: NonNullable<ReturnType<typeof getThreadRoom>>;
  taskMessage: VirtualMessage;
  target: SubAgentTarget;
  latestRun: SubAgentRun | null;
  now: string;
}) {
  const baseKey = buildSubAgentSessionKey(
    input.room.accountId,
    input.room.stableThreadId,
    input.taskMessage.threadId,
    input.target.targetId,
    "hook:mail",
    input.room.frontAgentAddress
  );

  if (!input.latestRun) {
    return baseKey;
  }
  if (boundSessionExpired(input.latestRun, input.target, input.now)) {
    return buildRespawnSessionKey(baseKey, input.latestRun.childSessionKey);
  }
  if (input.latestRun.status === "failed" || input.latestRun.status === "timeout") {
    return buildRespawnSessionKey(baseKey, input.latestRun.childSessionKey);
  }

  return input.latestRun.childSessionKey;
}

function buildRespawnSessionKey(baseKey: string, latestChildSessionKey: string) {
  const match = latestChildSessionKey.match(/:respawn:(\d+)$/);
  const nextAttempt = match ? Number.parseInt(match[1] ?? "0", 10) + 1 : 1;
  return `${baseKey}:respawn:${nextAttempt}`;
}

function boundSessionExpired(run: SubAgentRun, target: SubAgentTarget, now: string) {
  const ttlSeconds = target.boundSessionTtlSeconds;
  if (typeof ttlSeconds !== "number" || ttlSeconds <= 0) {
    return false;
  }

  const lastActiveAt = run.completedAt ?? run.updatedAt ?? run.startedAt;
  return Date.parse(now) - Date.parse(lastActiveAt) >= ttlSeconds * 1000;
}

function hashSubAgentResult(inputsHash: string, runId: string, summary: string) {
  return createHash("sha256").update(inputsHash).update("\n").update(runId).update("\n").update(summary).digest("hex");
}
