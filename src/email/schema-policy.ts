import {
  emailActionKeys,
  rankEmailActions,
  trainOfflineEmailPolicy,
  type EmailActionKey,
  type EmailActionScore,
  type EmailPolicyState,
  type EmailTrajectoryEpisode,
  type OfflineEmailPolicy
} from "./offline-rl.js";

export interface EmailPromptAttachment {
  filename: string;
  summaryText?: string | null;
}

export interface EmailPromptSearchHit {
  title: string;
  excerpt: string;
}

export interface EmailPromptContextSnapshot {
  summary?: string;
  decisions?: string[];
  openQuestions?: string[];
  requestedActions?: string[];
  commitments?: Array<{
    owner: string;
    action: string;
    dueAt?: string;
  }>;
}

export interface EmailSemanticPacketInput {
  mode: EmailPolicyState["mode"];
  from?: string;
  to?: string[];
  cc?: string[];
  replyTo?: string[];
  subject?: string;
  body?: string;
  attachments?: EmailPromptAttachment[];
  retrievedContext?: EmailPromptSearchHit[];
  preSnapshot?: EmailPromptContextSnapshot | null;
  maxFields?: number;
  policy?: OfflineEmailPolicy;
}

export type EmailSchemaCandidateMap = Record<EmailActionKey, string[]>;

export interface EmailSemanticField {
  key: EmailActionKey;
  label: string;
  values: string[];
  score: number;
  rationale: string;
}

export interface EmailSemanticPacket {
  mode: EmailPolicyState["mode"];
  summary: string;
  state: EmailPolicyState;
  fields: EmailSemanticField[];
  droppedFields: EmailActionKey[];
}

export const seedEmailTrajectoryEpisodes: EmailTrajectoryEpisode[] = [
  {
    episodeId: "write-deadline-attachments",
    steps: buildEpisodeSteps(
      {
        mode: "write",
        hasExplicitAsk: true,
        hasQuestion: true,
        hasDeadline: true,
        hasDecision: false,
        hasCommitment: false,
        hasAttachments: true,
        hasConstraints: true,
        hasRisks: false,
        multiPartyThread: true,
        hasOpenQuestions: true
      },
      [
        ["ask", 1.25],
        ["deadline", 1.12],
        ["artifact", 0.96],
        ["constraint", 0.84],
        ["stakeholder", 0.54],
        ["reply_style", 0.32]
      ]
    )
  },
  {
    episodeId: "write-decision-handoff",
    steps: buildEpisodeSteps(
      {
        mode: "write",
        hasExplicitAsk: true,
        hasQuestion: false,
        hasDeadline: true,
        hasDecision: true,
        hasCommitment: true,
        hasAttachments: false,
        hasConstraints: true,
        hasRisks: false,
        multiPartyThread: true,
        hasOpenQuestions: false
      },
      [
        ["decision", 1.22],
        ["commitment", 1.08],
        ["next_action", 0.93],
        ["deadline", 0.87],
        ["stakeholder", 0.51]
      ]
    )
  },
  {
    episodeId: "read-attachment-escalation",
    steps: buildEpisodeSteps(
      {
        mode: "read",
        hasExplicitAsk: false,
        hasQuestion: false,
        hasDeadline: false,
        hasDecision: true,
        hasCommitment: false,
        hasAttachments: true,
        hasConstraints: false,
        hasRisks: true,
        multiPartyThread: true,
        hasOpenQuestions: false
      },
      [
        ["artifact", 1.18],
        ["decision", 1.01],
        ["risk", 0.95],
        ["stakeholder", 0.52],
        ["next_action", 0.48]
      ]
    )
  },
  {
    episodeId: "explain-commitment-open-questions",
    steps: buildEpisodeSteps(
      {
        mode: "explain",
        hasExplicitAsk: true,
        hasQuestion: true,
        hasDeadline: true,
        hasDecision: false,
        hasCommitment: true,
        hasAttachments: false,
        hasConstraints: false,
        hasRisks: false,
        multiPartyThread: true,
        hasOpenQuestions: true
      },
      [
        ["commitment", 1.16],
        ["question", 1.01],
        ["next_action", 0.94],
        ["deadline", 0.75],
        ["stakeholder", 0.47]
      ]
    )
  },
  {
    episodeId: "explain-decision-risk",
    steps: buildEpisodeSteps(
      {
        mode: "explain",
        hasExplicitAsk: false,
        hasQuestion: false,
        hasDeadline: true,
        hasDecision: true,
        hasCommitment: false,
        hasAttachments: false,
        hasConstraints: true,
        hasRisks: true,
        multiPartyThread: true,
        hasOpenQuestions: false
      },
      [
        ["decision", 1.18],
        ["risk", 1.05],
        ["deadline", 0.9],
        ["next_action", 0.8],
        ["constraint", 0.52]
      ]
    )
  },
  {
    episodeId: "read-direct-question",
    steps: buildEpisodeSteps(
      {
        mode: "read",
        hasExplicitAsk: true,
        hasQuestion: true,
        hasDeadline: false,
        hasDecision: false,
        hasCommitment: false,
        hasAttachments: false,
        hasConstraints: false,
        hasRisks: false,
        multiPartyThread: false,
        hasOpenQuestions: true
      },
      [
        ["ask", 1.1],
        ["question", 1.02],
        ["next_action", 0.74],
        ["stakeholder", 0.31]
      ]
    )
  },
  {
    episodeId: "write-style-governance",
    steps: buildEpisodeSteps(
      {
        mode: "write",
        hasExplicitAsk: true,
        hasQuestion: false,
        hasDeadline: false,
        hasDecision: false,
        hasCommitment: false,
        hasAttachments: false,
        hasConstraints: true,
        hasRisks: false,
        multiPartyThread: false,
        hasOpenQuestions: false
      },
      [
        ["ask", 1.02],
        ["reply_style", 0.91],
        ["constraint", 0.88],
        ["next_action", 0.53]
      ]
    )
  },
  {
    episodeId: "read-commitment-deadline",
    steps: buildEpisodeSteps(
      {
        mode: "read",
        hasExplicitAsk: false,
        hasQuestion: false,
        hasDeadline: true,
        hasDecision: false,
        hasCommitment: true,
        hasAttachments: false,
        hasConstraints: false,
        hasRisks: false,
        multiPartyThread: true,
        hasOpenQuestions: false
      },
      [
        ["commitment", 1.05],
        ["deadline", 0.97],
        ["stakeholder", 0.44],
        ["next_action", 0.41]
      ]
    )
  }
];

export const builtInOfflineEmailPolicy = trainOfflineEmailPolicy(seedEmailTrajectoryEpisodes);

const emailFieldLabels: Record<EmailActionKey, string> = {
  ask: "Primary ask",
  deadline: "Deadline signals",
  decision: "Decisions",
  commitment: "Commitments",
  stakeholder: "Stakeholders",
  artifact: "Evidence and artifacts",
  constraint: "Constraints",
  risk: "Risks",
  question: "Open questions",
  reply_style: "Reply style",
  next_action: "Next actions"
};

const stylePattern = /\b(concise|brief|short|one sentence|bullet|customer-ready|formal|friendly|reply all|internal only)\b/i;
const askPattern = /\b(can you|could you|would you|please|need you to|need to|send|share|confirm|review|update|reply|prepare)\b/i;
const deadlinePattern =
  /\b(today|tomorrow|tonight|eod|end of day|this week|next week|by [a-z]+day|by \d{4}-\d{2}-\d{2}|by [a-z]{3,9} \d{1,2}|\d{4}-\d{2}-\d{2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday|jan(?:uary)? \d{1,2}|feb(?:ruary)? \d{1,2}|mar(?:ch)? \d{1,2}|apr(?:il)? \d{1,2}|may \d{1,2}|jun(?:e)? \d{1,2}|jul(?:y)? \d{1,2}|aug(?:ust)? \d{1,2}|sep(?:tember)? \d{1,2}|oct(?:ober)? \d{1,2}|nov(?:ember)? \d{1,2}|dec(?:ember)? \d{1,2})\b/i;
const decisionPattern = /\b(approved|approve|approved|decided|decision|confirmed|confirm|signed off|accepted|agreed)\b/i;
const commitmentPattern = /\b(i will|we will|i'll|we'll|we can|owner:|take over|follow up|send the|prepare the)\b/i;
const constraintPattern = /\b(must|should not|do not|don't|without|only|required|required to|no later than|keep it|avoid)\b/i;
const riskPattern = /\b(risk|blocker|issue|concern|escalat|dependency|waiting on|unclear)\b/i;

export function buildEmailSemanticPacket(input: EmailSemanticPacketInput): EmailSemanticPacket {
  const candidates = extractEmailSchemaCandidates(input);
  const state = buildEmailPolicyState(input, candidates);
  const availableActions = emailActionKeys.filter((action) => candidates[action].length > 0);
  const ranked = rankEmailActions(input.policy ?? builtInOfflineEmailPolicy, state, availableActions);
  const maxFields = input.maxFields ?? (input.mode === "write" ? 5 : 4);
  const selectedFields = ranked.slice(0, maxFields).map((entry) => toSemanticField(entry, candidates[entry.action]));
  const selectedActions = new Set(selectedFields.map((field) => field.key));
  const droppedFields = availableActions.filter((action) => !selectedActions.has(action));
  const summary = buildPacketSummary(input, selectedFields);

  return {
    mode: input.mode,
    summary,
    state,
    fields: selectedFields,
    droppedFields
  };
}

export function extractEmailSchemaCandidates(input: EmailSemanticPacketInput): EmailSchemaCandidateMap {
  const body = normalizeWhitespace(input.body ?? "");
  const subject = normalizeWhitespace(input.subject ?? "");
  const sentences = splitSentences([subject, body].filter((entry) => entry.length > 0).join(". "));
  const candidates = createEmptyCandidateMap();

  addCandidates(candidates.ask, [
    ...sentences.filter((sentence) => askPattern.test(sentence) || sentence.includes("?")),
    ...(input.preSnapshot?.requestedActions ?? [])
  ]);
  addCandidates(
    candidates.deadline,
    sentences.filter((sentence) => deadlinePattern.test(sentence)).concat(
      (input.preSnapshot?.commitments ?? [])
        .filter((commitment) => typeof commitment.dueAt === "string" && commitment.dueAt.trim().length > 0)
        .map((commitment) => `${commitment.owner}: ${commitment.action} by ${commitment.dueAt}`)
    )
  );
  addCandidates(
    candidates.decision,
    sentences.filter((sentence) => decisionPattern.test(sentence)).concat(input.preSnapshot?.decisions ?? [])
  );
  addCandidates(
    candidates.commitment,
    sentences
      .filter((sentence) => commitmentPattern.test(sentence))
      .concat(
        (input.preSnapshot?.commitments ?? []).map((commitment) =>
          `${commitment.owner}: ${commitment.action}${commitment.dueAt ? ` (due ${commitment.dueAt})` : ""}`
        )
      )
  );
  addCandidates(
    candidates.stakeholder,
    uniqueStrings([
      input.from ?? "",
      ...(input.to ?? []),
      ...(input.cc ?? []),
      ...(input.replyTo ?? [])
    ])
  );
  addCandidates(
    candidates.artifact,
    [
      ...(input.attachments ?? []).map((attachment) =>
        attachment.summaryText?.trim()
          ? `${attachment.filename}: ${normalizeWhitespace(attachment.summaryText)}`
          : attachment.filename
      ),
      ...(input.retrievedContext ?? []).map(
        (entry) => `${normalizeWhitespace(entry.title)}: ${normalizeWhitespace(entry.excerpt)}`
      )
    ].filter((entry) => entry.trim().length > 0)
  );
  addCandidates(candidates.constraint, sentences.filter((sentence) => constraintPattern.test(sentence)));
  addCandidates(candidates.risk, sentences.filter((sentence) => riskPattern.test(sentence)));
  addCandidates(
    candidates.question,
    sentences.filter((sentence) => sentence.includes("?")).concat(input.preSnapshot?.openQuestions ?? [])
  );
  addCandidates(candidates.reply_style, sentences.filter((sentence) => stylePattern.test(sentence)));
  addCandidates(
    candidates.next_action,
    [
      ...(input.preSnapshot?.requestedActions ?? []),
      ...(input.preSnapshot?.commitments ?? []).map((commitment) => commitment.action),
      ...sentences.filter((sentence) => askPattern.test(sentence))
    ].filter((entry) => entry.trim().length > 0)
  );

  return candidates;
}

export function formatEmailSemanticPacket(packet: EmailSemanticPacket) {
  const lines = [
    "Current inbound email packet:",
    `- Mode: ${packet.mode}`,
    `- Summary: ${packet.summary}`
  ];

  if (packet.fields.length > 0) {
    lines.push("Retained schema fields:");
    for (const field of packet.fields) {
      lines.push(
        `- ${field.label}: ${field.values
          .slice(0, 2)
          .map((value) => truncateValue(value, 96))
          .join(" | ")} [why: ${field.rationale}]`
      );
    }
  }

  return lines.join("\n");
}

export function getEmailFieldLabel(action: EmailActionKey) {
  return emailFieldLabels[action];
}

function buildEpisodeSteps(
  state: EmailPolicyState,
  rewards: Array<[EmailActionKey, number]>
): EmailTrajectoryEpisode["steps"] {
  return rewards.map(([action, reward]) => ({
    state,
    action,
    reward
  }));
}

function createEmptyCandidateMap(): EmailSchemaCandidateMap {
  return {
    ask: [],
    deadline: [],
    decision: [],
    commitment: [],
    stakeholder: [],
    artifact: [],
    constraint: [],
    risk: [],
    question: [],
    reply_style: [],
    next_action: []
  };
}

function addCandidates(target: string[], values: string[]) {
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized || target.includes(normalized)) {
      continue;
    }
    target.push(normalized);
  }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((entry) => normalizeWhitespace(entry)).filter((entry) => entry.length > 0))];
}

function splitSentences(inputText: string) {
  return inputText
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((entry) => normalizeWhitespace(entry))
    .filter((entry) => entry.length > 0);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function buildEmailPolicyState(
  input: EmailSemanticPacketInput,
  candidates: EmailSchemaCandidateMap
): EmailPolicyState {
  const recipientCount =
    (input.from ? 1 : 0) + (input.to?.length ?? 0) + (input.cc?.length ?? 0) + (input.replyTo?.length ?? 0);

  return {
    mode: input.mode,
    hasExplicitAsk: candidates.ask.length > 0,
    hasQuestion: candidates.question.length > 0,
    hasDeadline: candidates.deadline.length > 0,
    hasDecision: candidates.decision.length > 0,
    hasCommitment: candidates.commitment.length > 0,
    hasAttachments: candidates.artifact.length > 0,
    hasConstraints: candidates.constraint.length > 0,
    hasRisks: candidates.risk.length > 0,
    multiPartyThread: recipientCount >= 3,
    hasOpenQuestions: candidates.question.length > 0
  };
}

function toSemanticField(entry: EmailActionScore, values: string[]): EmailSemanticField {
  return {
    key: entry.action,
    label: emailFieldLabels[entry.action],
    values,
    score: entry.score,
    rationale: entry.rationale
  };
}

function buildPacketSummary(input: EmailSemanticPacketInput, fields: EmailSemanticField[]) {
  const fragments = fields
    .slice(0, 2)
    .map((field) => `${field.label}: ${truncateValue(field.values[0] ?? "", 72)}`)
    .filter((entry) => entry.trim().length > 0);

  const subject = normalizeWhitespace(input.subject ?? "");
  if (subject) {
    return fragments.length > 0 ? `${subject} | ${fragments.join(" | ")}` : subject;
  }

  if (fragments.length > 0) {
    return fragments.join(" | ");
  }

  return "No structured email cues were retained.";
}

function truncateValue(value: string, limit: number) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 3)).trim()}...`;
}
