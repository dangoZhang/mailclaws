function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function serializeForScript(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

export function renderConsoleAppHtml(input: {
  serviceName: string;
  initialPath: string;
  apiBasePath?: string;
}) {
  const config = serializeForScript({
    serviceName: input.serviceName,
    initialPath: input.initialPath,
    apiBasePath: input.apiBasePath ?? "/api"
  });

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.serviceName)} Console</title>
    <style>
      :root {
        --bg: #0b1217;
        --bg-elevated: rgba(13, 28, 36, 0.82);
        --bg-panel: rgba(20, 38, 48, 0.92);
        --bg-panel-soft: rgba(17, 32, 40, 0.86);
        --border: rgba(145, 196, 220, 0.16);
        --border-strong: rgba(145, 196, 220, 0.26);
        --text: #eef7fb;
        --muted: #8fb3c2;
        --accent: #56d0b3;
        --accent-soft: rgba(86, 208, 179, 0.16);
        --warning: #f2bb4a;
        --danger: #ff7f6c;
        --shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
        --radius-lg: 22px;
        --radius-md: 16px;
        --radius-sm: 12px;
        --font-sans: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
        --font-mono: "IBM Plex Mono", "SFMono-Regular", "Menlo", monospace;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        min-height: 100%;
        background:
          radial-gradient(circle at top right, rgba(86, 208, 179, 0.12), transparent 28rem),
          radial-gradient(circle at top left, rgba(87, 160, 242, 0.14), transparent 26rem),
          linear-gradient(180deg, #0b1217 0%, #0f1a21 100%);
        color: var(--text);
        font-family: var(--font-sans);
      }

      body {
        padding: 22px;
      }

      a {
        color: inherit;
      }

      button, select, input {
        font: inherit;
      }

      .page {
        max-width: 1600px;
        margin: 0 auto;
        display: grid;
        gap: 18px;
      }

      .hero {
        padding: 26px 28px;
        border-radius: var(--radius-lg);
        border: 1px solid var(--border);
        background:
          linear-gradient(135deg, rgba(86, 208, 179, 0.14), transparent 45%),
          linear-gradient(160deg, rgba(87, 160, 242, 0.16), rgba(13, 28, 36, 0.92) 58%);
        box-shadow: var(--shadow);
      }

      .hero-top {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
      }

      .hero h1 {
        margin: 0;
        font-size: clamp(1.8rem, 4vw, 3rem);
        letter-spacing: -0.03em;
      }

      .hero p {
        margin: 12px 0 0;
        max-width: 64rem;
        color: var(--muted);
        line-height: 1.55;
      }

      .hero-kicker {
        display: inline-flex;
        padding: 7px 11px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.05);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.14em;
      }

      .hero-stats {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 20px;
      }

      .stat {
        padding: 14px 16px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.04);
      }

      .stat-label {
        color: var(--muted);
        font-size: 0.82rem;
      }

      .stat-value {
        margin-top: 6px;
        font-size: 1.35rem;
        font-weight: 700;
      }

      .toolbar,
      .panel {
        border-radius: var(--radius-lg);
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        backdrop-filter: blur(12px);
        box-shadow: var(--shadow);
      }

      .toolbar {
        padding: 16px 18px;
        display: grid;
        gap: 12px;
      }

      .toolbar-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: center;
      }

      .toolbar .group {
        display: grid;
        gap: 6px;
        min-width: 180px;
      }

      .toolbar label,
      .section-label {
        color: var(--muted);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      select,
      input,
      .ghost-button,
      .primary-button {
        min-height: 40px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid var(--border-strong);
        background: rgba(255, 255, 255, 0.03);
        color: var(--text);
      }

      .ghost-button {
        cursor: pointer;
      }

      .ghost-button:hover,
      select:hover,
      input:hover {
        border-color: rgba(145, 196, 220, 0.38);
      }

      input::placeholder {
        color: rgba(143, 179, 194, 0.7);
      }

      .tab-strip {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 16px;
      }

      .tab-button {
        cursor: pointer;
        padding: 10px 14px;
        border-radius: 999px;
        border: 1px solid var(--border-strong);
        background: rgba(255, 255, 255, 0.03);
        color: var(--text);
      }

      .tab-button.active {
        background: linear-gradient(135deg, rgba(86, 208, 179, 0.24), rgba(87, 160, 242, 0.22));
        border-color: rgba(145, 196, 220, 0.38);
      }

      .primary-button {
        cursor: pointer;
        background: linear-gradient(135deg, rgba(86, 208, 179, 0.24), rgba(87, 160, 242, 0.22));
      }

      .dashboard {
        display: grid;
        grid-template-columns: minmax(250px, 0.9fr) minmax(340px, 1.1fr) minmax(420px, 1.6fr);
        gap: 18px;
      }

      .stack {
        display: grid;
        gap: 18px;
      }

      .panel {
        overflow: hidden;
      }

      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 16px 18px;
        border-bottom: 1px solid var(--border);
      }

      .panel-header h2,
      .panel-header h3 {
        margin: 0;
        font-size: 1rem;
      }

      .panel-body {
        padding: 16px 18px 18px;
      }

      .list {
        display: grid;
        gap: 12px;
      }

      .card-button {
        width: 100%;
        text-align: left;
        cursor: pointer;
        padding: 14px 15px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border);
        background: var(--bg-panel-soft);
        color: inherit;
      }

      .card-button:hover,
      .card-button.active {
        border-color: rgba(86, 208, 179, 0.34);
        background: linear-gradient(135deg, rgba(86, 208, 179, 0.14), rgba(18, 38, 49, 0.95));
      }

      .card-top,
      .card-bottom,
      .detail-grid,
      .chips,
      .timeline-list,
      .empty,
      .mailbox-feed,
      .two-col {
        display: grid;
        gap: 10px;
      }

      .card-top {
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
      }

      .card-title {
        font-weight: 700;
        line-height: 1.35;
      }

      .card-subtitle,
      .muted {
        color: var(--muted);
      }

      .chips {
        grid-template-columns: repeat(auto-fit, minmax(80px, max-content));
        gap: 8px;
      }

      .chip,
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.04);
        font-size: 0.8rem;
      }

      .chip.link {
        cursor: pointer;
      }

      .chip.link:hover {
        border-color: rgba(86, 208, 179, 0.34);
      }

      .badge.good {
        color: var(--accent);
        border-color: rgba(86, 208, 179, 0.32);
        background: var(--accent-soft);
      }

      .badge.warn {
        color: var(--warning);
        border-color: rgba(242, 187, 74, 0.32);
        background: rgba(242, 187, 74, 0.1);
      }

      .badge.danger {
        color: var(--danger);
        border-color: rgba(255, 127, 108, 0.34);
        background: rgba(255, 127, 108, 0.1);
      }

      .detail-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .metric {
        padding: 14px 15px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border);
        background: var(--bg-panel);
      }

      .metric .label {
        color: var(--muted);
        font-size: 0.8rem;
      }

      .metric .value {
        margin-top: 6px;
        font-size: 1.05rem;
        font-weight: 700;
      }

      .timeline-entry,
      .feed-entry {
        padding: 13px 14px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border);
        background: var(--bg-panel-soft);
      }

      .timeline-entry .meta,
      .feed-entry .meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        color: var(--muted);
        font-size: 0.82rem;
      }

      .timeline-entry .title,
      .feed-entry .title {
        margin-top: 8px;
        font-weight: 700;
      }

      .timeline-entry .detail,
      .feed-entry .detail {
        margin-top: 6px;
        color: var(--muted);
        line-height: 1.45;
      }

      .code {
        font-family: var(--font-mono);
        font-size: 0.84rem;
      }

      .empty,
      .error-banner {
        padding: 16px;
        border-radius: var(--radius-md);
        border: 1px dashed var(--border-strong);
        color: var(--muted);
      }

      .error-banner {
        border-style: solid;
        color: #ffd4ca;
        border-color: rgba(255, 127, 108, 0.34);
        background: rgba(255, 127, 108, 0.08);
      }

      .footer-note {
        color: var(--muted);
        font-size: 0.86rem;
      }

      .loading {
        opacity: 0.62;
      }

      @media (max-width: 1200px) {
        .dashboard {
          grid-template-columns: 1fr;
        }

        .hero-stats,
        .detail-grid,
        .two-col {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 720px) {
        body {
          padding: 14px;
        }

        .hero,
        .toolbar,
        .panel-body,
        .panel-header {
          padding-left: 14px;
          padding-right: 14px;
        }

        .hero-top,
        .toolbar-row {
          flex-direction: column;
          align-items: stretch;
        }

        .hero-stats,
        .detail-grid,
        .two-col {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div id="app" class="page"></div>
    <script type="module">
      const config = ${config};
      const app = document.getElementById("app");
      const originKindOptions = ["provider_mail", "gateway_chat", "virtual_internal"];
      const roomStatusOptions = ["idle", "queued", "running", "waiting_approval", "done", "failed", "handoff_pending"];
      const approvalStatusOptions = ["requested", "approved", "rejected"];
      const state = {
        loading: true,
        error: null,
        terminology: null,
        boundaries: null,
        workspace: null,
        accounts: [],
        rooms: [],
        approvals: [],
        accountDetail: null,
        roomDetail: null,
        mailboxConsole: null,
        mailboxFeed: [],
        roomMailboxView: [],
        selectedAccountId: null,
        selectedInboxId: null,
        selectedRoomKey: null,
        selectedMailboxId: null,
        routeMode: null,
        connect: {
          emailAddress: "",
          provider: "",
          plan: null
        },
        filters: {
          status: "",
          originKind: "",
          mailboxId: "",
          approvalStatus: ""
        }
      };

      function escapeHtml(value) {
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function formatTime(value) {
        if (!value) {
          return "n/a";
        }

        try {
          return new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          }).format(new Date(value));
        } catch (error) {
          return value;
        }
      }

      function apiPath(path) {
        return config.apiBasePath.replace(/\\/$/, "") + path;
      }

      async function requestJson(path, options) {
        const response = await fetch(apiPath(path), {
          headers: {
            accept: "application/json"
          }
        });

        if (response.status === 404 && options && options.allow404) {
          return null;
        }

        if (!response.ok) {
          let message = "request failed";
          try {
            const payload = await response.json();
            if (payload && typeof payload.error === "string") {
              message = payload.error;
            }
          } catch (error) {
          }
          throw new Error(message);
        }

        return response.json();
      }

      function badgeTone(value) {
        if (value === "healthy" || value === "done" || value === "delivered" || value === "approved") {
          return "good";
        }
        if (
          value === "degraded" ||
          value === "queued" ||
          value === "running" ||
          value === "pending_approval" ||
          value === "requested" ||
          value === "waiting_review" ||
          value === "waiting_approval" ||
          value === "watch"
        ) {
          return "warn";
        }
        if (
          value === "attention_required" ||
          value === "failed" ||
          value === "rejected" ||
          value === "blocked" ||
          value === "canceled" ||
          value === "critical"
        ) {
          return "danger";
        }
        return "";
      }

      function badge(label, value) {
        return '<span class="badge ' + badgeTone(value || label) + '">' + escapeHtml(label) + '</span>';
      }

      function countPendingRooms(rooms) {
        return rooms.filter(function(room) {
          return room.pendingApprovalCount > 0 || room.openDeliveryCount > 0;
        }).length;
      }

      function parseRoute() {
        const current = new URL(window.location.href);
        const segments = current.pathname.split("/").filter(Boolean);
        const route = {
          accountId: current.searchParams.get("accountId"),
          inboxId: current.searchParams.get("inboxId"),
          roomKey: current.searchParams.get("roomKey"),
          mailboxId: current.searchParams.get("mailboxId"),
          mode: current.searchParams.get("mode") || "",
          status: current.searchParams.get("status") || "",
          originKind: current.searchParams.get("originKind") || "",
          approvalStatus: current.searchParams.get("approvalStatus") || ""
        };

        if (segments[0] === "console" && segments[1] === "connect") {
          route.mode = "connect";
        }

        if (segments[0] === "console" && segments[1] === "accounts" && segments[2]) {
          route.accountId = decodeURIComponent(segments[2]);
        }

        if (segments[0] === "console" && segments[1] === "rooms" && segments[2]) {
          route.roomKey = decodeURIComponent(segments[2]);
        }

        if (segments[0] === "console" && segments[1] === "inboxes" && segments[2] && segments[3]) {
          route.accountId = decodeURIComponent(segments[2]);
          route.inboxId = decodeURIComponent(segments[3]);
        }

        if (segments[0] === "console" && segments[1] === "mailboxes" && segments[2] && segments[3]) {
          route.accountId = decodeURIComponent(segments[2]);
          route.mailboxId = decodeURIComponent(segments[3]);
        }

        state.selectedAccountId = route.accountId || null;
        state.selectedInboxId = route.inboxId || null;
        state.selectedRoomKey = route.roomKey || null;
        state.selectedMailboxId = route.mailboxId || null;
        state.routeMode = route.mode || null;
        state.filters.status = route.status;
        state.filters.originKind = route.originKind;
        state.filters.mailboxId = route.mailboxId || "";
        state.filters.approvalStatus = route.approvalStatus;
      }

      function syncRoute() {
        let pathname = "/console";
        if (state.routeMode === "connect" && !state.selectedInboxId && !state.selectedMailboxId && !state.selectedRoomKey && !state.selectedAccountId) {
          pathname = "/console/connect";
        } else if (state.selectedInboxId && state.selectedAccountId) {
          pathname =
            "/console/inboxes/" +
            encodeURIComponent(state.selectedAccountId) +
            "/" +
            encodeURIComponent(state.selectedInboxId);
        } else if (state.selectedMailboxId && state.selectedAccountId) {
          pathname =
            "/console/mailboxes/" +
            encodeURIComponent(state.selectedAccountId) +
            "/" +
            encodeURIComponent(state.selectedMailboxId);
        } else if (state.selectedRoomKey) {
          pathname = "/console/rooms/" + encodeURIComponent(state.selectedRoomKey);
        } else if (state.selectedAccountId) {
          pathname = "/console/accounts/" + encodeURIComponent(state.selectedAccountId);
        }

        const search = new URLSearchParams();
        if (state.routeMode === "connect" && pathname === "/console") {
          search.set("mode", "connect");
        }
        if (state.filters.status) {
          search.set("status", state.filters.status);
        }
        if (state.filters.originKind) {
          search.set("originKind", state.filters.originKind);
        }
        if (!state.selectedMailboxId && state.filters.mailboxId) {
          search.set("mailboxId", state.filters.mailboxId);
        }
        if (state.selectedMailboxId && state.selectedRoomKey) {
          search.set("roomKey", state.selectedRoomKey);
        }
        if (state.filters.approvalStatus) {
          search.set("approvalStatus", state.filters.approvalStatus);
        }
        const href = pathname + (search.toString() ? "?" + search.toString() : "");
        if (href !== window.location.pathname + window.location.search) {
          window.history.replaceState({}, "", href);
        }
      }

      async function refresh() {
        state.loading = true;
        state.error = null;
        render();

        try {
          const workbenchQuery = new URLSearchParams();
          if (state.routeMode) {
            workbenchQuery.set("mode", state.routeMode);
          }
          if (state.selectedAccountId) {
            workbenchQuery.set("accountId", state.selectedAccountId);
          }
          if (state.selectedRoomKey) {
            workbenchQuery.set("roomKey", state.selectedRoomKey);
          }
          if (state.selectedMailboxId) {
            workbenchQuery.set("mailboxId", state.selectedMailboxId);
          }
          if (state.filters.status) {
            workbenchQuery.set("roomStatuses", state.filters.status);
          }
          if (state.filters.originKind) {
            workbenchQuery.set("originKinds", state.filters.originKind);
          }
          if (state.filters.mailboxId && !state.selectedMailboxId) {
            workbenchQuery.set("mailboxFilterId", state.filters.mailboxId);
          }
          if (state.filters.approvalStatus) {
            workbenchQuery.set("approvalStatuses", state.filters.approvalStatus);
          }
          const payload = await requestJson(
            "/console/workbench" + (workbenchQuery.toString() ? "?" + workbenchQuery.toString() : "")
          );

          state.terminology = payload.terminology;
          state.workspace = payload.workspace || null;
          state.boundaries =
            payload.roomDetail?.boundaries ||
            payload.accountDetail?.boundaries ||
            {
              readOnly: true,
              mailboxClient: true,
              workbenchMailboxTab: true,
              automaticGatewayRoundTrip: false
            };
          state.accounts = payload.accounts || [];
          state.rooms = payload.rooms || [];
          state.approvals = payload.approvals || [];
          state.accountDetail = payload.accountDetail || null;
          state.roomDetail = payload.roomDetail || null;
          state.mailboxConsole = payload.mailboxConsole || null;
          state.mailboxFeed = payload.mailboxFeed || [];
          state.roomMailboxView = payload.roomMailboxView || [];
          state.selectedAccountId = payload.selection && payload.selection.accountId
            ? payload.selection.accountId
            : null;
          state.selectedRoomKey = payload.selection && payload.selection.roomKey
            ? payload.selection.roomKey
            : null;
          state.selectedMailboxId = payload.selection && payload.selection.mailboxId
            ? payload.selection.mailboxId
            : null;
          if (!state.routeMode && payload.workspace && payload.workspace.activeTab) {
            state.routeMode = payload.workspace.activeTab;
          }
          if (payload.workspace && payload.workspace.connect && !state.connect.plan) {
            state.connect.plan = payload.workspace.connect.defaultPlan || null;
          }
        } catch (error) {
          state.error = error instanceof Error ? error.message : String(error);
        } finally {
          state.loading = false;
          syncRoute();
          render();
        }
      }

      function renderStat(label, value) {
        return (
          '<div class="stat">' +
          '<div class="stat-label">' + escapeHtml(label) + "</div>" +
          '<div class="stat-value">' + escapeHtml(String(value)) + "</div>" +
          "</div>"
        );
      }

      function renderWorkspaceTabs() {
        const workspace = state.workspace;
        if (!workspace || !workspace.tabs || workspace.tabs.length === 0) {
          return "";
        }

        return (
          '<div class="tab-strip">' +
          workspace.tabs.map(function(tab) {
            return (
              '<button class="tab-button ' + (tab.active ? "active" : "") + '" data-action="select-tab" data-tab-id="' + escapeHtml(tab.id) + '">' +
              escapeHtml(tab.label) +
              (typeof tab.count === "number" ? " (" + escapeHtml(String(tab.count)) + ")" : "") +
              "</button>"
            );
          }).join("") +
          "</div>"
        );
      }

      function renderConnectPlan(plan) {
        if (!plan) {
          return '<div class="empty">Enter a mailbox address to get the easiest MailClaw connection path.</div>';
        }

        return (
          '<div class="stack">' +
          '<div class="detail-grid">' +
          renderMetric("Recommended provider", plan.recommendation.provider.displayName) +
          renderMetric("Confidence", plan.recommendation.confidence) +
          renderMetric("Suggested account ID", plan.input.accountIdSuggestion) +
          renderMetric("Browser console", plan.console.browserPath) +
          '</div>' +
          '<div class="panel">' +
          '<div class="panel-header"><h3>Recommended Path</h3><span class="muted code">' + escapeHtml(plan.recommendation.provider.id) + "</span></div>" +
          '<div class="panel-body">' +
          '<div class="chips">' +
          badge(plan.recommendation.provider.setupKind, plan.recommendation.provider.setupKind) +
          badge(plan.recommendation.matchReason, plan.recommendation.matchReason) +
          '</div>' +
          '<div class="timeline-list" style="margin-top:12px;">' +
          [
            "Start with " + plan.commands.login,
            "Inspect provider details with " + plan.commands.inspectProvider,
            "After login use " + plan.commands.observeAccounts,
            "Inspect rooms/internal mail with " + plan.commands.observeWorkbench
          ].map(function(step) {
            return '<div class="timeline-entry"><div class="title">' + escapeHtml(step) + "</div></div>";
          }).join("") +
          "</div>" +
          "</div></div>" +
          '<div class="panel">' +
          '<div class="panel-header"><h3>First-Mail Checklist</h3><span class="muted">' + escapeHtml(String((plan.checklist || []).length)) + " steps</span></div>" +
          '<div class="panel-body">' +
          ((plan.checklist || []).length > 0
            ? '<div class="timeline-list">' + plan.checklist.map(function(step) {
                return '<div class="timeline-entry"><div class="title">' + escapeHtml(step) + "</div></div>";
              }).join("") + "</div>"
            : '<div class="empty">No checklist steps are available.</div>') +
          "</div></div>" +
          (plan.migration && plan.migration.openClawUsers
            ? '<div class="panel"><div class="panel-header"><h3>OpenClaw Migration</h3><span class="muted">bridge first</span></div><div class="panel-body">' +
              '<div class="timeline-list">' +
              [
                plan.migration.openClawUsers.startCommand,
                plan.migration.openClawUsers.inspectRuntime,
                plan.migration.openClawUsers.inspectWorkbench
              ].map(function(step) {
                return '<div class="timeline-entry"><div class="title code">' + escapeHtml(step) + "</div></div>";
              }).join("") +
              ((plan.migration.openClawUsers.notes || []).map(function(note) {
                return '<div class="timeline-entry"><div class="detail">' + escapeHtml(note) + "</div></div>";
              }).join("")) +
              "</div></div></div>"
            : "") +
          "</div>"
        );
      }

      function renderConnectWorkspace() {
        const connect = state.workspace && state.workspace.connect;
        const providerOptions = (connect && connect.providerOptions) || [];
        return (
          '<div class="stack">' +
          '<div class="panel">' +
          '<div class="panel-header"><h3>Connect Mailbox</h3><span class="muted">mailbox-first onboarding</span></div>' +
          '<div class="panel-body">' +
          '<div class="muted">Start from a mailbox address. MailClaw will recommend the lowest-friction provider path, tell you how to log in, and show where to inspect the first room and internal agent mail.</div>' +
          '<div class="toolbar-row" style="margin-top:16px;">' +
          '<div class="group" style="min-width:240px;"><label for="connect-email">Mailbox address</label><input id="connect-email" data-action="connect-email" type="email" placeholder="you@example.com" value="' + escapeHtml(state.connect.emailAddress || "") + '"></div>' +
          '<div class="group" style="min-width:220px;"><label for="connect-provider">Provider hint</label><select id="connect-provider" data-action="connect-provider"><option value="">Auto detect</option>' +
          providerOptions.map(function(provider) {
            return '<option value="' + escapeHtml(provider.id) + '"' + (state.connect.provider === provider.id ? " selected" : "") + '>' + escapeHtml(provider.displayName) + "</option>";
          }).join("") +
          '</select></div>' +
          '<div class="group"><label>&nbsp;</label><button class="primary-button" data-action="recommend-connect">Recommend path</button></div>' +
          '</div>' +
          '<div class="chips" style="margin-top:12px;">' +
          badge("console " + ((connect && connect.browserPath) || "/console/connect"), "connect") +
          badge("API " + ((connect && connect.onboardingApiPath) || "/api/connect/onboarding"), "api") +
          '</div>' +
          '</div></div>' +
          renderConnectPlan(state.connect.plan || (connect && connect.defaultPlan) || null) +
          '</div>'
        );
      }

      function renderAccountCard(account) {
        return (
          '<button class="card-button ' + (account.accountId === state.selectedAccountId ? "active" : "") + '" ' +
          'data-action="select-account" data-account-id="' + escapeHtml(account.accountId) + '">' +
          '<div class="card-top">' +
          '<div>' +
          '<div class="card-title">' + escapeHtml(account.displayName || account.emailAddress) + "</div>" +
          '<div class="card-subtitle code">' + escapeHtml(account.accountId) + "</div>" +
          "</div>" +
          badge(account.health.replaceAll("_", " "), account.health) +
          "</div>" +
          '<div class="card-bottom">' +
          '<div class="chips">' +
          badge(account.provider, account.providerState?.ingress?.mode || account.provider) +
          badge(String(account.roomCount) + " rooms", "rooms") +
          badge(String(account.pendingApprovalCount) + " approvals", account.pendingApprovalCount > 0 ? "requested" : "done") +
          "</div>" +
          '<div class="muted">Latest activity ' + escapeHtml(formatTime(account.latestActivityAt)) + "</div>" +
          "</div>" +
          "</button>"
        );
      }

      function renderRoomCard(room) {
        const routingChips = [
          room.frontAgentAddress ? badge("front " + room.frontAgentAddress, "front") : "",
          (room.collaboratorAgentAddresses || []).slice(0, 2).map(function(address) {
            return badge("collab " + address, "collaborator");
          }).join(""),
          (room.summonedRoles || []).slice(0, 2).map(function(role) {
            return badge("role " + role, role);
          }).join("")
        ].join("");
        return (
          '<button class="card-button ' + (room.roomKey === state.selectedRoomKey ? "active" : "") + '" ' +
          'data-action="select-room" data-room-key="' + escapeHtml(room.roomKey) + '" data-account-id="' + escapeHtml(room.accountId) + '">' +
          '<div class="card-top">' +
          '<div>' +
          '<div class="card-title">' + escapeHtml(room.latestSubject || room.roomKey) + "</div>" +
          '<div class="card-subtitle code">' + escapeHtml(room.roomKey) + "</div>" +
          "</div>" +
          badge(room.state, room.state) +
          "</div>" +
          '<div class="chips">' +
          badge("attention " + room.attention, room.attention) +
          badge("rev " + room.revision, "revision") +
          badge(String(room.pendingApprovalCount) + " approvals", room.pendingApprovalCount > 0 ? "requested" : "done") +
          badge(String(room.openDeliveryCount) + " deliveries", room.openDeliveryCount > 0 ? "queued" : "done") +
          (room.mailTaskKind ? badge("task " + room.mailTaskKind, room.mailTaskKind) : "") +
          (room.mailTaskStage ? badge("stage " + room.mailTaskStage, room.mailTaskStage) : "") +
          (room.originKinds.includes("gateway_chat") ? badge("gateway in", "gateway") : "") +
          (room.gatewayOutcomeCount > 0 ? badge("gateway out " + room.gatewayOutcomeCount, "gateway") : "") +
          (room.pendingGatewayDispatchCount > 0 ? badge("gateway pending " + room.pendingGatewayDispatchCount, "queued") : "") +
          (room.failedGatewayDispatchCount > 0 ? badge("gateway failed " + room.failedGatewayDispatchCount, "failed") : "") +
          "</div>" +
          (routingChips ? '<div class="chips">' + routingChips + "</div>" : "") +
          (room.nextAction ? '<div class="muted">Next action: ' + escapeHtml(room.nextAction) + "</div>" : "") +
          '<div class="muted">Origins: ' + escapeHtml((room.originKinds || []).join(", ") || "none") + "</div>" +
          '<div class="muted">Updated ' + escapeHtml(formatTime(room.latestActivityAt)) + "</div>" +
          "</button>"
        );
      }

      function renderApprovalCard(approval) {
        return (
          '<button class="card-button" data-action="select-room" data-room-key="' + escapeHtml(approval.roomKey) + '" data-account-id="' + escapeHtml(approval.accountId) + '">' +
          '<div class="card-top">' +
          '<div>' +
          '<div class="card-title">' + escapeHtml(approval.subject) + "</div>" +
          '<div class="card-subtitle code">' + escapeHtml(approval.requestId) + "</div>" +
          "</div>" +
          badge(approval.status, approval.status) +
          "</div>" +
          '<div class="chips">' +
          (approval.outboxStatus ? badge(approval.outboxStatus, approval.outboxStatus) : "") +
          badge(String(approval.recipients.to.length) + " to", "to") +
          "</div>" +
          '<div class="muted">Updated ' + escapeHtml(formatTime(approval.updatedAt)) + "</div>" +
          "</button>"
        );
      }

      function renderMetric(label, value) {
        return (
          '<div class="metric">' +
          '<div class="label">' + escapeHtml(label) + "</div>" +
          '<div class="value">' + escapeHtml(String(value)) + "</div>" +
          "</div>"
        );
      }

      function renderTimelineEntry(entry) {
        return (
          '<div class="timeline-entry">' +
          '<div class="meta">' +
          '<span>' + escapeHtml(entry.category) + " / " + escapeHtml(entry.type) + "</span>" +
          '<span>' + escapeHtml(formatTime(entry.at)) + "</span>" +
          "</div>" +
          '<div class="title">' + escapeHtml(entry.title) + "</div>" +
          (entry.detail ? '<div class="detail">' + escapeHtml(entry.detail) + "</div>" : "") +
          '<div class="chips">' +
          (entry.revision ? badge("rev " + entry.revision, "revision") : "") +
          (entry.status ? badge(entry.status, entry.status) : "") +
          "</div>" +
          "</div>"
        );
      }

      function renderMailboxChip(mailboxId, roomKey) {
        const active = mailboxId === state.selectedMailboxId;
        const roomAttrs = roomKey ? ' data-room-key="' + escapeHtml(roomKey) + '"' : "";
        return (
          '<button class="chip link ' + (active ? "active" : "") + '" data-action="select-mailbox" data-mailbox-id="' +
          escapeHtml(mailboxId) +
          '"' +
          roomAttrs +
          ">" +
          escapeHtml(mailboxId) +
          "</button>"
        );
      }

      function renderMailboxCard(mailbox) {
        return (
          '<button class="card-button ' + (mailbox.mailboxId === state.selectedMailboxId ? "active" : "") + '" ' +
          'data-action="select-mailbox" data-mailbox-id="' + escapeHtml(mailbox.mailboxId) + '">' +
          '<div class="card-top">' +
          '<div>' +
          '<div class="card-title code">' + escapeHtml(mailbox.mailboxId) + "</div>" +
          '<div class="card-subtitle">' + escapeHtml(mailbox.kind) + (mailbox.role ? " / " + escapeHtml(mailbox.role) : "") + "</div>" +
          "</div>" +
          badge(mailbox.active ? "active" : "inactive", mailbox.active ? "healthy" : "attention_required") +
          "</div>" +
          '<div class="chips">' +
          badge(String(mailbox.messageCount) + " msgs", "messages") +
          badge(String(mailbox.roomCount) + " rooms", "rooms") +
          "</div>" +
          '<div class="muted">Latest ' + escapeHtml(formatTime(mailbox.latestMessageAt)) + "</div>" +
          "</button>"
        );
      }

      function renderInboxCard(projection) {
        const inbox = projection.inbox;
        const items = projection.items || [];
        return (
          '<button class="card-button ' + (inbox.inboxId === state.selectedInboxId ? "active" : "") + '" ' +
          'data-action="select-inbox" data-account-id="' + escapeHtml(inbox.accountId) + '" data-inbox-id="' + escapeHtml(inbox.inboxId) + '">' +
          '<div class="card-top">' +
          '<div>' +
          '<div class="card-title code">' + escapeHtml(inbox.inboxId) + "</div>" +
          '<div class="card-subtitle">' + escapeHtml(inbox.agentId) + " / public inbox</div>" +
          "</div>" +
          badge(String(items.length) + " rooms", items.length > 0 ? "requested" : "done") +
          "</div>" +
          '<div class="chips">' +
          badge("ACK " + inbox.ackSlaSeconds + "s", "ack") +
          badge("limit " + inbox.activeRoomLimit, "limit") +
          badge("burst " + inbox.burstCoalesceSeconds + "s", "burst") +
          "</div>" +
          '<div class="muted">' + escapeHtml(items.slice(0, 2).map(function(item) { return item.roomKey; }).join(", ") || "No projected rooms yet") + "</div>" +
          "</button>"
        );
      }

      function sumStatusCounts(counts) {
        return Object.values(counts || {}).reduce(function(total, value) {
          return total + Number(value || 0);
        }, 0);
      }

      function renderFeedEntry(entry) {
        return (
          '<button class="feed-entry card-button" data-action="select-room" data-room-key="' +
          escapeHtml(entry.delivery.roomKey) +
          '" data-account-id="' +
          escapeHtml(entry.message.accountId || state.selectedAccountId || "") +
          '">' +
          '<div class="meta">' +
          '<span>' + escapeHtml(entry.message.kind) + " / " + escapeHtml(entry.message.originKind) + "</span>" +
          '<span>' + escapeHtml(formatTime(entry.message.createdAt)) + "</span>" +
          "</div>" +
          '<div class="title">' + escapeHtml(entry.message.subject) + "</div>" +
          '<div class="detail code">' + escapeHtml(entry.message.fromMailboxId + " -> " + entry.message.toMailboxIds.join(", ")) + "</div>" +
          '<div class="chips">' +
          badge(entry.delivery.status, entry.delivery.status) +
          badge("room", entry.delivery.roomKey) +
          "</div>" +
          "</button>"
        );
      }

      function renderProviderSummary() {
        if (!state.mailboxConsole || !state.mailboxConsole.providerState) {
          return '<div class="empty">Select an account to inspect provider state, mailboxes, and inbox policies.</div>';
        }

        const summary = state.mailboxConsole.providerState.summary;
        const inboxes = state.mailboxConsole.publicAgentInboxes || [];
        return (
          '<div class="stack">' +
          '<div class="detail-grid">' +
          renderMetric("Ingress", summary.ingress.mode || "unknown") +
          renderMetric("Outbound", summary.outbound.mode || "unknown") +
          renderMetric("Watch", summary.watch.state || "idle") +
          renderMetric("Last event", summary.lastEventType || "none") +
          "</div>" +
          '<div class="two-col">' +
          '<div class="metric">' +
          '<div class="label">Connected inboxes</div>' +
          '<div class="value">' + escapeHtml(String(inboxes.length)) + "</div>" +
          '<div class="muted">Public agent inbox projections for this account.</div>' +
          "</div>" +
          '<div class="metric">' +
          '<div class="label">Mailboxes</div>' +
          '<div class="value">' + escapeHtml(String((state.mailboxConsole.virtualMailboxes || []).length)) + "</div>" +
          '<div class="muted">Internal/public mailboxes visible to the operator console.</div>' +
          "</div>" +
          "</div>" +
          (inboxes.length > 0
            ? '<div class="list">' +
              inboxes.map(function(entry) {
                const items = entry.items || [];
                return (
                  '<div class="timeline-entry card-button" data-action="select-inbox" data-account-id="' + escapeHtml(entry.inbox.accountId) + '" data-inbox-id="' + escapeHtml(entry.inbox.inboxId) + '">' +
                  '<div class="meta"><span>' + escapeHtml(entry.inbox.agentId) + '</span><span>ACK SLA ' + escapeHtml(String(entry.inbox.ackSlaSeconds)) + "s</span></div>" +
                  '<div class="title code">' + escapeHtml(entry.inbox.inboxId) + "</div>" +
                  '<div class="detail">Active room limit ' + escapeHtml(String(entry.inbox.activeRoomLimit)) + ", burst coalesce " + escapeHtml(String(entry.inbox.burstCoalesceSeconds)) + "s.</div>" +
                  '<div class="chips">' +
                  items.slice(0, 4).map(function(item) {
                    return '<button class="chip link" data-action="select-room" data-room-key="' + escapeHtml(item.roomKey) + '" data-account-id="' + escapeHtml(item.accountId) + '">' + escapeHtml(item.roomKey) + "</button>";
                  }).join("") +
                  "</div>" +
                  "</div>"
                );
              }).join("") +
              "</div>"
            : '<div class="empty">No public inbox projections exist for the selected account yet.</div>') +
          "</div>"
        );
      }

      function renderInboxDetail() {
        if (!state.selectedInboxId || !state.mailboxConsole) {
          return '<div class="empty">Select a public inbox to inspect room-level work intake, ACK pressure, and delegation backlog.</div>';
        }

        const projection = (state.mailboxConsole.publicAgentInboxes || []).find(function(entry) {
          return entry.inbox.inboxId === state.selectedInboxId;
        });
        if (!projection) {
          return '<div class="empty">The selected inbox is not visible in the current account scope.</div>';
        }

        const inbox = projection.inbox;
        const items = projection.items || [];
        return (
          '<div class="stack">' +
          '<div class="detail-grid">' +
          renderMetric("Projected rooms", items.length) +
          renderMetric("ACK SLA", inbox.ackSlaSeconds + "s") +
          renderMetric("Active room limit", inbox.activeRoomLimit) +
          renderMetric("Burst coalesce", inbox.burstCoalesceSeconds + "s") +
          "</div>" +
          '<div class="panel">' +
          '<div class="panel-header"><h3>Inbox Summary</h3><span class="muted code">' + escapeHtml(inbox.inboxId) + "</span></div>" +
          '<div class="panel-body">' +
          '<div class="chips">' +
          badge(inbox.agentId, inbox.agentId) +
          badge("account " + inbox.accountId, inbox.accountId) +
          badge(String(items.filter(function(item) { return item.state === "new" || item.state === "active"; }).length) + " active", "active") +
          "</div>" +
          '<div class="muted">Public-agent inbox projection for room-granularity intake. Items below stay scoped to rooms, not raw messages.</div>' +
          '</div></div>' +
          '<div class="panel">' +
          '<div class="panel-header"><h3>Inbox Items</h3><span class="muted">' + escapeHtml(String(items.length)) + " rooms</span></div>" +
          '<div class="panel-body">' +
          (items.length > 0
            ? '<div class="mailbox-feed">' + items.map(function(item) {
                return (
                  '<button class="feed-entry card-button" data-action="select-room" data-room-key="' + escapeHtml(item.roomKey) + '" data-account-id="' + escapeHtml(item.accountId) + '">' +
                  '<div class="meta"><span>' + escapeHtml(item.state) + " / " + escapeHtml(item.participantRole) + '</span><span>' + escapeHtml(formatTime(item.newestMessageAt)) + "</span></div>" +
                  '<div class="title code">' + escapeHtml(item.roomKey) + "</div>" +
                  '<div class="detail">Unread ' + escapeHtml(String(item.unreadCount)) + ", urgency " + escapeHtml(item.urgency) + ", effort " + escapeHtml(item.estimatedEffort) + ".</div>" +
                  '<div class="chips">' +
                  badge("priority " + item.priority, item.priority > 50 ? "requested" : "done") +
                  (item.needsAckBy ? badge("ack by " + formatTime(item.needsAckBy), "ack") : "") +
                  (item.blockedReason ? badge(item.blockedReason, item.blockedReason) : "") +
                  "</div>" +
                  "</button>"
                );
              }).join("") + "</div>"
            : '<div class="empty">No room projections are currently visible in this inbox.</div>') +
          "</div></div>" +
          "</div>"
        );
      }

      function renderMailboxWorkspaceHome() {
        if (!state.selectedAccountId || !state.mailboxConsole) {
          return '<div class="empty">Select an account to open the mailbox workbench.</div>';
        }

        const workspace = state.workspace && state.workspace.mailboxWorkspace ? state.workspace.mailboxWorkspace : null;
        const mailboxes = state.mailboxConsole.virtualMailboxes || [];
        const inboxes = state.mailboxConsole.publicAgentInboxes || [];
        const activeMailboxes = mailboxes.filter(function(entry) {
          return entry.active;
        }).length;
        const loadedRooms = Array.from(new Set((state.rooms || []).map(function(room) {
          return room.roomKey;
        })));
        const recentMailboxes = mailboxes
          .slice()
          .sort(function(left, right) {
            return String(right.latestMessageAt || "").localeCompare(String(left.latestMessageAt || ""));
          })
          .slice(0, 6);

        return (
          '<div class="stack">' +
          '<div class="detail-grid">' +
          renderMetric("Mailboxes", workspace ? workspace.mailboxCount : mailboxes.length) +
          renderMetric("Public inboxes", workspace ? workspace.inboxCount : inboxes.length) +
          renderMetric("Active mailboxes", activeMailboxes) +
          renderMetric("Loaded rooms", loadedRooms.length) +
          "</div>" +
          '<div class="panel">' +
          '<div class="panel-header"><h3>Mailbox Workspace</h3><span class="muted code">' + escapeHtml(state.selectedAccountId) + "</span></div>" +
          '<div class="panel-body">' +
          '<div class="chips">' +
          badge("read-only client", "healthy") +
          badge("mailbox tab", "healthy") +
          (workspace && workspace.browserPaths && workspace.browserPaths.account
            ? '<span class="chip code">' + escapeHtml(workspace.browserPaths.account) + "</span>"
            : "") +
          "</div>" +
          '<div class="muted">Mailbox mode is the front-office view for this account: open public inboxes, inspect internal/public mailboxes, and jump from mailbox feeds back into room truth without leaving the workbench.</div>' +
          "</div>" +
          "</div>" +
          '<div class="panel">' +
          '<div class="panel-header"><h3>Public Inboxes</h3><span class="muted">' + escapeHtml(String(inboxes.length)) + " projected</span></div>" +
          '<div class="panel-body">' +
          (inboxes.length > 0
            ? '<div class="list">' + inboxes.map(renderInboxCard).join("") + "</div>"
            : '<div class="empty">No public inbox projection exists for this account yet.</div>') +
          "</div>" +
          "</div>" +
          '<div class="panel">' +
          '<div class="panel-header"><h3>Recent Mailboxes</h3><span class="muted">' + escapeHtml(String(recentMailboxes.length)) + " shown</span></div>" +
          '<div class="panel-body">' +
          (recentMailboxes.length > 0
            ? '<div class="list">' + recentMailboxes.map(renderMailboxCard).join("") + "</div>"
            : '<div class="empty">No virtual mailbox is attached to this account yet.</div>') +
          "</div>" +
          "</div>" +
          "</div>"
        );
      }

      function renderMailboxDetail() {
        if (!state.selectedMailboxId || !state.mailboxConsole) {
          return '<div class="empty">Select a mailbox to inspect mailbox-first feeds, routing, and delivery state.</div>';
        }

        const mailbox = (state.mailboxConsole.virtualMailboxes || []).find(function(entry) {
          return entry.mailboxId === state.selectedMailboxId;
        });
        if (!mailbox) {
          return '<div class="empty">The selected mailbox is not visible in the current account scope.</div>';
        }

        const linkedInboxes = (state.mailboxConsole.publicAgentInboxes || []).filter(function(entry) {
          return "public:" + entry.inbox.agentId === mailbox.mailboxId;
        });
        const statusCounts = mailbox.deliveryStatusCounts || {};
        const statusChips = Object.entries(statusCounts).map(function(entry) {
          return badge(String(entry[1]) + " " + entry[0], entry[0]);
        }).join("");
        const roomPinned = state.selectedRoomKey && state.roomDetail && state.roomDetail.room
          ? state.roomDetail.room
          : null;

        return (
          '<div class="stack">' +
          '<div class="detail-grid">' +
          renderMetric("Messages", mailbox.messageCount) +
          renderMetric("Rooms", mailbox.roomCount) +
          renderMetric("Delivery states", sumStatusCounts(statusCounts)) +
          renderMetric("Inbox bindings", linkedInboxes.length) +
          (roomPinned ? renderMetric("Pinned room", roomPinned.roomKey) : "") +
          "</div>" +
          '<div class="panel">' +
          '<div class="panel-header"><h3>Mailbox Summary</h3><span class="muted code">' + escapeHtml(mailbox.mailboxId) + "</span></div>" +
          '<div class="panel-body">' +
          '<div class="chips">' +
          badge(mailbox.kind, mailbox.kind) +
          (mailbox.role ? badge(mailbox.role, mailbox.role) : "") +
          badge(mailbox.active ? "active" : "inactive", mailbox.active ? "healthy" : "attention_required") +
          (mailbox.originKinds || []).map(function(originKind) { return badge(originKind, originKind); }).join("") +
          statusChips +
          "</div>" +
          '<div class="muted">Latest message ' + escapeHtml(formatTime(mailbox.latestMessageAt)) + "</div>" +
          '<div class="muted">Latest room ' + escapeHtml(mailbox.latestRoomKey || "n/a") + "</div>" +
          (linkedInboxes.length > 0
            ? '<div class="timeline-list">' +
              linkedInboxes.map(function(entry) {
                return (
                  '<div class="timeline-entry">' +
                  '<div class="meta"><span>' + escapeHtml(entry.inbox.agentId) + '</span><span>ACK SLA ' + escapeHtml(String(entry.inbox.ackSlaSeconds)) + "s</span></div>" +
                  '<div class="title code">' + escapeHtml(entry.inbox.inboxId) + "</div>" +
                  '<div class="detail">Active room limit ' + escapeHtml(String(entry.inbox.activeRoomLimit)) + ", burst coalesce " + escapeHtml(String(entry.inbox.burstCoalesceSeconds)) + "s.</div>" +
                  "</div>"
                );
              }).join("") +
              "</div>"
            : '<div class="muted">No public inbox binding is attached to this mailbox.</div>') +
          (roomPinned
            ? '<div class="section-label">Pinned room context</div>' +
              '<div class="chips">' +
              badge("room " + roomPinned.roomKey, roomPinned.state) +
              badge("revision " + roomPinned.revision, "revision") +
              badge(String(roomPinned.pendingApprovalCount) + " approvals", roomPinned.pendingApprovalCount > 0 ? "requested" : "done") +
              '</div>' +
              '<div class="muted">This mailbox stays pinned to the selected room so you can inspect mailbox-local thread entries without leaving mailbox mode.</div>'
            : '<div class="muted">Select a mailbox chip from a room to pin that room inside mailbox mode.</div>') +
          "</div>" +
          "</div>" +
          (roomPinned
            ? '<div class="panel">' +
              '<div class="panel-header"><h3>Room Thread In Mailbox</h3><span class="muted code">' + escapeHtml(roomPinned.roomKey) + "</span></div>" +
              '<div class="panel-body">' +
              (state.roomMailboxView.length > 0
                ? '<div class="mailbox-feed">' + state.roomMailboxView.map(function(entry) {
                    return (
                      '<button class="feed-entry card-button" data-action="select-room" data-room-key="' +
                      escapeHtml(entry.delivery.roomKey) +
                      '" data-account-id="' +
                      escapeHtml(mailbox.accountId) +
                      '">' +
                      '<div class="meta">' +
                      '<span>' + escapeHtml(entry.message.kind) + " / " + escapeHtml(entry.thread.kind) + '</span>' +
                      '<span>' + escapeHtml(formatTime(entry.message.createdAt)) + "</span>" +
                      "</div>" +
                      '<div class="title">' + escapeHtml(entry.message.subject) + "</div>" +
                      '<div class="detail code">' + escapeHtml(entry.message.fromMailboxId + " -> " + entry.message.toMailboxIds.join(", ")) + "</div>" +
                      '<div class="chips">' +
                      badge(entry.delivery.status, entry.delivery.status) +
                      badge(entry.thread.status, entry.thread.status) +
                      (entry.message.parentMessageId ? badge("reply", "reply") : badge("root", "root")) +
                      "</div>" +
                      "</button>"
                    );
                  }).join("") + "</div>"
                : '<div class="empty">No projected entries for this room are visible in the selected mailbox.</div>') +
              "</div>" +
              "</div>"
            : "") +
          '<div class="panel">' +
          '<div class="panel-header"><h3>Mailbox Feed</h3><span class="muted">' + escapeHtml(String(state.mailboxFeed.length)) + " items loaded</span></div>" +
          '<div class="panel-body">' +
          (state.mailboxFeed.length > 0
            ? '<div class="mailbox-feed">' + state.mailboxFeed.map(renderFeedEntry).join("") + "</div>"
            : '<div class="empty">No messages are currently projected into the selected mailbox.</div>') +
          "</div>" +
          "</div>" +
          "</div>"
        );
      }

      function renderRoomDetail() {
        if (!state.roomDetail || !state.roomDetail.room) {
          return '<div class="empty">Select a room to inspect its timeline, approvals, gateway trace, and mailbox participation.</div>';
        }

        const room = state.roomDetail.room;
        const trace = state.roomDetail.gatewayTrace;
        const gatewayOutcomeChips = (trace.outcomeModes || []).map(function(mode) {
          return badge(mode, mode);
        }).join("");
        const gatewayOutcomeEntries = (state.roomDetail.gatewayTrace.outcomeProjections || []).map(function(entry) {
          return (
            '<div class="timeline-entry">' +
            '<div class="meta"><span>' + escapeHtml(entry.mode) + '</span><span>' + escapeHtml(formatTime(entry.projectedAt)) + "</span></div>" +
            '<div class="title code">' + escapeHtml(entry.messageId) + "</div>" +
            '<div class="chips">' + badge(entry.dispatchStatus, entry.dispatchStatus) + "</div>" +
            '<div class="detail">session ' + escapeHtml(entry.sessionKey) + "</div>" +
            (entry.dispatchTarget ? '<div class="detail">target ' + escapeHtml(entry.dispatchTarget) + "</div>" : "") +
            (entry.dispatchError ? '<div class="detail">error ' + escapeHtml(entry.dispatchError) + "</div>" : "") +
            "</div>"
          );
        }).join("");
        const routingChips =
          (room.publicAgentAddresses || []).map(function(address) {
            return badge("public " + address, "public");
          }).join("") +
          (room.collaboratorAgentAddresses || []).map(function(address) {
            return badge("collab " + address, "collaborator");
          }).join("") +
          (room.summonedRoles || []).map(function(role) {
            return badge("role " + role, role);
          }).join("");
        const taskEntries = (state.roomDetail.tasks || []).map(function(task) {
          return (
            '<div class="timeline-entry">' +
            '<div class="meta"><span>r' + escapeHtml(String(task.revision)) + "</span><span>" + escapeHtml(task.status) + "</span></div>" +
            '<div class="title">' + escapeHtml(task.title || task.kind) + "</div>" +
            '<div class="chips">' + badge(task.kind, task.kind) + badge(task.stage, task.stage) + "</div>" +
            (task.summary ? '<div class="detail">' + escapeHtml(task.summary) + "</div>" : "") +
            (task.nextAction ? '<div class="detail">Next: ' + escapeHtml(task.nextAction) + "</div>" : "") +
            "</div>"
          );
        }).join("");
        return (
          '<div class="stack">' +
          '<div class="detail-grid">' +
          renderMetric("Room revision", room.revision) +
          renderMetric("Mail tasks", state.roomDetail.counts.taskNodes) +
          renderMetric("Active threads", room.activeThreadCount) +
          renderMetric("Virtual messages", state.roomDetail.counts.virtualMessages) +
          renderMetric("Mailbox deliveries", state.roomDetail.counts.mailboxDeliveries) +
          "</div>" +
          '<div class="chips">' +
          badge("provider events " + state.roomDetail.counts.timelineByCategory.provider, "provider") +
          badge("ledger events " + state.roomDetail.counts.timelineByCategory.ledger, "ledger") +
          badge("virtual mail " + state.roomDetail.counts.timelineByCategory.virtualMail, "virtual_mail") +
          badge("approval events " + state.roomDetail.counts.timelineByCategory.approval, "approval") +
          badge("delivery events " + state.roomDetail.counts.timelineByCategory.delivery, "delivery") +
          "</div>" +
          '<div class="panel">' +
          '<div class="panel-header"><h3>Room Summary</h3><span class="muted code">' + escapeHtml(room.roomKey) + "</span></div>" +
          '<div class="panel-body">' +
          '<div class="chips">' +
          badge(room.state, room.state) +
          badge("account " + room.accountId, room.accountId) +
          (room.mailTaskKind ? badge("task " + room.mailTaskKind, room.mailTaskKind) : "") +
          (room.mailTaskStage ? badge("stage " + room.mailTaskStage, room.mailTaskStage) : "") +
          badge(String(room.pendingApprovalCount) + " approvals", room.pendingApprovalCount > 0 ? "requested" : "approved") +
          badge(String(room.deliveryCount) + " deliveries", room.openDeliveryCount > 0 ? "queued" : "done") +
          "</div>" +
          '<div class="muted">Front agent ' + escapeHtml(room.frontAgentAddress || "n/a") + "</div>" +
          (routingChips ? '<div class="section-label">Routing</div><div class="chips">' + routingChips + "</div>" : "") +
          '<div class="muted">Latest activity ' + escapeHtml(formatTime(room.latestActivityAt)) + "</div>" +
          '<div class="section-label">Mailboxes</div>' +
          '<div class="chips">' + (state.roomDetail.mailboxes || []).map(function(mailbox) {
            return renderMailboxChip(mailbox.mailboxId, room.roomKey);
          }).join("") + "</div>" +
          "</div>" +
          "</div>" +
          '<div class="panel">' +
          '<div class="panel-header"><h3>Gateway Projection</h3><span class="muted">' + escapeHtml(String(trace.projectedMessageCount)) + " projected messages</span></div>" +
          '<div class="panel-body">' +
          '<div class="detail-grid">' +
          renderMetric("Control planes", (trace.controlPlanes || []).length) +
          renderMetric("Session keys", (trace.sessionKeys || []).length) +
          renderMetric("Projected deliveries", trace.projectedDeliveryCount) +
          renderMetric("Projected outcomes", trace.projectedOutcomeCount || 0) +
          renderMetric("Pending dispatch", trace.pendingDispatchCount || 0) +
          renderMetric("Failed dispatch", trace.failedDispatchCount || 0) +
          "</div>" +
          '<div class="chips">' +
          (trace.controlPlanes || []).map(function(value) { return badge(value, value); }).join("") +
          (trace.sessionKeys || []).slice(0, 6).map(function(value) { return '<span class="chip code">' + escapeHtml(value) + "</span>"; }).join("") +
          gatewayOutcomeChips +
          (trace.pendingDispatchCount > 0 ? badge("pending " + trace.pendingDispatchCount, "queued") : "") +
          (trace.failedDispatchCount > 0 ? badge("failed " + trace.failedDispatchCount, "failed") : "") +
          "</div>" +
          (trace.latestDispatchAttemptAt
            ? '<div class="muted" style="margin-top:12px;">Latest dispatch attempt ' + escapeHtml(formatTime(trace.latestDispatchAttemptAt)) + "</div>"
            : "") +
          ((trace.outcomeProjections || []).length > 0
            ? '<div class="timeline-list" style="margin-top:12px;">' + gatewayOutcomeEntries + "</div>"
            : '<div class="muted" style="margin-top:12px;">No Gateway outcome projection has been recorded for this room yet.</div>') +
          "</div>" +
          "</div>" +
          '<div class="panel">' +
          '<div class="panel-header"><h3>Mail Tasks</h3><span class="muted">' + escapeHtml(String((state.roomDetail.tasks || []).length)) + " tracked</span></div>" +
          '<div class="panel-body">' +
          ((state.roomDetail.tasks || []).length > 0
            ? '<div class="timeline-list">' + taskEntries + "</div>"
            : '<div class="empty">No mail task classification has been recorded for this room yet.</div>') +
          "</div>" +
          "</div>" +
          '<div class="panel">' +
          '<div class="panel-header"><h3>Timeline</h3><span class="muted">' + escapeHtml(String((state.roomDetail.timeline || []).length)) + " entries</span></div>" +
          '<div class="panel-body"><div class="timeline-list">' +
          (state.roomDetail.timeline || []).slice(0, 30).map(renderTimelineEntry).join("") +
          "</div></div>" +
          "</div>" +
          "</div>"
        );
      }

      function renderPrimaryDetail() {
        if (state.routeMode === "connect") {
          return renderConnectWorkspace();
        }
        if (state.selectedMailboxId) {
          return renderMailboxDetail();
        }
        if (state.selectedInboxId && !state.selectedRoomKey && !state.selectedMailboxId) {
          return renderInboxDetail();
        }
        if (state.routeMode === "mailboxes" && !state.selectedRoomKey) {
          return renderMailboxWorkspaceHome();
        }
        return renderRoomDetail();
      }

      function renderBoundarySummary() {
        const boundaries = state.boundaries || {
          readOnly: true,
          mailboxClient: true,
          workbenchMailboxTab: true,
          automaticGatewayRoundTrip: false
        };
        return (
          '<div class="chips">' +
          badge(boundaries.readOnly ? "read-only surface" : "mutating surface", boundaries.readOnly ? "watch" : "critical") +
          badge(boundaries.mailboxClient ? "mailbox client mode" : "not a mailbox client", boundaries.mailboxClient ? "healthy" : "watch") +
          badge(boundaries.workbenchMailboxTab ? "workbench tab shipped" : "workbench tab not shipped", boundaries.workbenchMailboxTab ? "healthy" : "watch") +
          badge(
            boundaries.automaticGatewayRoundTrip ? "gateway round-trip auto" : "gateway round-trip manual/partial",
            boundaries.automaticGatewayRoundTrip ? "healthy" : "watch"
          ) +
          "</div>"
        );
      }

      function layout() {
        const selectedAccountLabel = state.selectedAccountId
          ? escapeHtml(state.selectedAccountId)
          : "all accounts";
        const roomsSection =
          state.rooms.length > 0
            ? '<div class="list">' + state.rooms.map(renderRoomCard).join("") + "</div>"
            : '<div class="empty">No rooms match the current filters.</div>';
        const approvalsSection =
          state.approvals.length > 0
            ? '<div class="list">' + state.approvals.slice(0, 12).map(renderApprovalCard).join("") + "</div>"
            : '<div class="empty">No approval items match the current scope.</div>';
        const mailboxSection =
          state.mailboxConsole && (state.mailboxConsole.virtualMailboxes || []).length > 0
            ? '<div class="stack">' +
              ((state.mailboxConsole.publicAgentInboxes || []).length > 0
                ? '<div><div class="section-label">Public inboxes</div><div class="list">' + state.mailboxConsole.publicAgentInboxes.map(renderInboxCard).join("") + "</div></div>"
                : "") +
              '<div class="list">' + state.mailboxConsole.virtualMailboxes.map(renderMailboxCard).join("") + "</div>" +
              (state.selectedMailboxId
                ? '<div class="panel">' +
                  '<div class="panel-header"><h3>Mailbox Feed</h3><span class="muted code">' + escapeHtml(state.selectedMailboxId) + "</span></div>" +
                  '<div class="panel-body">' +
                  (state.mailboxFeed.length > 0
                    ? '<div class="mailbox-feed">' + state.mailboxFeed.map(renderFeedEntry).join("") + "</div>"
                    : '<div class="empty">No messages are currently projected into the selected mailbox.</div>') +
                  "</div></div>"
                : "") +
              "</div>"
            : '<div class="empty">Select an account with virtual mailboxes to inspect mailbox delivery state.</div>';

        return (
          '<section class="hero">' +
          '<div class="hero-top">' +
          '<div>' +
          '<span class="hero-kicker">MailClaw Operator Console</span>' +
          '<h1>Virtual mail, rooms, approvals, and gateway traces in one place.</h1>' +
          '<p>Kernel-first operator surface for MailClaw. External transport stays outside, room truth stays inside, and every approval, mailbox delivery, and gateway projection remains replayable.</p>' +
          renderWorkspaceTabs() +
          '<div class="section-label" style="margin-top:12px;">Boundary status</div>' +
          renderBoundarySummary() +
          "</div>" +
          '<div class="chips">' +
          badge("OpenClaw compatible", "healthy") +
          badge("room truth layer", "room") +
          badge("read-only console", "degraded") +
          "</div>" +
          "</div>" +
          '<div class="hero-stats">' +
          renderStat("Accounts", state.accounts.length) +
          renderStat("Rooms", state.rooms.length) +
          renderStat("Pending actions", countPendingRooms(state.rooms) + state.approvals.length) +
          renderStat("Selected scope", selectedAccountLabel) +
          "</div>" +
          "</section>" +
          '<section class="toolbar">' +
          '<div class="toolbar-row">' +
          '<div class="group"><label for="account-filter">Account</label><select id="account-filter" data-action="filter-account">' +
          '<option value="">All visible accounts</option>' +
          state.accounts.map(function(account) {
            return '<option value="' + escapeHtml(account.accountId) + '"' +
              (account.accountId === state.selectedAccountId ? " selected" : "") +
              ">" + escapeHtml(account.displayName || account.emailAddress) + "</option>";
          }).join("") +
          "</select></div>" +
          '<div class="group"><label for="status-filter">Status</label><select id="status-filter" data-action="filter-status">' +
          '<option value="">All statuses</option>' +
          roomStatusOptions.map(function(value) {
            return '<option value="' + escapeHtml(value) + '"' + (value === state.filters.status ? " selected" : "") + ">" + escapeHtml(value) + "</option>";
          }).join("") +
          "</select></div>" +
          '<div class="group"><label for="origin-filter">Origin</label><select id="origin-filter" data-action="filter-origin">' +
          '<option value="">All origins</option>' +
          originKindOptions.map(function(value) {
            return '<option value="' + escapeHtml(value) + '"' + (value === state.filters.originKind ? " selected" : "") + ">" + escapeHtml(value) + "</option>";
          }).join("") +
          "</select></div>" +
          '<div class="group"><label for="mailbox-filter">Mailbox filter</label><select id="mailbox-filter" data-action="filter-mailbox">' +
          '<option value="">All mailboxes</option>' +
          ((state.mailboxConsole && state.mailboxConsole.virtualMailboxes) || []).map(function(mailbox) {
            return '<option value="' + escapeHtml(mailbox.mailboxId) + '"' + (mailbox.mailboxId === state.filters.mailboxId ? " selected" : "") + ">" + escapeHtml(mailbox.mailboxId) + "</option>";
          }).join("") +
          "</select></div>" +
          '<div class="group"><label for="approval-status-filter">Approval status</label><select id="approval-status-filter" data-action="filter-approval-status">' +
          '<option value="">All approval states</option>' +
          approvalStatusOptions.map(function(value) {
            return '<option value="' + escapeHtml(value) + '"' + (value === state.filters.approvalStatus ? " selected" : "") + ">" + escapeHtml(value) + "</option>";
          }).join("") +
          "</select></div>" +
          '<div class="group"><label>&nbsp;</label><button class="ghost-button" data-action="clear-filters">Clear filters</button></div>' +
          "</div>" +
          '<div class="footer-note">Deep links are stable under <span class="code">/console/connect</span>, <span class="code">/console/accounts/:accountId</span>, <span class="code">/console/inboxes/:accountId/:inboxId</span>, <span class="code">/console/rooms/:roomKey</span>, and <span class="code">/console/mailboxes/:accountId/:mailboxId</span>.</div>' +
          "</section>" +
          (state.error ? '<div class="error-banner">' + escapeHtml(state.error) + "</div>" : "") +
          '<section class="dashboard ' + (state.loading ? "loading" : "") + '">' +
          '<div class="stack">' +
          '<section class="panel"><div class="panel-header"><h2>Accounts</h2><span class="muted">' + escapeHtml(String(state.accounts.length)) + ' visible</span></div><div class="panel-body">' +
          (state.accounts.length > 0 ? '<div class="list">' + state.accounts.map(renderAccountCard).join("") + "</div>" : '<div class="empty">No accounts have been configured yet.</div>') +
          '</div></section>' +
          '<section class="panel"><div class="panel-header"><h2>Approvals</h2><span class="muted">' + escapeHtml(String(state.approvals.length)) + ' items</span></div><div class="panel-body">' + approvalsSection + "</div></section>" +
          "</div>" +
          '<section class="panel"><div class="panel-header"><h2>Rooms</h2><span class="muted">' + escapeHtml(String(state.rooms.length)) + ' matching filters</span></div><div class="panel-body">' + roomsSection + "</div></section>" +
          '<div class="stack">' +
          '<section class="panel"><div class="panel-header"><h2>Detail</h2><span class="muted">' + escapeHtml(state.selectedRoomKey || state.selectedMailboxId || state.selectedAccountId || "no selection") + '</span></div><div class="panel-body">' +
          renderPrimaryDetail() +
          "</div></section>" +
          '<section class="panel"><div class="panel-header"><h2>Provider + Mailboxes</h2><span class="muted">' + escapeHtml(state.selectedAccountId || "select account") + '</span></div><div class="panel-body">' +
          renderProviderSummary() +
          '<div class="section-label" style="margin-top:16px;">Mailbox deliveries</div>' +
          mailboxSection +
          "</div></section>" +
          "</div>" +
          "</section>"
        );
      }

      function render() {
        app.innerHTML = layout();
      }

      async function refreshConnectPlan() {
        const query = new URLSearchParams();
        if (state.connect.emailAddress) {
          query.set("emailAddress", state.connect.emailAddress);
        }
        if (state.connect.provider) {
          query.set("provider", state.connect.provider);
        }
        state.connect.plan = await requestJson(
          "/connect/onboarding" + (query.toString() ? "?" + query.toString() : "")
        );
        render();
      }

      app.addEventListener("click", function(event) {
        const target = event.target.closest("[data-action]");
        if (!target) {
          return;
        }

        const action = target.getAttribute("data-action");
        if (action === "select-tab") {
          const tabId = target.getAttribute("data-tab-id");
          state.routeMode = tabId === "connect" ? "connect" : tabId;
          if (tabId === "connect" || tabId === "approvals") {
            state.selectedAccountId = null;
            state.selectedInboxId = null;
            state.selectedRoomKey = null;
            state.selectedMailboxId = null;
          } else if (tabId === "accounts") {
            state.selectedInboxId = null;
            state.selectedRoomKey = null;
            state.selectedMailboxId = null;
          } else if (tabId === "rooms") {
            state.selectedInboxId = null;
            state.selectedMailboxId = null;
          } else if (tabId === "mailboxes") {
            state.selectedInboxId = null;
            state.selectedRoomKey = null;
          }
          void refresh();
          return;
        }

        if (action === "recommend-connect") {
          state.routeMode = "connect";
          void refreshConnectPlan();
          return;
        }

        if (action === "select-account") {
          state.routeMode = "accounts";
          state.selectedAccountId = target.getAttribute("data-account-id");
          state.selectedInboxId = null;
          state.selectedRoomKey = null;
          state.selectedMailboxId = null;
          state.filters.mailboxId = "";
          void refresh();
          return;
        }

        if (action === "select-inbox") {
          state.routeMode = "mailboxes";
          state.selectedAccountId = target.getAttribute("data-account-id") || state.selectedAccountId;
          state.selectedInboxId = target.getAttribute("data-inbox-id");
          state.selectedRoomKey = null;
          state.selectedMailboxId = null;
          state.filters.mailboxId = "";
          void refresh();
          return;
        }

        if (action === "select-room") {
          state.routeMode = "rooms";
          state.selectedAccountId = target.getAttribute("data-account-id") || state.selectedAccountId;
          state.selectedInboxId = null;
          state.selectedRoomKey = target.getAttribute("data-room-key");
          state.selectedMailboxId = null;
          void refresh();
          return;
        }

        if (action === "select-mailbox") {
          state.routeMode = "mailboxes";
          state.selectedInboxId = null;
          state.selectedMailboxId = target.getAttribute("data-mailbox-id");
          state.filters.mailboxId = state.selectedMailboxId || "";
          state.selectedRoomKey = target.getAttribute("data-room-key") || state.selectedRoomKey || null;
          void refresh();
          return;
        }

        if (action === "clear-filters") {
          state.filters.status = "";
          state.filters.originKind = "";
          state.filters.mailboxId = "";
          state.filters.approvalStatus = "";
          state.selectedInboxId = null;
          state.selectedMailboxId = null;
          void refresh();
        }
      });

      app.addEventListener("change", function(event) {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
          const action = target.getAttribute("data-action");
          if (action === "connect-email") {
            state.connect.emailAddress = target.value.trim();
          }
          return;
        }

        if (!(target instanceof HTMLSelectElement)) {
          return;
        }

        const action = target.getAttribute("data-action");
        if (action === "connect-provider") {
          state.connect.provider = target.value;
          return;
        }
        if (action === "filter-account") {
          state.routeMode = "accounts";
          state.selectedAccountId = target.value || null;
          state.selectedInboxId = null;
          state.selectedRoomKey = null;
          state.selectedMailboxId = null;
          state.filters.mailboxId = "";
          void refresh();
          return;
        }

        if (action === "filter-status") {
          state.filters.status = target.value;
          void refresh();
          return;
        }

        if (action === "filter-origin") {
          state.filters.originKind = target.value;
          void refresh();
          return;
        }

        if (action === "filter-mailbox") {
          state.filters.mailboxId = target.value;
          state.selectedInboxId = null;
          state.selectedMailboxId = target.value || null;
          state.selectedRoomKey = null;
          void refresh();
          return;
        }

        if (action === "filter-approval-status") {
          state.filters.approvalStatus = target.value;
          void refresh();
        }
      });

      window.addEventListener("popstate", function() {
        parseRoute();
        void refresh();
      });

      parseRoute();
      render();
      void refresh();
    </script>
  </body>
</html>`;
}
