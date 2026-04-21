export interface EmailDatasetCatalogEntry {
  datasetId: string;
  name: string;
  access: "public" | "research_license";
  scale: string;
  focus: string;
  homepage: string;
  strengths: string[];
  cautions: string[];
}

export const emailDatasetCatalog: EmailDatasetCatalogEntry[] = [
  {
    datasetId: "enron-email",
    name: "Enron Email Dataset",
    access: "public",
    scale: "About 0.5M emails from roughly 150 users.",
    focus: "Large real-world corporate email graph for thread structure, role routing, and longitudinal behavior.",
    homepage: "https://www.cs.cmu.edu/~enron/",
    strengths: [
      "Best public baseline for enterprise-style thread recovery and multi-party collaboration patterns.",
      "Good fit for retention, routing, and recipient reasoning."
    ],
    cautions: [
      "Historic corporate language and compliance norms differ from modern SaaS support or product org mail.",
      "No gold summaries or explanation labels out of the box."
    ]
  },
  {
    datasetId: "avocado-email",
    name: "Avocado Research Email Collection",
    access: "research_license",
    scale: "938,035 messages from 279 mailboxes.",
    focus: "Modern business email with folders and richer enterprise communication patterns than Enron.",
    homepage: "https://catalog.ldc.upenn.edu/LDC2015T03",
    strengths: [
      "High-value corpus for work-email read/write policy learning.",
      "Useful for modeling business requests, commitments, and follow-up chains."
    ],
    cautions: [
      "Requires LDC access.",
      "Still needs downstream annotation or reward shaping for reply quality and explainability."
    ]
  },
  {
    datasetId: "bc3",
    name: "BC3 Email Corpus",
    access: "public",
    scale: "40 email threads with manual thread and summary annotations.",
    focus: "Thread summarization and extractive sentence salience.",
    homepage: "https://www.cs.ubc.ca/labs/lci/bc3/download.html",
    strengths: [
      "Small but directly labeled for summary-style retention.",
      "Useful for offline reward design around salient sentence selection."
    ],
    cautions: [
      "Too small to train a general work-email policy alone.",
      "Should be used as evaluation or reward-calibration data, not the only behavior source."
    ]
  },
  {
    datasetId: "w3c-corpus",
    name: "W3C Corpus",
    access: "public",
    scale: "Public W3C mailing-list mail used in TREC Enterprise.",
    focus: "Technical discussion threads with explicit decisions, disagreements, and follow-up structure.",
    homepage: "https://trec.nist.gov/pubs/trec14/papers/ENTERPRISE.OVERVIEW.pdf",
    strengths: [
      "Good for explainability, argument tracking, and action extraction in long threads.",
      "Public and easy to distribute inside benchmark pipelines."
    ],
    cautions: [
      "Not private enterprise mail.",
      "Language style is standards-committee heavy and can bias the policy toward technical discussion."
    ]
  },
  {
    datasetId: "emailsum",
    name: "EmailSum",
    access: "public",
    scale: "Large email-thread summarization dataset derived from email corpora.",
    focus: "Abstractive thread summarization targets for read/explain evaluation.",
    homepage: "https://github.com/ZhangShiyue/EmailSum",
    strengths: [
      "Provides direct summary supervision missing from raw mail corpora.",
      "Useful for evaluating whether retained context still supports concise thread summaries."
    ],
    cautions: [
      "Derived summarization labels do not cover governed reply writing by themselves.",
      "Needs pairing with raw enterprise mail traces for policy learning."
    ]
  },
  {
    datasetId: "radar-action-items",
    name: "RADAR Action-Item Dataset",
    access: "public",
    scale: "Email and meeting data annotated for action-item extraction.",
    focus: "Actionability, commitments, and follow-up detection.",
    homepage: "https://www.cs.cmu.edu/~pbennett/action-item-dataset.html",
    strengths: [
      "Strong fit for extracting commitments, owners, and next actions from work mail.",
      "Useful for reward terms tied to handoff quality in multi-agent collaboration."
    ],
    cautions: [
      "Not a full end-to-end reply dataset.",
      "Best used as a specialist signal layered on top of broader mail corpora."
    ]
  }
];

export function recommendEmailDatasetMix() {
  return {
    behaviorPolicy: ["enron-email", "avocado-email"],
    retentionRewardCalibration: ["bc3", "emailsum"],
    actionabilityCalibration: ["radar-action-items"],
    explainabilityAndDisagreement: ["w3c-corpus"]
  };
}
