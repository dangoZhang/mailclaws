#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

import { loadConfig } from "../config.js";
import { runMailctl } from "./mailctl-main.js";

interface MailclawOutputMode {
  format: "text" | "json";
  verbose: boolean;
}

interface ParsedMailclawArgs {
  mode: MailclawOutputMode;
  help: boolean;
  version: boolean;
  positionals: string[];
}

export async function runMailclaw(
  args: string[],
  deps?: {
    stdout?: Pick<NodeJS.WriteStream, "write">;
    stderr?: Pick<NodeJS.WriteStream, "write">;
    runMailctl?: typeof runMailctl;
    startServer?: () => Promise<void> | void;
    openExternal?: (url: string) => Promise<void> | void;
    fetchJson?: (url: string) => Promise<unknown>;
  }
) {
  const stdout = deps?.stdout ?? process.stdout;
  const stderr = deps?.stderr ?? process.stderr;
  const parsedArgs = parseMailclawArgs(args);
  const [command, ...rest] = parsedArgs.positionals;

  if (parsedArgs.help || command === "help") {
    writeUsage(stdout);
    return 0;
  }

  if (parsedArgs.version) {
    writePayload(stdout, parsedArgs.mode, {
      name: "mailclaw",
      version: readPackageVersion()
    }, readPackageVersion());
    return 0;
  }

  if (!command || command === "serve" || command === "server") {
    await (deps?.startServer ?? startServer)();
    return 0;
  }

  if (command === "gateway") {
    if (isGatewayControlCommand(rest[0])) {
      return (deps?.runMailctl ?? runMailctl)(withMailctlFlags(parsedArgs.mode, ["gateway", ...rest]), {
        stdout,
        stderr
      });
    }
    if (!rest[0] || rest[0] === "run" || rest[0] === "start") {
      await (deps?.startServer ?? startServer)();
      return 0;
    }
    if (rest[0] === "status" || rest[0] === "health") {
      return inspectLocalRuntime({
        command: rest[0],
        stdout,
        stderr,
        mode: parsedArgs.mode,
        fetchJson: deps?.fetchJson ?? fetchJson
      });
    }
    const targetPath = rest[0] === "open" ? (rest[1] || "/") : rest[0];
    const url = openDashboardUrl({
      targetPath,
      stdout,
      stderr,
      mode: parsedArgs.mode,
      openExternal: deps?.openExternal ?? openExternalUrl
    });
    await url;
    return 0;
  }

  if (command === "dashboard" || command === "browser") {
    await openDashboardUrl({
      targetPath: rest[0],
      stdout,
      stderr,
      mode: parsedArgs.mode,
      openExternal: deps?.openExternal ?? openExternalUrl
    });
    return 0;
  }

  if (command === "open" || command === "console") {
    const url = resolveDirectWorkbenchUrl(rest[0]);
    stderr.write(`Opening ${url}\n`);
    await (deps?.openExternal ?? openExternalUrl)(url);
    writePayload(stdout, parsedArgs.mode, { url, mode: "direct_mail_tab" }, url);
    return 0;
  }

  if (command === "status" || command === "doctor" || command === "health") {
    return inspectLocalRuntime({
      command,
      stdout,
      stderr,
      mode: parsedArgs.mode,
      fetchJson: deps?.fetchJson ?? fetchJson
    });
  }

  const delegatedArgs = mapUserFacingCommand(command, rest) ?? args;
  if (delegatedArgs.length === 1 && delegatedArgs[0] === "__open_connect__") {
    const url = resolveGatewayUrl("/workbench/mail/login") ?? resolveDirectWorkbenchUrl("/workbench/mail/login");
    stderr.write(`Opening ${url}\n`);
    await (deps?.openExternal ?? openExternalUrl)(url);
    writePayload(stdout, parsedArgs.mode, { url, mode: resolveGatewayUrl("/workbench/mail/login") ? "gateway_host" : "direct_mail_tab" }, url);
    return 0;
  }

  return (deps?.runMailctl ?? runMailctl)(withMailctlFlags(parsedArgs.mode, delegatedArgs), {
    stdout,
    stderr
  });
}

function mapUserFacingCommand(command: string, rest: string[]) {
  switch (command) {
    case "setup":
    case "onboard":
    case "configure":
      return ["connect", "start", ...rest];
    case "login":
      if (rest[0] === "web" || rest[0] === "browser") {
        return ["__open_connect__"];
      }
      return ["connect", "login", ...rest];
    case "providers":
      return ["connect", "providers", ...rest];
    case "accounts":
      return ["accounts", ...rest];
    case "rooms":
      return ["rooms", ...rest];
    case "inboxes":
      return ["observe", "inboxes", ...rest];
    case "workbench":
      return ["observe", "workbench", ...rest];
    case "replay":
      return ["replay", ...rest];
    case "approvals":
      return ["approvals", ...rest];
    case "deliver":
      return ["deliver-outbox", ...rest];
    case "approve":
      return ["approve", ...rest];
    case "reject":
      return ["reject", ...rest];
    case "trace":
      return ["gateway-trace", ...rest];
    case "gateway-events":
      return ["gateway", "events", ...rest];
    case "gateway-history":
      return ["gateway", "import-history", ...rest];
    case "sync-mail":
      return ["gateway", "sync-mail", ...rest];
    default:
      return null;
  }
}

function parseMailclawArgs(args: string[]): ParsedMailclawArgs {
  const positionals: string[] = [];
  let help = false;
  let version = false;
  let json = false;
  let verbose = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    switch (arg) {
      case "--help":
      case "-h":
        help = true;
        break;
      case "--version":
      case "-V":
      case "-v":
        version = true;
        break;
      case "--json":
        json = true;
        break;
      case "--plain":
      case "--no-color":
        break;
      case "--verbose":
        verbose = true;
        break;
      default:
        positionals.push(arg);
        break;
    }
  }

  return {
    mode: {
      format: json ? "json" : "text",
      verbose
    },
    help,
    version,
    positionals
  };
}

function isGatewayControlCommand(value: string | undefined) {
  return (
    value === "resolve" ||
    value === "bind" ||
    value === "trace" ||
    value === "events" ||
    value === "import-history" ||
    value === "sync-mail" ||
    value === "dispatch"
  );
}

function resolveDirectWorkbenchUrl(pathname?: string) {
  const config = loadConfig(process.env);
  const baseUrl =
    config.http.publicBaseUrl.trim() || `http://${config.http.host}:${String(config.http.port)}`;
  const normalizedPath = pathname
    ? pathname.startsWith("/")
      ? pathname
      : pathname === "mail" ||
          pathname === "login" ||
          pathname === "workbench/mail" ||
          pathname === "workbench/mail/tab" ||
          pathname.startsWith("mail/") ||
          pathname.startsWith("login/") ||
          pathname.startsWith("workbench/mail/")
        ? `/${pathname.replace(/^\/+/, "")}`
        : `/console/${pathname.replace(/^console\/?/, "")}`
    : "/workbench/mail";
  return new URL(normalizedPath, ensureTrailingSlash(baseUrl)).toString();
}

function resolveGatewayUrl(pathname?: string) {
  const config = loadConfig(process.env);
  const baseUrl = config.openClaw.publicBaseUrl.trim();
  if (!baseUrl) {
    return null;
  }

  const normalizedPath = pathname
    ? pathname.startsWith("/")
      ? pathname
      : `/${pathname.replace(/^\/+/, "")}`
    : "/";
  return new URL(normalizedPath, ensureTrailingSlash(baseUrl)).toString();
}

async function openDashboardUrl(input: {
  targetPath?: string;
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
  mode: MailclawOutputMode;
  openExternal: (url: string) => Promise<void> | void;
}) {
  const gatewayUrl = resolveGatewayUrl(input.targetPath ?? "/");
  const url = gatewayUrl ?? resolveDirectWorkbenchUrl(input.targetPath || "/workbench/mail");
  if (!gatewayUrl) {
    input.stderr.write("OpenClaw host URL is not configured; falling back to the direct Mail tab.\n");
  }
  input.stderr.write(`Opening ${url}\n`);
  await input.openExternal(url);
  writePayload(input.stdout, input.mode, {
    url,
    mode: gatewayUrl ? "gateway_host" : "direct_mail_tab"
  }, url);
}

function ensureTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

async function startServer() {
  await import("../index.js");
}

async function inspectLocalRuntime(input: {
  command: "status" | "doctor" | "health";
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
  mode: MailclawOutputMode;
  fetchJson: (url: string) => Promise<unknown>;
}) {
  const config = loadConfig(process.env);
  const baseUrl =
    config.http.publicBaseUrl.trim() || `http://${config.http.host}:${String(config.http.port)}`;
  const gatewayUrl = resolveGatewayUrl();
  const healthUrl = new URL("/healthz", ensureTrailingSlash(baseUrl)).toString();
  const readyUrl = new URL("/readyz", ensureTrailingSlash(baseUrl)).toString();
  const workbenchUrl = new URL("/workbench/mail", ensureTrailingSlash(baseUrl)).toString();

  try {
    const [health, ready] = await Promise.all([
      input.fetchJson(healthUrl) as Promise<{ status?: string; service?: string; env?: string }>,
      input.fetchJson(readyUrl) as Promise<{ status?: string; service?: string }>
    ]);
    const payload = {
      service: String(health.service ?? config.serviceName),
      environment: String(health.env ?? config.env),
      health: String(health.status ?? "unknown"),
      ready: String(ready.status ?? "unknown"),
      gateway: gatewayUrl ?? null,
      mailTab: workbenchUrl
    };

    if (input.command === "status" || input.command === "health") {
      writePayload(
        input.stdout,
        input.mode,
        payload,
        [
          `MailClaw ${payload.service}`,
          `status: ${payload.health} / ready: ${payload.ready}`,
          `gateway: ${gatewayUrl ?? "not configured"}`,
          `mail tab: ${workbenchUrl}`
        ].join("\n")
      );
      return ready.status === "ok" ? 0 : 1;
    }

    writePayload(
      input.stdout,
      input.mode,
      payload,
      [
        "MailClaw doctor",
        `service: ${payload.service}`,
        `environment: ${payload.environment}`,
        `health: ${payload.health}`,
        `ready: ${payload.ready}`,
        `gateway: ${gatewayUrl ?? "not configured"}`,
        `mail tab: ${workbenchUrl}`,
        "",
        "next:",
        "  1. Run `mailclaw gateway` if the server is not ready.",
        "  2. Run `mailclaw onboard you@example.com` for the recommended path.",
        "  3. Run `mailclaw login` to connect one mailbox.",
        "  4. Run `mailclaw dashboard` to open OpenClaw/Gateway, then click the Mail tab.",
        "  5. Run `mailclaw open` for the direct Mail tab fallback."
      ].join("\n")
    );
    return ready.status === "ok" ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (input.command === "status" || input.command === "health") {
      input.stderr.write(`MailClaw is not reachable at ${baseUrl}: ${message}\n`);
      return 1;
    }

    input.stdout.write(
      [
        "MailClaw doctor",
        `status: not reachable at ${baseUrl}`,
        `error: ${message}`,
        "",
        "next:",
        "  1. Start MailClaw with `mailclaw gateway`.",
        "  2. Run `mailclaw onboard you@example.com` for the recommended path.",
        "  3. Connect a mailbox with `mailclaw login`.",
        "  4. Open OpenClaw/Gateway with `mailclaw dashboard` when configured.",
        "  5. Open the direct Mail tab with `mailclaw open`."
      ].join("\n") + "\n"
    );
    return 1;
  }
}

async function fetchJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function openExternalUrl(url: string) {
  const platform = process.platform;
  if (platform === "darwin") {
    await spawnAndWait("open", [url]);
    return;
  }

  if (platform === "win32") {
    await spawnAndWait("cmd", ["/c", "start", "", url]);
    return;
  }

  await spawnAndWait("xdg-open", [url]);
}

function spawnAndWait(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "ignore"
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
      }
    });
  });
}

function writePayload(
  stdout: Pick<NodeJS.WriteStream, "write">,
  mode: MailclawOutputMode,
  payload: unknown,
  text: string
) {
  if (mode.format === "json") {
    stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  if (mode.verbose) {
    stdout.write(`\nJSON:\n${JSON.stringify(payload, null, 2)}\n`);
  }
}

function withMailctlFlags(mode: MailclawOutputMode, args: string[]) {
  const prefix: string[] = [];
  if (mode.format === "json") {
    prefix.push("--json");
  }
  if (mode.verbose) {
    prefix.push("--verbose");
  }
  return [...prefix, ...args];
}

function readPackageVersion() {
  const packageJsonPath = new URL("../../package.json", import.meta.url);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: string };
  return packageJson.version ?? "0.0.0";
}

function writeUsage(stream: Pick<NodeJS.WriteStream, "write">) {
  stream.write(
    [
      "usage: mailclaw [--json] [--verbose] [--no-color] [--version] <gateway|dashboard|browser|setup|onboard|configure|login|providers|status|health|doctor|accounts|rooms|inboxes|workbench|replay|approvals|deliver|approve|reject|trace|gateway-events|gateway-history|sync-mail|open|console> ...",
      "",
      "first run:",
      "  mailclaw gateway",
      "  mailclaw setup [you@example.com]",
      "  mailclaw login",
      "  mailclaw dashboard",
      "",
      "quick checks:",
      "  mailclaw status",
      "  mailclaw health",
      "  mailclaw doctor",
      "",
      "commands:",
      "  gateway [run|start|status|health|open [path]|resolve|bind|trace|events|import-history|sync-mail|dispatch]",
      "  dashboard [path]",
      "  browser [path]",
      "  setup [emailAddress] [provider]",
      "  onboard [emailAddress] [provider]",
      "  configure [emailAddress] [provider]",
      "  login [provider-specific args|web]",
      "  providers [provider]",
      "  status",
      "  health",
      "  doctor",
      "  accounts [show <accountId>]",
      "  rooms [accountId]",
      "  inboxes <accountId>",
      "  workbench [accountId] [roomKey] [mailboxId]",
      "  replay <roomKey>",
      "  approvals [room <roomKey>|account <accountId>|trace <roomKey>]",
      "  deliver",
      "  approve <outboxId>",
      "  reject <outboxId>",
      "  trace <roomKey>",
      "  gateway-events <jsonFile>",
      "  gateway-history <sessionKey> <roomKey> <jsonFile>",
      "  sync-mail <roomKey> <messageId>",
      "",
      "advanced:",
      "  open [path]",
      "  mailclaw <mailctl command>",
      "  mailctl --help",
      "",
      "docs:",
      "  https://docs.openclaw.ai"
    ].join("\n") + "\n"
  );
}
