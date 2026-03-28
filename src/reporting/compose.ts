import type { PrePacket } from "../core/types.js";
import {
  normalizeAndValidateOutboundHeaders,
  normalizeReferenceHeaderValue,
  validateOutboundRecipients
} from "./rfc.js";

export interface ThreadReplyInput {
  subject: string;
  from: string;
  to: string[];
  cc?: string[];
  messageId: string;
  inReplyTo?: string;
  references?: string[];
}

export interface ThreadReplyPayload {
  kind: "ack" | "progress" | "final";
  body: string;
  headers: Record<string, string>;
}

type MailDisplayPre = Pick<PrePacket, "kind" | "summary" | "draftBody"> | PrePacket;

export function buildReplyHeaders(thread: ThreadReplyInput) {
  validateOutboundRecipients({
    to: thread.to,
    cc: thread.cc
  });

  const references = uniqueReferences([
    ...(thread.references ?? []),
    thread.inReplyTo ?? ""
  ]);

  return normalizeAndValidateOutboundHeaders({
    From: thread.from,
    To: thread.to.join(", "),
    ...((thread.cc ?? []).length > 0 ? { Cc: (thread.cc ?? []).join(", ") } : {}),
    Subject: thread.subject,
    "Message-ID": thread.messageId,
    "In-Reply-To": thread.inReplyTo ?? thread.messageId,
    References: references.join(" "),
    "Auto-Submitted": "auto-generated"
  });
}

export function composeAckReply(thread: ThreadReplyInput, body: string): ThreadReplyPayload {
  return renderPreToMail(thread, {
    kind: "ack",
    summary: body
  });
}

export function composeProgressReply(thread: ThreadReplyInput, body: string): ThreadReplyPayload {
  return renderPreToMail(thread, {
    kind: "progress",
    summary: body
  });
}

export function composeFinalReply(thread: ThreadReplyInput, body: string): ThreadReplyPayload {
  return renderPreToMail(thread, {
    kind: "final",
    summary: body,
    draftBody: body
  });
}

export function buildThreadReplyPayload(thread: ThreadReplyInput, body: string) {
  return buildReplyPayload("final", thread, body);
}

export function renderPreToMail(thread: ThreadReplyInput, pre: MailDisplayPre): ThreadReplyPayload {
  const kind = coercePreToMailKind(pre.kind);
  const body = selectDisplayBody(pre);
  return buildReplyPayload(kind, thread, body);
}

function buildReplyPayload(kind: ThreadReplyPayload["kind"], thread: ThreadReplyInput, body: string) {
  return {
    kind,
    body,
    headers: buildReplyHeaders(thread)
  };
}

function uniqueReferences(values: string[]) {
  return normalizeReferenceHeaderValue(values.join(" "));
}

function selectDisplayBody(pre: MailDisplayPre) {
  if (typeof pre.draftBody === "string" && pre.draftBody.trim().length > 0) {
    return pre.draftBody.trim();
  }

  return pre.summary.trim();
}

function coercePreToMailKind(kind: MailDisplayPre["kind"]): ThreadReplyPayload["kind"] {
  switch (kind) {
    case "ack":
    case "progress":
    case "final":
      return kind;
    default:
      throw new Error(`unsupported mail display pre kind: ${kind}`);
  }
}
