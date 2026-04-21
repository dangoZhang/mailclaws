import fs from "node:fs";

import type { MailRuntimePolicyManifest, WorkerRole } from "../core/types.js";
import { workerRoles } from "../core/types.js";
import type { EmbeddedRuntimeAdapter, EmbeddedRuntimeTurnRequest } from "./embedded-executor.js";

const BUILTIN_POLICY_MANIFEST: MailRuntimePolicyManifest = {
  toolPolicies: [...workerRoles],
  sandboxPolicies: ["mail-room-orchestrator", "mail-room-worker"],
  networkAccess: "allowlisted",
  filesystemAccess: "workspace-read",
  outboundMode: "approval_required"
};

export function createBuiltInEmbeddedRuntimeAdapter(): EmbeddedRuntimeAdapter {
  return {
    adapterId: "mailclaws-embedded",
    policyManifest: BUILTIN_POLICY_MANIFEST,
    async executeMailTurn(input) {
      return {
        responseText: renderEmbeddedResponse(input)
      };
    }
  };
}

function renderEmbeddedResponse(input: EmbeddedRuntimeTurnRequest) {
  const role = resolveWorkerRole(input);

  switch (role) {
    case "mail-attachment-reader":
      return JSON.stringify(buildAttachmentReaderResult(input));
    case "mail-researcher":
      return JSON.stringify(buildResearchResult(input));
    case "mail-drafter":
      return JSON.stringify(buildDrafterResult(input));
    case "mail-reviewer":
      return JSON.stringify({
        headline: "草稿可发送",
        summary: "Draft is acceptable for the local embedded runtime path.",
        status: "ok",
        keyEvidence: ["The current draft matches the inbound request context available in the embedded runtime path."],
        risks: [],
        nextStep: "Send after final guard check.",
        recommendedAction: "send"
      });
    case "mail-guard":
      return JSON.stringify({
        headline: "未触发拦截",
        summary: "No embedded-runtime policy veto was triggered.",
        status: "ok",
        keyEvidence: ["No embedded-runtime approval or blocking rule matched the current draft."],
        risks: [],
        nextStep: "Allow send.",
        approvalRequired: false,
        blocked: false
      });
    case "mail-orchestrator":
    default:
      return buildOrchestratorReply(input);
  }
}

function buildOrchestratorReply(input: EmbeddedRuntimeTurnRequest) {
  const draftReply = extractWorkerDraftReply(input.inputText);
  if (draftReply) {
    return draftReply;
  }

  const attachmentClaims = collectAttachmentClaims(input.attachments ?? []);
  if (attachmentClaims.length > 0) {
    return attachmentClaims.join("\n");
  }

  const body = extractPrimaryBody(input.inputText);
  if (body) {
    return body;
  }

  const subject = extractLineValue(input.inputText, "Subject:");

  return subject ? `Received your message about "${subject}".` : "Received your message.";
}

function buildAttachmentReaderResult(input: EmbeddedRuntimeTurnRequest) {
  const attachments = input.attachments ?? [];
  const attachmentFacts = collectAttachmentClaims(attachments, 5).map((claim, index) => ({
    key: normalizeFactKey(claim, index),
    claim,
    evidenceRef: resolveAttachmentEvidenceRef(attachments[index]),
    confidence: "high" as const
  }));

  return {
    headline:
      attachmentFacts.length > 0
        ? `提取到 ${attachmentFacts.length} 条附件证据`
        : attachments.length > 0
          ? `已索引 ${attachments.length} 个附件`
          : "未发现可读附件",
    summary:
      attachmentFacts.length > 0
        ? `Read ${attachments.length} attachment${attachments.length === 1 ? "" : "s"} and extracted ${attachmentFacts.length} evidence point${attachmentFacts.length === 1 ? "" : "s"}.`
        : attachments.length > 0
          ? `Indexed ${attachments.length} attachment${attachments.length === 1 ? "" : "s"} for the room.`
        : "No attachments were present on this message.",
    status: "ok",
    keyEvidence: attachmentFacts.map((fact) => fact.claim).slice(0, 3),
    risks: attachments.length > 0 ? [] : ["No attachment content was available to inspect."],
    nextStep:
      attachmentFacts.length > 0
        ? "Use the extracted attachment facts in the reply."
        : attachments.length > 0
          ? "Use the attachment summaries as supporting evidence."
          : "Proceed without attachment evidence.",
    facts: attachmentFacts,
    openQuestions: attachments.length > 0 ? [] : ["No attachment content was available to inspect."],
    recommendedAction:
      attachmentFacts.length > 0
        ? "Use the extracted attachment facts in the reply."
        : attachments.length > 0
          ? "Use the attachment summaries as supporting evidence."
          : "Proceed without attachment evidence."
  };
}

function buildResearchResult(input: EmbeddedRuntimeTurnRequest) {
  const subject = extractLineValue(input.inputText, "Subject:");
  const body = extractPrimaryBody(input.inputText);
  const snippet = truncateToSentence(body, 180);
  const attachmentClaims = collectAttachmentClaims(input.attachments ?? [], 2);
  const facts = [
    ...(snippet
      ? [
          {
            claim: snippet,
            confidence: "medium" as const
          }
        ]
      : []),
    ...attachmentClaims.map((claim) => ({
      claim,
      confidence: "high" as const
    }))
  ];

  return {
    headline: subject ? `已整理主题“${subject}”的上下文` : "已整理当前上下文",
    summary: subject
      ? `Captured the current request context for "${subject}".`
      : "Captured the current request context.",
    status: "ok",
    keyEvidence: facts.map((fact) => fact.claim).slice(0, 3),
    risks: snippet || attachmentClaims.length > 0 ? [] : ["The inbound message did not include usable evidence."],
    nextStep:
      attachmentClaims.length > 0
        ? "Draft a concise reply that directly answers with the attachment facts."
        : "Draft a concise reply anchored on the latest inbound message.",
    facts,
    openQuestions: snippet || attachmentClaims.length > 0 ? [] : ["The inbound message did not include usable evidence."],
    recommendedAction:
      attachmentClaims.length > 0
        ? "Draft a concise reply that directly answers with the attachment facts."
        : "Draft a concise reply anchored on the latest inbound message."
  };
}

function buildDrafterResult(input: EmbeddedRuntimeTurnRequest) {
  const draftReply = buildOrchestratorReply(input);
  return {
    headline: "已起草回信",
    summary: "Prepared a draft reply for the current room.",
    status: "ok",
    keyEvidence: draftReply ? [truncateToSentence(draftReply, 180)] : [],
    risks: [],
    nextStep: "Send the draft after any required review.",
    draftReply,
    recommendedAction: "Send the draft after any required review."
  };
}

function resolveWorkerRole(input: EmbeddedRuntimeTurnRequest): WorkerRole {
  const explicitRole = input.executionPolicy?.role;
  if (explicitRole) {
    return explicitRole;
  }

  const agentId = input.agentId?.toLowerCase() ?? "";
  if (agentId.includes("attachment")) {
    return "mail-attachment-reader";
  }
  if (agentId.includes("research")) {
    return "mail-researcher";
  }
  if (agentId.includes("draft")) {
    return "mail-drafter";
  }
  if (agentId.includes("review")) {
    return "mail-reviewer";
  }
  if (agentId.includes("guard")) {
    return "mail-guard";
  }

  return "mail-orchestrator";
}

function extractLineValue(inputText: string, prefix: string) {
  const line = inputText.split("\n").find((entry) => entry.startsWith(prefix));
  if (!line) {
    return "";
  }

  return line.slice(prefix.length).trim();
}

function extractPrimaryBody(inputText: string) {
  const captureHeadings = new Set(["Current inbound body:", "Draft reply:"]);
  const structuredSectionPrefixes = [
    "Default mail skills",
    "From:",
    "Subject:",
    "Reply-To:",
    "Role:",
    "Routing context:",
    "Current inbound email packet:",
    "Retained schema fields:",
    "Retention rationale:",
    "Relevant room context:",
    "Latest room pre snapshot:",
    "Shared facts:",
    "Worker summaries:",
    "Worker draft replies:",
    "Attachment inventory:"
  ];
  const nonBodyPrefixes = [
    "- Read Email:",
    "- Compress for humans:",
    "- Write Email:",
    "- Mail Read:",
    "- Mail Write:",
    "- Read Attachments:",
    "- Safety:",
    "Return JSON",
    "Respond with JSON",
    "Use:",
    "Each fact should",
    "Summarize the most relevant attachment evidence",
    "Identify supporting evidence",
    "Task:",
    "Return internal-only analysis.",
    "Focus on the few facts",
    "Prefer room facts",
    "Keep it dense:"
  ];

  const lines = inputText.split("\n");
  const collected: string[] = [];
  let captureBody = false;
  let skippingStructuredBullets = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (collected.length > 0) {
        collected.push("");
      }
      continue;
    }

    if (captureBody) {
      if (
        captureHeadings.has(trimmed) ||
        structuredSectionPrefixes.some((prefix) => trimmed.startsWith(prefix))
      ) {
        break;
      }
      collected.push(trimmed);
      continue;
    }

    if (captureHeadings.has(trimmed)) {
      captureBody = true;
      skippingStructuredBullets = false;
      continue;
    }

    if (structuredSectionPrefixes.some((prefix) => trimmed.startsWith(prefix))) {
      if (collected.length > 0) {
        break;
      }
      skippingStructuredBullets = true;
      continue;
    }

    if (nonBodyPrefixes.some((prefix) => trimmed.startsWith(prefix))) {
      continue;
    }

    if (skippingStructuredBullets && trimmed.startsWith("- ")) {
      continue;
    }

    skippingStructuredBullets = false;
    collected.push(trimmed);
  }

  return collected.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function truncateToSentence(inputText: string, limit: number) {
  const normalized = inputText.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const sentenceMatch = normalized.match(/^(.+?[.!?])(?:\s|$)/);
  const sentence = sentenceMatch?.[1]?.trim() ?? normalized;
  return sentence.length <= limit ? sentence : `${sentence.slice(0, Math.max(0, limit - 1)).trim()}…`;
}

function collectAttachmentClaims(
  attachments: NonNullable<EmbeddedRuntimeTurnRequest["attachments"]>,
  limit = 4
) {
  const claims: string[] = [];

  for (const attachment of attachments) {
    const text = readAttachmentText(attachment);
    if (!text) {
      continue;
    }

    const pieces = text
      .split(/\n+/)
      .flatMap((line) => line.split(/(?<=[.!?])\s+/))
      .map((entry) => entry.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    for (const piece of pieces) {
      const normalized = piece.length <= 180 ? piece : `${piece.slice(0, 177).trim()}...`;
      if (!claims.includes(normalized)) {
        claims.push(normalized);
      }
      if (claims.length >= limit) {
        return claims;
      }
    }
  }

  return claims;
}

function readAttachmentText(
  attachment: NonNullable<EmbeddedRuntimeTurnRequest["attachments"]>[number]
) {
  const candidatePaths = [
    attachment.preferredInputPath,
    attachment.extractedTextPath,
    attachment.summaryShortPath,
    attachment.summaryPath
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  for (const candidatePath of candidatePaths) {
    try {
      if (!fs.existsSync(candidatePath)) {
        continue;
      }
      const text = fs.readFileSync(candidatePath, "utf8").trim();
      if (text) {
        return stripAttachmentMetadataPrefix(maybeDecodeBase64Text(text), attachment.filename);
      }
    } catch {
      continue;
    }
  }

  if (attachment.summaryText?.trim()) {
    return stripAttachmentMetadataPrefix(maybeDecodeBase64Text(attachment.summaryText.trim()), attachment.filename);
  }

  return "";
}

function stripAttachmentMetadataPrefix(inputText: string, filename?: string) {
  const text = inputText.trim();
  const prefixes = [filename ? `${filename}:` : "", filename ? `${filename} ` : ""].filter(Boolean);
  for (const prefix of prefixes) {
    if (text.startsWith(prefix)) {
      return text.slice(prefix.length).trim();
    }
  }

  return text;
}

function maybeDecodeBase64Text(inputText: string) {
  const compact = inputText.replace(/\s+/g, "");
  if (compact.length < 16 || compact.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(compact)) {
    return inputText;
  }

  try {
    const decoded = Buffer.from(compact, "base64").toString("utf8").replace(/\0/g, "").trim();
    if (!decoded) {
      return inputText;
    }
    const printableChars = [...decoded].filter((char) => char >= " " || char === "\n" || char === "\t").length;
    return printableChars / decoded.length >= 0.85 ? decoded : inputText;
  } catch {
    return inputText;
  }
}

function resolveAttachmentEvidenceRef(
  attachment: NonNullable<EmbeddedRuntimeTurnRequest["attachments"]>[number] | undefined
) {
  if (!attachment) {
    return undefined;
  }
  return attachment.summaryPath ?? attachment.extractedTextPath ?? attachment.artifactPath;
}

function normalizeFactKey(claim: string, index: number) {
  const slug = claim
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || `attachment-fact-${index + 1}`;
}

function extractWorkerDraftReply(inputText: string) {
  const lines = inputText.split("\n");
  const start = lines.findIndex((line) => line.trim() === "Worker draft replies:");
  if (start < 0) {
    return "";
  }

  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (!trimmed.startsWith("- ")) {
      break;
    }
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (value) {
      return value;
    }
  }

  return "";
}
