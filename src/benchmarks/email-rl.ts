import {
  buildEmailSemanticPacket,
  extractEmailSchemaCandidates,
  getEmailFieldLabel,
  seedEmailTrajectoryEpisodes,
  type EmailSemanticPacketInput
} from "../email/schema-policy.js";
import {
  trainOfflineEmailPolicy,
  emailActionKeys,
  type EmailActionKey,
  type EmailTrajectoryEpisode,
  type OfflineEmailPolicyConfig
} from "../email/offline-rl.js";
import {
  getEmailBenchmarkDefinition,
  listEmailBenchmarkDefinitions
} from "../email/benchmark-registry.js";

export interface RunEmailRlBenchmarkInput {
  generatedAt?: string;
  benchmarkIds?: string[];
  policyConfig?: OfflineEmailPolicyConfig;
  trainingEpisodes?: EmailTrajectoryEpisode[];
  appendSeedEpisodes?: boolean;
  maxWriteFields?: number;
  maxReadFields?: number;
  maxExplainFields?: number;
}

export interface EmailRlScenarioResult {
  scenarioId: string;
  benchmarkId: string;
  benchmarkName: string;
  mode: "read" | "write" | "explain";
  baselineSelected: EmailActionKey[];
  rlSelected: EmailActionKey[];
  baselineReward: number;
  rlReward: number;
  baselineCoverage: number;
  rlCoverage: number;
}

export interface EmailRlBenchmarkSummary {
  benchmarkId: string;
  benchmarkName: string;
  datasetId: string;
  task: string;
  primaryMetrics: string[];
  scenarioCount: number;
  baselineReward: number;
  rlReward: number;
  rewardLiftPct: number;
  baselineCoverage: number;
  rlCoverage: number;
  coverageLiftPct: number;
}

export interface EmailRlBenchmarkResult {
  generatedAt: string;
  benchmarkIds: string[];
  trainingEpisodeCount: number;
  trainingDatasetIds: string[];
  selectedConfig: {
    gamma?: number;
    supportPenalty?: number;
    behaviorPenalty?: number;
    similarityFloor?: number;
    maxWriteFields: number;
    maxReadFields: number;
    maxExplainFields: number;
  };
  baseline: {
    averageReward: number;
    coverage: number;
    explainability: number;
  };
  rlPolicy: {
    averageReward: number;
    coverage: number;
    explainability: number;
  };
  rewardLiftPct: number;
  coverageLiftPct: number;
  benchmarks: EmailRlBenchmarkSummary[];
  scenarios: EmailRlScenarioResult[];
}

interface EmailRlScenario {
  scenarioId: string;
  benchmarkId: string;
  title: string;
  mode: "read" | "write" | "explain";
  packet: EmailSemanticPacketInput;
  weights: Partial<Record<EmailActionKey, number>>;
}

const generatedAt = "2026-04-21T09:00:00.000Z";
const defaultFieldBudgets = {
  maxWriteFields: 5,
  maxReadFields: 4,
  maxExplainFields: 4
};
const baselinePriority: EmailActionKey[] = [
  "ask",
  "stakeholder",
  "artifact",
  "question",
  "reply_style",
  "deadline",
  "decision",
  "constraint",
  "commitment",
  "risk",
  "next_action"
];

export async function runEmailRlBenchmark(input: RunEmailRlBenchmarkInput = {}): Promise<EmailRlBenchmarkResult> {
  const scenarios = filterScenarios(buildScenarios(), input.benchmarkIds);
  const trainingEpisodes = resolveTrainingEpisodes(input);
  const selectedConfig = {
    ...input.policyConfig,
    maxWriteFields: input.maxWriteFields ?? defaultFieldBudgets.maxWriteFields,
    maxReadFields: input.maxReadFields ?? defaultFieldBudgets.maxReadFields,
    maxExplainFields: input.maxExplainFields ?? defaultFieldBudgets.maxExplainFields
  };
  const policy = trainOfflineEmailPolicy(trainingEpisodes, input.policyConfig);
  const results = scenarios.map((scenario) =>
    runScenario(scenario, {
      policy,
      maxWriteFields: selectedConfig.maxWriteFields,
      maxReadFields: selectedConfig.maxReadFields,
      maxExplainFields: selectedConfig.maxExplainFields
    })
  );

  const baselineAverageReward = average(results.map((result) => result.baselineReward));
  const rlAverageReward = average(results.map((result) => result.rlReward));
  const baselineCoverage = average(results.map((result) => result.baselineCoverage));
  const rlCoverage = average(results.map((result) => result.rlCoverage));
  const baselineExplainability = 0;
  const rlExplainability = 1;

  return {
    generatedAt: input.generatedAt ?? generatedAt,
    benchmarkIds: uniqueBenchmarkIds(scenarios),
    trainingEpisodeCount: trainingEpisodes.length,
    trainingDatasetIds: uniqueStrings(trainingEpisodes.map((episode) => episode.datasetId ?? "unknown")),
    selectedConfig,
    baseline: {
      averageReward: roundTo(baselineAverageReward),
      coverage: roundTo(baselineCoverage),
      explainability: baselineExplainability
    },
    rlPolicy: {
      averageReward: roundTo(rlAverageReward),
      coverage: roundTo(rlCoverage),
      explainability: rlExplainability
    },
    rewardLiftPct: percentageLift(baselineAverageReward, rlAverageReward),
    coverageLiftPct: percentageLift(baselineCoverage, rlCoverage),
    benchmarks: summarizeBenchmarks(results),
    scenarios: results
  };
}

function runScenario(
  scenario: EmailRlScenario,
  input: {
    policy: ReturnType<typeof trainOfflineEmailPolicy>;
    maxWriteFields: number;
    maxReadFields: number;
    maxExplainFields: number;
  }
): EmailRlScenarioResult {
  const candidates = extractEmailSchemaCandidates(scenario.packet);
  const availableActions = emailActionKeys.filter((action) => candidates[action].length > 0);
  const maxFields =
    scenario.packet.maxFields ??
    (scenario.mode === "write"
      ? input.maxWriteFields
      : scenario.mode === "read"
        ? input.maxReadFields
        : input.maxExplainFields);
  const baselineSelected = baselinePriority.filter((action) => availableActions.includes(action)).slice(0, maxFields);
  const rlPacket = buildEmailSemanticPacket({
    ...scenario.packet,
    policy: input.policy,
    maxFields
  });
  const rlSelected = rlPacket.fields.map((field) => field.key);
  const benchmark = getEmailBenchmarkDefinition(scenario.benchmarkId);

  return {
    scenarioId: scenario.scenarioId,
    benchmarkId: scenario.benchmarkId,
    benchmarkName: benchmark?.name ?? scenario.benchmarkId,
    mode: scenario.mode,
    baselineSelected,
    rlSelected,
    baselineReward: roundTo(scoreSelection(baselineSelected, scenario.weights)),
    rlReward: roundTo(scoreSelection(rlSelected, scenario.weights)),
    baselineCoverage: roundTo(computeCoverage(baselineSelected, scenario.weights)),
    rlCoverage: roundTo(computeCoverage(rlSelected, scenario.weights))
  };
}

function scoreSelection(
  selected: EmailActionKey[],
  weights: Partial<Record<EmailActionKey, number>>
) {
  const selectedSet = new Set(selected);
  let reward = 0;
  for (const action of Object.keys(weights) as EmailActionKey[]) {
    if (selectedSet.has(action)) {
      reward += weights[action] ?? 0;
    }
  }

  const noisyFields = selected.filter((action) => (weights[action] ?? 0) === 0).length;
  reward -= noisyFields * 0.12;
  return reward;
}

function computeCoverage(
  selected: EmailActionKey[],
  weights: Partial<Record<EmailActionKey, number>>
) {
  const targetActions = (Object.keys(weights) as EmailActionKey[]).filter((action) => (weights[action] ?? 0) > 0);
  if (targetActions.length === 0) {
    return 1;
  }

  const selectedSet = new Set(selected);
  const covered = targetActions.filter((action) => selectedSet.has(action)).length;
  return covered / targetActions.length;
}

function buildScenarios(): EmailRlScenario[] {
  return [
    {
      scenarioId: "customer-security-reply",
      benchmarkId: "enronsr-reply-alignment",
      title: "Reply with evidence, deadline, and style control",
      mode: "write",
      packet: {
        mode: "write",
        from: "buyer@example.com",
        to: ["frontdesk@mailclaws.test", "sales@example.com"],
        cc: ["security@example.com"],
        subject: "Pilot pricing and security follow-up",
        body:
          "Please send one customer-ready reply with the pilot pricing and current SSO status by Friday. Keep it concise and avoid internal process notes.",
        attachments: [
          {
            filename: "pricing.md",
            summaryText: "Pilot starts at $12k and includes audit logs."
          },
          {
            filename: "security.md",
            summaryText: "SSO is available, but SCIM is still pending review."
          }
        ],
        maxFields: 5
      },
      weights: {
        ask: 1.25,
        deadline: 1.1,
        artifact: 1.0,
        constraint: 0.95,
        reply_style: 0.75
      }
    },
    {
      scenarioId: "budget-signoff-brief",
      benchmarkId: "bc3-thread-summary",
      title: "Summarize sign-off state and remaining follow-up",
      mode: "explain",
      packet: {
        mode: "explain",
        from: "ops-lead@example.com",
        to: ["frontdesk@mailclaws.test", "finance@example.com", "cto@example.com"],
        subject: "Migration budget sign-off",
        body:
          "We approved the migration budget yesterday. Finance still needs the final owner and the go-live date by 2026-05-01. The main risk is procurement lead time.",
        preSnapshot: {
          decisions: ["Migration budget approved."],
          requestedActions: ["Name the final owner and confirm the date for finance."],
          commitments: [
            {
              owner: "ops-lead@example.com",
              action: "Send the finalized budget note",
              dueAt: "2026-05-01"
            }
          ]
        },
        maxFields: 5
      },
      weights: {
        decision: 1.2,
        deadline: 1.0,
        risk: 0.95,
        next_action: 0.9,
        stakeholder: 0.55
      }
    },
    {
      scenarioId: "customer-handoff",
      benchmarkId: "radar-action-items",
      title: "Extract owner, commitment, and follow-up handoff",
      mode: "explain",
      packet: {
        mode: "explain",
        from: "ae@example.com",
        to: ["frontdesk@mailclaws.test", "support@example.com", "legal@example.com"],
        subject: "Need someone to take over the customer follow-up",
        body:
          "Can you take over the customer follow-up? I will send the draft contract tomorrow. Open question: should legal join the next reply?",
        preSnapshot: {
          openQuestions: ["Should legal join the next reply?"],
          commitments: [
            {
              owner: "ae@example.com",
              action: "Send the draft contract",
              dueAt: "tomorrow"
            }
          ],
          requestedActions: ["Take over the customer follow-up thread."]
        },
        maxFields: 5
      },
      weights: {
        commitment: 1.15,
        question: 1.0,
        next_action: 0.95,
        deadline: 0.75,
        stakeholder: 0.5
      }
    },
    {
      scenarioId: "contract-redline-reply",
      benchmarkId: "enronsr-reply-alignment",
      title: "Write a customer reply from legal decisions and artifacts",
      mode: "write",
      packet: {
        mode: "write",
        from: "procurement@example.com",
        to: ["frontdesk@mailclaws.test"],
        cc: ["legal@example.com", "sales@example.com"],
        subject: "Redlines before signature",
        body:
          "Please confirm whether the indemnity cap is approved and send the customer-facing reply by Tuesday. Keep the note short and do not mention internal debate.",
        attachments: [
          {
            filename: "msa-redlines.docx",
            summaryText: "Customer asks for a higher indemnity cap and mutual confidentiality."
          }
        ],
        preSnapshot: {
          decisions: ["Legal approved the confidentiality language."],
          requestedActions: ["Send the customer-facing reply with the approved clauses only."]
        },
        maxFields: 5
      },
      weights: {
        ask: 1.15,
        decision: 1.05,
        artifact: 0.95,
        deadline: 0.9,
        constraint: 0.85
      }
    },
    {
      scenarioId: "incident-escalation-read",
      benchmarkId: "mailex-event-extraction",
      title: "Preserve event triggers, risk state, and escalation step",
      mode: "read",
      packet: {
        mode: "read",
        from: "support@example.com",
        to: ["frontdesk@mailclaws.test", "infra@example.com", "oncall@example.com"],
        subject: "Customer impact still ongoing",
        body:
          "The issue is still blocking customer logins. We decided to keep the mitigation in place for now. Next action is to escalate to infra if the fix is not verified today.",
        maxFields: 5
      },
      weights: {
        risk: 1.1,
        decision: 1.0,
        next_action: 0.92,
        deadline: 0.74,
        stakeholder: 0.48
      }
    },
    {
      scenarioId: "thread-summary-for-executive-brief",
      benchmarkId: "emailsum-thread-summarization",
      title: "Compress a long thread into a summary-ready packet",
      mode: "explain",
      packet: {
        mode: "explain",
        from: "pm@example.com",
        to: ["frontdesk@mailclaws.test", "exec@example.com", "ops@example.com"],
        subject: "Launch readiness recap",
        body:
          "We confirmed the launch date for next Wednesday, but there is still one open question around billing migration. Dana will send the final checklist tonight. Please prepare the executive brief without replaying the entire thread.",
        preSnapshot: {
          decisions: ["Launch date confirmed for next Wednesday."],
          openQuestions: ["Is billing migration complete for the remaining enterprise accounts?"],
          commitments: [
            {
              owner: "Dana",
              action: "Send the final checklist",
              dueAt: "tonight"
            }
          ],
          requestedActions: ["Prepare the executive brief."]
        }
      },
      weights: {
        decision: 1.08,
        question: 1.0,
        commitment: 0.92,
        deadline: 0.86,
        next_action: 0.82
      }
    },
    {
      scenarioId: "meeting-follow-up-action-items",
      benchmarkId: "radar-action-items",
      title: "Convert a mail thread into owners and next actions",
      mode: "read",
      packet: {
        mode: "read",
        from: "chief-of-staff@example.com",
        to: ["frontdesk@mailclaws.test", "eng@example.com", "design@example.com"],
        subject: "After today's roadmap meeting",
        body:
          "Alex will update the prototype by Thursday. Priya needs to confirm the vendor quote. Please send me the owner list and next actions after you review the notes.",
        attachments: [
          {
            filename: "notes.txt",
            summaryText: "Owners discussed: Alex on prototype, Priya on vendor quote, Sam on launch memo."
          }
        ]
      },
      weights: {
        commitment: 1.15,
        next_action: 1.08,
        stakeholder: 0.82,
        deadline: 0.76,
        artifact: 0.58
      }
    },
    {
      scenarioId: "vendor-approval-event-chain",
      benchmarkId: "mailex-event-extraction",
      title: "Keep event arguments for approvals and procurement timing",
      mode: "read",
      packet: {
        mode: "read",
        from: "procurement@example.com",
        to: ["frontdesk@mailclaws.test", "finance@example.com", "legal@example.com"],
        subject: "PO approval and shipment timeline",
        body:
          "Finance approved the purchase order this morning. Legal still needs to sign the addendum, and the vendor expects shipment on Monday if that happens today.",
        attachments: [
          {
            filename: "po-summary.txt",
            summaryText: "Event chain: finance approval, legal addendum signature pending, vendor shipment on Monday."
          }
        ]
      },
      weights: {
        decision: 1.08,
        deadline: 0.98,
        artifact: 0.88,
        stakeholder: 0.74,
        next_action: 0.64
      }
    }
  ];
}

function filterScenarios(scenarios: EmailRlScenario[], benchmarkIds?: string[]) {
  const normalizedIds = (benchmarkIds ?? []).map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (normalizedIds.length === 0) {
    return scenarios;
  }

  const requested = new Set(normalizedIds);
  return scenarios.filter((scenario) => requested.has(scenario.benchmarkId));
}

function uniqueBenchmarkIds(scenarios: EmailRlScenario[]) {
  return [...new Set(scenarios.map((scenario) => scenario.benchmarkId))];
}

function summarizeBenchmarks(results: EmailRlScenarioResult[]): EmailRlBenchmarkSummary[] {
  return listEmailBenchmarkDefinitions()
    .flatMap((benchmark) => {
      const matching = results.filter((result) => result.benchmarkId === benchmark.benchmarkId);
      if (matching.length === 0) {
        return [];
      }

      const baselineReward = average(matching.map((result) => result.baselineReward));
      const rlReward = average(matching.map((result) => result.rlReward));
      const baselineCoverage = average(matching.map((result) => result.baselineCoverage));
      const rlCoverage = average(matching.map((result) => result.rlCoverage));

      return [
        {
          benchmarkId: benchmark.benchmarkId,
          benchmarkName: benchmark.name,
          datasetId: benchmark.datasetId,
          task: benchmark.task,
          primaryMetrics: benchmark.primaryMetrics,
          scenarioCount: matching.length,
          baselineReward: roundTo(baselineReward),
          rlReward: roundTo(rlReward),
          rewardLiftPct: percentageLift(baselineReward, rlReward),
          baselineCoverage: roundTo(baselineCoverage),
          rlCoverage: roundTo(rlCoverage),
          coverageLiftPct: percentageLift(baselineCoverage, rlCoverage)
        }
      ];
    })
    .sort((left, right) => right.rewardLiftPct - left.rewardLiftPct || left.benchmarkId.localeCompare(right.benchmarkId));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundTo(value: number) {
  return Math.round(value * 1000) / 1000;
}

function percentageLift(baseline: number, improved: number) {
  if (baseline === 0) {
    return improved > 0 ? 100 : 0;
  }
  return roundTo(((improved - baseline) / baseline) * 100);
}

function resolveTrainingEpisodes(input: RunEmailRlBenchmarkInput) {
  if (!input.trainingEpisodes || input.trainingEpisodes.length === 0) {
    return seedEmailTrajectoryEpisodes;
  }

  return input.appendSeedEpisodes ? [...seedEmailTrajectoryEpisodes, ...input.trainingEpisodes] : input.trainingEpisodes;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function renderEmailRlBenchmarkMarkdown(result: EmailRlBenchmarkResult) {
  const lines = [
    "# Email Offline RL Benchmark",
    "",
    `Generated at: ${result.generatedAt}`,
    `Benchmarks: ${result.benchmarkIds.join(", ")}`,
    `Training episodes: ${result.trainingEpisodeCount} (${result.trainingDatasetIds.join(", ")})`,
    `Config: gamma ${result.selectedConfig.gamma ?? "default"} | supportPenalty ${result.selectedConfig.supportPenalty ?? "default"} | behaviorPenalty ${result.selectedConfig.behaviorPenalty ?? "default"} | similarityFloor ${result.selectedConfig.similarityFloor ?? "default"} | fields write/read/explain ${result.selectedConfig.maxWriteFields}/${result.selectedConfig.maxReadFields}/${result.selectedConfig.maxExplainFields}`,
    "",
    `- Baseline reward: ${result.baseline.averageReward}`,
    `- RL reward: ${result.rlPolicy.averageReward}`,
    `- Reward lift: ${result.rewardLiftPct}%`,
    `- Baseline coverage: ${result.baseline.coverage}`,
    `- RL coverage: ${result.rlPolicy.coverage}`,
    `- Coverage lift: ${result.coverageLiftPct}%`,
    "",
    "## Benchmark summaries"
  ];

  for (const benchmark of result.benchmarks) {
    lines.push(
      `- ${benchmark.benchmarkName}: reward lift ${benchmark.rewardLiftPct}% | coverage lift ${benchmark.coverageLiftPct}% | metrics ${benchmark.primaryMetrics.join(", ")}`
    );
  }

  lines.push(
    "",
    "## Scenario snapshots"
  );

  for (const scenario of result.scenarios) {
    lines.push(
      `- ${scenario.scenarioId} (${scenario.benchmarkName}): baseline ${scenario.baselineSelected.map((action) => getEmailFieldLabel(action)).join(", ")} | RL ${scenario.rlSelected.map((action) => getEmailFieldLabel(action)).join(", ")}`
    );
  }

  return lines.join("\n");
}
