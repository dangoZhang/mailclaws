import type { AppConfig } from "../config.js";
import { createOpenClawClient, type OpenClawClientOptions } from "../openclaw/client.js";
import type { OpenClawBridgeSessionManager } from "../openclaw/session-manager.js";
import { createEmbeddedMailRuntimeExecutor, type EmbeddedRuntimeAdapter } from "./embedded-executor.js";
import type { EmbeddedRuntimeSessionManager } from "./embedded-session-manager.js";
import { createBuiltInEmbeddedRuntimeAdapter } from "./embedded-default-adapter.js";
import {
  createLocalCommandExecutor,
  type LocalCommandExecutorOptions,
  type LocalCommandRunner
} from "./local-command-executor.js";
import type { MailRuntimePolicyManifest } from "../core/types.js";

export interface DefaultMailAgentExecutorOptions {
  fetchImpl?: typeof fetch;
  bridgeSessionManager?: OpenClawBridgeSessionManager;
  commandRunner?: LocalCommandRunner;
  commandPolicyManifest?: MailRuntimePolicyManifest | null;
  embeddedAdapter?: EmbeddedRuntimeAdapter;
  embeddedSessionManager?: EmbeddedRuntimeSessionManager;
}

export function createDefaultMailAgentExecutor(
  config: AppConfig,
  options: DefaultMailAgentExecutorOptions = {}
) {
  if (config.runtime.mode === "embedded") {
    return createEmbeddedMailRuntimeExecutor(config, {
      adapter: options.embeddedAdapter ?? createBuiltInEmbeddedRuntimeAdapter(),
      sessionManager: options.embeddedSessionManager
    });
  }

  if (config.runtime.mode === "command") {
    const commandOptions: LocalCommandExecutorOptions = {
      runner: options.commandRunner,
      policyManifest: options.commandPolicyManifest ?? config.runtime.policyManifest
    };
    return createLocalCommandExecutor(config, commandOptions);
  }

  const bridgeOptions: OpenClawClientOptions = {
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.bridgeSessionManager ? { sessionManager: options.bridgeSessionManager } : {})
  };

  return createOpenClawClient(config, bridgeOptions);
}
