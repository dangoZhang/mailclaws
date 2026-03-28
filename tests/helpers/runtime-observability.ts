import { createMailSidecarRuntime } from "../../src/orchestration/runtime.js";

export function collectRoomObservability(
  runtime: ReturnType<typeof createMailSidecarRuntime>,
  roomKey: string,
  input: {
    accountId?: string;
    agentId?: string;
    mailboxId?: string;
  } = {}
) {
  const replay = runtime.replay(roomKey);
  const accountId = input.accountId ?? replay.room?.accountId;
  const agentId = input.agentId ?? replay.room?.frontAgentAddress;
  const inbox =
    accountId && agentId
      ? runtime.listPublicAgentInboxes(accountId).find((entry) => entry.agentId === agentId) ?? null
      : null;

  return {
    room: replay.room,
    roomRevision: replay.room?.revision ?? 0,
    roomEvents: replay.ledger,
    taskNodes: replay.taskNodes,
    inboxItem: inbox
      ? runtime.getInboxItemForRoom({
          inboxId: inbox.inboxId,
          roomKey
        })
      : null,
    virtualMessages: replay.virtualMessages,
    gatewayProjectionTrace: replay.gatewayProjectionTrace,
    mailboxDeliveries: replay.mailboxDeliveries,
    mailboxView:
      input.mailboxId && replay.room
        ? runtime.projectMailboxView({
            roomKey,
            mailboxId: input.mailboxId
          })
        : [],
    subagentRuns: replay.subagentRuns,
    approvalRequests: replay.approvalRequests,
    approvalTrace: runtime.traceApprovals(roomKey),
    outbox: replay.outbox,
    outboxIntents: replay.outboxIntents,
    deliveryAttempts: replay.outboxAttempts,
    memoryNamespaces: replay.memoryNamespaces,
    attachments: replay.attachments
  };
}
