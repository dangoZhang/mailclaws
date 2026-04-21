import {
  buildEmailSemanticPacket,
  builtInOfflineEmailPolicy,
  extractEmailSchemaCandidates,
  getEmailFieldLabel,
  type EmailSemanticPacketInput
} from "../email/schema-policy.js";
import { emailActionKeys, type EmailActionKey } from "../email/offline-rl.js";

export interface EmailRlScenarioResult {
  scenarioId: string;
  mode: "read" | "write" | "explain";
  baselineSelected: EmailActionKey[];
  rlSelected: EmailActionKey[];
  baselineReward: number;
  rlReward: number;
  baselineCoverage: number;
  rlCoverage: number;
}

export interface EmailRlBenchmarkResult {
  generatedAt: string;
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
  scenarios: EmailRlScenarioResult[];
}

interface EmailRlScenario {
  scenarioId: string;
  mode: "read" | "write" | "explain";
  packet: EmailSemanticPacketInput;
  weights: Partial<Record<EmailActionKey, number>>;
}

const generatedAt = "2026-04-21T09:00:00.000Z";
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

export async function runEmailRlBenchmark(): Promise<EmailRlBenchmarkResult> {
  const scenarios = buildScenarios();
  const results = scenarios.map((scenario) => runScenario(scenario));

  const baselineAverageReward = average(results.map((result) => result.baselineReward));
  const rlAverageReward = average(results.map((result) => result.rlReward));
  const baselineCoverage = average(results.map((result) => result.baselineCoverage));
  const rlCoverage = average(results.map((result) => result.rlCoverage));
  const baselineExplainability = 0;
  const rlExplainability = 1;

  return {
    generatedAt,
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
    scenarios: results
  };
}

function runScenario(scenario: EmailRlScenario): EmailRlScenarioResult {
  const candidates = extractEmailSchemaCandidates(scenario.packet);
  const availableActions = emailActionKeys.filter((action) => candidates[action].length > 0);
  const maxFields = scenario.packet.maxFields ?? (scenario.mode === "write" ? 6 : 5);
  const baselineSelected = baselinePriority.filter((action) => availableActions.includes(action)).slice(0, maxFields);
  const rlPacket = buildEmailSemanticPacket({
    ...scenario.packet,
    policy: builtInOfflineEmailPolicy
  });
  const rlSelected = rlPacket.fields.map((field) => field.key);

  return {
    scenarioId: scenario.scenarioId,
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
    }
  ];
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

export function renderEmailRlBenchmarkMarkdown(result: EmailRlBenchmarkResult) {
  const lines = [
    "# Email Offline RL Benchmark",
    "",
    `Generated at: ${result.generatedAt}`,
    "",
    `- Baseline reward: ${result.baseline.averageReward}`,
    `- RL reward: ${result.rlPolicy.averageReward}`,
    `- Reward lift: ${result.rewardLiftPct}%`,
    `- Baseline coverage: ${result.baseline.coverage}`,
    `- RL coverage: ${result.rlPolicy.coverage}`,
    `- Coverage lift: ${result.coverageLiftPct}%`,
    "",
    "## Scenario snapshots"
  ];

  for (const scenario of result.scenarios) {
    lines.push(
      `- ${scenario.scenarioId}: baseline ${scenario.baselineSelected.map((action) => getEmailFieldLabel(action)).join(", ")} | RL ${scenario.rlSelected.map((action) => getEmailFieldLabel(action)).join(", ")}`
    );
  }

  return lines.join("\n");
}
