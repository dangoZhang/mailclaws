import type { AppConfig } from "../config.js";
import type { MailAgentExecutor } from "../runtime/agent-executor.js";
import {
  createFileBackedOpenClawBridgeSessionManager,
  type OpenClawBridgeSessionManager
} from "./session-manager.js";
import {
  assertCanonicalMemoryNamespaceDescriptors,
  assertExecutionPolicyAllowsTurn,
  assertRuntimePolicyManifestAllowsTurn,
  prepareExecutionAttachments
} from "../runtime/execution-context.js";
import {
  buildOpenClawResponsesRequest,
  type OpenClawResponsesRequest,
  extractOpenClawResponseText,
  parseOpenClawSseStream
} from "./bridge.js";

export type OpenClawClient = MailAgentExecutor;

export interface OpenClawClientOptions {
  fetchImpl?: typeof fetch;
  sessionManager?: OpenClawBridgeSessionManager;
}

export function createOpenClawClient(
  config: AppConfig,
  fetchOrOptions: typeof fetch | OpenClawClientOptions = fetch
): MailAgentExecutor {
  const fetchImpl = typeof fetchOrOptions === "function" ? fetchOrOptions : (fetchOrOptions.fetchImpl ?? fetch);
  const sessionManager =
    typeof fetchOrOptions === "function"
      ? createFileBackedOpenClawBridgeSessionManager(config)
      : (fetchOrOptions.sessionManager ?? createFileBackedOpenClawBridgeSessionManager(config));

  return {
    inspectRuntime() {
      return {
        runtimeKind: "bridge",
        runtimeLabel: normalizeBridgeLabel(config.openClaw.baseUrl),
        policyManifest: config.runtime.policyManifest,
        manifestSource: config.runtime.policyManifest ? "config" : "none",
        namespaceValidation: true,
        canonicalWorkspaceBinding: true,
        policyAdmissionRequired: true,
        backendEnforcement: "external_runtime"
      };
    },
    async executeMailTurn(input) {
      assertExecutionPolicyAllowsTurn(input);
      assertCanonicalMemoryNamespaceDescriptors(config, input);
      assertRuntimePolicyManifestAllowsTurn({
        runtimeKind: "bridge",
        runtimeLabel: normalizeBridgeLabel(config.openClaw.baseUrl),
        executionInput: input,
        policyManifest: config.runtime.policyManifest
      });
      const startedAt = new Date().toISOString();
      const session = sessionManager.describeSession({
        sessionKey: input.sessionKey,
        agentId: input.agentId ?? config.openClaw.agentId,
        now: startedAt
      });
      const attachments = prepareExecutionAttachments(config, input);
      const request = buildOpenClawResponsesRequest({
        baseUrl: config.openClaw.baseUrl,
        agentId: input.agentId ?? config.openClaw.agentId,
        sessionKey: input.sessionKey,
        inputText: input.inputText,
        sessionHeaders: session.transportHeaders,
        sessionMetadata: session.metadata,
        attachments,
        memoryNamespaces: input.memoryNamespaces,
        executionPolicy: input.executionPolicy,
        gatewayToken: config.openClaw.gatewayToken
      });
      const response = await fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      const sse = await response.text();
      const completedAt = new Date().toISOString();

      if (!response.ok) {
        const chunks = parseOpenClawSseStream(sse);
        const message = extractOpenClawResponseText(chunks) || response.statusText;
        throw new Error(`OpenClaw request failed: ${response.status} ${message}`.trim());
      }

      sessionManager.appendTranscriptEntries({
        sessionKey: input.sessionKey,
        agentId: input.agentId ?? config.openClaw.agentId,
        now: completedAt,
        entries: [
          {
            role: "user",
            text: input.inputText
          },
          {
            role: "assistant",
            text: extractOpenClawResponseText(parseOpenClawSseStream(sse)).trim()
          }
        ]
      });

      return {
        startedAt,
        completedAt,
        responseText: extractOpenClawResponseText(parseOpenClawSseStream(sse)).trim(),
        request: sanitizeOpenClawRequest(request)
      };
    }
  };
}

function sanitizeOpenClawRequest(request: OpenClawResponsesRequest) {
  const headers = { ...request.headers };
  delete headers.Authorization;
  const body = JSON.parse(request.body) as Record<string, unknown>;
  sanitizeOpenClawRequestBody(body);

  return {
    url: request.url,
    method: request.method,
    headers,
    body
  };
}

function sanitizeOpenClawRequestBody(body: Record<string, unknown>) {
  const input = Array.isArray(body.input) ? body.input : [];
  for (const item of input) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const record = item as { content?: unknown };
    if (!Array.isArray(record.content)) {
      continue;
    }

    for (const content of record.content) {
      if (typeof content !== "object" || content === null) {
        continue;
      }

      const entry = content as { type?: unknown; file_data?: unknown };
      if (entry.type === "input_file" && typeof entry.file_data === "string") {
        entry.file_data = "[redacted-inline-file]";
      }
    }
  }
}

function normalizeBridgeLabel(baseUrl: string) {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}
