import type {
  NormalizedAttachment,
  NormalizedMailAddress,
  NormalizedMailEnvelope,
  ProviderAddress,
  ProviderAttachment,
  ProviderHeader,
  ProviderMailEnvelope
} from "./types.js";

const DEFAULT_MESSAGE_ID_PREFIX = "mailclaws";

export function normalizeMailEnvelope(input: ProviderMailEnvelope): NormalizedMailEnvelope {
  const headers = normalizeHeaders(input.headers ?? []);
  const messageId = readHeaderValue(headers, "message-id") ?? `<${DEFAULT_MESSAGE_ID_PREFIX}-${input.providerMessageId}>`;
  const text = normalizeText(input.text ?? stripHtml(input.html ?? ""));
  const html = sanitizeHtml(input.html);

  return {
    providerMessageId: input.providerMessageId,
    messageId,
    threadId: input.threadId,
    envelopeRecipients: normalizeRecipientEmails(input.envelopeRecipients ?? []),
    subject: normalizeSubject(input.subject),
    from: normalizeAddress(input.from),
    to: normalizeAddresses(input.to),
    cc: normalizeAddresses(input.cc ?? []),
    bcc: normalizeAddresses(input.bcc ?? []),
    replyTo: normalizeAddresses(input.replyTo ?? []),
    date: normalizeDate(input.date),
    headers,
    text,
    html,
    attachments: normalizeAttachments(input.attachments ?? []),
    rawMime: input.rawMime,
    raw: input.raw ?? input
  };
}

export function normalizeText(value: string): string {
  return stripQuotedText(normalizeWhitespace(value))
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .join("\n")
    .trim();
}

export function stripQuotedText(value: string): string {
  const lines = normalizeWhitespace(value).split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    if (isQuotedReplyBoundary(line, kept.length > 0)) {
      break;
    }

    kept.push(line);
  }

  return kept.join("\n").replace(/\n--\s*$/, "").trim();
}

export function stripHtml(html: string): string {
  const withoutScripts = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const text = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

export function normalizeHeaders(headers: ProviderHeader[]): ProviderHeader[] {
  return headers
    .filter((header) => header.name.trim().length > 0)
    .map((header) => ({
      name: header.name.trim(),
      value: header.value.trim().replace(/\s+/g, " ")
    }));
}

function normalizeAddresses(addresses: ProviderAddress[]): NormalizedMailAddress[] {
  return addresses.map(normalizeAddress);
}

function normalizeAddress(address: ProviderAddress): NormalizedMailAddress {
  return {
    name: address.name?.trim() || undefined,
    email: address.email.trim().toLowerCase()
  };
}

function normalizeAttachments(attachments: ProviderAttachment[]): NormalizedAttachment[] {
  return attachments.map((attachment, index) => ({
    filename: attachment.filename?.trim() || `attachment-${index + 1}`,
    mimeType: attachment.mimeType?.trim() || attachment.contentType?.trim() || "application/octet-stream",
    size: attachment.size,
    contentId: attachment.contentId?.trim() || undefined,
    disposition: attachment.disposition?.trim() || undefined
  }));
}

function normalizeRecipientEmails(values: string[]) {
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function normalizeDate(date: string | Date | undefined): string | undefined {
  if (!date) {
    return undefined;
  }

  const parsed = typeof date === "string" ? new Date(date) : date;
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function normalizeSubject(subject: string): string {
  return normalizeWhitespace(subject);
}

function readHeaderValue(headers: ProviderHeader[], headerName: string): string | undefined {
  const found = headers.find((header) => header.name.toLowerCase() === headerName.toLowerCase());
  return found?.value;
}

function sanitizeHtml(html: string | undefined): string | undefined {
  if (!html) {
    return undefined;
  }

  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function isQuotedReplyBoundary(line: string, hasContent: boolean) {
  const trimmed = line.trim();

  if (!hasContent) {
    return false;
  }

  if (trimmed === "--" || trimmed === "--") {
    return true;
  }

  if (trimmed.startsWith(">")) {
    return true;
  }

  if (/^on .+ wrote:$/i.test(trimmed)) {
    return true;
  }

  if (/^(from|sent|to|subject):/i.test(trimmed)) {
    return true;
  }

  return false;
}
