import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

import type { GatewaySessionBinding, VirtualMessage } from "../core/types.js";
import { toSafeStorageFileName, toSafeStoragePathSegment } from "../storage/path-safety.js";
import { replaceRoomSearchDocumentForVirtualMessage } from "../storage/repositories/room-search-index.js";
import { bindGatewaySessionToRoom, projectGatewayTurnToVirtualMail } from "./projection-adapter.js";

export interface GatewayThreadHistoryTurn {
  sourceMessageId?: string;
  sourceRunId?: string;
  fromPrincipalId: string;
  fromMailboxId: string;
  toMailboxIds: string[];
  ccMailboxIds?: string[];
  kind: VirtualMessage["kind"];
  visibility: VirtualMessage["visibility"];
  subject: string;
  bodyText: string;
  createdAt: string;
  parentMessageId?: string;
}

export interface ImportGatewayThreadHistoryInput {
  stateDir: string;
  roomKey: string;
  sessionKey: string;
  sourceControlPlane: string;
  frontAgentId?: string;
  bindingKind?: GatewaySessionBinding["bindingKind"];
  turns: GatewayThreadHistoryTurn[];
}

export function importGatewayThreadHistory(
  db: DatabaseSync,
  input: ImportGatewayThreadHistoryInput
) {
  bindGatewaySessionToRoom(db, {
    sessionKey: input.sessionKey,
    roomKey: input.roomKey,
    bindingKind: input.bindingKind ?? "room",
    sourceControlPlane: input.sourceControlPlane,
    frontAgentId: input.frontAgentId
  });

  let previousMessageId: string | undefined;

  return input.turns.map((turn, index) => {
    const sourceMessageId = turn.sourceMessageId ?? `${input.sessionKey}-turn-${index + 1}`;
    const bodyRef = persistGatewayTurnBody({
      stateDir: input.stateDir,
      roomKey: input.roomKey,
      sessionKey: input.sessionKey,
      sourceMessageId,
      bodyText: turn.bodyText
    });
    const result = projectGatewayTurnToVirtualMail(db, {
      roomKey: input.roomKey,
      sessionKey: input.sessionKey,
      sourceControlPlane: input.sourceControlPlane,
      sourceMessageId,
      sourceRunId: turn.sourceRunId,
      parentMessageId: turn.parentMessageId ?? previousMessageId,
      fromPrincipalId: turn.fromPrincipalId,
      fromMailboxId: turn.fromMailboxId,
      toMailboxIds: turn.toMailboxIds,
      ccMailboxIds: turn.ccMailboxIds,
      kind: turn.kind,
      visibility: turn.visibility,
      subject: turn.subject,
      bodyRef,
      inputsHash: createHash("sha256")
        .update(turn.subject)
        .update("\n")
        .update(turn.bodyText)
        .digest("hex"),
      createdAt: turn.createdAt
    });

    replaceRoomSearchDocumentForVirtualMessage(db, {
      roomKey: input.roomKey,
      messageId: result.message.messageId,
      title: turn.subject,
      body: turn.bodyText,
      createdAt: turn.createdAt,
      artifactPath: bodyRef
    });
    previousMessageId = result.message.messageId;
    return result;
  });
}

function persistGatewayTurnBody(input: {
  stateDir: string;
  roomKey: string;
  sessionKey: string;
  sourceMessageId: string;
  bodyText: string;
}) {
  const dir = path.join(
    input.stateDir,
    "gateway-history",
    toSafeStoragePathSegment(input.roomKey),
    toSafeStoragePathSegment(input.sessionKey)
  );
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, toSafeStorageFileName(input.sourceMessageId, ".md"));
  fs.writeFileSync(filePath, input.bodyText, "utf8");
  return filePath;
}
