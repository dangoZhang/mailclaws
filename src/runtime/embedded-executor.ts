import type { AppConfig } from "../config.js";
import type {
  MailTurnAttachmentDescriptor,
  MailRuntimePolicyManifest,
  MailTurnExecutionPolicy,
  MailTurnMemoryNamespaces
} from "../core/types.js";
import type { MailAgentExecutionResult, MailAgentExecutor } from "./agent-executor.js";
import {
  createFileBackedEmbeddedSessionManager,
  type EmbeddedRuntimeSessionManager,
  type EmbeddedTranscriptEntry
} from "./embedded-session-manager.js";
import {
  assertCanonicalMemoryNamespaceDescriptors,
  assertExecutionPolicyAllowsTurn,
  assertRuntimePolicyManifestAllowsTurn,
  prepareExecutionAttachments
} from "./execution-context.js";

export interface EmbeddedRuntimeTurnRequest {
  sessionKey: string;
  inputText: string;
  agentId?: string;
  attachments?: MailTurnAttachmentDescriptor[];
  memoryNamespaces?: MailTurnMemoryNamespaces;
  executionPolicy?: MailTurnExecutionPolicy;
  history: EmbeddedTranscriptEntry[];
  session: {
    sessionId: string;
    statePath: string;
    transcriptPath: string;
  };
}

export interface EmbeddedRuntimeAdapterResult {
  responseText: string;
  request?: MailAgentExecutionResult["request"];
}

export interface EmbeddedRuntimeAdapter {
  adapterId?: string;
  policyManifest: MailRuntimePolicyManifest;
  executeMailTurn(input: EmbeddedRuntimeTurnRequest): Promise<EmbeddedRuntimeAdapterResult>;
}

export interface EmbeddedExecutorOptions {
  adapter?: EmbeddedRuntimeAdapter;
  sessionManager?: EmbeddedRuntimeSessionManager;
}

export function createEmbeddedMailRuntimeExecutor(
  config: AppConfig,
  adapterOrOptions: EmbeddedRuntimeAdapter | EmbeddedExecutorOptions
): MailAgentExecutor {
  const adapter =
    "executeMailTurn" in adapterOrOptions
      ? adapterOrOptions
      : adapterOrOptions.adapter;
  const sessionManager =
    "executeMailTurn" in adapterOrOptions
      ? createFileBackedEmbeddedSessionManager(config)
      : (adapterOrOptions.sessionManager ?? createFileBackedEmbeddedSessionManager(config));

  if (!adapter) {
    throw new Error(
      "embedded runtime mode requires an in-process adapter; command fallback has been removed"
    );
  }

  return {
    inspectRuntime() {
      return {
        runtimeKind: "embedded",
        runtimeLabel: adapter.adapterId ?? "in-process",
        policyManifest: adapter.policyManifest,
        manifestSource: "executor",
        namespaceValidation: true,
        canonicalWorkspaceBinding: true,
        policyAdmissionRequired: true,
        backendEnforcement: "process_adapter"
      };
    },
    async executeMailTurn(input) {
      assertExecutionPolicyAllowsTurn(input);
      assertCanonicalMemoryNamespaceDescriptors(config, input);
      assertRuntimePolicyManifestAllowsTurn({
        runtimeKind: "embedded",
        runtimeLabel: adapter.adapterId ?? "in-process",
        executionInput: input,
        policyManifest: adapter.policyManifest
      });
      const attachments = prepareExecutionAttachments(config, input);
      const startedAt = new Date().toISOString();
      const session = sessionManager.describeSession(input.sessionKey, startedAt);
      const history = session.history;
      const requestBody: EmbeddedRuntimeTurnRequest = {
        sessionKey: input.sessionKey,
        inputText: input.inputText,
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(attachments ? { attachments } : {}),
        ...(input.memoryNamespaces ? { memoryNamespaces: input.memoryNamespaces } : {}),
        ...(input.executionPolicy ? { executionPolicy: input.executionPolicy } : {}),
        history,
        session: {
          sessionId: session.state.sessionId,
          statePath: session.statePath,
          transcriptPath: session.transcriptPath
        }
      };
      let responseText = "";
      const result = await adapter.executeMailTurn(requestBody);
      const completedAt = new Date().toISOString();
      responseText = result.responseText;
      const request = result.request ?? sanitizeEmbeddedRequest(adapter.adapterId ?? "in-process", requestBody);

      sessionManager.appendTranscriptEntries(input.sessionKey, [
        {
          role: "user",
          text: input.inputText
        },
        {
          role: "assistant",
          text: responseText
        }
      ]);

      return {
        startedAt,
        completedAt,
        responseText,
        request
      } satisfies MailAgentExecutionResult;
    }
  };
}

function sanitizeEmbeddedRequest(command: string, body: EmbeddedRuntimeTurnRequest) {
  return {
    url: `embedded://${normalizeCommandLabel(command)}`,
    method: "POST" as const,
    headers: {
      "x-mailclaws-runtime": "embedded"
    },
    body: body as unknown as Record<string, unknown>
  };
}

function normalizeCommandLabel(command: string) {
  return command.trim().split(/\s+/)[0] ?? "embedded";
}
