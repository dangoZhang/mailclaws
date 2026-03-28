import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { readSharedFactsState } from "../core/shared-facts.js";
import type { ProjectAggregate, ThreadRoom } from "../core/types.js";
import { normalizeSubject } from "../threading/dedupe.js";
import { getThreadRoom } from "../storage/repositories/thread-rooms.js";
import {
  findProjectAggregateById,
  findProjectAggregateByKey,
  listProjectRoomLinks,
  listRoomProjectLinks,
  upsertProjectAggregate,
  upsertRoomProjectLink
} from "../storage/repositories/project-aggregates.js";

export function maybeBindRoomToProject(input: {
  db: DatabaseSync;
  room: ThreadRoom;
  subject?: string;
  body?: string;
  createdAt: string;
}) {
  const derived = deriveProjectIdentity(input.subject, input.body);
  if (!derived) {
    return null;
  }

  const existing = findProjectAggregateByKey(input.db, {
    accountId: input.room.accountId,
    projectKey: derived.projectKey
  });
  const project = upsertProjectAggregate(input.db, {
    projectId: existing?.projectId ?? randomUUID(),
    accountId: input.room.accountId,
    projectKey: derived.projectKey,
    title: existing?.title ?? derived.title,
    status: existing?.status ?? "open",
    roomCount: existing?.roomCount ?? 0,
    activeRoomCount: existing?.activeRoomCount ?? 0,
    latestSummary: existing?.latestSummary,
    riskSummary: existing?.riskSummary,
    nextAction: existing?.nextAction,
    createdAt: existing?.createdAt ?? input.createdAt,
    updatedAt: input.createdAt
  });

  upsertRoomProjectLink(input.db, {
    projectId: project.projectId,
    roomKey: input.room.roomKey,
    latestRevision: input.room.revision,
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  });

  return refreshProjectAggregate(input.db, project.projectId, input.createdAt);
}

export function refreshProjectAggregate(db: DatabaseSync, projectId: string, now: string) {
  const project = findProjectAggregateById(db, projectId);
  if (!project) {
    return null;
  }

  const links = listProjectRoomLinks(db, projectId);
  const rooms = links
    .map((link) => getThreadRoom(db, link.roomKey))
    .filter((room): room is ThreadRoom => room !== null);
  const sharedFacts = rooms
    .map((room) => ({
      room,
      facts: readSharedFactsState({
        roomKey: room.roomKey,
        sharedFactsRef: room.sharedFactsRef
      })
    }))
    .sort((left, right) =>
      (right.facts?.latestInbound?.receivedAt ?? "").localeCompare(left.facts?.latestInbound?.receivedAt ?? "")
    );
  const latestFacts = sharedFacts
    .map((entry) => entry.facts)
    .find((facts) => facts?.latestResponse?.text || facts?.recommendedActions?.length || facts?.openQuestions?.length) ?? null;
  const activeRoomCount = rooms.filter((room) => !["done", "handoff"].includes(room.state)).length;
  const latestSummary = latestFacts?.latestResponse?.text ?? project.latestSummary;
  const riskSummary = resolveProjectRiskSummary(
    sharedFacts.map((entry) => entry.facts),
    latestSummary,
    project.riskSummary
  );
  const nextAction =
    latestFacts?.recommendedActions?.[0]?.action ??
    extractNextAction(latestSummary) ??
    inferProjectNextAction({
      title: project.title,
      status: activeRoomCount === 0 ? "done" : "open",
      latestSummary
    }) ??
    project.nextAction;

  return upsertProjectAggregate(db, {
    projectId: project.projectId,
    accountId: project.accountId,
    projectKey: project.projectKey,
    title: project.title,
    status: activeRoomCount === 0 ? "done" : "open",
    roomCount: rooms.length,
    activeRoomCount,
    latestSummary,
    riskSummary,
    nextAction,
    createdAt: project.createdAt,
    updatedAt: now
  });
}

export function getRoomProject(db: DatabaseSync, roomKey: string): ProjectAggregate | null {
  const link = listRoomProjectLinks(db, roomKey)[0];
  return link ? findProjectAggregateById(db, link.projectId) : null;
}

export function deriveProjectIdentity(subject?: string, body?: string) {
  const rawSubject = (subject ?? "").trim();
  const normalized = normalizeSubject(rawSubject);
  const subjectPrefix = rawSubject.split(":")[0]?.trim();
  const haystack = `${rawSubject}\n${body ?? ""}`;

  const directMatch =
    haystack.match(/\bproject\s+([a-z0-9][a-z0-9 -]{1,40})/i) ??
    (subjectPrefix && /project/i.test(subjectPrefix) ? [subjectPrefix, subjectPrefix.replace(/^project\s*/i, "")] : null);

  const titleBase =
    (directMatch?.[1] ?? subjectPrefix ?? normalized)
      .replace(/\b(kickoff|status update|weekly report|blocker|timeline|roadmap|follow-up|follow up)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  const projectKey = titleBase
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!projectKey) {
    return null;
  }

  return {
    projectKey,
    title: titleBase
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  };
}

function extractRiskSummary(summary?: string) {
  const labelledRisk = extractLabelledSegment(summary, "risk");
  if (labelledRisk) {
    return labelledRisk;
  }

  if (!summary) {
    return undefined;
  }

  const blockerSentence = summary
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .find((sentence) => /\b(blocker|risk|dependency|escalation)\b/i.test(sentence));

  return blockerSentence && blockerSentence.length > 0 ? blockerSentence : undefined;
}

function resolveProjectRiskSummary(
  factsEntries: Array<ReturnType<typeof readSharedFactsState>>,
  latestSummary?: string,
  fallback?: string
) {
  for (const facts of factsEntries) {
    const openQuestion = facts?.openQuestions?.[0]?.trim();
    if (openQuestion) {
      return openQuestion;
    }

    const conflictKey = facts?.conflicts?.[0]?.key?.trim();
    if (conflictKey) {
      return conflictKey;
    }

    const extracted = extractRiskSummary(facts?.latestResponse?.text);
    if (extracted) {
      return extracted;
    }
  }

  return extractRiskSummary(latestSummary) ?? fallback;
}

function extractNextAction(summary?: string) {
  return (
    extractLabelledSegment(summary, "next action") ??
    extractLabelledSegment(summary, "next actions") ??
    extractLabelledSegment(summary, "action")
  );
}

function extractLabelledSegment(summary: string | undefined, label: string) {
  if (!summary) {
    return undefined;
  }

  const match = summary.match(new RegExp(`${escapeRegExp(label)}\\s*[:.-]\\s*([^.!?\\n]+)`, "i"));
  return match?.[1]?.trim() || undefined;
}

function inferProjectNextAction(input: {
  title: string;
  status: "open" | "done";
  latestSummary?: string;
}) {
  if (input.status === "done") {
    return `Archive ${input.title} and monitor for follow-up.`;
  }
  if (input.latestSummary?.trim()) {
    return `Continue ${input.title} based on the latest room summary.`;
  }
  return `Review ${input.title} and confirm the next owner update.`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
