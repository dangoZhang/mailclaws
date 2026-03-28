import { createHash } from "node:crypto";

import type { PrePacket, RoomPreSnapshot, RoomSharedFactsArtifact } from "./types.js";

export function buildRoomFinalPrePacket(input: {
  roomKey: string;
  roomRevision: number;
  mailboxId: string;
  agentId?: string;
  summary: string;
  sharedFacts: RoomSharedFactsArtifact;
  draftBody?: string;
}) {
  const facts: PrePacket["facts"] = input.sharedFacts.facts.map((fact) => ({
    claim: fact.claim,
    evidenceRef: fact.evidenceRefs[0],
    confidence: fact.evidenceRefs.length > 0 ? "high" : undefined
  }));
  const decisions = input.sharedFacts.recommendedActions.map((action) => `${action.role}: ${action.action}`);
  const requestedActions = input.sharedFacts.recommendedActions.map((action) => action.action);
  const inputsHash = createHash("sha256")
    .update(input.summary)
    .update("\n")
    .update(JSON.stringify(facts))
    .update("\n")
    .update(JSON.stringify(input.sharedFacts.openQuestions))
    .update("\n")
    .update(JSON.stringify(decisions))
    .digest("hex");

  return {
    kind: "final",
    audience: "external",
    summary: input.summary.trim(),
    facts,
    openQuestions: [...input.sharedFacts.openQuestions],
    decisions,
    commitments: [],
    requestedActions,
    draftBody: input.draftBody?.trim() || input.summary.trim(),
    roomRevision: input.roomRevision,
    inputsHash,
    createdBy: {
      mailboxId: input.mailboxId,
      agentId: input.agentId
    }
  } satisfies PrePacket;
}

export function createRoomPreSnapshot(input: {
  snapshotId: string;
  roomKey: string;
  createdAt: string;
  packet: PrePacket;
}): RoomPreSnapshot {
  return {
    snapshotId: input.snapshotId,
    roomKey: input.roomKey,
    createdAt: input.createdAt,
    ...input.packet
  };
}

export function buildRoomPreSnapshotId(input: {
  roomKey: string;
  roomRevision: number;
  kind: PrePacket["kind"];
}) {
  const roomToken = createHash("sha256").update(input.roomKey).digest("hex").slice(0, 12);
  return `pre-${roomToken}-r${input.roomRevision}-${input.kind}`;
}
