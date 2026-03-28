import type { AppConfig } from "../config.js";
import type {
  BridgeRuntimeSessionSummary,
  EmbeddedRuntimeSessionSummary,
  MailRuntimeExecutionBoundary
} from "../core/types.js";
import { createFileBackedOpenClawBridgeSessionManager } from "../openclaw/session-manager.js";
import type { MailAgentExecutor } from "./agent-executor.js";
import { createFileBackedEmbeddedSessionManager } from "./embedded-session-manager.js";

export function describeRuntimeExecutionBoundary(
  config: AppConfig,
  executor?: MailAgentExecutor
): MailRuntimeExecutionBoundary {
  const inspected = executor?.inspectRuntime?.();
  if (inspected) {
    return inspected;
  }

  switch (config.runtime.mode) {
    case "bridge":
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
    case "command":
      return {
        runtimeKind: "command",
        runtimeLabel: normalizeCommandLabel(config.runtime.command),
        policyManifest: config.runtime.policyManifest,
        manifestSource: config.runtime.policyManifest ? "config" : "none",
        namespaceValidation: true,
        canonicalWorkspaceBinding: true,
        policyAdmissionRequired: true,
        backendEnforcement: "local_command"
      };
    case "embedded":
      return {
        runtimeKind: "embedded",
        runtimeLabel: "embedded",
        policyManifest: config.runtime.policyManifest,
        manifestSource: config.runtime.policyManifest ? "config" : "none",
        namespaceValidation: true,
        canonicalWorkspaceBinding: true,
        policyAdmissionRequired: true,
        backendEnforcement: "process_adapter"
      };
  }
}

export function listEmbeddedRuntimeSessions(
  config: AppConfig,
  input: {
    sessionKey?: string;
    sessionId?: string;
  } = {}
): EmbeddedRuntimeSessionSummary[] {
  return createFileBackedEmbeddedSessionManager(config).listSessions(input);
}

export function listBridgeRuntimeSessions(
  config: AppConfig,
  input: {
    sessionKey?: string;
    sessionId?: string;
  } = {}
): BridgeRuntimeSessionSummary[] {
  return createFileBackedOpenClawBridgeSessionManager(config).listSessions(input);
}

function normalizeBridgeLabel(baseUrl: string) {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

function normalizeCommandLabel(command: string) {
  return command.trim().split(/\s+/)[0] ?? "local";
}
