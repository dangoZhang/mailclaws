import fs from "node:fs";
import path from "node:path";

import { emailActionKeys, type EmailActionKey, type EmailTrajectoryEpisode } from "./offline-rl.js";
import {
  deriveEmailPolicyState,
  extractEmailSchemaCandidates,
  type EmailPromptAttachment,
  type EmailPromptContextSnapshot,
  type EmailPromptSearchHit,
  type EmailSchemaCandidateMap,
  type EmailSemanticPacketInput
} from "./schema-policy.js";

export const emailTrajectoryImportProfiles = [
  "generic",
  "emailsum",
  "bc3",
  "radar-action-items",
  "mailex",
  "enronsr-reply-alignment"
] as const;

export type EmailTrajectoryImportProfile = (typeof emailTrajectoryImportProfiles)[number];

export interface ExternalEmailCommitmentRecord {
  owner?: string;
  action: string;
  dueAt?: string;
}

export interface ExternalEmailActionItemRecord {
  owner?: string;
  action: string;
  dueAt?: string;
  status?: string;
}

export interface ExternalEmailEventRecord {
  trigger?: string;
  participants?: string[];
  artifact?: string;
  dueAt?: string;
  kind?: string;
  notes?: string;
}

export interface ExternalEmailAnnotations {
  actions?: Partial<Record<EmailActionKey, string[] | string>>;
  summary?: string;
  salientSentences?: string[];
  decisions?: string[];
  openQuestions?: string[];
  requestedActions?: string[];
  commitments?: ExternalEmailCommitmentRecord[];
  actionItems?: ExternalEmailActionItemRecord[];
  events?: ExternalEmailEventRecord[];
  replyGoal?: string;
  replyStyle?: string;
  mustMention?: string[];
  deadlines?: string[];
  constraints?: string[];
  risks?: string[];
}

export interface ExternalEmailCorpusRecord {
  episodeId?: string;
  threadId?: string;
  messageId?: string;
  datasetId?: string;
  benchmarkId?: string;
  mode?: "read" | "write" | "explain";
  from?: string;
  to?: string[] | string;
  cc?: string[] | string;
  replyTo?: string[] | string;
  subject?: string;
  body?: string;
  attachments?: Array<{
    filename?: string;
    summaryText?: string | null;
  }>;
  retrievedContext?: Array<{
    title?: string;
    excerpt?: string;
  }>;
  preSnapshot?: EmailPromptContextSnapshot | null;
  annotations?: ExternalEmailAnnotations;
}

export interface ImportEmailTrajectoryInput {
  profile?: EmailTrajectoryImportProfile;
  datasetId?: string;
  defaultMode?: "read" | "write" | "explain";
  minReward?: number;
  maxActionsPerEpisode?: number;
}

export interface ImportEmailTrajectorySkippedRecord {
  recordId: string;
  reason: string;
}

export interface ImportEmailTrajectoryResult {
  profile: EmailTrajectoryImportProfile;
  datasetIds: string[];
  importedRecordCount: number;
  skippedRecordCount: number;
  actionHistogram: Record<EmailActionKey, number>;
  episodes: EmailTrajectoryEpisode[];
  skippedRecords: ImportEmailTrajectorySkippedRecord[];
}

export function importEmailTrajectoryRecords(
  records: ExternalEmailCorpusRecord[],
  input: ImportEmailTrajectoryInput = {}
): ImportEmailTrajectoryResult {
  const profile = input.profile ?? "generic";
  const minReward = input.minReward ?? 0.35;
  const maxActionsPerEpisode = input.maxActionsPerEpisode ?? 6;
  const episodes: EmailTrajectoryEpisode[] = [];
  const skippedRecords: ImportEmailTrajectorySkippedRecord[] = [];
  const datasetIds = new Set<string>();
  const actionHistogram = createActionHistogram();

  for (const [index, record] of records.entries()) {
    const episodeId = buildEpisodeId(record, profile, index);
    const packet = toEmailPacket(record, profile, input.defaultMode);
    const candidates = extractEmailSchemaCandidates(packet);
    const state = deriveEmailPolicyState(packet, candidates);
    const rewardMap = deriveRewardMap(record, profile, candidates);
    const rankedActions = Array.from(rewardMap.entries())
      .filter((entry) => entry[1] >= minReward)
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, maxActionsPerEpisode);

    if (rankedActions.length === 0) {
      skippedRecords.push({
        recordId: episodeId,
        reason: "record did not yield any retained actions above the reward threshold"
      });
      continue;
    }

    const datasetId = normalizeInlineText(input.datasetId) || normalizeInlineText(record.datasetId) || defaultDatasetId(profile);
    datasetIds.add(datasetId);

    const steps = rankedActions.map(([action, reward]) => ({
      state,
      action,
      reward: roundTo(reward)
    }));

    for (const [action] of rankedActions) {
      actionHistogram[action] += 1;
    }

    episodes.push({
      episodeId,
      datasetId,
      steps
    });
  }

  return {
    profile,
    datasetIds: [...datasetIds].sort((left, right) => left.localeCompare(right)),
    importedRecordCount: episodes.length,
    skippedRecordCount: skippedRecords.length,
    actionHistogram,
    episodes,
    skippedRecords
  };
}

export function loadExternalEmailCorpusRecords(filePath: string): ExternalEmailCorpusRecord[] {
  return parseStructuredFile<ExternalEmailCorpusRecord>(filePath);
}

export function loadEmailTrajectoryEpisodes(filePath: string): EmailTrajectoryEpisode[] {
  return parseStructuredFile<EmailTrajectoryEpisode>(filePath);
}

export function writeEmailTrajectoryEpisodes(filePath: string, episodes: EmailTrajectoryEpisode[]) {
  const absolutePath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

  if (absolutePath.endsWith(".json")) {
    fs.writeFileSync(absolutePath, `${JSON.stringify(episodes, null, 2)}\n`, "utf8");
    return absolutePath;
  }

  const content = episodes.map((episode) => JSON.stringify(episode)).join("\n");
  fs.writeFileSync(absolutePath, content.length > 0 ? `${content}\n` : "", "utf8");
  return absolutePath;
}

function deriveRewardMap(
  record: ExternalEmailCorpusRecord,
  profile: EmailTrajectoryImportProfile,
  candidates: EmailSchemaCandidateMap
) {
  const rewards = new Map<EmailActionKey, number>();
  const annotations = record.annotations;

  applyDirectActionAnnotations(rewards, annotations?.actions);
  applyCommonStructuredAnnotations(rewards, annotations);

  switch (profile) {
    case "generic":
      applySummaryOverlapRewards(rewards, annotations, candidates);
      break;
    case "emailsum":
    case "bc3":
      applySummaryOverlapRewards(rewards, annotations, candidates, {
        decision: 1.18,
        commitment: 1.08,
        ask: 0.92,
        question: 0.9,
        deadline: 0.84,
        risk: 0.82,
        next_action: 0.88
      });
      break;
    case "radar-action-items":
      applyRadarRewards(rewards, annotations);
      break;
    case "mailex":
      applyMailExRewards(rewards, annotations);
      break;
    case "enronsr-reply-alignment":
      applyEnronSrRewards(rewards, annotations);
      break;
  }

  if (rewards.size === 0) {
    applyFallbackRewards(rewards, candidates);
  }

  return rewards;
}

function applyDirectActionAnnotations(
  rewards: Map<EmailActionKey, number>,
  actions: ExternalEmailAnnotations["actions"]
) {
  if (!actions) {
    return;
  }

  for (const action of emailActionKeys) {
    const values = toStringArray(actions[action]);
    if (values.length === 0) {
      continue;
    }

    bumpReward(rewards, action, 0.88 + Math.min(0.24, (values.length - 1) * 0.08));
  }
}

function applyCommonStructuredAnnotations(
  rewards: Map<EmailActionKey, number>,
  annotations: ExternalEmailAnnotations | undefined
) {
  if (!annotations) {
    return;
  }

  if (toStringArray(annotations.decisions).length > 0) {
    bumpReward(rewards, "decision", 1.12);
  }
  if (toStringArray(annotations.openQuestions).length > 0) {
    bumpReward(rewards, "question", 0.98);
  }
  if (toStringArray(annotations.requestedActions).length > 0) {
    bumpReward(rewards, "ask", 0.96);
    bumpReward(rewards, "next_action", 0.92);
  }
  if (toStringArray(annotations.constraints).length > 0) {
    bumpReward(rewards, "constraint", 0.9);
  }
  if (toStringArray(annotations.risks).length > 0) {
    bumpReward(rewards, "risk", 0.92);
  }
  if (normalizeInlineText(annotations.replyStyle)) {
    bumpReward(rewards, "reply_style", 0.94);
  }
  if (toStringArray(annotations.deadlines).length > 0) {
    bumpReward(rewards, "deadline", 0.9);
  }
  if (annotations.commitments && annotations.commitments.length > 0) {
    bumpReward(rewards, "commitment", 1.05);
    bumpReward(rewards, "next_action", 0.9);

    if (annotations.commitments.some((entry) => normalizeInlineText(entry.owner).length > 0)) {
      bumpReward(rewards, "stakeholder", 0.72);
    }
    if (annotations.commitments.some((entry) => normalizeInlineText(entry.dueAt).length > 0)) {
      bumpReward(rewards, "deadline", 0.82);
    }
  }
}

function applySummaryOverlapRewards(
  rewards: Map<EmailActionKey, number>,
  annotations: ExternalEmailAnnotations | undefined,
  candidates: EmailSchemaCandidateMap,
  overrides: Partial<Record<EmailActionKey, number>> = {}
) {
  if (!annotations) {
    return;
  }

  const references = [
    ...toStringArray(annotations.summary),
    ...toStringArray(annotations.salientSentences),
    ...toStringArray(annotations.decisions),
    ...toStringArray(annotations.openQuestions),
    ...toStringArray(annotations.requestedActions),
    ...(annotations.commitments ?? []).map((entry) =>
      [normalizeInlineText(entry.owner), normalizeInlineText(entry.action), normalizeInlineText(entry.dueAt)]
        .filter((value) => value.length > 0)
        .join(" ")
    )
  ].filter((entry) => entry.length > 0);

  if (references.length === 0) {
    return;
  }

  const baseWeights: Record<EmailActionKey, number> = {
    ask: 0.82,
    deadline: 0.76,
    decision: 0.9,
    commitment: 0.84,
    stakeholder: 0.58,
    artifact: 0.62,
    constraint: 0.56,
    risk: 0.74,
    question: 0.78,
    reply_style: 0.48,
    next_action: 0.78,
    ...overrides
  };

  for (const action of emailActionKeys) {
    const overlapCount = countCandidateOverlaps(candidates[action], references);
    if (overlapCount === 0) {
      continue;
    }

    bumpReward(rewards, action, baseWeights[action] + Math.min(0.18, (overlapCount - 1) * 0.06));
  }
}

function applyRadarRewards(rewards: Map<EmailActionKey, number>, annotations: ExternalEmailAnnotations | undefined) {
  if (!annotations?.actionItems || annotations.actionItems.length === 0) {
    return;
  }

  bumpReward(rewards, "commitment", 1.18);
  bumpReward(rewards, "next_action", 1.08);

  if (annotations.actionItems.some((entry) => normalizeInlineText(entry.owner).length > 0)) {
    bumpReward(rewards, "stakeholder", 0.96);
  }
  if (annotations.actionItems.some((entry) => normalizeInlineText(entry.dueAt).length > 0)) {
    bumpReward(rewards, "deadline", 0.82);
  }
}

function applyMailExRewards(rewards: Map<EmailActionKey, number>, annotations: ExternalEmailAnnotations | undefined) {
  if (!annotations?.events || annotations.events.length === 0) {
    return;
  }

  if (
    annotations.events.some(
      (entry) => normalizeInlineText(entry.trigger).length > 0 || normalizeInlineText(entry.artifact).length > 0
    )
  ) {
    bumpReward(rewards, "artifact", 1.02);
  }
  if (annotations.events.some((entry) => (entry.participants ?? []).some((participant) => participant.trim().length > 0))) {
    bumpReward(rewards, "stakeholder", 0.82);
  }
  if (annotations.events.some((entry) => normalizeInlineText(entry.dueAt).length > 0)) {
    bumpReward(rewards, "deadline", 0.86);
  }
  if (annotations.events.some((entry) => /\b(approve|approval|decision|signoff|confirm)\b/i.test(entry.kind ?? ""))) {
    bumpReward(rewards, "decision", 0.94);
  }
  if (annotations.events.some((entry) => /\b(incident|escalat|risk|blocker|failure)\b/i.test(entry.kind ?? ""))) {
    bumpReward(rewards, "risk", 0.94);
  }
  if (annotations.events.some((entry) => /\b(follow[- ]?up|remediat|next|action)\b/i.test(entry.kind ?? ""))) {
    bumpReward(rewards, "next_action", 0.78);
  }
}

function applyEnronSrRewards(rewards: Map<EmailActionKey, number>, annotations: ExternalEmailAnnotations | undefined) {
  if (!annotations) {
    return;
  }

  if (normalizeInlineText(annotations.replyGoal)) {
    bumpReward(rewards, "ask", 1.16);
    bumpReward(rewards, "next_action", 0.9);
  }
  if (normalizeInlineText(annotations.replyStyle)) {
    bumpReward(rewards, "reply_style", 0.98);
  }
  if (toStringArray(annotations.mustMention).length > 0) {
    bumpReward(rewards, "artifact", 1.02);
  }
  if (toStringArray(annotations.deadlines).length > 0) {
    bumpReward(rewards, "deadline", 0.96);
  }
  if (toStringArray(annotations.constraints).length > 0) {
    bumpReward(rewards, "constraint", 0.92);
  }
  if (toStringArray(annotations.decisions).length > 0) {
    bumpReward(rewards, "decision", 1.0);
  }
  if (annotations.commitments && annotations.commitments.length > 0) {
    bumpReward(rewards, "commitment", 0.98);
    if (annotations.commitments.some((entry) => normalizeInlineText(entry.owner).length > 0)) {
      bumpReward(rewards, "stakeholder", 0.68);
    }
  }
}

function applyFallbackRewards(rewards: Map<EmailActionKey, number>, candidates: EmailSchemaCandidateMap) {
  for (const action of emailActionKeys) {
    if (candidates[action].length === 0) {
      continue;
    }

    const fallbackReward =
      action === "decision" || action === "commitment" || action === "ask" || action === "deadline"
        ? 0.72
        : 0.52;
    bumpReward(rewards, action, fallbackReward);
  }
}

function toEmailPacket(
  record: ExternalEmailCorpusRecord,
  profile: EmailTrajectoryImportProfile,
  defaultMode: ImportEmailTrajectoryInput["defaultMode"]
): EmailSemanticPacketInput {
  return {
    mode: resolveMode(record, profile, defaultMode),
    from: normalizeInlineText(record.from) || undefined,
    to: toStringArray(record.to),
    cc: toStringArray(record.cc),
    replyTo: toStringArray(record.replyTo),
    subject: normalizeInlineText(record.subject) || undefined,
    body: normalizeInlineText(record.body) || undefined,
    attachments: normalizeAttachments(record.attachments),
    retrievedContext: normalizeSearchHits(record.retrievedContext),
    preSnapshot: normalizePreSnapshot(record.preSnapshot, record.annotations)
  };
}

function resolveMode(
  record: ExternalEmailCorpusRecord,
  profile: EmailTrajectoryImportProfile,
  defaultMode: ImportEmailTrajectoryInput["defaultMode"]
) {
  if (record.mode) {
    return record.mode;
  }
  if (defaultMode) {
    return defaultMode;
  }

  switch (profile) {
    case "emailsum":
    case "bc3":
      return "explain";
    case "radar-action-items":
    case "mailex":
      return "read";
    case "enronsr-reply-alignment":
      return "write";
    default:
      return "explain";
  }
}

function defaultDatasetId(profile: EmailTrajectoryImportProfile) {
  switch (profile) {
    case "emailsum":
      return "emailsum";
    case "bc3":
      return "bc3";
    case "radar-action-items":
      return "radar-action-items";
    case "mailex":
    case "enronsr-reply-alignment":
      return "enron-email";
    default:
      return "external-email";
  }
}

function buildEpisodeId(record: ExternalEmailCorpusRecord, profile: EmailTrajectoryImportProfile, index: number) {
  const candidate =
    normalizeInlineText(record.episodeId) ||
    normalizeInlineText(record.threadId) ||
    normalizeInlineText(record.messageId) ||
    normalizeInlineText(record.subject);

  if (!candidate) {
    return `${profile}-${String(index + 1).padStart(4, "0")}`;
  }

  return slugify(candidate).slice(0, 96) || `${profile}-${String(index + 1).padStart(4, "0")}`;
}

function normalizeAttachments(
  attachments: ExternalEmailCorpusRecord["attachments"]
): EmailPromptAttachment[] | undefined {
  const normalized = (attachments ?? [])
    .map((attachment, index) => {
      const filename = normalizeInlineText(attachment.filename) || `attachment-${index + 1}`;
      const summaryText = normalizeInlineText(attachment.summaryText);
      return {
        filename,
        summaryText: summaryText || undefined
      };
    })
    .filter((attachment) => attachment.filename.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSearchHits(
  searchHits: ExternalEmailCorpusRecord["retrievedContext"]
): EmailPromptSearchHit[] | undefined {
  const normalized = (searchHits ?? [])
    .map((entry) => {
      const title = normalizeInlineText(entry.title);
      const excerpt = normalizeInlineText(entry.excerpt);
      if (!title || !excerpt) {
        return null;
      }

      return { title, excerpt };
    })
    .filter((entry): entry is EmailPromptSearchHit => entry !== null);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizePreSnapshot(
  preSnapshot: ExternalEmailCorpusRecord["preSnapshot"],
  annotations: ExternalEmailAnnotations | undefined
): EmailPromptContextSnapshot | null | undefined {
  const normalizedSnapshot: EmailPromptContextSnapshot = {
    summary: normalizeInlineText(preSnapshot?.summary) || normalizeInlineText(annotations?.summary) || undefined,
    decisions: uniqueNormalizedStrings(preSnapshot?.decisions ?? annotations?.decisions),
    openQuestions: uniqueNormalizedStrings(preSnapshot?.openQuestions ?? annotations?.openQuestions),
    requestedActions: uniqueNormalizedStrings(preSnapshot?.requestedActions ?? annotations?.requestedActions),
    commitments: normalizeCommitments(preSnapshot?.commitments ?? annotations?.commitments)
  };

  return hasSnapshotContent(normalizedSnapshot) ? normalizedSnapshot : preSnapshot ?? null;
}

function normalizeCommitments(
  values: EmailPromptContextSnapshot["commitments"] | ExternalEmailAnnotations["commitments"]
): EmailPromptContextSnapshot["commitments"] {
  const normalized: NonNullable<EmailPromptContextSnapshot["commitments"]> = [];

  for (const entry of values ?? []) {
    const owner = normalizeInlineText(entry.owner);
    const action = normalizeInlineText(entry.action);
    const dueAt = normalizeInlineText(entry.dueAt);
    if (!action) {
      continue;
    }

    normalized.push({
      owner: owner || "unknown",
      action,
      dueAt: dueAt || undefined
    });
  }

  return normalized.length > 0 ? normalized : undefined;
}

function hasSnapshotContent(snapshot: EmailPromptContextSnapshot) {
  return Boolean(
    normalizeInlineText(snapshot.summary) ||
      (snapshot.decisions?.length ?? 0) > 0 ||
      (snapshot.openQuestions?.length ?? 0) > 0 ||
      (snapshot.requestedActions?.length ?? 0) > 0 ||
      (snapshot.commitments?.length ?? 0) > 0
  );
}

function toStringArray(value: string[] | string | undefined) {
  if (!value) {
    return [];
  }

  const values = Array.isArray(value) ? value : [value];
  return uniqueNormalizedStrings(values);
}

function uniqueNormalizedStrings(values: string[] | undefined) {
  return [...new Set((values ?? []).map((entry) => normalizeInlineText(entry)).filter((entry) => entry.length > 0))];
}

function normalizeInlineText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function countCandidateOverlaps(candidates: string[], references: string[]) {
  let overlapCount = 0;
  for (const candidate of candidates) {
    if (references.some((reference) => hasLooseTextOverlap(candidate, reference))) {
      overlapCount += 1;
    }
  }
  return overlapCount;
}

function hasLooseTextOverlap(left: string, right: string) {
  const normalizedLeft = normalizeComparableText(left);
  const normalizedRight = normalizeComparableText(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }

  const leftTokens = tokenizeComparableText(normalizedLeft);
  const rightTokens = tokenizeComparableText(normalizedRight);
  let sharedTokens = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      sharedTokens += 1;
    }
  }

  return sharedTokens >= 2 || (sharedTokens >= 1 && (leftTokens.size === 1 || rightTokens.size === 1));
}

function normalizeComparableText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeComparableText(value: string) {
  return new Set(
    value
      .split(" ")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length >= 3)
  );
}

function bumpReward(rewards: Map<EmailActionKey, number>, action: EmailActionKey, reward: number) {
  rewards.set(action, Math.max(rewards.get(action) ?? 0, roundTo(reward)));
}

function roundTo(value: number) {
  return Math.round(value * 1000) / 1000;
}

function createActionHistogram() {
  return Object.fromEntries(emailActionKeys.map((action) => [action, 0])) as Record<EmailActionKey, number>;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseStructuredFile<T>(filePath: string): T[] {
  const content = fs.readFileSync(path.resolve(filePath), "utf8");
  return parseStructuredContent<T>(content);
}

function parseStructuredContent<T>(content: string): T[] {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed as T[];
    }
    if (parsed && typeof parsed === "object") {
      const recordContainer = parsed as { records?: T[]; episodes?: T[] };
      if (Array.isArray(recordContainer.records)) {
        return recordContainer.records;
      }
      if (Array.isArray(recordContainer.episodes)) {
        return recordContainer.episodes;
      }
      return [parsed as T];
    }
  } catch {}

  return trimmed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}
