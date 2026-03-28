import type {
  MailRuntimeExecutionBoundary,
  MailTurnAttachmentDescriptor,
  MailTurnExecutionPolicy,
  MailTurnMemoryNamespaces
} from "../core/types.js";

export interface ExecuteMailTurnInput {
  sessionKey: string;
  inputText: string;
  agentId?: string;
  attachments?: MailTurnAttachmentDescriptor[];
  memoryNamespaces?: MailTurnMemoryNamespaces;
  executionPolicy?: MailTurnExecutionPolicy;
}

export interface MailAgentExecutionResult {
  startedAt: string;
  completedAt: string;
  responseText: string;
  request: {
    url: string;
    method: "POST";
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
}

export interface MailAgentExecutor {
  executeMailTurn(input: ExecuteMailTurnInput): Promise<MailAgentExecutionResult>;
  inspectRuntime?(): MailRuntimeExecutionBoundary;
}
