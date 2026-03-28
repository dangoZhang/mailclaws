export class OutboundHeaderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundHeaderValidationError";
  }
}

const SINGLE_INSTANCE_HEADERS = new Set([
  "to",
  "cc",
  "bcc",
  "subject",
  "date",
  "from",
  "sender",
  "reply-to",
  "message-id",
  "in-reply-to",
  "references",
  "auto-submitted"
]);

export function normalizeAndValidateOutboundHeaders(headers: Record<string, string>) {
  const normalized: Record<string, string> = {};
  const seenSingletons = new Set<string>();

  for (const [key, rawValue] of Object.entries(headers)) {
    const name = key.trim();
    const value = rawValue.trim();
    const lowerName = name.toLowerCase();

    if (!name) {
      throw new OutboundHeaderValidationError("header name must not be empty");
    }

    if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) {
      throw new OutboundHeaderValidationError(`header ${name} must not contain CRLF characters`);
    }

    if (SINGLE_INSTANCE_HEADERS.has(lowerName)) {
      if (seenSingletons.has(lowerName)) {
        throw new OutboundHeaderValidationError(`duplicate single-instance header: ${name}`);
      }

      seenSingletons.add(lowerName);
    }

    if (lowerName === "message-id" || lowerName === "in-reply-to") {
      if (!isValidMessageId(value)) {
        throw new OutboundHeaderValidationError(`invalid ${name}: ${value}`);
      }
    }

    if (lowerName === "references") {
      const normalizedReferences = normalizeReferenceHeaderValue(value);
      if (normalizedReferences.length === 0) {
        throw new OutboundHeaderValidationError(`invalid References: ${value}`);
      }

      normalized[name] = normalizedReferences.join(" ");
      continue;
    }

    normalized[name] = value;
  }

  return normalized;
}

export function validateOutboundRecipients(input: {
  to: string[];
  cc?: string[];
  bcc?: string[];
}) {
  if ([...(input.to ?? []), ...(input.cc ?? []), ...(input.bcc ?? [])].every((value) => value.trim().length === 0)) {
    throw new OutboundHeaderValidationError("outbound mail must include at least one recipient");
  }
}

export function isValidMessageId(value: string) {
  return /^<[^<>\s]+@[^<>\s]+>$/.test(value.trim());
}

export function normalizeReferenceHeaderValue(value: string) {
  const tokens = value
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const token of tokens) {
    if (!isValidMessageId(token)) {
      return [];
    }

    if (seen.has(token)) {
      continue;
    }

    seen.add(token);
    normalized.push(token);
  }

  return normalized;
}
