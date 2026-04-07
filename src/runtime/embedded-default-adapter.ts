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
        summary: "Draft is acceptable for the local embedded runtime path.",
        status: "ok",
        recommendedAction: "send"
      });
    case "mail-guard":
      return JSON.stringify({
        summary: "No embedded-runtime policy veto was triggered.",
        status: "ok",
        approvalRequired: false,
        blocked: false
      });
    case "mail-orchestrator":
    default:
      return buildOrchestratorReply(input);
  }
}

function buildOrchestratorReply(input: EmbeddedRuntimeTurnRequest) {
  const subject = extractLineValue(input.inputText, "Subject:");
  const body = extractPrimaryBody(input.inputText);
  const snippet = truncateToSentence(body, 220);
  const historyNote =
    input.history.filter((entry) => entry.role === "assistant").length > 0
      ? "I kept the earlier room summary and this reply stays on the same thread."
      : "I created a durable room for this message and can continue on the same thread.";

  return [
    subject ? `Received your message about "${subject}".` : "Received your message.",
    snippet ? `Summary: ${snippet}` : "",
    historyNote,
    "Reply with more details or attachments if you want me to continue from here."
  ]
    .filter((line) => line.length > 0)
    .join("\n\n");
}

function buildAttachmentReaderResult(input: EmbeddedRuntimeTurnRequest) {
  const attachments = input.attachments ?? [];
  const attachmentFacts = attachments.slice(0, 5).map((attachment) => ({
    claim: `${attachment.filename} is available for the current room.`,
    evidenceRef: attachment.summaryPath ?? attachment.extractedTextPath ?? attachment.artifactPath,
    confidence: "high" as const
  }));

  return {
    summary:
      attachments.length > 0
        ? `Indexed ${attachments.length} attachment${attachments.length === 1 ? "" : "s"} for the room.`
        : "No attachments were present on this message.",
    status: "ok",
    facts: attachmentFacts,
    openQuestions: attachments.length > 0 ? [] : ["No attachment content was available to inspect."],
    recommendedAction:
      attachments.length > 0 ? "Use the attachment summaries as supporting evidence." : "Proceed without attachment evidence."
  };
}

function buildResearchResult(input: EmbeddedRuntimeTurnRequest) {
  const subject = extractLineValue(input.inputText, "Subject:");
  const body = extractPrimaryBody(input.inputText);
  const snippet = truncateToSentence(body, 180);

  return {
    summary: subject
      ? `Captured the current request context for "${subject}".`
      : "Captured the current request context.",
    status: "ok",
    facts: snippet
      ? [
          {
            claim: snippet,
            confidence: "medium" as const
          }
        ]
      : [],
    openQuestions: snippet ? [] : ["The inbound message did not include a usable text body."],
    recommendedAction: "Draft a concise reply anchored on the latest inbound message."
  };
}

function buildDrafterResult(input: EmbeddedRuntimeTurnRequest) {
  const draftReply = buildOrchestratorReply(input);
  return {
    summary: "Prepared a draft reply for the current room.",
    status: "ok",
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
    "Latest room pre snapshot:",
    "Shared facts:",
    "Worker summaries:",
    "Worker draft replies:",
    "Attachment inventory:"
  ];
  const nonBodyPrefixes = [
    "- Mail Read:",
    "- Mail Write:",
    "Return JSON",
    "Each fact should",
    "Summarize the most relevant attachment evidence",
    "Identify supporting evidence",
    "Prepare a draft reply direction",
    "Review the draft reply for factual or policy issues.",
    "Decide whether the draft may be sent automatically.",
    "Return internal-only analysis.",
    "Respond with JSON when possible:"
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
