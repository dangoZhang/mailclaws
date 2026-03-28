export interface LoopGuardHeaders {
  "Auto-Submitted"?: string;
  "Precedence"?: string;
  "List-Id"?: string;
  "X-Auto-Response-Suppress"?: string;
  [key: string]: string | undefined;
}

export interface LoopGuardInput {
  from: string;
  headers: LoopGuardHeaders;
}

export interface LoopGuardResult {
  blocked: boolean;
  reasons: string[];
}

const noReplyPattern =
  /(^|[.\-_])(no[-_]?reply|noreply|do[-_]?not[-_]?reply|donotreply)([.\-_@]|$)/i;

export function evaluateLoopGuard(input: LoopGuardInput): LoopGuardResult {
  const reasons = new Set<string>();
  const sender = input.from.trim().toLowerCase();
  const headers = normalizeHeaders(input.headers);

  const localPart = sender.split("@", 1)[0] ?? sender;
  if (noReplyPattern.test(sender) || noReplyPattern.test(localPart)) {
    reasons.add("from:noreply");
  }

  const autoSubmitted = headers["auto-submitted"];
  if (autoSubmitted && autoSubmitted !== "no") {
    reasons.add(`auto-submitted:${autoSubmitted}`);
  }

  const precedence = headers["precedence"];
  if (precedence === "bulk" || precedence === "list" || precedence === "junk") {
    reasons.add(`precedence:${precedence}`);
  }

  if (headers["list-id"]) {
    reasons.add("list-id");
  }

  const suppression = headers["x-auto-response-suppress"];
  if (suppression && suppression !== "none") {
    reasons.add(`x-auto-response-suppress:${suppression}`);
  }

  return {
    blocked: reasons.size > 0,
    reasons: [...reasons]
  };
}

function normalizeHeaders(headers: LoopGuardHeaders) {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      normalized[key.toLowerCase()] = value.trim().toLowerCase();
    }
  }

  return normalized;
}
