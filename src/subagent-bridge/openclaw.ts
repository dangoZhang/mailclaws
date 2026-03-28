import type { AppConfig } from "../config.js";
import {
  buildOpenClawResponsesUrl,
  extractOpenClawResponseText,
  parseOpenClawSseStream
} from "../openclaw/bridge.js";

export interface SpawnBurstSubAgentInput {
  parentSessionKey: string;
  targetAgentId: string;
  inputText: string;
  model?: string;
  thinking?: string;
  timeoutSeconds?: number;
  sandboxMode: "require" | "inherit";
}

export interface SpawnBurstSubAgentResult {
  runId: string;
  childSessionKey: string;
  childSessionId?: string;
  acceptedAt: string;
  request: {
    url: string;
    method: "POST";
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
}

export interface WatchBurstSubAgentInput {
  childSessionKey: string;
  runId: string;
}

export interface WatchBurstSubAgentResult {
  status: "completed" | "failed" | "timeout";
  responseText: string;
  completedAt: string;
  announceSummary?: string;
  childSessionId?: string;
  request: {
    url: string;
    method: "GET" | "POST";
    headers: Record<string, string>;
    body?: Record<string, unknown>;
  };
}

export interface RunBoundSubAgentInput {
  childSessionKey: string;
  targetAgentId: string;
  inputText: string;
  model?: string;
  thinking?: string;
  sandboxMode: "require" | "inherit";
}

export interface OpenClawSubAgentTransport {
  spawnBurst(input: SpawnBurstSubAgentInput): Promise<SpawnBurstSubAgentResult>;
  watchBurst(input: WatchBurstSubAgentInput): Promise<WatchBurstSubAgentResult>;
  runBound(input: RunBoundSubAgentInput): Promise<WatchBurstSubAgentResult>;
}

export function createOpenClawSubAgentTransport(
  config: AppConfig,
  fetchImpl: typeof fetch = fetch
): OpenClawSubAgentTransport {
  return {
    async spawnBurst(input) {
      const request = buildSessionsSpawnRequest(config, input);
      const acceptedAt = new Date().toISOString();
      const response = await fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(request.body)
      });
      const payload = (await response.json()) as Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          `OpenClaw sessions_spawn failed: ${response.status} ${String(payload.error ?? response.statusText)}`.trim()
        );
      }

      if (payload.status !== "accepted") {
        throw new Error(`OpenClaw sessions_spawn did not accept run: ${JSON.stringify(payload)}`);
      }

      if (typeof payload.runId !== "string" || typeof payload.childSessionKey !== "string") {
        throw new Error(`OpenClaw sessions_spawn returned invalid identifiers: ${JSON.stringify(payload)}`);
      }

      return {
        runId: payload.runId,
        childSessionKey: payload.childSessionKey,
        childSessionId: typeof payload.childSessionId === "string" ? payload.childSessionId : undefined,
        acceptedAt,
        request
      };
    },
    async watchBurst(input) {
      const request = buildSessionHistoryFollowRequest(config, input.childSessionKey);
      const response = await fetchImpl(request.url, {
        method: request.method,
        headers: request.headers
      });
      const completedAt = new Date().toISOString();
      const raw = await response.text();

      if (!response.ok) {
        throw new Error(`OpenClaw session history watch failed: ${response.status} ${response.statusText}`.trim());
      }

      const responseText = extractHistoryText(raw).trim();

      return {
        status: responseText.length > 0 ? "completed" : "failed",
        responseText,
        completedAt,
        request
      };
    },
    async runBound(input) {
      const request = buildBoundSessionTurnRequest(config, input);
      const response = await fetchImpl(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(request.body)
      });
      const completedAt = new Date().toISOString();
      const raw = await response.text();

      if (!response.ok) {
        const message = extractHistoryText(raw) || response.statusText;
        throw new Error(`OpenClaw bound session turn failed: ${response.status} ${message}`.trim());
      }

      const responseText = extractHistoryText(raw).trim();
      return {
        status: responseText.length > 0 ? "completed" : "failed",
        responseText,
        completedAt,
        request
      };
    }
  };
}

export function buildSessionsSpawnRequest(config: AppConfig, input: SpawnBurstSubAgentInput) {
  const url = new URL("/v1/sessions/spawn", config.openClaw.baseUrl).toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-openclaw-session-key": input.parentSessionKey
  };

  if (config.openClaw.gatewayToken) {
    headers.Authorization = `Bearer ${config.openClaw.gatewayToken}`;
  }

  return {
    url,
    method: "POST" as const,
    headers,
    body: {
      agentId: input.targetAgentId,
      mode: "burst",
      wait: false,
      nestedSubagents: false,
      maxSpawnDepth: 1,
      sandboxMode: input.sandboxMode,
      executionPolicy: {
        outboundMode: "blocked"
      },
      ...(input.model ? { model: input.model } : {}),
      ...(input.thinking ? { thinking: input.thinking } : {}),
      ...(typeof input.timeoutSeconds === "number" ? { timeoutSeconds: input.timeoutSeconds } : {}),
      input: input.inputText
    }
  };
}

export function buildSessionHistoryFollowRequest(config: AppConfig, childSessionKey: string) {
  const url = new URL(`/v1/sessions/${encodeURIComponent(childSessionKey)}/history`, config.openClaw.baseUrl);
  url.searchParams.set("follow", "1");

  const headers: Record<string, string> = {};
  if (config.openClaw.gatewayToken) {
    headers.Authorization = `Bearer ${config.openClaw.gatewayToken}`;
  }

  return {
    url: url.toString(),
    method: "GET" as const,
    headers
  };
}

export function buildBoundSessionTurnRequest(config: AppConfig, input: RunBoundSubAgentInput) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-openclaw-agent-id": input.targetAgentId,
    "x-openclaw-session-key": input.childSessionKey
  };

  if (config.openClaw.gatewayToken) {
    headers.Authorization = `Bearer ${config.openClaw.gatewayToken}`;
  }

  return {
    url: buildOpenClawResponsesUrl(config.openClaw.baseUrl),
    method: "POST" as const,
    headers,
    body: {
      model: input.model ?? `openclaw:${input.targetAgentId}`,
      stream: true,
      sandboxMode: input.sandboxMode,
      executionPolicy: {
        outboundMode: "blocked"
      },
      ...(input.thinking ? { thinking: input.thinking } : {}),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: input.inputText
            }
          ]
        }
      ]
    }
  };
}

function extractHistoryText(raw: string) {
  const sseText = extractOpenClawResponseText(parseOpenClawSseStream(raw));
  if (sseText.trim().length > 0) {
    return sseText;
  }

  try {
    const payload = JSON.parse(raw) as unknown;
    return extractNestedText(payload);
  } catch {
    return raw;
  }
}

function extractNestedText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => extractNestedText(entry)).filter(Boolean).join("\n").trim();
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const record = value as Record<string, unknown>;
  const direct = [record.responseText, record.text, record.summary].find((entry) => typeof entry === "string");
  if (typeof direct === "string") {
    return direct;
  }

  return [record.message, record.output, record.history, record.messages, record.events]
    .map((entry) => extractNestedText(entry))
    .filter((entry) => entry.length > 0)
    .join("\n")
    .trim();
}
