import http from "node:http";

import type { AppConfig } from "./config.js";
import { discoverMailboxProfile } from "./auth/mailbox-autoconfig.js";
import { renderOAuthCallbackHtml } from "./auth/oauth-core.js";
import { renderOpenClawWorkbenchShellHtml } from "./presentation/openclaw-workbench-shell.js";
import {
  buildConnectOnboardingPlan,
  getConnectDiscovery,
  getUnsupportedOAuthProviderMessage,
  listConnectProviderGuides,
  resolveConnectProviderGuide,
  resolveOAuthProvider
} from "./auth/oauth-providers.js";
import {
  OutboxActionError,
  RoomJobActionError,
  RuntimeApiError,
  RuntimeFeatureDisabledError,
  type createMailSidecarRuntime
} from "./orchestration/runtime.js";
import type { VirtualMessageOriginKind } from "./core/types.js";

export interface AppServerOptions {
  config: AppConfig;
  isReady?: () => boolean;
  mailApi?: ReturnType<typeof createMailSidecarRuntime>;
}

export function createAppServer(options: AppServerOptions) {
  const { config, isReady = () => true, mailApi } = options;

  return http.createServer((request, response) => {
    void handleRequest({ request, response, config, isReady, mailApi });
  });
}

function mapWorkbenchBrowserPath(pathname: string, search: string) {
  const suffix = search || "";
  if (
    pathname === "/" ||
    pathname === "/dashboard" ||
    pathname === "/dashboard/" ||
    pathname === "/mail" ||
    pathname === "/mail/" ||
    pathname === "/login" ||
    pathname === "/workbench/mail" ||
    pathname === "/workbench/mail/" ||
    pathname === "/workbench/mailclaws" ||
    pathname === "/workbench/mailclaws/"
  ) {
    return `/console/connect${suffix}`;
  }
  if (
    pathname === "/workbench/mail/tab" ||
    pathname === "/workbench/mail/tab/" ||
    pathname === "/workbench/mailclaws/tab" ||
    pathname === "/workbench/mailclaws/tab/"
  ) {
    return withSearch("/console/connect", search, "shell", "embedded");
  }
  if (
    pathname === "/mail/login" ||
    pathname === "/workbench/mail/login" ||
    pathname === "/workbench/mailclaws/login"
  ) {
    return `/console/connect${suffix}`;
  }
  if (pathname.startsWith("/workbench/mail/tab/")) {
    return withSearch(`/console/${pathname.slice("/workbench/mail/tab/".length)}`, search, "shell", "embedded");
  }
  if (pathname.startsWith("/workbench/mailclaws/tab/")) {
    return withSearch(`/console/${pathname.slice("/workbench/mailclaws/tab/".length)}`, search, "shell", "embedded");
  }
  if (pathname.startsWith("/dashboard/")) {
    return `/console/${pathname.slice("/dashboard/".length)}${suffix}`;
  }
  if (pathname.startsWith("/mail/")) {
    return `/console/${pathname.slice("/mail/".length)}${suffix}`;
  }
  if (pathname.startsWith("/workbench/mail/")) {
    return `/console/${pathname.slice("/workbench/mail/".length)}${suffix}`;
  }
  if (pathname.startsWith("/workbench/mailclaws/")) {
    return `/console/${pathname.slice("/workbench/mailclaws/".length)}${suffix}`;
  }
  return null;
}

function mapConsoleWorkbenchPath(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  const embedded = params.get("shell") === "embedded";
  params.delete("shell");
  const query = params.toString();
  const nextSuffix = query ? `?${query}` : "";
  const basePath = embedded ? "/workbench/mail/tab" : "/workbench/mail";

  if (pathname === "/console" || pathname === "/console/" || pathname === "/console/connect" || pathname === "/console/connect/") {
    return `${basePath}${nextSuffix}`;
  }

  if (pathname.startsWith("/console/connect/")) {
    return `${basePath}${pathname.slice("/console/connect".length)}${nextSuffix}`;
  }

  if (pathname.startsWith("/console/")) {
    return `${basePath}${pathname.slice("/console".length)}${nextSuffix}`;
  }

  return null;
}

function isWorkbenchShellPath(pathname: string) {
  if (
    pathname === "/" ||
    pathname === "/dashboard" ||
    pathname === "/dashboard/" ||
    pathname === "/mail" ||
    pathname === "/mail/" ||
    pathname === "/login" ||
    pathname === "/workbench/mail" ||
    pathname === "/workbench/mail/" ||
    pathname === "/workbench/mail/tab" ||
    pathname === "/workbench/mail/tab/" ||
    pathname === "/workbench/mailclaws/tab" ||
    pathname === "/workbench/mailclaws/tab/" ||
    pathname === "/workbench/mailclaws" ||
    pathname === "/workbench/mailclaws/" ||
    pathname === "/mail/login" ||
    pathname === "/workbench/mail/login" ||
    pathname === "/workbench/mailclaws/login"
  ) {
    return true;
  }
  return (
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/mail/") ||
    pathname.startsWith("/workbench/mail/tab/") ||
    pathname.startsWith("/workbench/mailclaws/tab/") ||
    pathname.startsWith("/workbench/mail/") ||
    pathname.startsWith("/workbench/mailclaws/")
  );
}

function withSearch(pathname: string, search: string, key: string, value: string) {
  const params = new URLSearchParams(search);
  if (!params.has(key)) {
    params.set(key, value);
  }
  const nextSearch = params.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ""}`;
}

function ensureSearchParam(urlPath: string, key: string, value: string) {
  const [pathname, search = ""] = urlPath.split("?", 2);
  return withSearch(pathname, search ? `?${search}` : "", key, value);
}

function writeJson(response: http.ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function writeHtml(response: http.ServerResponse, statusCode: number, body: string) {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8"
  });
  response.end(body);
}

async function handleRequest(options: {
  request: http.IncomingMessage;
  response: http.ServerResponse;
  config: AppConfig;
  isReady: () => boolean;
  mailApi?: ReturnType<typeof createMailSidecarRuntime>;
}) {
  try {
    const { request, response, config, isReady, mailApi } = options;
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && requestUrl.pathname === "/healthz") {
      writeJson(response, 200, {
        status: "ok",
        service: config.serviceName,
        env: config.env
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/readyz") {
      writeJson(response, isReady() ? 200 : 503, {
        status: isReady() ? "ok" : "not_ready",
        service: config.serviceName
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/connect/providers") {
      writeJson(response, 200, listConnectProviderGuides());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/connect") {
      writeJson(response, 200, {
        ...getConnectDiscovery(),
        providers: listConnectProviderGuides().map((guide) => ({
          id: guide.id,
          displayName: guide.displayName,
          setupKind: guide.setupKind,
          accountProvider: guide.accountProvider
        }))
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/connect/onboarding") {
      const emailAddress = requestUrl.searchParams.get("emailAddress") ?? undefined;
      const providerHint = requestUrl.searchParams.get("provider") ?? undefined;
      const autoconfig = emailAddress
        ? await discoverMailboxProfile({
            emailAddress,
            providerPreset: providerHint
          })
        : null;
      writeJson(
        response,
        200,
        {
          ...buildConnectOnboardingPlan({
            emailAddress,
            providerHint
          }),
          ...(autoconfig ? { autoconfig } : {})
        }
      );
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/runtime/execution") {
      writeJson(response, 200, mailApi.inspectRuntimeExecution());
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/runtime/embedded-sessions") {
      writeJson(
        response,
        200,
        mailApi.listEmbeddedRuntimeSessions({
          sessionKey: requestUrl.searchParams.get("sessionKey") ?? undefined,
          sessionId: requestUrl.searchParams.get("sessionId") ?? undefined
        })
      );
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/runtime/bridge-sessions") {
      writeJson(
        response,
        200,
        mailApi.listBridgeRuntimeSessions({
          sessionKey: requestUrl.searchParams.get("sessionKey") ?? undefined,
          sessionId: requestUrl.searchParams.get("sessionId") ?? undefined
        })
      );
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/runtime/mail-io") {
      writeJson(response, 200, await mailApi.inspectMailIoBoundary());
      return;
    }

    const connectProviderMatch = requestUrl.pathname.match(/^\/api\/connect\/providers\/([^/]+)$/);
    if (request.method === "GET" && connectProviderMatch) {
      const provider = resolveConnectProviderGuide(decodeURIComponent(connectProviderMatch[1] ?? ""));
      if (!provider) {
        throw new RuntimeApiError(`unknown connect provider: ${connectProviderMatch[1] ?? ""}`, 404);
      }
      writeJson(response, 200, provider);
      return;
    }

    const workbenchPath = mapWorkbenchBrowserPath(requestUrl.pathname, requestUrl.search);
    const consoleWorkbenchPath = mapConsoleWorkbenchPath(requestUrl.pathname, requestUrl.search);
    if (
      mailApi &&
      request.method === "GET" &&
      (isWorkbenchShellPath(requestUrl.pathname) || consoleWorkbenchPath !== null)
    ) {
      writeHtml(
        response,
        200,
        renderOpenClawWorkbenchShellHtml({
          serviceName: config.serviceName,
          initialWorkbenchPath: consoleWorkbenchPath ?? `${requestUrl.pathname}${requestUrl.search}`,
          initialConsolePath:
            requestUrl.pathname === "/console" || requestUrl.pathname.startsWith("/console/")
              ? `${requestUrl.pathname}${requestUrl.search || ""}`
              : workbenchPath != null
                ? ensureSearchParam(workbenchPath, "shell", "embedded")
                : "/console/connect?shell=embedded"
        })
      );
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/console/terminology") {
      writeJson(response, 200, mailApi.getConsoleTerminology());
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/console/workbench") {
      writeJson(
        response,
        200,
        mailApi.getConsoleWorkbench({
          mode: (requestUrl.searchParams.get("mode") as "connect" | "accounts" | "rooms" | "mailboxes" | "approvals" | null) ?? undefined,
          accountId: requestUrl.searchParams.get("accountId") ?? undefined,
          roomKey: requestUrl.searchParams.get("roomKey") ?? undefined,
          mailboxId: requestUrl.searchParams.get("mailboxId") ?? undefined,
          mailboxFilterId: requestUrl.searchParams.get("mailboxFilterId") ?? undefined,
          roomStatuses: parseOptionalStringList(requestUrl.searchParams.get("roomStatuses")),
          originKinds: parseOptionalOriginKinds(requestUrl.searchParams.get("originKinds")),
          approvalStatuses: parseOptionalStringList(requestUrl.searchParams.get("approvalStatuses")) as
            | Array<"requested" | "approved" | "rejected">
            | undefined,
          roomLimit: parseOptionalInteger(requestUrl.searchParams.get("roomLimit")),
          approvalLimit: parseOptionalInteger(requestUrl.searchParams.get("approvalLimit")),
          mailboxFeedLimit: parseOptionalInteger(requestUrl.searchParams.get("mailboxFeedLimit"))
        })
      );
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/console/workbench-host") {
      writeJson(response, 200, mailApi.getConsoleWorkbenchHost());
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/console/agent-templates") {
      writeJson(response, 200, mailApi.listAgentTemplates());
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/console/agent-directory") {
      writeJson(
        response,
        200,
        mailApi.getAgentDirectory({
          tenantId: requestUrl.searchParams.get("tenantId") ?? requestUrl.searchParams.get("accountId") ?? "default",
          accountId: requestUrl.searchParams.get("accountId") ?? undefined
        })
      );
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/console/headcount") {
      writeJson(response, 200, mailApi.getHeadcountRecommendations(requestUrl.searchParams.get("accountId") ?? undefined));
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/skills") {
      writeJson(
        response,
        200,
        mailApi.listAgentSkills({
          tenantId: requestUrl.searchParams.get("tenantId") ?? requestUrl.searchParams.get("accountId") ?? "default",
          accountId: requestUrl.searchParams.get("accountId") ?? undefined,
          agentId: requestUrl.searchParams.get("agentId") ?? undefined
        })
      );
      return;
    }

    const skillMatch = mailApi ? requestUrl.pathname.match(/^\/api\/skills\/([^/]+)\/([^/]+)$/) : null;
    if (mailApi && request.method === "GET" && skillMatch) {
      writeJson(
        response,
        200,
        mailApi.inspectAgentSkill({
          tenantId: requestUrl.searchParams.get("tenantId") ?? requestUrl.searchParams.get("accountId") ?? "default",
          agentId: decodeURIComponent(skillMatch[1] ?? ""),
          skillId: decodeURIComponent(skillMatch[2] ?? "")
        })
      );
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/console/rooms") {
      writeJson(
        response,
        200,
        mailApi.listConsoleRooms({
          accountId: requestUrl.searchParams.get("accountId") ?? undefined,
          roomKey: requestUrl.searchParams.get("roomKey") ?? undefined,
          mailboxId: requestUrl.searchParams.get("mailboxId") ?? undefined,
          statuses: parseOptionalStringList(requestUrl.searchParams.get("statuses")),
          originKinds: parseOptionalOriginKinds(requestUrl.searchParams.get("originKinds")),
          limit: parseOptionalInteger(requestUrl.searchParams.get("limit"))
        })
      );
      return;
    }

    const consoleRoomMatch = mailApi ? requestUrl.pathname.match(/^\/api\/console\/rooms\/(.+)$/) : null;
    if (mailApi && request.method === "GET" && consoleRoomMatch) {
      writeJson(response, 200, mailApi.getConsoleRoom(decodeURIComponent(consoleRoomMatch[1] ?? "")));
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/console/approvals") {
      writeJson(
        response,
        200,
        mailApi.listConsoleApprovals({
          accountId: requestUrl.searchParams.get("accountId") ?? undefined,
          roomKey: requestUrl.searchParams.get("roomKey") ?? undefined,
          statuses: parseOptionalStringList(requestUrl.searchParams.get("statuses")) as
            | Array<"requested" | "approved" | "rejected">
            | undefined,
          limit: parseOptionalInteger(requestUrl.searchParams.get("limit"))
        })
      );
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/console/accounts") {
      writeJson(response, 200, mailApi.listConsoleAccounts());
      return;
    }

    const consoleAccountMatch = mailApi ? requestUrl.pathname.match(/^\/api\/console\/accounts\/([^/]+)$/) : null;
    if (mailApi && request.method === "GET" && consoleAccountMatch) {
      writeJson(response, 200, mailApi.getConsoleAccount(decodeURIComponent(consoleAccountMatch[1] ?? "")));
      return;
    }

    const authStartMatch = mailApi ? requestUrl.pathname.match(/^\/api\/auth\/([^/]+)\/start$/) : null;
    if (mailApi && request.method === "GET" && authStartMatch) {
      const resolvedProvider = resolveOAuthProvider(decodeURIComponent(authStartMatch[1] ?? ""));
      if (!resolvedProvider) {
        throw new RuntimeApiError(getUnsupportedOAuthProviderMessage(authStartMatch[1]), 400);
      }
      if (requestUrl.searchParams.has("clientSecret")) {
        throw new RuntimeApiError(
          "clientSecret is not accepted on GET /api/auth/.../start; use POST /api/auth/.../start or env-backed CLI login",
          400
        );
      }

      const redirectUri =
        requestUrl.searchParams.get("redirectUri") ??
        buildDefaultOAuthRedirectUri({
          config,
          request,
          providerId: resolvedProvider.id
        });
      const started = mailApi.startOAuthLogin({
        provider: resolvedProvider.id,
        accountId: requiredQueryParam(requestUrl, "accountId"),
        displayName: requestUrl.searchParams.get("displayName") ?? undefined,
        loginHint: requestUrl.searchParams.get("loginHint") ?? undefined,
        redirectUri,
        clientId: requestUrl.searchParams.get("clientId") ?? undefined,
        clientSecret: requestUrl.searchParams.get("clientSecret") ?? undefined,
        tenant: requestUrl.searchParams.get("tenant") ?? undefined,
        topicName: requestUrl.searchParams.get("topicName") ?? undefined,
        userId: requestUrl.searchParams.get("userId") ?? undefined,
        labelIds: parseOptionalStringList(requestUrl.searchParams.get("labelIds")),
        scopes: parseOptionalStringList(requestUrl.searchParams.get("scopes"))
      });
      response.writeHead(302, {
        location: started.authorizeUrl
      });
      response.end();
      return;
    }

    const authCallbackMatch = mailApi ? requestUrl.pathname.match(/^\/api\/auth\/([^/]+)\/callback$/) : null;
    if (mailApi && request.method === "GET" && authCallbackMatch) {
      const resolvedProvider = resolveOAuthProvider(decodeURIComponent(authCallbackMatch[1] ?? ""));
      if (!resolvedProvider) {
        throw new RuntimeApiError(getUnsupportedOAuthProviderMessage(authCallbackMatch[1]), 400);
      }

      try {
        const completed = await mailApi.completeOAuthLogin({
          state: requiredQueryParam(requestUrl, "state"),
          code: requestUrl.searchParams.get("code") ?? undefined,
          error: requestUrl.searchParams.get("error") ?? undefined,
          errorDescription: requestUrl.searchParams.get("error_description") ?? undefined
        });
        writeHtml(
          response,
          200,
          renderOAuthCallbackHtml({
            providerName: resolvedProvider.displayName,
            success: true,
            title: `${resolvedProvider.displayName} mailbox connected`,
            message:
              resolvedProvider.id === "gmail"
                ? completed.watchReady
                  ? "MailClaws can now use Gmail watch/recovery and Gmail API send for this account."
                  : "The mailbox is connected. Add a Pub/Sub topic if you want Gmail watch/recovery to be active."
                : "The mailbox is connected. MailClaws will use IMAP/SMTP with OAuth for this account.",
            accountId: completed.account?.accountId,
            emailAddress: completed.account?.emailAddress
          })
        );
      } catch (error) {
        const statusCode =
          error instanceof RuntimeFeatureDisabledError
            ? 503
            : error instanceof OutboxActionError
              ? error.statusCode
              : error instanceof RoomJobActionError
                ? error.statusCode
                : error instanceof RuntimeApiError
                  ? error.statusCode
                  : 500;
        writeHtml(
          response,
          statusCode,
          renderOAuthCallbackHtml({
            providerName: resolvedProvider.displayName,
            success: false,
            title: `${resolvedProvider.displayName} mailbox connection failed`,
            message: error instanceof Error ? error.message : String(error)
          })
        );
      }
      return;
    }

    if (mailApi && request.method === "POST" && requestUrl.pathname === "/api/inbound/raw") {
      const body = (await readJsonBody(request)) as Parameters<typeof mailApi.ingestRaw>[0];
      const result = await mailApi.ingestRaw({
        ...body,
        processImmediately: requestUrl.searchParams.get("processImmediately") === "true"
      });

      writeJson(response, 200, result);
      return;
    }

    if (mailApi && request.method === "POST" && requestUrl.pathname === "/api/skills/install") {
      const body = (await readJsonBody(request)) as {
        tenantId?: string;
        accountId?: string;
        agentId?: string;
        source?: string;
        skillId?: string;
        title?: string;
      };
      writeJson(
        response,
        200,
        await mailApi.installAgentSkill({
          tenantId: body.tenantId ?? body.accountId ?? "default",
          agentId: typeof body.agentId === "string" ? body.agentId : "",
          source: typeof body.source === "string" ? body.source : "",
          skillId: typeof body.skillId === "string" ? body.skillId : undefined,
          title: typeof body.title === "string" ? body.title : undefined
        })
      );
      return;
    }

    if (mailApi && request.method === "POST" && requestUrl.pathname === "/api/inbound") {
      const body = await readJsonBody(request);
      const payload = body as Parameters<typeof mailApi.ingest>[0];
      const result = await mailApi.ingest({
        ...payload,
        processImmediately: requestUrl.searchParams.get("processImmediately") === "true"
      });

      writeJson(response, 200, result);
      return;
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname.startsWith("/api/rooms/")) {
      const match = requestUrl.pathname.match(/^\/api\/rooms\/(.+)\/replay$/);
      if (match) {
        const roomKey = decodeURIComponent(match[1] ?? "");
        const replay = mailApi.replay(roomKey);
        if (replay.room) {
          writeJson(response, 200, replay);
        } else {
          writeJson(response, 404, {
            status: "not_found"
          });
        }
        return;
      }

      const gatewayTraceMatch = requestUrl.pathname.match(/^\/api\/rooms\/(.+)\/gateway-projection-trace$/);
      if (gatewayTraceMatch) {
        writeJson(response, 200, mailApi.getGatewayProjectionTrace(decodeURIComponent(gatewayTraceMatch[1] ?? "")));
        return;
      }

      const approvalsMatch = requestUrl.pathname.match(/^\/api\/rooms\/(.+)\/approvals$/);
      if (approvalsMatch) {
        const roomKey = decodeURIComponent(approvalsMatch[1] ?? "");
        writeJson(response, 200, mailApi.traceApprovals(roomKey));
        return;
      }

      const mailboxViewMatch = requestUrl.pathname.match(/^\/api\/rooms\/(.+)\/mailboxes\/(.+)$/);
      if (mailboxViewMatch) {
        writeJson(response, 200, {
          roomKey: decodeURIComponent(mailboxViewMatch[1] ?? ""),
          mailboxId: decodeURIComponent(mailboxViewMatch[2] ?? ""),
          entries: mailApi.projectMailboxView({
            roomKey: decodeURIComponent(mailboxViewMatch[1] ?? ""),
            mailboxId: decodeURIComponent(mailboxViewMatch[2] ?? ""),
            originKinds: parseOptionalOriginKinds(requestUrl.searchParams.get("originKinds"))
          })
        });
        return;
      }
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname.startsWith("/api/gateway/sessions/")) {
      const match = requestUrl.pathname.match(/^\/api\/gateway\/sessions\/(.+)$/);
      if (match) {
        writeJson(response, 200, mailApi.resolveGatewayTurnRoom({
          sessionKey: decodeURIComponent(match[1] ?? ""),
          roomKey: requestUrl.searchParams.get("roomKey") ?? undefined
        }));
        return;
      }
    }

    if (mailApi && request.method === "POST" && requestUrl.pathname === "/api/recovery/room-queue") {
      const body = (await readJsonBody(request)) as { now?: string };
      writeJson(response, 200, mailApi.recover(body.now));
      return;
    }

    if (mailApi && request.method === "POST") {
      if (requestUrl.pathname === "/api/gateway/events") {
        const body = (await readJsonBody(request)) as {
          events?: unknown;
        };
        const events = Array.isArray(body.events) ? body.events : [body];
        writeJson(response, 200, {
          processed: mailApi.ingestGatewayEvents(events.map((event) => parseGatewayEvent(event)))
        });
        return;
      }

      const gatewayBindMatch = requestUrl.pathname.match(/^\/api\/gateway\/sessions\/(.+)\/bind$/);
      if (gatewayBindMatch) {
        const body = (await readJsonBody(request)) as {
          roomKey?: string;
          bindingKind?: "room" | "work_thread" | "subagent";
          sourceControlPlane?: string;
          workThreadId?: string;
          parentMessageId?: string;
          frontAgentId?: string;
          now?: string;
        };
        writeJson(response, 200, mailApi.bindGatewaySessionToRoom({
          sessionKey: decodeURIComponent(gatewayBindMatch[1] ?? ""),
          roomKey: requireStringBody(body.roomKey, "roomKey"),
          bindingKind: body.bindingKind ?? "room",
          sourceControlPlane: typeof body.sourceControlPlane === "string" ? body.sourceControlPlane : "openclaw",
          workThreadId: typeof body.workThreadId === "string" ? body.workThreadId : undefined,
          parentMessageId: typeof body.parentMessageId === "string" ? body.parentMessageId : undefined,
          frontAgentId: typeof body.frontAgentId === "string" ? body.frontAgentId : undefined,
          now: typeof body.now === "string" ? body.now : undefined
        }));
        return;
      }

      if (requestUrl.pathname === "/api/gateway/project") {
        const body = (await readJsonBody(request)) as {
          sessionKey?: string;
          sourceControlPlane?: string;
          sourceMessageId?: string;
          sourceRunId?: string;
          roomKey?: string;
          parentMessageId?: string;
          fromPrincipalId?: string;
          fromMailboxId?: string;
          toMailboxIds?: string[] | string;
          ccMailboxIds?: string[] | string;
          kind?: "task" | "question" | "claim" | "evidence" | "draft" | "review" | "approval" | "progress" | "final_ready" | "handoff" | "system_notice";
          visibility?: "room" | "internal" | "private" | "governance";
          subject?: string;
          bodyRef?: string;
          artifactRefs?: string[] | string;
          memoryRefs?: string[] | string;
          inputsHash?: string;
          createdAt?: string;
          threadKind?: "room" | "work";
          topic?: string;
          frontAgentId?: string;
        };
        writeJson(response, 200, mailApi.projectGatewayTurnToVirtualMail({
          sessionKey: requireStringBody(body.sessionKey, "sessionKey"),
          sourceControlPlane: typeof body.sourceControlPlane === "string" ? body.sourceControlPlane : "openclaw",
          sourceMessageId: typeof body.sourceMessageId === "string" ? body.sourceMessageId : undefined,
          sourceRunId: typeof body.sourceRunId === "string" ? body.sourceRunId : undefined,
          roomKey: typeof body.roomKey === "string" ? body.roomKey : undefined,
          parentMessageId: typeof body.parentMessageId === "string" ? body.parentMessageId : undefined,
          fromPrincipalId: requireStringBody(body.fromPrincipalId, "fromPrincipalId"),
          fromMailboxId: requireStringBody(body.fromMailboxId, "fromMailboxId"),
          toMailboxIds: parseRequiredBodyStringList(body.toMailboxIds, "toMailboxIds"),
          ccMailboxIds: parseOptionalBodyStringList(body.ccMailboxIds),
          kind: body.kind ?? "claim",
          visibility: body.visibility ?? "internal",
          subject: requireStringBody(body.subject, "subject"),
          bodyRef: requireStringBody(body.bodyRef, "bodyRef"),
          artifactRefs: parseOptionalBodyStringList(body.artifactRefs),
          memoryRefs: parseOptionalBodyStringList(body.memoryRefs),
          inputsHash: requireStringBody(body.inputsHash, "inputsHash"),
          createdAt: typeof body.createdAt === "string" ? body.createdAt : undefined,
          threadKind: body.threadKind,
          topic: typeof body.topic === "string" ? body.topic : undefined,
          frontAgentId: typeof body.frontAgentId === "string" ? body.frontAgentId : undefined
        }));
        return;
      }

      if (requestUrl.pathname === "/api/gateway/history/import") {
        const body = (await readJsonBody(request)) as {
          roomKey?: string;
          sessionKey?: string;
          sourceControlPlane?: string;
          frontAgentId?: string;
          bindingKind?: "room" | "work_thread" | "subagent";
          turns?: Array<{
            sourceMessageId?: string;
            sourceRunId?: string;
            fromPrincipalId?: string;
            fromMailboxId?: string;
            toMailboxIds?: string[] | string;
            ccMailboxIds?: string[] | string;
            kind?: "task" | "question" | "claim" | "evidence" | "draft" | "review" | "approval" | "progress" | "final_ready" | "handoff" | "system_notice";
            visibility?: "room" | "internal" | "private" | "governance";
            subject?: string;
            bodyText?: string;
            createdAt?: string;
            parentMessageId?: string;
          }>;
        };
        writeJson(
          response,
          200,
          mailApi.importGatewayThreadHistory({
            roomKey: requireStringBody(body.roomKey, "roomKey"),
            sessionKey: requireStringBody(body.sessionKey, "sessionKey"),
            sourceControlPlane: typeof body.sourceControlPlane === "string" ? body.sourceControlPlane : "openclaw",
            frontAgentId: typeof body.frontAgentId === "string" ? body.frontAgentId : undefined,
            bindingKind: body.bindingKind,
            turns: parseRequiredGatewayHistoryTurns(body.turns)
          })
        );
        return;
      }

      if (requestUrl.pathname === "/api/gateway/outcome") {
        const body = (await readJsonBody(request)) as {
          roomKey?: string;
          messageId?: string;
          projectedAt?: string;
        };
        writeJson(response, 200, mailApi.projectRoomOutcomeToGateway({
          roomKey: requireStringBody(body.roomKey, "roomKey"),
          messageId: requireStringBody(body.messageId, "messageId"),
          projectedAt: typeof body.projectedAt === "string" ? body.projectedAt : undefined
        }));
        return;
      }

      if (requestUrl.pathname === "/api/gateway/outcomes/dispatch") {
        const body = (await readJsonBody(request)) as {
          roomKey?: string;
          limit?: number;
        };
        writeJson(
          response,
          200,
          await mailApi.dispatchPendingGatewayOutcomes({
            roomKey: typeof body.roomKey === "string" ? body.roomKey : undefined,
            limit: typeof body.limit === "number" ? body.limit : undefined
          })
        );
        return;
      }

      const handoffMatch = requestUrl.pathname.match(/^\/api\/rooms\/(.+)\/handoff$/);
      if (handoffMatch) {
        const body = (await readJsonBody(request)) as {
          requestedBy?: string;
          reason?: string;
        };
        writeJson(
          response,
          200,
          mailApi.requestHandoff(decodeURIComponent(handoffMatch[1] ?? ""), {
            requestedBy: typeof body.requestedBy === "string" ? body.requestedBy : undefined,
            reason: typeof body.reason === "string" ? body.reason : undefined
          })
        );
        return;
      }

      const handoffReleaseMatch = requestUrl.pathname.match(/^\/api\/rooms\/(.+)\/handoff\/release$/);
      if (handoffReleaseMatch) {
        const body = (await readJsonBody(request)) as {
          releasedBy?: string;
          reason?: string;
        };
        writeJson(
          response,
          200,
          mailApi.releaseHandoff(decodeURIComponent(handoffReleaseMatch[1] ?? ""), {
            releasedBy: typeof body.releasedBy === "string" ? body.releasedBy : undefined,
            reason: typeof body.reason === "string" ? body.reason : undefined
          })
        );
        return;
      }

      const mailboxRebuildMatch = requestUrl.pathname.match(/^\/api\/rooms\/(.+)\/mailboxes\/rebuild$/);
      if (mailboxRebuildMatch) {
        writeJson(response, 200, mailApi.rebuildVirtualMailProjection(decodeURIComponent(mailboxRebuildMatch[1] ?? "")));
        return;
      }

      const roomJobRetryMatch = requestUrl.pathname.match(/^\/api\/dead-letter\/room-jobs\/([^/]+)\/retry$/);
      if (roomJobRetryMatch) {
        writeJson(response, 200, mailApi.retryRoomJob(decodeURIComponent(roomJobRetryMatch[1] ?? "")));
        return;
      }

      const applyTemplateMatch = requestUrl.pathname.match(/^\/api\/console\/agent-templates\/([^/]+)\/apply$/);
      if (applyTemplateMatch) {
        const body = (await readJsonBody(request)) as {
          accountId?: string;
          tenantId?: string;
          now?: string;
        };
        writeJson(
          response,
          200,
          mailApi.applyAgentTemplate({
            templateId: decodeURIComponent(applyTemplateMatch[1] ?? ""),
            accountId: requireStringBody(body.accountId, "accountId"),
            tenantId: typeof body.tenantId === "string" ? body.tenantId : undefined,
            now: typeof body.now === "string" ? body.now : undefined
          })
        );
        return;
      }

      if (requestUrl.pathname === "/api/console/agents") {
        const body = (await readJsonBody(request)) as {
          accountId?: string;
          tenantId?: string;
          agentId?: string;
          displayName?: string;
          purpose?: string;
          publicMailboxId?: string;
          collaboratorAgentIds?: string[] | string;
          activeRoomLimit?: number;
          ackSlaSeconds?: number;
          burstCoalesceSeconds?: number;
          now?: string;
        };
        writeJson(
          response,
          200,
          mailApi.createCustomAgent({
            accountId: requireStringBody(body.accountId, "accountId"),
            tenantId: typeof body.tenantId === "string" ? body.tenantId : undefined,
            agentId: requireStringBody(body.agentId, "agentId"),
            displayName: typeof body.displayName === "string" ? body.displayName : undefined,
            purpose: typeof body.purpose === "string" ? body.purpose : undefined,
            publicMailboxId: typeof body.publicMailboxId === "string" ? body.publicMailboxId : undefined,
            collaboratorAgentIds: parseOptionalBodyStringList(body.collaboratorAgentIds),
            activeRoomLimit: typeof body.activeRoomLimit === "number" ? body.activeRoomLimit : undefined,
            ackSlaSeconds: typeof body.ackSlaSeconds === "number" ? body.ackSlaSeconds : undefined,
            burstCoalesceSeconds:
              typeof body.burstCoalesceSeconds === "number" ? body.burstCoalesceSeconds : undefined,
            now: typeof body.now === "string" ? body.now : undefined
          })
        );
        return;
      }
    }

    if (mailApi && request.method === "POST" && requestUrl.pathname === "/api/outbox/deliver") {
      writeJson(response, 200, await mailApi.deliverOutbox());
      return;
    }

    const roomMessageEmailSyncMatch =
      mailApi && request.method === "POST"
        ? requestUrl.pathname.match(/^\/api\/rooms\/(.+)\/messages\/(.+)\/sync-email$/)
        : null;
    if (mailApi && roomMessageEmailSyncMatch) {
      const body = (await readJsonBody(request)) as {
        mailboxAddress?: string;
        to?: string[] | string;
        cc?: string[] | string;
        bcc?: string[] | string;
        subject?: string;
        body?: string;
        htmlBody?: string;
        kind?: "ack" | "progress" | "final";
        approvalRequired?: boolean;
        createdAt?: string;
      };
      writeJson(
        response,
        200,
        mailApi.syncRoomMessageToEmail({
          roomKey: decodeURIComponent(roomMessageEmailSyncMatch[1] ?? ""),
          messageId: decodeURIComponent(roomMessageEmailSyncMatch[2] ?? ""),
          mailboxAddress: typeof body.mailboxAddress === "string" ? body.mailboxAddress : undefined,
          to: parseOptionalBodyStringList(body.to),
          cc: parseOptionalBodyStringList(body.cc),
          bcc: parseOptionalBodyStringList(body.bcc),
          subject: typeof body.subject === "string" ? body.subject : undefined,
          body: typeof body.body === "string" ? body.body : undefined,
          htmlBody: typeof body.htmlBody === "string" ? body.htmlBody : undefined,
          kind: body.kind,
          approvalRequired: typeof body.approvalRequired === "boolean" ? body.approvalRequired : undefined,
          createdAt: typeof body.createdAt === "string" ? body.createdAt : undefined
        })
      );
      return;
    }

    if (mailApi && request.method === "POST" && requestUrl.pathname.startsWith("/api/outbox/")) {
      const match = requestUrl.pathname.match(/^\/api\/outbox\/([^/]+)\/(approve|reject)$/);
      if (match) {
        const outboxId = decodeURIComponent(match[1] ?? "");
        const action = match[2];
        writeJson(
          response,
          200,
          action === "approve" ? mailApi.approveOutbox(outboxId) : mailApi.rejectOutbox(outboxId)
        );
        return;
      }
    }

    if (mailApi && request.method === "GET" && requestUrl.pathname === "/api/accounts") {
      writeJson(response, 200, mailApi.listPublicAccounts());
      return;
    }

    if (mailApi && request.method === "GET") {
      const mailboxConsoleMatch = requestUrl.pathname.match(/^\/api\/accounts\/([^/]+)\/mailbox-console$/);
      if (mailboxConsoleMatch) {
        writeJson(response, 200, mailApi.getPublicMailboxConsole(decodeURIComponent(mailboxConsoleMatch[1] ?? "")));
        return;
      }

      const inboxListMatch = requestUrl.pathname.match(/^\/api\/accounts\/([^/]+)\/inboxes$/);
      if (inboxListMatch) {
        writeJson(response, 200, mailApi.listPublicAgentInboxes(decodeURIComponent(inboxListMatch[1] ?? "")));
        return;
      }

      const inboxProjectMatch = requestUrl.pathname.match(/^\/api\/accounts\/([^/]+)\/inboxes\/([^/]+)\/project$/);
      if (inboxProjectMatch) {
        writeJson(
          response,
          200,
          mailApi.projectPublicAgentInbox({
            accountId: decodeURIComponent(inboxProjectMatch[1] ?? ""),
            agentId: decodeURIComponent(inboxProjectMatch[2] ?? ""),
            activeRoomLimit: parseOptionalInteger(requestUrl.searchParams.get("activeRoomLimit")),
            ackSlaSeconds: parseOptionalInteger(requestUrl.searchParams.get("ackSlaSeconds")),
            burstCoalesceSeconds: parseOptionalInteger(requestUrl.searchParams.get("burstCoalesceSeconds"))
          })
        );
        return;
      }

      const providerStateMatch = requestUrl.pathname.match(/^\/api\/accounts\/([^/]+)\/provider-state$/);
      if (providerStateMatch) {
        writeJson(
          response,
          200,
          mailApi.getPublicAccountProviderState(decodeURIComponent(providerStateMatch[1] ?? ""))
        );
        return;
      }

      const mailboxFeedMatch = requestUrl.pathname.match(/^\/api\/accounts\/([^/]+)\/mailboxes\/([^/]+)\/feed$/);
      if (mailboxFeedMatch) {
        writeJson(
          response,
          200,
          mailApi.projectMailboxFeed({
            accountId: decodeURIComponent(mailboxFeedMatch[1] ?? ""),
            mailboxId: decodeURIComponent(mailboxFeedMatch[2] ?? ""),
            limit: parseOptionalInteger(requestUrl.searchParams.get("limit")),
            originKinds: parseOptionalOriginKinds(requestUrl.searchParams.get("originKinds"))
          })
        );
        return;
      }

      const inboxItemsMatch = requestUrl.pathname.match(/^\/api\/inboxes\/([^/]+)\/items$/);
      if (inboxItemsMatch) {
        writeJson(response, 200, mailApi.listInboxItems(decodeURIComponent(inboxItemsMatch[1] ?? "")));
        return;
      }
    }

    if (mailApi && request.method === "POST" && requestUrl.pathname === "/api/accounts") {
      const body = (await readJsonBody(request)) as Parameters<typeof mailApi.upsertAccount>[0];
      mailApi.upsertAccount(body);
      writeJson(
        response,
        200,
        mailApi.listPublicAccounts().find((account) => account.accountId === body.accountId) ?? {
          accountId: body.accountId
        }
      );
      return;
    }

    const authStartPostMatch = mailApi ? requestUrl.pathname.match(/^\/api\/auth\/([^/]+)\/start$/) : null;
    if (mailApi && request.method === "POST" && authStartPostMatch) {
      const resolvedProvider = resolveOAuthProvider(decodeURIComponent(authStartPostMatch[1] ?? ""));
      if (!resolvedProvider) {
        throw new RuntimeApiError(getUnsupportedOAuthProviderMessage(authStartPostMatch[1]), 400);
      }
      const body = (await readJsonBody(request)) as {
        accountId?: string;
        displayName?: string;
        loginHint?: string;
        redirectUri?: string;
        clientId?: string;
        clientSecret?: string;
        tenant?: string;
        topicName?: string;
        userId?: string;
        labelIds?: string[] | string;
        scopes?: string[] | string;
      };
      writeJson(
        response,
        200,
        mailApi.startOAuthLogin({
          provider: resolvedProvider.id,
          accountId: requireStringBody(body.accountId, "accountId"),
          displayName: typeof body.displayName === "string" ? body.displayName : undefined,
          loginHint: typeof body.loginHint === "string" ? body.loginHint : undefined,
          redirectUri:
            typeof body.redirectUri === "string" && body.redirectUri.trim().length > 0
              ? body.redirectUri
              : buildDefaultOAuthRedirectUri({
                  config,
                  request,
                  providerId: resolvedProvider.id
                }),
          clientId: typeof body.clientId === "string" ? body.clientId : undefined,
          clientSecret: typeof body.clientSecret === "string" ? body.clientSecret : undefined,
          tenant: typeof body.tenant === "string" ? body.tenant : undefined,
          topicName: typeof body.topicName === "string" ? body.topicName : undefined,
          userId: typeof body.userId === "string" ? body.userId : undefined,
          labelIds: parseOptionalBodyStringList(body.labelIds),
          scopes: parseOptionalBodyStringList(body.scopes)
        })
      );
      return;
    }

    if (mailApi && request.method === "POST") {
      const gmailNotificationMatch = requestUrl.pathname.match(/^\/api\/accounts\/([^/]+)\/gmail\/notifications$/);
      if (gmailNotificationMatch) {
        const body = await readJsonBody(request);
        const payload =
          body && typeof body === "object" && "notification" in body
            ? ((body as { notification?: unknown }).notification ?? {})
            : body;
        writeJson(
          response,
          200,
          await mailApi.ingestGmailNotification({
            accountId: decodeURIComponent(gmailNotificationMatch[1] ?? ""),
            notification: payload as Parameters<typeof mailApi.ingestGmailNotification>[0]["notification"],
            processImmediately: requestUrl.searchParams.get("processImmediately") === "true"
          })
        );
        return;
      }

      const gmailRecoveryMatch = requestUrl.pathname.match(/^\/api\/accounts\/([^/]+)\/gmail\/recover$/);
      if (gmailRecoveryMatch) {
        const body = (await readJsonBody(request)) as {
          reason?: string;
        };
        writeJson(
          response,
          200,
          await mailApi.recoverGmailMailbox({
            accountId: decodeURIComponent(gmailRecoveryMatch[1] ?? ""),
            reason: typeof body.reason === "string" ? body.reason : undefined,
            processImmediately: requestUrl.searchParams.get("processImmediately") === "true"
          })
        );
        return;
      }
    }

    writeJson(response, 404, {
      status: "not_found"
    });
  } catch (error) {
    const statusCode =
      error instanceof RuntimeFeatureDisabledError
        ? 503
        : error instanceof OutboxActionError
          ? error.statusCode
          : error instanceof RoomJobActionError
            ? error.statusCode
            : error instanceof RuntimeApiError
              ? error.statusCode
          : 500;
    writeJson(options.response, statusCode, {
      status: "error",
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function buildDefaultOAuthRedirectUri(input: {
  config: AppConfig;
  request: http.IncomingMessage;
  providerId: string;
}) {
  const baseUrl = input.config.http.publicBaseUrl
    ? normalizeConfiguredBaseUrl(input.config.http.publicBaseUrl)
    : `http://${normalizeLocalHttpHost(input.config.http.host)}:${input.request.socket.localPort ?? input.config.http.port}`;

  return new URL(`/api/auth/${input.providerId}/callback`, baseUrl).toString();
}

function normalizeConfiguredBaseUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new RuntimeApiError("MAILCLAW_PUBLIC_BASE_URL must be an absolute http(s) URL", 500);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new RuntimeApiError("MAILCLAW_PUBLIC_BASE_URL must use http or https", 500);
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString();
}

function normalizeLocalHttpHost(host: string) {
  const trimmed = host.trim();
  if (!trimmed || trimmed === "0.0.0.0" || trimmed === "::" || trimmed === "[::]") {
    return "127.0.0.1";
  }
  return trimmed;
}

async function readJsonBody(request: http.IncomingMessage) {
  let body = "";

  for await (const chunk of request) {
    body += chunk.toString();
  }

  if (!body) {
    return {};
  }

  return JSON.parse(body) as unknown;
}

function parseOptionalInteger(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalStringList(value: string | null) {
  if (!value) {
    return undefined;
  }

  const parsed = value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

function parseOptionalOriginKinds(value: string | null): VirtualMessageOriginKind[] | undefined {
  const parsed = parseOptionalStringList(value);
  if (!parsed) {
    return undefined;
  }

  return parsed.filter(
    (entry): entry is VirtualMessageOriginKind =>
      entry === "provider_mail" || entry === "gateway_chat" || entry === "virtual_internal"
  );
}

function parseOptionalBodyStringList(value: string[] | string | undefined) {
  if (typeof value === "string") {
    return parseOptionalStringList(value);
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const parsed = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

function parseRequiredBodyStringList(value: string[] | string | undefined, key: string) {
  const parsed = parseOptionalBodyStringList(value);
  if (!parsed || parsed.length === 0) {
    throw new RuntimeApiError(`${key} is required`, 400);
  }

  return parsed;
}

function requiredQueryParam(url: URL, key: string) {
  const value = url.searchParams.get(key);
  if (!value || value.trim().length === 0) {
    throw new RuntimeApiError(`${key} is required`, 400);
  }

  return value.trim();
}

function requireStringBody(value: unknown, key: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RuntimeApiError(`${key} is required`, 400);
  }

  return value.trim();
}

function parseGatewayEvent(event: unknown) {
  const record =
    typeof event === "object" && event !== null ? (event as Record<string, unknown>) : null;
  if (!record || typeof record.type !== "string") {
    throw new RuntimeApiError("gateway event type is required", 400);
  }

  switch (record.type) {
    case "gateway.session.bind":
      return {
        type: record.type,
        sessionKey: requireStringBody(record.sessionKey, "sessionKey"),
        roomKey: requireStringBody(record.roomKey, "roomKey"),
        bindingKind: (record.bindingKind as "room" | "work_thread" | "subagent" | undefined) ?? "room",
        sourceControlPlane: typeof record.sourceControlPlane === "string" ? record.sourceControlPlane : "openclaw",
        workThreadId: typeof record.workThreadId === "string" ? record.workThreadId : undefined,
        parentMessageId: typeof record.parentMessageId === "string" ? record.parentMessageId : undefined,
        frontAgentId: typeof record.frontAgentId === "string" ? record.frontAgentId : undefined,
        now: typeof record.now === "string" ? record.now : undefined
      } as const;
    case "gateway.turn.project":
      return {
        type: record.type,
        sessionKey: requireStringBody(record.sessionKey, "sessionKey"),
        sourceControlPlane: typeof record.sourceControlPlane === "string" ? record.sourceControlPlane : "openclaw",
        sourceMessageId: typeof record.sourceMessageId === "string" ? record.sourceMessageId : undefined,
        sourceRunId: typeof record.sourceRunId === "string" ? record.sourceRunId : undefined,
        roomKey: typeof record.roomKey === "string" ? record.roomKey : undefined,
        parentMessageId: typeof record.parentMessageId === "string" ? record.parentMessageId : undefined,
        fromPrincipalId: requireStringBody(record.fromPrincipalId, "fromPrincipalId"),
        fromMailboxId: requireStringBody(record.fromMailboxId, "fromMailboxId"),
        toMailboxIds: parseRequiredBodyStringList(record.toMailboxIds as string[] | string | undefined, "toMailboxIds"),
        ccMailboxIds: parseOptionalBodyStringList(record.ccMailboxIds as string[] | string | undefined),
        kind: (record.kind as "task" | "question" | "claim" | "evidence" | "draft" | "review" | "approval" | "progress" | "final_ready" | "handoff" | "system_notice" | undefined) ?? "claim",
        visibility: (record.visibility as "room" | "internal" | "private" | "governance" | undefined) ?? "internal",
        subject: requireStringBody(record.subject, "subject"),
        bodyRef: requireStringBody(record.bodyRef, "bodyRef"),
        artifactRefs: parseOptionalBodyStringList(record.artifactRefs as string[] | string | undefined),
        memoryRefs: parseOptionalBodyStringList(record.memoryRefs as string[] | string | undefined),
        inputsHash: requireStringBody(record.inputsHash, "inputsHash"),
        createdAt: typeof record.createdAt === "string" ? record.createdAt : undefined,
        threadKind: record.threadKind as "room" | "work" | undefined,
        topic: typeof record.topic === "string" ? record.topic : undefined,
        frontAgentId: typeof record.frontAgentId === "string" ? record.frontAgentId : undefined
      } as const;
    case "gateway.outcome.project":
      return {
        type: record.type,
        roomKey: requireStringBody(record.roomKey, "roomKey"),
        messageId: requireStringBody(record.messageId, "messageId"),
        projectedAt: typeof record.projectedAt === "string" ? record.projectedAt : undefined
      } as const;
    case "gateway.history.import":
      return {
        type: record.type,
        roomKey: requireStringBody(record.roomKey, "roomKey"),
        sessionKey: requireStringBody(record.sessionKey, "sessionKey"),
        sourceControlPlane: typeof record.sourceControlPlane === "string" ? record.sourceControlPlane : "openclaw",
        frontAgentId: typeof record.frontAgentId === "string" ? record.frontAgentId : undefined,
        bindingKind: (record.bindingKind as "room" | "work_thread" | "subagent" | undefined) ?? "room",
        turns: parseRequiredGatewayHistoryTurns(record.turns as unknown)
      } as const;
    default:
      throw new RuntimeApiError(`unsupported gateway event type: ${record.type}`, 400);
  }
}

function parseRequiredGatewayHistoryTurns(turns: unknown) {
  if (!Array.isArray(turns) || turns.length === 0) {
    throw new RuntimeApiError("gateway history turns are required", 400);
  }

  return turns.map((turn, index) => {
    const record =
      typeof turn === "object" && turn !== null ? (turn as Record<string, unknown>) : null;
    if (!record) {
      throw new RuntimeApiError(`gateway history turn ${index + 1} is invalid`, 400);
    }

    return {
      sourceMessageId: typeof record.sourceMessageId === "string" ? record.sourceMessageId : undefined,
      sourceRunId: typeof record.sourceRunId === "string" ? record.sourceRunId : undefined,
      fromPrincipalId: requireStringBody(record.fromPrincipalId, `turns[${index}].fromPrincipalId`),
      fromMailboxId: requireStringBody(record.fromMailboxId, `turns[${index}].fromMailboxId`),
      toMailboxIds: parseRequiredBodyStringList(
        record.toMailboxIds as string[] | string | undefined,
        `turns[${index}].toMailboxIds`
      ),
      ccMailboxIds: parseOptionalBodyStringList(record.ccMailboxIds as string[] | string | undefined),
      kind:
        (record.kind as
          | "task"
          | "question"
          | "claim"
          | "evidence"
          | "draft"
          | "review"
          | "approval"
          | "progress"
          | "final_ready"
          | "handoff"
          | "system_notice"
          | undefined) ?? "claim",
      visibility:
        (record.visibility as "room" | "internal" | "private" | "governance" | undefined) ?? "internal",
      subject: requireStringBody(record.subject, `turns[${index}].subject`),
      bodyText: requireStringBody(record.bodyText, `turns[${index}].bodyText`),
      createdAt: requireStringBody(record.createdAt, `turns[${index}].createdAt`),
      parentMessageId: typeof record.parentMessageId === "string" ? record.parentMessageId : undefined
    };
  });
}
