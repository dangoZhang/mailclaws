export interface ProviderAddress {
  name?: string;
  email: string;
}

export interface ProviderAttachment {
  filename?: string;
  mimeType?: string;
  size?: number;
  contentId?: string;
  disposition?: "inline" | "attachment" | string;
  data?: string | Uint8Array;
}

export interface ProviderHeader {
  name: string;
  value: string;
}

export interface ProviderMailEnvelope {
  providerMessageId: string;
  threadId?: string;
  messageId?: string;
  envelopeRecipients?: string[];
  subject: string;
  from: ProviderAddress;
  to: ProviderAddress[];
  cc?: ProviderAddress[];
  bcc?: ProviderAddress[];
  replyTo?: ProviderAddress[];
  date?: string | Date;
  headers?: ProviderHeader[];
  text?: string;
  html?: string;
  attachments?: ProviderAttachment[];
  rawMime?: string;
  raw?: unknown;
}

export interface NormalizedAttachment {
  filename: string;
  mimeType: string;
  size?: number;
  contentId?: string;
  disposition?: string;
}

export interface NormalizedMailHeader {
  name: string;
  value: string;
}

export interface NormalizedMailAddress {
  name?: string;
  email: string;
}

export interface NormalizedMailEnvelope {
  providerMessageId: string;
  messageId: string;
  threadId?: string;
  envelopeRecipients: string[];
  subject: string;
  from: NormalizedMailAddress;
  to: NormalizedMailAddress[];
  cc: NormalizedMailAddress[];
  bcc: NormalizedMailAddress[];
  replyTo: NormalizedMailAddress[];
  date?: string;
  headers: NormalizedMailHeader[];
  text: string;
  html?: string;
  attachments: NormalizedAttachment[];
  rawMime?: string;
  raw: unknown;
}

export type OutboxItemStatus = "queued" | "sending" | "sent" | "failed" | "skipped";

export interface OutboxMailIntent {
  intentId: string;
  threadKey: string;
  provider: "smtp";
  enabled: boolean;
  to: ProviderAddress[];
  cc?: ProviderAddress[];
  bcc?: ProviderAddress[];
  subject: string;
  text: string;
  html?: string;
  headers?: ProviderHeader[];
  createdAt: string;
}

export interface OutboxMailRecord extends OutboxMailIntent {
  status: OutboxItemStatus;
  updatedAt: string;
  error?: string;
}
