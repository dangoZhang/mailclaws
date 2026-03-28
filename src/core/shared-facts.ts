import fs from "node:fs";
import path from "node:path";

import type {
  RoomSharedFactConflict,
  RoomSharedFactsArtifact,
  SharedFactConflictAcknowledgement
} from "./types.js";

export interface SharedFactsConflictList {
  roomKey: string;
  sharedFactsRef: string;
  conflictCount: number;
  conflicts: RoomSharedFactConflict[];
}

export function listSharedFactConflicts(input: {
  roomKey: string;
  sharedFactsRef?: string;
}): SharedFactsConflictList {
  const sharedFacts = readSharedFactsState(input);
  if (!sharedFacts) {
    return {
      roomKey: input.roomKey,
      sharedFactsRef: input.sharedFactsRef ?? "",
      conflictCount: 0,
      conflicts: []
    };
  }

  return {
    roomKey: sharedFacts.roomKey,
    sharedFactsRef: input.sharedFactsRef ?? "",
    conflictCount: sharedFacts.conflicts.length,
    conflicts: sharedFacts.conflicts
  };
}

export function readSharedFactsState(input: {
  roomKey?: string;
  sharedFactsRef?: string;
}): RoomSharedFactsArtifact | null {
  const sharedFactsRef = input.sharedFactsRef;
  if (!sharedFactsRef || !fs.existsSync(sharedFactsRef)) {
    return null;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(sharedFactsRef, "utf8")) as RoomSharedFactsArtifact;
    const acknowledgementsByConflict = groupAcknowledgementsByConflictKey(
      listSharedFactConflictAcknowledgements({
        roomKey: input.roomKey ?? payload.roomKey,
        sharedFactsRef
      })
    );

    return {
      ...payload,
      roomKey: payload.roomKey ?? input.roomKey ?? "",
      facts: Array.isArray(payload.facts) ? payload.facts : [],
      conflicts: normalizeSharedFactConflicts(payload.conflicts, acknowledgementsByConflict),
      openQuestions: Array.isArray(payload.openQuestions) ? payload.openQuestions : [],
      recommendedActions: Array.isArray(payload.recommendedActions) ? payload.recommendedActions : [],
      workerSummaries: Array.isArray(payload.workerSummaries) ? payload.workerSummaries : [],
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      latestResponse: payload.latestResponse ?? null
    };
  } catch {
    return null;
  }
}

export function acknowledgeSharedFactConflict(input: {
  roomKey: string;
  conflictKey: string;
  note: string;
  sharedFactsRef?: string;
  acknowledgedAt?: string;
}) {
  const conflicts = listSharedFactConflicts({
    roomKey: input.roomKey,
    sharedFactsRef: input.sharedFactsRef
  });

  const matchingConflict = conflicts.conflicts.find((conflict) => conflict.key === input.conflictKey);
  if (!matchingConflict) {
    throw new Error(`shared facts conflict not found: ${input.conflictKey}`);
  }

  const acknowledgedAt = input.acknowledgedAt ?? new Date().toISOString();
  const resolution: SharedFactConflictAcknowledgement = {
    roomKey: input.roomKey,
    conflictKey: input.conflictKey,
    status: "acknowledged",
    note: input.note.trim(),
    sharedFactsRef: conflicts.sharedFactsRef,
    acknowledgedAt
  };

  const resolutionPath = path.join(
    resolveSharedFactsRoot(conflicts.sharedFactsRef),
    "resolutions",
    `${sanitizeFileComponent(input.conflictKey)}-${sanitizeFileComponent(acknowledgedAt)}.json`
  );
  fs.mkdirSync(path.dirname(resolutionPath), { recursive: true });
  fs.writeFileSync(resolutionPath, JSON.stringify(resolution, null, 2), "utf8");

  return {
    ...resolution,
    resolutionPath
  };
}

function listSharedFactConflictAcknowledgements(input: {
  roomKey: string;
  sharedFactsRef: string;
}) {
  const resolutionsDir = path.join(resolveSharedFactsRoot(input.sharedFactsRef), "resolutions");
  if (!fs.existsSync(resolutionsDir)) {
    return [] as SharedFactConflictAcknowledgement[];
  }

  return fs
    .readdirSync(resolutionsDir)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .flatMap((entry) => {
      const resolutionPath = path.join(resolutionsDir, entry);

      try {
        const payload = JSON.parse(fs.readFileSync(resolutionPath, "utf8")) as SharedFactConflictAcknowledgement;
        if (
          payload?.status !== "acknowledged" ||
          typeof payload.conflictKey !== "string" ||
          payload.conflictKey.trim().length === 0
        ) {
          return [];
        }

        return [
          {
            ...payload,
            roomKey: payload.roomKey ?? input.roomKey,
            sharedFactsRef: payload.sharedFactsRef ?? input.sharedFactsRef,
            resolutionPath
          }
        ];
      } catch {
        return [];
      }
    });
}

function resolveSharedFactsRoot(sharedFactsRef: string) {
  const parentDir = path.dirname(sharedFactsRef);
  return path.basename(parentDir) === "history" ? path.dirname(parentDir) : parentDir;
}

function groupAcknowledgementsByConflictKey(
  acknowledgements: SharedFactConflictAcknowledgement[]
) {
  const grouped = new Map<string, SharedFactConflictAcknowledgement[]>();

  for (const acknowledgement of acknowledgements) {
    const existing = grouped.get(acknowledgement.conflictKey) ?? [];
    existing.push(acknowledgement);
    existing.sort((left, right) => left.acknowledgedAt.localeCompare(right.acknowledgedAt));
    grouped.set(acknowledgement.conflictKey, existing);
  }

  return grouped;
}

function normalizeSharedFactConflicts(
  conflicts: RoomSharedFactsArtifact["conflicts"],
  acknowledgementsByConflict: Map<string, SharedFactConflictAcknowledgement[]>
) {
  if (!Array.isArray(conflicts)) {
    return [];
  }

  return conflicts.map((conflict) => {
    const persistedAcknowledgements = Array.isArray(conflict.acknowledgements)
      ? conflict.acknowledgements
      : [];
    const fileAcknowledgements = acknowledgementsByConflict.get(conflict.key) ?? [];
    const acknowledgements = dedupeAcknowledgements([
      ...persistedAcknowledgements,
      ...fileAcknowledgements
    ]);

    return {
      key: conflict.key,
      claims: Array.isArray(conflict.claims) ? conflict.claims : [],
      status: acknowledgements.length > 0 ? "acknowledged" : "open",
      acknowledgements
    } satisfies RoomSharedFactConflict;
  });
}

function dedupeAcknowledgements(
  acknowledgements: SharedFactConflictAcknowledgement[]
) {
  const deduped = new Map<string, SharedFactConflictAcknowledgement>();

  for (const acknowledgement of acknowledgements) {
    const dedupeKey = [
      acknowledgement.conflictKey,
      acknowledgement.acknowledgedAt,
      acknowledgement.note,
      acknowledgement.resolutionPath ?? ""
    ].join(":");
    deduped.set(dedupeKey, acknowledgement);
  }

  return Array.from(deduped.values()).sort((left, right) =>
    left.acknowledgedAt.localeCompare(right.acknowledgedAt)
  );
}

function sanitizeFileComponent(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artifact";
}
