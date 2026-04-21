export const emailActionKeys = [
  "ask",
  "deadline",
  "decision",
  "commitment",
  "stakeholder",
  "artifact",
  "constraint",
  "risk",
  "question",
  "reply_style",
  "next_action"
] as const;

export type EmailActionKey = (typeof emailActionKeys)[number];

export interface EmailPolicyState {
  mode: "read" | "write" | "explain";
  hasExplicitAsk: boolean;
  hasQuestion: boolean;
  hasDeadline: boolean;
  hasDecision: boolean;
  hasCommitment: boolean;
  hasAttachments: boolean;
  hasConstraints: boolean;
  hasRisks: boolean;
  multiPartyThread: boolean;
  hasOpenQuestions: boolean;
}

export interface EmailTrajectoryStep {
  state: EmailPolicyState;
  action: EmailActionKey;
  reward: number;
}

export interface EmailTrajectoryEpisode {
  episodeId: string;
  datasetId?: string;
  steps: EmailTrajectoryStep[];
}

export interface OfflineEmailPolicyConfig {
  gamma?: number;
  supportPenalty?: number;
  behaviorPenalty?: number;
  similarityFloor?: number;
}

export interface LearnedActionStats {
  action: EmailActionKey;
  support: number;
  averageReturn: number;
  conservativeQ: number;
  behaviorProbability: number;
}

export interface OfflineEmailPolicyStateModel {
  stateKey: string;
  state: EmailPolicyState;
  actionStats: Record<EmailActionKey, LearnedActionStats>;
}

export interface OfflineEmailPolicy {
  config: Required<OfflineEmailPolicyConfig>;
  stateModels: OfflineEmailPolicyStateModel[];
  globalActionStats: Record<EmailActionKey, LearnedActionStats>;
}

export interface EmailActionScore extends LearnedActionStats {
  score: number;
  provenance: "exact" | "similar" | "global";
  rationale: string;
}

interface AggregateBucket {
  state: EmailPolicyState;
  totalCount: number;
  byAction: Map<EmailActionKey, { count: number; returnSum: number }>;
}

const stateFeatureKeys: Array<keyof Omit<EmailPolicyState, "mode">> = [
  "hasExplicitAsk",
  "hasQuestion",
  "hasDeadline",
  "hasDecision",
  "hasCommitment",
  "hasAttachments",
  "hasConstraints",
  "hasRisks",
  "multiPartyThread",
  "hasOpenQuestions"
];

const defaultConfig: Required<OfflineEmailPolicyConfig> = {
  gamma: 0.72,
  supportPenalty: 0.18,
  behaviorPenalty: 0.08,
  similarityFloor: 0.55
};

export function trainOfflineEmailPolicy(
  episodes: EmailTrajectoryEpisode[],
  config: OfflineEmailPolicyConfig = {}
): OfflineEmailPolicy {
  const resolvedConfig = {
    ...defaultConfig,
    ...config
  };
  const stateBuckets = new Map<string, AggregateBucket>();
  const globalBucket: AggregateBucket = {
    state: {
      mode: "read",
      hasExplicitAsk: false,
      hasQuestion: false,
      hasDeadline: false,
      hasDecision: false,
      hasCommitment: false,
      hasAttachments: false,
      hasConstraints: false,
      hasRisks: false,
      multiPartyThread: false,
      hasOpenQuestions: false
    },
    totalCount: 0,
    byAction: new Map()
  };

  for (const episode of episodes) {
    let discountedReturn = 0;
    for (let index = episode.steps.length - 1; index >= 0; index -= 1) {
      const step = episode.steps[index];
      if (!step) {
        continue;
      }

      discountedReturn = step.reward + resolvedConfig.gamma * discountedReturn;
      const stateKey = serializeEmailPolicyState(step.state);
      const bucket = getOrCreateStateBucket(stateBuckets, stateKey, step.state);
      addStepReturn(bucket, step.action, discountedReturn);
      addStepReturn(globalBucket, step.action, discountedReturn);
    }
  }

  const stateModels = Array.from(stateBuckets.entries()).map(([stateKey, bucket]) => ({
    stateKey,
    state: bucket.state,
    actionStats: finalizeActionStats(bucket, resolvedConfig)
  }));

  return {
    config: resolvedConfig,
    stateModels,
    globalActionStats: finalizeActionStats(globalBucket, resolvedConfig)
  };
}

export function rankEmailActions(
  policy: OfflineEmailPolicy,
  state: EmailPolicyState,
  candidates: EmailActionKey[] = [...emailActionKeys]
): EmailActionScore[] {
  const uniqueCandidates = uniqueActions(candidates);
  const exactModel = policy.stateModels.find((entry) => entry.stateKey === serializeEmailPolicyState(state));
  if (exactModel) {
    return uniqueCandidates
      .map((action) => toActionScore(action, exactModel.actionStats[action], "exact", state))
      .sort(compareActionScores);
  }

  const similarModels = policy.stateModels
    .map((entry) => ({
      similarity: computeStateSimilarity(state, entry.state),
      model: entry
    }))
    .filter((entry) => entry.similarity >= policy.config.similarityFloor);

  if (similarModels.length > 0) {
    return uniqueCandidates
      .map((action) => {
        const blended = blendActionStats(
          action,
          similarModels.map((entry) => ({
            similarity: entry.similarity,
            stats: entry.model.actionStats[action]
          })),
          policy.globalActionStats[action]
        );
        return toActionScore(action, blended, "similar", state);
      })
      .sort(compareActionScores);
  }

  return uniqueCandidates
    .map((action) => toActionScore(action, policy.globalActionStats[action], "global", state))
    .sort(compareActionScores);
}

export function serializeEmailPolicyState(state: EmailPolicyState) {
  return [
    `mode=${state.mode}`,
    ...stateFeatureKeys.map((key) => `${key}=${state[key] ? "1" : "0"}`)
  ].join("|");
}

export function computeStateSimilarity(left: EmailPolicyState, right: EmailPolicyState) {
  if (left.mode !== right.mode) {
    return 0;
  }

  let matches = 0;
  for (const key of stateFeatureKeys) {
    if (left[key] === right[key]) {
      matches += 1;
    }
  }

  return 0.35 + (0.65 * matches) / stateFeatureKeys.length;
}

function uniqueActions(actions: EmailActionKey[]) {
  return [...new Set(actions)];
}

function compareActionScores(left: EmailActionScore, right: EmailActionScore) {
  return right.score - left.score || right.support - left.support || left.action.localeCompare(right.action);
}

function getOrCreateStateBucket(
  buckets: Map<string, AggregateBucket>,
  stateKey: string,
  state: EmailPolicyState
) {
  const existing = buckets.get(stateKey);
  if (existing) {
    return existing;
  }

  const created: AggregateBucket = {
    state,
    totalCount: 0,
    byAction: new Map()
  };
  buckets.set(stateKey, created);
  return created;
}

function addStepReturn(bucket: AggregateBucket, action: EmailActionKey, discountedReturn: number) {
  bucket.totalCount += 1;
  const current = bucket.byAction.get(action) ?? {
    count: 0,
    returnSum: 0
  };
  current.count += 1;
  current.returnSum += discountedReturn;
  bucket.byAction.set(action, current);
}

function finalizeActionStats(
  bucket: AggregateBucket,
  config: Required<OfflineEmailPolicyConfig>
): Record<EmailActionKey, LearnedActionStats> {
  const stats = {} as Record<EmailActionKey, LearnedActionStats>;

  for (const action of emailActionKeys) {
    const aggregate = bucket.byAction.get(action);
    const support = aggregate?.count ?? 0;
    const averageReturn = support > 0 ? aggregate!.returnSum / support : -0.25;
    const behaviorProbability = bucket.totalCount > 0 ? support / bucket.totalCount : 0;
    const supportPenalty = support > 0 ? config.supportPenalty / Math.sqrt(support) : config.supportPenalty;
    const conservativeQ =
      averageReturn - supportPenalty - config.behaviorPenalty * Math.log(Math.max(behaviorProbability, 1e-6));

    stats[action] = {
      action,
      support,
      averageReturn,
      conservativeQ,
      behaviorProbability
    };
  }

  return stats;
}

function blendActionStats(
  action: EmailActionKey,
  inputs: Array<{ similarity: number; stats: LearnedActionStats }>,
  fallback: LearnedActionStats
): LearnedActionStats {
  let totalWeight = 0;
  let weightedSupport = 0;
  let weightedAverageReturn = 0;
  let weightedConservativeQ = 0;
  let weightedBehaviorProbability = 0;

  for (const entry of inputs) {
    if (entry.stats.support <= 0) {
      continue;
    }

    totalWeight += entry.similarity;
    weightedSupport += entry.stats.support * entry.similarity;
    weightedAverageReturn += entry.stats.averageReturn * entry.similarity;
    weightedConservativeQ += entry.stats.conservativeQ * entry.similarity;
    weightedBehaviorProbability += entry.stats.behaviorProbability * entry.similarity;
  }

  if (totalWeight <= 0) {
    return fallback;
  }

  return {
    action,
    support: weightedSupport / totalWeight,
    averageReturn: weightedAverageReturn / totalWeight,
    conservativeQ: weightedConservativeQ / totalWeight,
    behaviorProbability: weightedBehaviorProbability / totalWeight
  };
}

function toActionScore(
  action: EmailActionKey,
  stats: LearnedActionStats,
  provenance: EmailActionScore["provenance"],
  state: EmailPolicyState
): EmailActionScore {
  const modeLabel = state.mode === "write" ? "write" : state.mode === "explain" ? "explain" : "read";
  const contextTags = [
    state.hasExplicitAsk ? "ask" : "",
    state.hasDeadline ? "deadline" : "",
    state.hasAttachments ? "attachment" : "",
    state.hasDecision ? "decision" : "",
    state.hasCommitment ? "commitment" : "",
    state.hasRisks ? "risk" : ""
  ].filter((entry) => entry.length > 0);
  const contextSummary = contextTags.length > 0 ? ` for ${contextTags.join("/")}` : "";
  const support = formatSupport(stats.support);
  const rationale =
    provenance === "global"
      ? `global ${modeLabel}${contextSummary}; avg ${stats.averageReturn.toFixed(2)} / ${support}`
      : `${provenance === "exact" ? "exact" : "similar"} ${modeLabel}${contextSummary}; avg ${stats.averageReturn.toFixed(2)} / ${support}`;

  return {
    ...stats,
    score: stats.conservativeQ,
    provenance,
    rationale
  };
}

function formatSupport(value: number) {
  if (Number.isInteger(value)) {
    return `${value} logged step${value === 1 ? "" : "s"}`;
  }

  return `${value.toFixed(1)} weighted steps`;
}
