import type { SubAgentTarget } from "../core/types.js";

export interface NormalizedSubAgentReply {
  status: "ok" | "partial" | "blocked" | "timeout" | "error" | "stale";
  summary: string;
  facts: Array<{
    key?: string;
    claim: string;
    evidenceRef?: string;
  }>;
  openQuestions: string[];
  draftReply?: string;
  recommendedAction?: string;
}

export function normalizeSubAgentReply(
  responseText: string,
  input: {
    resultSchema: SubAgentTarget["resultSchema"];
    status?: "completed" | "failed" | "timeout" | "stale";
    fallbackSummary?: string;
  }
): NormalizedSubAgentReply {
  if (input.status === "timeout") {
    return {
      status: "timeout",
      summary: input.fallbackSummary ?? "Subagent run timed out before a stable result was collected.",
      facts: [],
      openQuestions: []
    };
  }

  if (input.status === "failed") {
    return {
      status: "error",
      summary: input.fallbackSummary ?? (responseText.trim() || "Subagent run failed."),
      facts: [],
      openQuestions: []
    };
  }

  if (input.status === "stale") {
    return {
      status: "stale",
      summary: input.fallbackSummary ?? "Subagent result arrived after the room moved to a newer revision.",
      facts: [],
      openQuestions: []
    };
  }

  try {
    const parsed = JSON.parse(responseText) as Record<string, unknown>;
    const draftReply = asOptionalString(parsed.draftReply ?? parsed.draft_reply);
    const recommendedAction = asOptionalString(parsed.recommendedAction ?? parsed.recommended_action);

    return {
      status: normalizeStatus(parsed.status),
      summary: asOptionalString(parsed.summary) ?? (responseText.trim() || defaultSummary(input.resultSchema)),
      facts: normalizeFacts(parsed.facts),
      openQuestions: normalizeStringList(parsed.openQuestions ?? parsed.open_questions),
      draftReply,
      recommendedAction
    };
  } catch {
    return {
      status: "ok",
      summary: responseText.trim() || defaultSummary(input.resultSchema),
      facts: [],
      openQuestions: [],
      ...(input.resultSchema === "draft" ? { draftReply: responseText.trim() || undefined } : {})
    };
  }
}

export function resolveNormalizedSubAgentMessageKind(
  resultSchema: SubAgentTarget["resultSchema"],
  status: NormalizedSubAgentReply["status"]
) {
  if (status === "stale" || status === "timeout" || status === "error") {
    return "system_notice" as const;
  }

  switch (resultSchema) {
    case "research":
      return "claim" as const;
    case "reader":
      return "evidence" as const;
    case "draft":
      return "draft" as const;
    case "review":
      return "review" as const;
  }
}

function normalizeFacts(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const claim = asOptionalString((entry as { claim?: unknown }).claim);
    if (!claim) {
      return [];
    }

    return [
      {
        key: asOptionalString((entry as { key?: unknown }).key),
        claim,
        evidenceRef: asOptionalString((entry as { evidenceRef?: unknown }).evidenceRef)
      }
    ];
  });
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const deduped = new Map<string, string>();
  for (const entry of value) {
    const normalized = asOptionalString(entry)?.toLowerCase();
    if (normalized) {
      deduped.set(normalized, String(entry).trim());
    }
  }

  return Array.from(deduped.values());
}

function normalizeStatus(value: unknown): NormalizedSubAgentReply["status"] {
  if (typeof value !== "string") {
    return "ok";
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "ok" ||
    normalized === "partial" ||
    normalized === "blocked" ||
    normalized === "timeout" ||
    normalized === "error" ||
    normalized === "stale"
  ) {
    return normalized;
  }

  return "ok";
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function defaultSummary(resultSchema: SubAgentTarget["resultSchema"]) {
  switch (resultSchema) {
    case "research":
      return "Subagent research completed.";
    case "reader":
      return "Subagent reading completed.";
    case "draft":
      return "Subagent draft completed.";
    case "review":
      return "Subagent review completed.";
  }
}
