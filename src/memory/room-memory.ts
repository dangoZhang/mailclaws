import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { AppConfig } from "../config.js";
import { toSafeStorageFileName, toSafeStoragePathSegment } from "../storage/path-safety.js";

export interface RoomMemorySnapshot {
  snapshotId: string;
  tenantId: string;
  roomKey: string;
  title: string;
  summary: string;
  decisions: string[];
  facts: string[];
  openQuestions: string[];
  createdAt: string;
}

export interface RoomNoteDocument {
  noteId: string;
  title: string;
  format: "markdown" | "json";
  path: string;
  content: string;
}

export interface RoomMemoryWorkspace {
  roomDir: string;
  roomMemoryPath: string;
  sharedDigestPath: string;
  sharedFactsPath: string;
  sharedOpenQuestionsPath: string;
  sharedDecisionsPath: string;
  snapshotsDir: string;
}

export interface LoadedRoomNotes extends RoomMemoryWorkspace {
  latestSnapshot: RoomMemorySnapshot | null;
  latestSnapshotPath?: string;
  documents: RoomNoteDocument[];
}

export function getRoomStateDir(config: AppConfig, tenantId: string, roomKey: string) {
  return getRoomStateDirForRoot(config.storage.stateDir, tenantId, roomKey);
}

export function getRoomStateDirForRoot(stateDir: string, tenantId: string, roomKey: string) {
  return path.join(
    stateDir,
    "tenants",
    toSafeStoragePathSegment(tenantId, "tenant"),
    "rooms",
    toSafeStoragePathSegment(roomKey, "room")
  );
}

export function ensureRoomMemoryWorkspace(
  config: AppConfig,
  tenantId: string,
  roomKey: string
): RoomMemoryWorkspace {
  const workspace = buildRoomMemoryWorkspacePaths(getRoomStateDir(config, tenantId, roomKey));

  for (const directory of [
    workspace.roomDir,
    path.dirname(workspace.sharedDigestPath),
    workspace.snapshotsDir
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }

  ensureMarkdownFile(workspace.roomMemoryPath, `# Room Memory\n\nRoom: ${roomKey}\n`);
  ensureMarkdownFile(workspace.sharedDigestPath, `# Room Digest\n`);
  ensureMarkdownFile(workspace.sharedOpenQuestionsPath, `# Open Questions\n`);
  ensureMarkdownFile(workspace.sharedDecisionsPath, `# Decisions\n`);
  ensureJsonFile(workspace.sharedFactsPath, {
    roomKey,
    decisions: [],
    facts: [],
    openQuestions: [],
    conflicts: [],
    recommendedActions: []
  });

  return workspace;
}

export function captureRoomMemorySnapshot(
  config: AppConfig,
  input: {
    tenantId: string;
    roomKey: string;
    title: string;
    summary: string;
    decisions?: string[];
    facts: string[];
    openQuestions: string[];
    createdAt?: string;
    snapshotId?: string;
  }
) {
  const workspace = ensureRoomMemoryWorkspace(config, input.tenantId, input.roomKey);
  const snapshot: RoomMemorySnapshot = {
    snapshotId: input.snapshotId ?? randomUUID(),
    tenantId: input.tenantId,
    roomKey: input.roomKey,
    title: input.title.trim(),
    summary: input.summary.trim(),
    decisions: uniqueNonEmpty(input.decisions ?? []),
    facts: uniqueNonEmpty(input.facts),
    openQuestions: uniqueNonEmpty(input.openQuestions),
    createdAt: input.createdAt ?? new Date().toISOString()
  };
  const snapshotPath = path.join(
    workspace.snapshotsDir,
    toSafeStorageFileName(snapshot.snapshotId, ".json", "snapshot")
  );

  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  fs.writeFileSync(workspace.roomMemoryPath, renderRoomMemoryMarkdown(snapshot), "utf8");
  fs.writeFileSync(workspace.sharedDigestPath, renderRoomDigestMarkdown(snapshot), "utf8");
  fs.writeFileSync(
    workspace.sharedFactsPath,
    JSON.stringify(
      {
        roomKey: snapshot.roomKey,
        latestSnapshotId: snapshot.snapshotId,
        title: snapshot.title,
        summary: snapshot.summary,
        decisions: snapshot.decisions,
        facts: snapshot.facts,
        openQuestions: snapshot.openQuestions,
        createdAt: snapshot.createdAt
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    workspace.sharedOpenQuestionsPath,
    renderOpenQuestionsMarkdown(snapshot),
    "utf8"
  );
  fs.writeFileSync(workspace.sharedDecisionsPath, renderDecisionsMarkdown(snapshot), "utf8");

  return {
    snapshot,
    snapshotPath,
    workspace
  };
}

export function loadRoomMemorySnapshot(snapshotPath: string) {
  return normalizeRoomMemorySnapshot(
    JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as Partial<RoomMemorySnapshot>
  );
}

export function listRoomMemorySnapshots(
  config: AppConfig,
  tenantId: string,
  roomKey: string
) {
  const workspace = ensureRoomMemoryWorkspace(config, tenantId, roomKey);
  const snapshots = fs
    .readdirSync(workspace.snapshotsDir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => {
      const snapshotPath = path.join(workspace.snapshotsDir, entry);
      const snapshot = loadRoomMemorySnapshot(snapshotPath);
      return {
        snapshot,
        snapshotPath,
        workspace
      };
    });

  snapshots.sort(
    (left, right) =>
      Date.parse(left.snapshot.createdAt) - Date.parse(right.snapshot.createdAt) ||
      left.snapshot.snapshotId.localeCompare(right.snapshot.snapshotId)
  );

  return snapshots;
}

export function getLatestRoomMemorySnapshot(
  config: AppConfig,
  tenantId: string,
  roomKey: string
) {
  return listRoomMemorySnapshots(config, tenantId, roomKey).at(-1) ?? null;
}

export function readRoomNotesFromStateDir(stateDir: string, tenantId: string, roomKey: string) {
  const roomDir = getRoomStateDirForRoot(stateDir, tenantId, roomKey);
  return readRoomNotesFromRoomDir(roomDir);
}

export function renderRoomMemoryDraftContent(input: {
  snapshot: RoomMemorySnapshot;
  roomMemoryPath: string;
  snapshotPath: string;
}) {
  const lines = [
    "# Room Memory Source",
    `- Room: ${input.snapshot.roomKey}`,
    `- Snapshot Path: ${input.snapshotPath}`,
    `- Room Memory Path: ${input.roomMemoryPath}`,
    `- Created At: ${input.snapshot.createdAt}`,
    "",
    `## ${input.snapshot.title}`,
    input.snapshot.summary
  ];

  if (input.snapshot.decisions.length > 0) {
    lines.push("", "### Decisions", ...input.snapshot.decisions.map((decision) => `- ${decision}`));
  }

  if (input.snapshot.facts.length > 0) {
    lines.push("", "### Facts", ...input.snapshot.facts.map((fact) => `- ${fact}`));
  }

  if (input.snapshot.openQuestions.length > 0) {
    lines.push(
      "",
      "### Open Questions",
      ...input.snapshot.openQuestions.map((question) => `- ${question}`)
    );
  }

  return `${lines.join("\n")}\n`;
}

function renderRoomMemoryMarkdown(snapshot: RoomMemorySnapshot) {
  return [
    `# Room Memory`,
    `- Room: ${snapshot.roomKey}`,
    `- Snapshot: ${snapshot.snapshotId}`,
    `- Created At: ${snapshot.createdAt}`,
    "",
    `## ${snapshot.title}`,
    snapshot.summary,
    "",
    "### Decisions",
    ...(snapshot.decisions.length > 0
      ? snapshot.decisions.map((decision) => `- ${decision}`)
      : ["- None recorded"]),
    "",
    "### Facts",
    ...(snapshot.facts.length > 0 ? snapshot.facts.map((fact) => `- ${fact}`) : ["- None recorded"]),
    "",
    "### Open Questions",
    ...(snapshot.openQuestions.length > 0
      ? snapshot.openQuestions.map((question) => `- ${question}`)
      : ["- None recorded"])
  ].join("\n");
}

function renderRoomDigestMarkdown(snapshot: RoomMemorySnapshot) {
  return [
    "# Room Digest",
    `- Room: ${snapshot.roomKey}`,
    `- Snapshot: ${snapshot.snapshotId}`,
    "",
    snapshot.summary
  ].join("\n");
}

function renderOpenQuestionsMarkdown(snapshot: RoomMemorySnapshot) {
  return [
    "# Open Questions",
    ...(snapshot.openQuestions.length > 0
      ? snapshot.openQuestions.map((question) => `- ${question}`)
      : ["- None recorded"])
  ].join("\n");
}

function renderDecisionsMarkdown(snapshot: RoomMemorySnapshot) {
  return [
    "# Decisions",
    ...(snapshot.decisions.length > 0
      ? snapshot.decisions.map((decision) => `- ${decision}`)
      : ["- None recorded"])
  ].join("\n");
}

function normalizeRoomMemorySnapshot(snapshot: Partial<RoomMemorySnapshot>) {
  return {
    snapshotId: snapshot.snapshotId ?? "",
    tenantId: snapshot.tenantId ?? "",
    roomKey: snapshot.roomKey ?? "",
    title: snapshot.title?.trim() ?? "",
    summary: snapshot.summary?.trim() ?? "",
    decisions: uniqueNonEmpty(snapshot.decisions ?? []),
    facts: uniqueNonEmpty(snapshot.facts ?? []),
    openQuestions: uniqueNonEmpty(snapshot.openQuestions ?? []),
    createdAt: snapshot.createdAt ?? new Date(0).toISOString()
  } satisfies RoomMemorySnapshot;
}

function buildRoomMemoryWorkspacePaths(roomDir: string): RoomMemoryWorkspace {
  const sharedDir = path.join(roomDir, "shared");
  const snapshotsDir = path.join(roomDir, "snapshots");

  return {
    roomDir,
    roomMemoryPath: path.join(roomDir, "ROOM.md"),
    sharedDigestPath: path.join(sharedDir, "digest.md"),
    sharedFactsPath: path.join(sharedDir, "facts.json"),
    sharedOpenQuestionsPath: path.join(sharedDir, "open_questions.md"),
    sharedDecisionsPath: path.join(sharedDir, "decisions.md"),
    snapshotsDir
  };
}

function readRoomNotesFromRoomDir(roomDir: string): LoadedRoomNotes | null {
  if (!fs.existsSync(roomDir)) {
    return null;
  }

  const workspace = buildRoomMemoryWorkspacePaths(roomDir);
  const latestSnapshotEntry = readLatestRoomMemorySnapshotEntry(workspace.snapshotsDir);
  const documents = [
    readRoomNoteDocument("room-memory", "Room Memory", "markdown", workspace.roomMemoryPath),
    readRoomNoteDocument("shared-digest", "Room Digest", "markdown", workspace.sharedDigestPath),
    readRoomNoteDocument("shared-facts", "Shared Facts", "json", workspace.sharedFactsPath),
    readRoomNoteDocument(
      "shared-open-questions",
      "Open Questions",
      "markdown",
      workspace.sharedOpenQuestionsPath
    ),
    readRoomNoteDocument("shared-decisions", "Decisions", "markdown", workspace.sharedDecisionsPath)
  ].filter((document): document is RoomNoteDocument => document !== null);

  return {
    ...workspace,
    latestSnapshot: latestSnapshotEntry?.snapshot ?? null,
    latestSnapshotPath: latestSnapshotEntry?.snapshotPath,
    documents
  };
}

function readLatestRoomMemorySnapshotEntry(snapshotsDir: string) {
  if (!fs.existsSync(snapshotsDir)) {
    return null;
  }

  return fs
    .readdirSync(snapshotsDir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => {
      const snapshotPath = path.join(snapshotsDir, entry);
      const snapshot = loadRoomMemorySnapshot(snapshotPath);
      return {
        snapshotPath,
        snapshot
      };
    })
    .sort(
      (left, right) =>
        Date.parse(left.snapshot.createdAt) - Date.parse(right.snapshot.createdAt) ||
        left.snapshot.snapshotId.localeCompare(right.snapshot.snapshotId)
    )
    .at(-1) ?? null;
}

function readRoomNoteDocument(
  noteId: string,
  title: string,
  format: RoomNoteDocument["format"],
  filePath: string
) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf8");
  if (content.trim().length === 0) {
    return null;
  }

  return {
    noteId,
    title,
    format,
    path: filePath,
    content
  } satisfies RoomNoteDocument;
}

function uniqueNonEmpty(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function ensureMarkdownFile(filePath: string, contents: string) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, contents, "utf8");
  }
}

function ensureJsonFile(filePath: string, payload: unknown) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}
