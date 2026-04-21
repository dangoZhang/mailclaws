export type EmailBenchmarkOperation = "read" | "write" | "explain";

export interface EmailBenchmarkCandidateDefinition {
  candidateId: string;
  datasetId: string;
  name: string;
  status: "implemented" | "planned" | "license_gated";
  kind: "benchmark" | "behavior_source";
  operations: EmailBenchmarkOperation[];
  homepage: string;
  whyItMatters: string;
}

export const emailBenchmarkCandidateRegistry: EmailBenchmarkCandidateDefinition[] = [
  {
    candidateId: "emailsum-thread-summarization",
    datasetId: "emailsum",
    name: "EmailSum Thread Summarization",
    status: "implemented",
    kind: "benchmark",
    operations: ["read", "explain"],
    homepage: "https://github.com/ZhangShiyue/EmailSum",
    whyItMatters: "Measures whether compact packets still support faithful thread summaries."
  },
  {
    candidateId: "bc3-thread-summary",
    datasetId: "bc3",
    name: "BC3 Thread Summary",
    status: "implemented",
    kind: "benchmark",
    operations: ["read", "explain"],
    homepage: "https://www.cs.ubc.ca/labs/lci/bc3/download.html",
    whyItMatters: "Checks whether salient sentences, decisions, and follow-up notes survive retention."
  },
  {
    candidateId: "radar-action-items",
    datasetId: "radar-action-items",
    name: "RADAR Action Items",
    status: "implemented",
    kind: "benchmark",
    operations: ["read", "write", "explain"],
    homepage: "https://www.cs.cmu.edu/~pbennett/action-item-dataset.html",
    whyItMatters: "Evaluates owner, commitment, and next-action retention for work-email handoff."
  },
  {
    candidateId: "mailex-event-extraction",
    datasetId: "enron-email",
    name: "MailEx Event Extraction",
    status: "implemented",
    kind: "benchmark",
    operations: ["read", "explain"],
    homepage: "https://github.com/salokr/Email-Event-Extraction",
    whyItMatters: "Tests whether event triggers, arguments, and timing details survive compression."
  },
  {
    candidateId: "enronsr-reply-alignment",
    datasetId: "enron-email",
    name: "EnronSR Reply Alignment",
    status: "implemented",
    kind: "benchmark",
    operations: ["write"],
    homepage: "https://sel.sise.bgu.ac.il/assets/pubs/enron-sr-icwsm-2024.pdf",
    whyItMatters: "Checks whether the packet preserves enough context to draft a faithful reply."
  },
  {
    candidateId: "aeslc-subject-generation",
    datasetId: "aeslc",
    name: "AESLC Subject Generation",
    status: "planned",
    kind: "benchmark",
    operations: ["write"],
    homepage: "https://aclanthology.org/P19-1043.pdf",
    whyItMatters: "Good next write benchmark for intent retention under aggressive compression."
  },
  {
    candidateId: "cerec-entity-resolution",
    datasetId: "cerec",
    name: "CEREC Entity Resolution",
    status: "planned",
    kind: "benchmark",
    operations: ["read", "explain"],
    homepage: "https://aclanthology.org/2020.coling-main.30/",
    whyItMatters: "Stress-tests stakeholder disambiguation, pronoun carryover, and long-thread references."
  },
  {
    candidateId: "w3c-known-item-search",
    datasetId: "w3c-corpus",
    name: "W3C Known-Item Search",
    status: "planned",
    kind: "benchmark",
    operations: ["read", "explain"],
    homepage: "https://trec.nist.gov/pubs/trec14/papers/ENTERPRISE.OVERVIEW.pdf",
    whyItMatters: "Useful for retrieval-style evaluation when workers must find the one message that matters."
  },
  {
    candidateId: "avocado-behavior-trajectories",
    datasetId: "avocado-email",
    name: "Avocado Behavior Trajectories",
    status: "license_gated",
    kind: "behavior_source",
    operations: ["read", "write", "explain"],
    homepage: "https://catalog.ldc.upenn.edu/docs/LDC2015T03/README.txt",
    whyItMatters: "Best next source for imported work-email behavior trajectories once licensed."
  }
];

export function listEmailBenchmarkCandidates() {
  return [...emailBenchmarkCandidateRegistry];
}

export function getEmailBenchmarkCandidate(candidateId: string) {
  return emailBenchmarkCandidateRegistry.find((entry) => entry.candidateId === candidateId) ?? null;
}

export function recommendEmailBenchmarkCandidates(operation: EmailBenchmarkOperation) {
  return emailBenchmarkCandidateRegistry
    .filter((entry) => entry.operations.includes(operation))
    .sort(compareCandidatePriority);
}

export function recommendEmailBenchmarkPlan() {
  return {
    write: ["enronsr-reply-alignment", "aeslc-subject-generation"],
    read: ["radar-action-items", "mailex-event-extraction", "cerec-entity-resolution"],
    explain: ["emailsum-thread-summarization", "bc3-thread-summary", "w3c-known-item-search"],
    behaviorPolicy: ["avocado-behavior-trajectories"]
  };
}

function compareCandidatePriority(
  left: EmailBenchmarkCandidateDefinition,
  right: EmailBenchmarkCandidateDefinition
) {
  return (
    statusRank(left.status) - statusRank(right.status) ||
    kindRank(left.kind) - kindRank(right.kind) ||
    left.candidateId.localeCompare(right.candidateId)
  );
}

function statusRank(status: EmailBenchmarkCandidateDefinition["status"]) {
  if (status === "implemented") {
    return 0;
  }

  if (status === "planned") {
    return 1;
  }

  return 2;
}

function kindRank(kind: EmailBenchmarkCandidateDefinition["kind"]) {
  return kind === "benchmark" ? 0 : 1;
}
