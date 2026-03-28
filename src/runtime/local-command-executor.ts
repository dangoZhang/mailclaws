import { spawn } from "node:child_process";
import path from "node:path";

import type { AppConfig } from "../config.js";
import type { MailRuntimePolicyManifest } from "../core/types.js";
import type { MailAgentExecutionResult, MailAgentExecutor } from "./agent-executor.js";
import {
  assertCanonicalMemoryNamespaceDescriptors,
  assertExecutionPolicyAllowsTurn,
  assertRuntimePolicyManifestAllowsTurn,
  prepareExecutionAttachments
} from "./execution-context.js";

export interface LocalCommandRunnerResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type LocalCommandRunner = (
  command: string,
  input: string
) => Promise<LocalCommandRunnerResult>;

export interface LocalCommandExecutorOptions {
  runner?: LocalCommandRunner;
  policyManifest?: MailRuntimePolicyManifest | null;
}

export function createLocalCommandExecutor(
  config: AppConfig,
  runnerOrOptions: LocalCommandRunner | LocalCommandExecutorOptions = runLocalCommand
): MailAgentExecutor {
  const explicitManifest =
    typeof runnerOrOptions === "function" ? undefined : runnerOrOptions.policyManifest;
  const options =
    typeof runnerOrOptions === "function"
      ? {
          runner:
            runnerOrOptions === runLocalCommand
              ? (command: string, input: string) =>
                  runLocalCommand(command, input, { cwd: config.storage.stateDir })
              : runnerOrOptions,
          policyManifest: config.runtime.policyManifest
        }
      : {
          runner:
            runnerOrOptions.runner ??
            ((command: string, input: string) =>
              runLocalCommand(command, input, { cwd: config.storage.stateDir })),
          policyManifest: runnerOrOptions.policyManifest ?? config.runtime.policyManifest
        };

  return {
    inspectRuntime() {
      return {
        runtimeKind: "command",
        runtimeLabel: normalizeCommandLabel(config.runtime.command),
        policyManifest: options.policyManifest ?? null,
        manifestSource: explicitManifest !== undefined ? (explicitManifest ? "executor" : "none") : config.runtime.policyManifest ? "config" : "none",
        namespaceValidation: true,
        canonicalWorkspaceBinding: true,
        policyAdmissionRequired: true,
        backendEnforcement: "local_command"
      };
    },
    async executeMailTurn(input) {
      const command = config.runtime.command;
      if (!command) {
        throw new Error("MAILCLAW_RUNTIME_COMMAND is required when runtime mode is command");
      }
      assertExecutionPolicyAllowsTurn(input);
      assertCanonicalMemoryNamespaceDescriptors(config, input);
      assertRuntimePolicyManifestAllowsTurn({
        runtimeKind: "command",
        runtimeLabel: normalizeCommandLabel(command),
        executionInput: input,
        policyManifest: options.policyManifest
      });
      const attachments = prepareExecutionAttachments(config, input);

      const startedAt = new Date().toISOString();
      const requestBody = {
        sessionKey: input.sessionKey,
        inputText: input.inputText,
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(attachments ? { attachments } : {}),
        ...(input.memoryNamespaces ? { memoryNamespaces: input.memoryNamespaces } : {}),
        ...(input.executionPolicy ? { executionPolicy: input.executionPolicy } : {})
      };
      const result = await options.runner(command, JSON.stringify(requestBody));
      const completedAt = new Date().toISOString();

      if (result.exitCode !== 0) {
        throw new Error(
          `local runtime command failed: ${result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`}`
        );
      }

      return {
        startedAt,
        completedAt,
        responseText: extractCommandResponseText(result.stdout),
        request: sanitizeCommandRequest(command, requestBody)
      } satisfies MailAgentExecutionResult;
    }
  };
}

export async function runLocalCommand(
  command: string,
  input: string,
  options: {
    cwd?: string;
    envOverrides?: Record<string, string>;
    transportLabel?: string;
  } = {}
): Promise<LocalCommandRunnerResult> {
  const commandSpec = parseRuntimeCommand(command);
  return new Promise((resolve, reject) => {
    const child = spawn(commandSpec.file, commandSpec.args, {
      shell: false,
      cwd: options.cwd ?? process.cwd(),
      env: buildRuntimeProcessEnvironment(
        options.cwd,
        options.transportLabel ?? "local-command",
        options.envOverrides
      ),
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1
      });
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

export function parseRuntimeCommand(command: string) {
  const parts = command.match(/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'|\S+/g) ?? [];
  const tokens = parts.map((part) => {
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'"))
    ) {
      return part.slice(1, -1);
    }
    return part;
  });

  if (tokens.length === 0 || !tokens[0]) {
    throw new Error("MAILCLAW_RUNTIME_COMMAND must include an executable");
  }

  return {
    file: tokens[0],
    args: tokens.slice(1)
  };
}

export function buildRuntimeProcessEnvironment(
  cwd = process.cwd(),
  transportLabel = "local-command",
  envOverrides: Record<string, string> = {}
) {
  const nextEnv: Record<string, string> = {};
  const passthroughKeys = ["PATH", "PATHEXT", "SYSTEMROOT", "COMSPEC", "TMPDIR", "TMP", "TEMP", "LANG"];

  for (const key of passthroughKeys) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
      nextEnv[key] = value;
    }
  }

  nextEnv.MAILCLAW_RUNTIME_TRANSPORT = transportLabel;
  nextEnv.MAILCLAW_RUNTIME_CWD = path.resolve(cwd);
  for (const [key, value] of Object.entries(envOverrides)) {
    nextEnv[key] = value;
  }

  return nextEnv;
}

function extractCommandResponseText(stdout: string) {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const payload = JSON.parse(trimmed) as {
      responseText?: string;
    };
    return payload.responseText?.trim() ?? "";
  } catch {
    return trimmed;
  }
}

function sanitizeCommandRequest(command: string, body: Record<string, unknown>) {
  return {
    url: `command://${normalizeCommandLabel(command)}`,
    method: "POST" as const,
    headers: {
      "x-mailclaw-runtime": "command"
    },
    body
  };
}

function normalizeCommandLabel(command: string) {
  return command.trim().split(/\s+/)[0] ?? "local";
}
