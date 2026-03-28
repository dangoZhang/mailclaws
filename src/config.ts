import path from "node:path";

import { z } from "zod";
import type {
  MailRuntimePolicyManifest,
  MailTurnFilesystemAccess,
  MailTurnNetworkAccess,
  MailTurnOutboundMode
} from "./core/types.js";
import type { MailTrustLevel } from "./identity/trust.js";
import { workerRoles, type WorkerRole } from "./core/types.js";
import { DEFAULT_GMAIL_OAUTH_SCOPES } from "./auth/gmail-oauth.js";
import { DEFAULT_MICROSOFT_OAUTH_SCOPES } from "./auth/microsoft-oauth.js";

export type AppConfig = ReturnType<typeof loadConfig>;

const booleanFlag = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string(), z.undefined()])
    .transform((value) => {
      if (typeof value === "boolean") {
        return value;
      }

      if (value === undefined) {
        return defaultValue;
      }

      return ["1", "true", "yes", "on"].includes(value.toLowerCase());
    });

const envSchema = z.object({
  MAILCLAW_ENV: z.string().default("development"),
  MAILCLAW_HTTP_HOST: z.string().default("127.0.0.1"),
  MAILCLAW_HTTP_PORT: z.coerce.number().int().positive().default(3000),
  MAILCLAW_PUBLIC_BASE_URL: z.string().default(""),
  MAILCLAW_STATE_DIR: z.string().default("./state"),
  MAILCLAW_SQLITE_PATH: z.string().default("./state/mailclaw.sqlite"),
  MAILCLAW_RUNTIME_MODE: z.enum(["bridge", "command", "embedded"]).default("bridge"),
  MAILCLAW_RUNTIME_COMMAND: z.string().default(""),
  MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON: z.string().default(""),
  MAILCLAW_MAIL_IO_MODE: z.enum(["local", "command"]).default("local"),
  MAILCLAW_MAIL_IO_COMMAND: z.string().default(""),
  MAILCLAW_FEATURE_MAIL_INGEST: booleanFlag(false),
  MAILCLAW_FEATURE_OPENCLAW_BRIDGE: booleanFlag(false),
  MAILCLAW_FEATURE_SWARM_WORKERS: booleanFlag(false),
  MAILCLAW_FEATURE_APPROVAL_GATE: booleanFlag(false),
  MAILCLAW_FEATURE_IDENTITY_TRUST_GATE: booleanFlag(false),
  MAILCLAW_IDENTITY_MIN_TRUST_LEVEL: z
    .enum(["T0", "T1", "T2", "T3", "T4"] satisfies [MailTrustLevel, ...MailTrustLevel[]])
    .default("T0"),
  MAILCLAW_OPENCLAW_BASE_URL: z.string().url().default("http://127.0.0.1:11437"),
  MAILCLAW_OPENCLAW_AGENT_ID: z.string().default("mail"),
  MAILCLAW_OPENCLAW_ROLE_AGENT_IDS_JSON: z.string().default(""),
  MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON: z.string().default(""),
  MAILCLAW_OPENCLAW_GATEWAY_TOKEN: z.string().default("change-me"),
  MAILCLAW_OPENCLAW_SESSION_PREFIX: z.string().default("hook:mail"),
  MAILCLAW_QUEUE_MAX_CONCURRENT_ROOMS: z.coerce.number().int().positive().default(3),
  MAILCLAW_QUEUE_MAX_WORKERS_PER_ROOM: z.coerce.number().int().positive().default(3),
  MAILCLAW_QUEUE_MAX_GLOBAL_WORKERS: z.coerce.number().int().positive().default(8),
  MAILCLAW_QUEUE_PRIORITY_AGING_MS: z.coerce.number().int().positive().default(60_000),
  MAILCLAW_QUEUE_PRIORITY_AGING_STEP: z.coerce.number().int().positive().default(25),
  MAILCLAW_QUEUE_ROOM_FAIRNESS_PENALTY_STEP: z.coerce.number().int().nonnegative().default(100),
  MAILCLAW_REPORTING_ACK_TIMEOUT_MS: z.coerce.number().int().positive().default(8_000),
  MAILCLAW_REPORTING_PROGRESS_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60_000),
  MAILCLAW_SMTP_HOST: z.string().default(""),
  MAILCLAW_SMTP_PORT: z.coerce.number().int().positive().default(587),
  MAILCLAW_SMTP_SECURE: booleanFlag(false),
  MAILCLAW_SMTP_USERNAME: z.string().default(""),
  MAILCLAW_SMTP_PASSWORD: z.string().default(""),
  MAILCLAW_SMTP_FROM: z.string().default(""),
  MAILCLAW_GMAIL_OAUTH_CLIENT_ID: z.string().default(""),
  MAILCLAW_GMAIL_OAUTH_CLIENT_SECRET: z.string().default(""),
  MAILCLAW_GMAIL_OAUTH_TOPIC_NAME: z.string().default(""),
  MAILCLAW_GMAIL_OAUTH_USER_ID: z.string().default("me"),
  MAILCLAW_GMAIL_OAUTH_LABEL_IDS: z.string().default(""),
  MAILCLAW_GMAIL_OAUTH_SCOPES: z.string().default(""),
  MAILCLAW_GMAIL_OAUTH_SESSION_TTL_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  MAILCLAW_MICROSOFT_OAUTH_CLIENT_ID: z.string().default(""),
  MAILCLAW_MICROSOFT_OAUTH_CLIENT_SECRET: z.string().default(""),
  MAILCLAW_MICROSOFT_OAUTH_TENANT: z.string().default("common"),
  MAILCLAW_MICROSOFT_OAUTH_SCOPES: z.string().default(""),
  MAILCLAW_MICROSOFT_OAUTH_SESSION_TTL_MS: z.coerce.number().int().positive().default(10 * 60 * 1000)
});

export function loadConfig(source: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  const env = envSchema.parse(source);
  const cwd = process.cwd();
  const roleAgentIds = parseRoleAgentIds(env.MAILCLAW_OPENCLAW_ROLE_AGENT_IDS_JSON);
  const roleExecutionPolicies = parseRoleExecutionPolicies(
    env.MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON
  );
  const runtimePolicyManifest = parseRuntimePolicyManifest(env.MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON);

  return {
    serviceName: "mailclaw",
    env: env.MAILCLAW_ENV,
    http: {
      host: env.MAILCLAW_HTTP_HOST,
      port: env.MAILCLAW_HTTP_PORT,
      publicBaseUrl: env.MAILCLAW_PUBLIC_BASE_URL.trim()
    },
    storage: {
      stateDir: path.resolve(cwd, env.MAILCLAW_STATE_DIR),
      sqlitePath: path.resolve(cwd, env.MAILCLAW_SQLITE_PATH)
    },
    runtime: {
      mode: env.MAILCLAW_RUNTIME_MODE,
      command: env.MAILCLAW_RUNTIME_COMMAND.trim(),
      policyManifest: runtimePolicyManifest
    },
    mailIo: {
      mode: env.MAILCLAW_MAIL_IO_MODE,
      command: env.MAILCLAW_MAIL_IO_COMMAND.trim()
    },
    features: {
      mailIngest: env.MAILCLAW_FEATURE_MAIL_INGEST,
      openClawBridge: env.MAILCLAW_FEATURE_OPENCLAW_BRIDGE,
      swarmWorkers: env.MAILCLAW_FEATURE_SWARM_WORKERS,
      approvalGate: env.MAILCLAW_FEATURE_APPROVAL_GATE,
      identityTrustGate: env.MAILCLAW_FEATURE_IDENTITY_TRUST_GATE
    },
    identity: {
      minTrustLevel: env.MAILCLAW_IDENTITY_MIN_TRUST_LEVEL
    },
    openClaw: {
      baseUrl: env.MAILCLAW_OPENCLAW_BASE_URL,
      agentId: env.MAILCLAW_OPENCLAW_AGENT_ID,
      roleAgentIds,
      roleExecutionPolicies,
      gatewayToken: env.MAILCLAW_OPENCLAW_GATEWAY_TOKEN,
      sessionPrefix: env.MAILCLAW_OPENCLAW_SESSION_PREFIX
    },
    queue: {
      maxConcurrentRooms: env.MAILCLAW_QUEUE_MAX_CONCURRENT_ROOMS,
      maxWorkersPerRoom: env.MAILCLAW_QUEUE_MAX_WORKERS_PER_ROOM,
      maxGlobalWorkers: env.MAILCLAW_QUEUE_MAX_GLOBAL_WORKERS,
      priorityAgingMs: env.MAILCLAW_QUEUE_PRIORITY_AGING_MS,
      priorityAgingStep: env.MAILCLAW_QUEUE_PRIORITY_AGING_STEP,
      roomFairnessPenaltyStep: env.MAILCLAW_QUEUE_ROOM_FAIRNESS_PENALTY_STEP
    },
    reporting: {
      ackTimeoutMs: env.MAILCLAW_REPORTING_ACK_TIMEOUT_MS,
      progressIntervalMs: env.MAILCLAW_REPORTING_PROGRESS_INTERVAL_MS
    },
    smtp: {
      host: env.MAILCLAW_SMTP_HOST.trim(),
      port: env.MAILCLAW_SMTP_PORT,
      secure: env.MAILCLAW_SMTP_SECURE,
      username: env.MAILCLAW_SMTP_USERNAME.trim(),
      password: env.MAILCLAW_SMTP_PASSWORD,
      from: env.MAILCLAW_SMTP_FROM.trim()
    },
    gmailOAuth: {
      clientId: env.MAILCLAW_GMAIL_OAUTH_CLIENT_ID.trim(),
      clientSecret: env.MAILCLAW_GMAIL_OAUTH_CLIENT_SECRET.trim(),
      topicName: env.MAILCLAW_GMAIL_OAUTH_TOPIC_NAME.trim(),
      userId: env.MAILCLAW_GMAIL_OAUTH_USER_ID.trim() || "me",
      labelIds: parseDelimitedStrings(env.MAILCLAW_GMAIL_OAUTH_LABEL_IDS),
      scopes: parseDelimitedStrings(env.MAILCLAW_GMAIL_OAUTH_SCOPES, DEFAULT_GMAIL_OAUTH_SCOPES),
      sessionTtlMs: env.MAILCLAW_GMAIL_OAUTH_SESSION_TTL_MS
    },
    microsoftOAuth: {
      clientId: env.MAILCLAW_MICROSOFT_OAUTH_CLIENT_ID.trim(),
      clientSecret: env.MAILCLAW_MICROSOFT_OAUTH_CLIENT_SECRET.trim(),
      tenant: env.MAILCLAW_MICROSOFT_OAUTH_TENANT.trim() || "common",
      scopes: parseDelimitedStrings(env.MAILCLAW_MICROSOFT_OAUTH_SCOPES, DEFAULT_MICROSOFT_OAUTH_SCOPES),
      sessionTtlMs: env.MAILCLAW_MICROSOFT_OAUTH_SESSION_TTL_MS
    }
  } as const;
}

function parseDelimitedStrings(raw: string, fallback: readonly string[] = []) {
  const values = raw
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length > 0 ? values : [...fallback];
}

function parseRuntimePolicyManifest(raw: string): MailRuntimePolicyManifest | null {
  if (!raw.trim()) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON must be valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON must be a JSON object");
  }

  const record = parsed as Record<string, unknown>;
  const toolPolicies = readRequiredStringArray(
    record.toolPolicies,
    "MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON toolPolicies"
  );
  const sandboxPolicies = readRequiredStringArray(
    record.sandboxPolicies,
    "MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON sandboxPolicies"
  );
  const networkAccess = readPolicyEnum<MailTurnNetworkAccess>(
    record.networkAccess,
    ["none", "allowlisted"],
    "MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON networkAccess"
  );
  const filesystemAccess = readPolicyEnum<MailTurnFilesystemAccess>(
    record.filesystemAccess,
    ["none", "workspace-read"],
    "MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON filesystemAccess"
  );
  const outboundMode = readPolicyEnum<MailTurnOutboundMode>(
    record.outboundMode,
    ["blocked", "approval_required"],
    "MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON outboundMode"
  );

  return {
    toolPolicies,
    sandboxPolicies,
    networkAccess,
    filesystemAccess,
    outboundMode
  };
}

function parseRoleAgentIds(raw: string): Partial<Record<WorkerRole, string>> {
  if (!raw.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MAILCLAW_OPENCLAW_ROLE_AGENT_IDS_JSON must be valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("MAILCLAW_OPENCLAW_ROLE_AGENT_IDS_JSON must be a JSON object");
  }

  const allowedRoles = new Set<WorkerRole>(workerRoles);
  const result: Partial<Record<WorkerRole, string>> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (!allowedRoles.has(key as WorkerRole)) {
      throw new Error(`MAILCLAW_OPENCLAW_ROLE_AGENT_IDS_JSON contains unsupported role: ${key}`);
    }

    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`MAILCLAW_OPENCLAW_ROLE_AGENT_IDS_JSON role ${key} must map to a non-empty string`);
    }

    result[key as WorkerRole] = value.trim();
  }

  return result;
}

interface RoleExecutionPolicyOverride {
  toolPolicy?: string;
  sandboxPolicy?: string;
  networkAccess?: MailTurnNetworkAccess;
  filesystemAccess?: MailTurnFilesystemAccess;
  outboundMode?: MailTurnOutboundMode;
}

function parseRoleExecutionPolicies(raw: string): Partial<Record<WorkerRole, RoleExecutionPolicyOverride>> {
  if (!raw.trim()) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON must be valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON must be a JSON object");
  }

  const allowedRoles = new Set<WorkerRole>(workerRoles);
  const result: Partial<Record<WorkerRole, RoleExecutionPolicyOverride>> = {};
  const networkAccessValues = new Set<MailTurnNetworkAccess>(["none", "allowlisted"]);
  const filesystemAccessValues = new Set<MailTurnFilesystemAccess>(["none", "workspace-read"]);
  const outboundModeValues = new Set<MailTurnOutboundMode>(["blocked", "approval_required"]);

  for (const [key, value] of Object.entries(parsed)) {
    if (!allowedRoles.has(key as WorkerRole)) {
      throw new Error(
        `MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON contains unsupported role: ${key}`
      );
    }

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(
        `MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON role ${key} must map to a JSON object`
      );
    }

    const record = value as Record<string, unknown>;
    const override: RoleExecutionPolicyOverride = {};

    if ("toolPolicy" in record) {
      if (typeof record.toolPolicy !== "string" || record.toolPolicy.trim().length === 0) {
        throw new Error(
          `MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON role ${key} toolPolicy must be a non-empty string`
        );
      }
      override.toolPolicy = record.toolPolicy.trim();
    }

    if ("sandboxPolicy" in record) {
      if (typeof record.sandboxPolicy !== "string" || record.sandboxPolicy.trim().length === 0) {
        throw new Error(
          `MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON role ${key} sandboxPolicy must be a non-empty string`
        );
      }
      override.sandboxPolicy = record.sandboxPolicy.trim();
    }

    if ("networkAccess" in record) {
      if (
        typeof record.networkAccess !== "string" ||
        !networkAccessValues.has(record.networkAccess as MailTurnNetworkAccess)
      ) {
        throw new Error(
          `MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON role ${key} networkAccess must be one of: none, allowlisted`
        );
      }
      override.networkAccess = record.networkAccess as MailTurnNetworkAccess;
    }

    if ("filesystemAccess" in record) {
      if (
        typeof record.filesystemAccess !== "string" ||
        !filesystemAccessValues.has(record.filesystemAccess as MailTurnFilesystemAccess)
      ) {
        throw new Error(
          `MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON role ${key} filesystemAccess must be one of: none, workspace-read`
        );
      }
      override.filesystemAccess = record.filesystemAccess as MailTurnFilesystemAccess;
    }

    if ("outboundMode" in record) {
      if (
        typeof record.outboundMode !== "string" ||
        !outboundModeValues.has(record.outboundMode as MailTurnOutboundMode)
      ) {
        throw new Error(
          `MAILCLAW_OPENCLAW_ROLE_EXECUTION_POLICIES_JSON role ${key} outboundMode must be one of: blocked, approval_required`
        );
      }
      override.outboundMode = record.outboundMode as MailTurnOutboundMode;
    }

    result[key as WorkerRole] = override;
  }

  return result;
}

function readRequiredStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty string array`);
  }

  const normalized = value.map((entry) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new Error(`${label} must be a non-empty string array`);
    }
    return entry.trim();
  });

  return Array.from(new Set(normalized));
}

function readPolicyEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}`);
  }

  return value as T;
}
