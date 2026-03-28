import { createHash } from "node:crypto";

export interface InboundDedupKeyInput {
  accountId: string;
  providerMessageId?: string;
  messageId: string;
  normalizedSubject: string;
  normalizedText: string;
  participants: string[];
}

export function buildInboundDedupKey(input: InboundDedupKeyInput) {
  if (input.providerMessageId?.trim()) {
    return `${input.accountId}:provider:${input.providerMessageId.trim()}`;
  }

  if (input.messageId.trim()) {
    return `${input.accountId}:message:${input.messageId.trim()}`;
  }

  const participantFingerprint = buildParticipantFingerprint(input.participants);
  const hash = createHash("sha256")
    .update(input.accountId)
    .update("\n")
    .update(normalizeSubject(input.normalizedSubject))
    .update("\n")
    .update(input.normalizedText.trim())
    .update("\n")
    .update(participantFingerprint)
    .digest("hex");

  return `${input.accountId}:hash:${hash}`;
}

export function buildParticipantFingerprint(participants: string[]) {
  return [...new Set(participants.map((value) => value.trim().toLowerCase()).filter(Boolean))]
    .sort()
    .join("|");
}

export function normalizeSubject(subject: string) {
  let normalized = subject.trim();

  while (/^(re|fw|fwd)\s*:/i.test(normalized)) {
    normalized = normalized.replace(/^(re|fw|fwd)\s*:\s*/i, "").trim();
  }

  return normalized.toLowerCase();
}
