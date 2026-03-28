import { randomUUID } from "node:crypto";

import type {
  OutboxMailIntent,
  OutboxMailRecord,
  ProviderAddress,
  ProviderHeader
} from "./types.js";

export interface OutboxIntentInput {
  threadKey: string;
  to: ProviderAddress[];
  subject: string;
  text: string;
  html?: string;
  cc?: ProviderAddress[];
  bcc?: ProviderAddress[];
  headers?: ProviderHeader[];
}

export interface OutboxAdapterOptions {
  enabled?: boolean;
}

export class MemoryOutboxAdapter {
  private readonly enabled: boolean;
  private readonly records = new Map<string, OutboxMailRecord>();

  constructor(options: OutboxAdapterOptions = {}) {
    this.enabled = options.enabled ?? false;
  }

  enqueue(input: OutboxIntentInput): OutboxMailRecord {
    const now = new Date().toISOString();
    const intent: OutboxMailIntent = {
      intentId: randomUUID(),
      threadKey: input.threadKey,
      provider: "smtp",
      enabled: this.enabled,
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      subject: input.subject,
      text: input.text,
      html: input.html,
      headers: input.headers,
      createdAt: now
    };
    const record: OutboxMailRecord = {
      ...intent,
      status: this.enabled ? "queued" : "skipped",
      updatedAt: now,
      error: this.enabled ? undefined : "smtp outbox is disabled"
    };

    this.records.set(record.intentId, record);
    return record;
  }

  get(intentId: string): OutboxMailRecord | undefined {
    return this.records.get(intentId);
  }

  list(): OutboxMailRecord[] {
    return [...this.records.values()];
  }

  markSending(intentId: string): OutboxMailRecord {
    return this.updateStatus(intentId, "sending");
  }

  markSent(intentId: string): OutboxMailRecord {
    return this.updateStatus(intentId, "sent");
  }

  markFailed(intentId: string, error: string): OutboxMailRecord {
    return this.updateStatus(intentId, "failed", error);
  }

  private updateStatus(intentId: string, status: OutboxMailRecord["status"], error?: string) {
    const existing = this.records.get(intentId);
    if (!existing) {
      throw new Error(`Unknown outbox intent: ${intentId}`);
    }

    const updated: OutboxMailRecord = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
      error
    };

    this.records.set(intentId, updated);
    return updated;
  }
}
