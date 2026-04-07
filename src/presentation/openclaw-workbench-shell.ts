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

const OPENCLAW_SHELL_CSS = String.raw`
:root {
  --bg: #0e1015;
  --bg-accent: #13151b;
  --bg-elevated: #191c24;
  --bg-hover: #1f2330;
  --bg-muted: #1f2330;
  --bg-content: #13151b;
  --card: #161920;
  --card-foreground: #f0f0f2;
  --card-highlight: rgba(255, 255, 255, 0.04);
  --popover: #191c24;
  --popover-foreground: #f0f0f2;
  --panel: #0e1015;
  --panel-strong: #191c24;
  --panel-hover: #1f2330;
  --chrome: rgba(14, 16, 21, 0.96);
  --chrome-strong: rgba(14, 16, 21, 0.98);
  --text: #d4d4d8;
  --text-strong: #f4f4f5;
  --muted: #838387;
  --muted-strong: #75757d;
  --border: #1e2028;
  --border-strong: #2e3040;
  --border-hover: #3e4050;
  --input: #1e2028;
  --ring: #ff5c5c;
  --accent: #ff5c5c;
  --accent-hover: #ff7070;
  --accent-subtle: rgba(255, 92, 92, 0.1);
  --accent-glow: rgba(255, 92, 92, 0.2);
  --primary-foreground: #ffffff;
  --secondary: #161920;
  --ok: #22c55e;
  --warn: #f59e0b;
  --danger: #ef4444;
  --danger-subtle: rgba(239, 68, 68, 0.08);
  --focus-ring: 0 0 0 2px var(--bg), 0 0 0 3px color-mix(in srgb, var(--ring) 80%, transparent);
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace;
  --font-body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.25);
  --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.4);
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
  --radius-full: 9999px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 100ms;
  --duration-normal: 180ms;
  color-scheme: dark;
}

:root[data-theme-mode="light"] {
  --bg: #f8f9fa;
  --bg-accent: #f1f3f5;
  --bg-elevated: #ffffff;
  --bg-hover: #eceef0;
  --bg-muted: #eceef0;
  --bg-content: #f1f3f5;
  --card: #ffffff;
  --card-foreground: #1a1a1e;
  --card-highlight: rgba(0, 0, 0, 0.02);
  --popover: #ffffff;
  --popover-foreground: #1a1a1e;
  --panel: #f8f9fa;
  --panel-strong: #f1f3f5;
  --panel-hover: #e6e8eb;
  --chrome: rgba(248, 249, 250, 0.96);
  --chrome-strong: rgba(248, 249, 250, 0.98);
  --text: #3c3c43;
  --text-strong: #1a1a1e;
  --muted: #6e6e73;
  --muted-strong: #545458;
  --border: #e5e5ea;
  --border-strong: #d1d1d6;
  --border-hover: #aeaeb2;
  --input: #e5e5ea;
  --ring: #dc2626;
  --accent: #dc2626;
  --accent-hover: #ef4444;
  --accent-subtle: rgba(220, 38, 38, 0.08);
  --accent-glow: rgba(220, 38, 38, 0.1);
  --secondary: #f1f3f5;
  --ok: #15803d;
  --warn: #b45309;
  --danger: #dc2626;
  color-scheme: light;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background: var(--bg);
  color: var(--text);
  font: 400 14px/1.55 var(--font-body);
  letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  height: 100vh;
  overflow: hidden;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
input,
textarea,
select {
  font: inherit;
  color: inherit;
}

:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.shell {
  --shell-nav-width: 258px;
  --shell-nav-rail-width: 78px;
  --shell-topbar-height: 52px;
  --shell-focus-duration: 200ms;
  --shell-focus-ease: var(--ease-out);
  height: 100vh;
  display: grid;
  grid-template-columns: var(--shell-nav-width) minmax(0, 1fr);
  grid-template-rows: var(--shell-topbar-height) 1fr;
  grid-template-areas:
    "nav topbar"
    "nav content";
  gap: 0;
  overflow: hidden;
  transition: grid-template-columns var(--shell-focus-duration) var(--shell-focus-ease);
}

.shell--nav-collapsed {
  grid-template-columns: var(--shell-nav-rail-width) minmax(0, 1fr);
}

.shell--embedded {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 1fr;
  grid-template-areas: "content";
}

.topbar {
  grid-area: topbar;
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  padding: 0 24px;
  min-height: 58px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(12px) saturate(1.6);
  -webkit-backdrop-filter: blur(12px) saturate(1.6);
}

.shell--embedded .topbar,
.shell--embedded .shell-nav,
.shell--embedded .shell-nav-backdrop {
  display: none;
}

.topnav-shell {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: var(--shell-topbar-height);
}

.topbar-nav-toggle,
.nav-collapse-toggle {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--bg-elevated) 80%, transparent);
  color: var(--muted);
  cursor: pointer;
  transition:
    background var(--duration-fast) ease,
    border-color var(--duration-fast) ease,
    color var(--duration-fast) ease;
}

.topbar-nav-toggle {
  display: none;
}

.topnav-shell__content {
  min-width: 0;
  flex: 1;
}

.topnav-shell__actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.dashboard-header__breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
}

.dashboard-header__breadcrumb-link,
.dashboard-header__breadcrumb-sep {
  color: var(--muted);
}

.dashboard-header__breadcrumb-current {
  color: var(--text-strong);
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.topbar-theme-mode {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--bg-elevated) 78%, transparent);
}

.topbar-theme-mode__btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition:
    color var(--duration-fast) ease,
    background var(--duration-fast) ease,
    border-color var(--duration-fast) ease;
}

.topbar-theme-mode__btn:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.topbar-theme-mode__btn--active {
  color: var(--accent);
  background: var(--accent-subtle);
  border-color: color-mix(in srgb, var(--accent) 25%, transparent);
}

.shell-nav {
  grid-area: nav;
  display: flex;
  min-height: 100%;
  overflow: hidden;
  border-right: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
}

.shell-nav-backdrop {
  display: none;
}

.sidebar {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg) 96%, var(--bg-elevated) 4%);
}

.sidebar-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  padding: 14px 10px 12px;
}

.sidebar-shell__header,
.sidebar-shell__footer {
  flex-shrink: 0;
}

.sidebar-shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 8px 18px;
}

.sidebar-shell__body {
  min-height: 0;
  flex: 1;
  display: flex;
}

.sidebar-shell__footer {
  padding: 12px 0 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sidebar-brand__logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 28%, var(--bg-elevated) 72%), color-mix(in srgb, var(--accent) 12%, var(--bg) 88%));
  color: var(--text-strong);
  font-size: 12px;
  font-weight: 700;
  box-shadow: 0 8px 18px color-mix(in srgb, black 12%, transparent);
}

.sidebar-brand__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sidebar-brand__eyebrow {
  font-size: 10px;
  line-height: 1.1;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--muted);
  text-transform: uppercase;
}

.sidebar-brand__title {
  font-size: 15px;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.03em;
  color: var(--text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.nav-section {
  display: grid;
  gap: 6px;
  margin-bottom: 16px;
}

.nav-section__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 0 10px;
  min-height: 28px;
  background: transparent;
  border: none;
  color: color-mix(in srgb, var(--muted) 72%, var(--text) 28%);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.nav-section__items {
  display: grid;
  gap: 4px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-height: 40px;
  padding: 0 9px;
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted);
  transition:
    border-color var(--duration-fast) ease,
    background var(--duration-fast) ease,
    color var(--duration-fast) ease;
}

.nav-item:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--bg-hover) 84%, transparent);
  border-color: color-mix(in srgb, var(--border) 72%, transparent);
}

.nav-item--active {
  color: var(--text-strong);
  background: color-mix(in srgb, var(--accent-subtle) 88%, var(--bg-elevated) 12%);
  border-color: color-mix(in srgb, var(--accent) 18%, transparent);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 10%, transparent),
    0 12px 24px color-mix(in srgb, black 10%, transparent);
}

.nav-item__icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.72;
}

.nav-item__icon svg,
.topbar-nav-toggle svg,
.nav-collapse-toggle svg,
.topbar-theme-mode__btn svg,
.toolbar-button svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.7px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.nav-item--active .nav-item__icon {
  opacity: 1;
  color: var(--accent);
}

.nav-item__text {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.sidebar--collapsed .sidebar-shell {
  padding: 12px 8px 10px;
}

.sidebar--collapsed .sidebar-brand__copy,
.sidebar--collapsed .nav-item__text,
.sidebar--collapsed .sidebar-footer-copy {
  display: none;
}

.sidebar--collapsed .nav-item {
  justify-content: center;
  width: 44px;
  min-height: 44px;
  padding: 0;
  margin: 0 auto;
}

.sidebar--collapsed .nav-section__label {
  display: none;
}

.sidebar-footer-copy {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.content {
  grid-area: content;
  padding: 16px 20px 32px;
  display: block;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg-content);
}

.shell--embedded .content {
  padding: 16px;
}

.content > * + * {
  margin-top: 20px;
}

.content-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 4px 8px;
}

.page-title {
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.03em;
  line-height: 1.2;
  color: var(--text-strong);
}

.page-sub {
  color: var(--muted);
  font-size: 13px;
  margin-top: 4px;
}

.page-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--border);
  padding: 5px 11px;
  border-radius: var(--radius-full);
  background: var(--secondary);
  font-size: 12px;
  font-weight: 500;
}

.pill--ok {
  color: var(--ok);
}

.pill--warn {
  color: var(--warn);
}

.pill--danger {
  color: var(--danger);
  background: var(--danger-subtle);
  border-color: color-mix(in srgb, var(--danger) 16%, transparent);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  padding: 8px 14px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) var(--ease-out),
    background var(--duration-fast) var(--ease-out);
}

.btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.btn.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--primary-foreground);
}

.btn.primary:hover {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.toolbar-button {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--bg-elevated);
  color: var(--muted);
  cursor: pointer;
}

.toolbar-button:hover {
  color: var(--text);
  border-color: var(--border-strong);
  background: var(--bg-hover);
}

.card {
  border: 1px solid var(--border);
  background: var(--card);
  border-radius: var(--radius-lg);
  padding: 18px;
  transition:
    border-color var(--duration-normal) var(--ease-out),
    box-shadow var(--duration-normal) var(--ease-out);
}

.card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-strong);
}

.card-sub {
  color: var(--muted);
  font-size: 13px;
  margin-top: 6px;
  line-height: 1.5;
}

.stat-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.workspace-hero {
  position: relative;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border-strong) 70%, transparent);
  border-radius: var(--radius-xl);
  padding: 24px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 16%, transparent), transparent 34%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 92%, transparent), color-mix(in srgb, var(--card) 96%, transparent));
  box-shadow: var(--shadow-md);
}

.workspace-hero::after {
  content: "";
  position: absolute;
  inset: auto -10% -30% auto;
  width: 240px;
  height: 240px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  filter: blur(36px);
  pointer-events: none;
}

.workspace-hero__grid {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1.5fr) minmax(240px, 0.9fr);
  align-items: end;
}

.workspace-hero__eyebrow {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-hero__title {
  margin-top: 8px;
  color: var(--text-strong);
  font-size: 28px;
  line-height: 1.05;
  letter-spacing: -0.04em;
  font-weight: 700;
  text-wrap: balance;
}

.workspace-hero__copy {
  max-width: 58ch;
  margin-top: 10px;
  color: color-mix(in srgb, var(--text) 82%, var(--muted) 18%);
  font-size: 14px;
  line-height: 1.6;
}

.workspace-hero__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
}

.summary-strip {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.summary-item {
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg) 30%, transparent);
}

.summary-item__label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.summary-item__value {
  margin-top: 6px;
  color: var(--text-strong);
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.03em;
}

.stat {
  background: var(--card);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  border: 1px solid var(--border);
}

.stat-label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  margin-top: 6px;
  letter-spacing: -0.03em;
  line-height: 1.1;
  color: var(--text-strong);
}

.mail-workbench-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1.75fr) minmax(320px, 0.92fr);
  align-items: start;
}

.mail-workbench-main,
.mail-workbench-side {
  display: grid;
  gap: 16px;
}

.mail-workbench-side {
  position: sticky;
  top: 16px;
}

.panel {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--card);
  overflow: hidden;
  box-shadow: 0 1px 0 color-mix(in srgb, white 4%, transparent);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-elevated) 74%, transparent);
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-strong);
}

.panel-body {
  padding: 16px;
  display: grid;
  gap: 14px;
}

.detail-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.actions-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.console-input,
.console-textarea {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-elevated);
  color: var(--text);
  padding: 10px 12px;
  font: inherit;
}

.console-textarea {
  min-height: 92px;
  resize: vertical;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.section-label {
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.muted {
  color: var(--muted);
  font-size: 13px;
}

.code {
  font-family: var(--mono);
}

.list,
.timeline-list,
.mailbox-feed {
  display: grid;
  gap: 10px;
}

.list-card,
.timeline-entry,
.feed-entry {
  width: 100%;
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-elevated) 84%, transparent);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--duration-fast) ease,
    background var(--duration-fast) ease,
    transform var(--duration-fast) ease,
    box-shadow var(--duration-fast) ease;
}

.list-card:hover,
.timeline-entry:hover,
.feed-entry:hover {
  border-color: var(--border-strong);
  background: color-mix(in srgb, var(--bg-hover) 84%, transparent);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.list-card.active {
  border-color: color-mix(in srgb, var(--accent) 26%, transparent);
  background: color-mix(in srgb, var(--accent-subtle) 86%, var(--bg-elevated) 14%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 10%, transparent),
    0 10px 22px color-mix(in srgb, black 10%, transparent);
}

.list-card.active::before {
  content: "";
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 3px;
  border-radius: 999px;
  background: var(--accent);
}

.card-top,
.meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-subtitle {
  color: var(--muted);
  font-size: 12px;
}

.title {
  color: var(--text-strong);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.detail {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}

.detail-strong {
  color: var(--text);
}

.empty,
.loading,
.error-banner {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--card);
  padding: 18px;
}

.error-banner {
  border-color: color-mix(in srgb, var(--danger) 18%, transparent);
  background: color-mix(in srgb, var(--danger-subtle) 68%, var(--card) 32%);
}

.link-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--secondary);
  color: var(--text);
  cursor: pointer;
}

.link-chip.active {
  border-color: color-mix(in srgb, var(--accent) 26%, transparent);
  color: var(--accent);
}

.connect-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.mono-block {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  font-family: var(--mono);
  font-size: 12px;
  overflow-x: auto;
}

@media (max-width: 1100px) {
  .shell,
  .shell--nav-collapsed {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: var(--shell-topbar-height) minmax(0, 1fr);
    grid-template-areas:
      "topbar"
      "content";
  }

  .shell-nav,
  .shell--nav-collapsed .shell-nav {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 70;
    width: min(86vw, 320px);
    min-width: 0;
    border-right: none;
    box-shadow: 0 30px 80px color-mix(in srgb, black 40%, transparent);
    transform: translateX(-100%);
    opacity: 0;
    pointer-events: none;
    transition:
      transform var(--duration-normal) var(--ease-out),
      opacity var(--duration-normal) var(--ease-out);
  }

  .shell--nav-drawer-open .shell-nav {
    transform: translateX(0);
    opacity: 1;
    pointer-events: auto;
  }

  .shell-nav-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 65;
    border: 0;
    background: color-mix(in srgb, black 52%, transparent);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-normal) var(--ease-out);
  }

  .shell--nav-drawer-open .shell-nav-backdrop {
    opacity: 1;
    pointer-events: auto;
  }

  .topbar-nav-toggle {
    display: inline-flex;
  }

  .mail-workbench-grid {
    grid-template-columns: 1fr;
  }

  .mail-workbench-side {
    position: static;
    top: auto;
  }

  .workspace-hero__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .topbar {
    padding: 10px 12px;
  }

  .topnav-shell {
    gap: 10px;
  }

  .topnav-shell__actions {
    gap: 8px;
  }

  .content {
    padding: 12px;
  }

  .content-header {
    display: grid;
    gap: 12px;
    padding: 0;
  }

  .workspace-hero {
    padding: 18px;
    border-radius: var(--radius-lg);
  }

  .workspace-hero__title {
    font-size: 22px;
  }

  .workspace-hero__copy {
    font-size: 13px;
  }

  .summary-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .page-meta {
    justify-content: flex-start;
  }

  .topbar-theme-mode {
    display: none;
  }
}
`;

export function renderOpenClawWorkbenchShellHtml(input: {
  serviceName: string;
  initialWorkbenchPath: string;
  initialConsolePath: string;
  apiBasePath?: string;
}) {
  const embeddedShell =
    input.initialWorkbenchPath === "/workbench/mail/tab" ||
    input.initialWorkbenchPath.startsWith("/workbench/mail/tab/") ||
    input.initialWorkbenchPath.includes("shell=embedded");

  const config = serializeForScript({
    serviceName: input.serviceName,
    initialWorkbenchPath: input.initialWorkbenchPath,
    initialConsolePath: input.initialConsolePath,
    apiBasePath: input.apiBasePath ?? "/api",
    embeddedShell
  });

  return `<!doctype html>
<html lang="en" data-theme-mode="dark">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>OpenClaw Workbench · ${escapeHtml(input.serviceName)} Mail</title>
    <style>${OPENCLAW_SHELL_CSS}</style>
  </head>
  <body>
    <div class="shell${embeddedShell ? " shell--embedded" : ""}" id="app-shell">
      <button type="button" class="shell-nav-backdrop" id="nav-backdrop" aria-label="Close navigation"></button>
      <header class="topbar">
        <div class="topnav-shell">
          <button type="button" class="topbar-nav-toggle" id="topbar-nav-toggle" aria-label="Open navigation">
            <svg viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path></svg>
          </button>
          <div class="topnav-shell__content">
            <div class="dashboard-header">
              <div class="dashboard-header__breadcrumb">
                <span class="dashboard-header__breadcrumb-link">OpenClaw</span>
                <span class="dashboard-header__breadcrumb-sep">›</span>
                <span class="dashboard-header__breadcrumb-current" id="breadcrumb-current">Mail</span>
              </div>
            </div>
          </div>
          <div class="topnav-shell__actions">
            <button type="button" class="toolbar-button" id="refresh-button" aria-label="Refresh workbench">
              <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 3v6h-6"></path></svg>
            </button>
            <div class="topbar-status">
              <span class="pill pill--ok">Workbench</span>
              <span class="pill" id="accounts-pill">accounts 0</span>
              <span class="pill" id="rooms-pill">rooms 0</span>
              <span class="pill" id="approvals-pill">approvals 0</span>
            </div>
            <div class="topbar-theme-mode" role="group" aria-label="Color mode">
              <button type="button" class="topbar-theme-mode__btn topbar-theme-mode__btn--active" data-theme-mode="dark" aria-label="Dark mode">
                <svg viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9"></path></svg>
              </button>
              <button type="button" class="topbar-theme-mode__btn" data-theme-mode="light" aria-label="Light mode">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>
              </button>
            </div>
          </div>
        </div>
      </header>
      <div class="shell-nav">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-shell">
            <div class="sidebar-shell__header">
              <div class="sidebar-brand">
                <span class="sidebar-brand__logo">OC</span>
                <span class="sidebar-brand__copy">
                  <span class="sidebar-brand__eyebrow">OpenClaw Control</span>
                  <span class="sidebar-brand__title">${escapeHtml(input.serviceName)} Mail</span>
                </span>
              </div>
              <button type="button" class="nav-collapse-toggle" id="nav-collapse-toggle" aria-label="Collapse navigation">
                <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"></path></svg>
              </button>
            </div>
            <div class="sidebar-shell__body">
              <nav class="sidebar-nav">
                <section class="nav-section">
                  <div class="nav-section__label">Mail</div>
                  <div class="nav-section__items" id="nav-items"></div>
                </section>
              </nav>
            </div>
            <div class="sidebar-shell__footer">
              <div class="sidebar-footer-copy">OpenClaw-style Mail tab. MailClaws runtime data is rendered directly in the same workbench surface.</div>
            </div>
          </div>
        </aside>
      </div>
      <main class="content">
        <section class="content-header">
          <div>
            <div class="page-title" id="page-title">Mail Workbench</div>
            <div class="page-sub" id="page-sub">Kernel-first mailbox and room inspection from the same workbench route.</div>
          </div>
          <div class="page-meta" id="page-meta"></div>
        </section>
        <div id="content-root" class="loading">Loading mail workspace…</div>
      </main>
    </div>
    <script type="module">
      const config = ${config};

      const ICONS = {
        mail: '<svg viewBox="0 0 24 24"><path d="M4 6h16v12H4z"></path><path d="m4 8 8 6 8-6"></path></svg>',
        accounts: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
        rooms: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
        mailboxes: '<svg viewBox="0 0 24 24"><path d="M3 7h18"></path><path d="M5 7l2-3h10l2 3"></path><path d="M5 7v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7"></path><path d="M9 11h6"></path></svg>',
        approvals: '<svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>'
      };

      const state = {
        loading: true,
        error: null,
        data: null,
        navCollapsed: false,
        navDrawerOpen: false,
        route: null
      };

      function escapeHtmlClient(value) {
        return String(value == null ? "" : value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function formatTime(value) {
        if (!value) return "n/a";
        try {
          return new Date(value).toLocaleString();
        } catch {
          return String(value);
        }
      }

      function normalizeBasePath(pathname) {
        const bases = [
          "/console",
          "/workbench/mail/tab",
          "/workbench/mailclaws/tab",
          "/workbench/mail",
          "/workbench/mailclaws",
          "/dashboard",
          "/mail"
        ];
        for (const base of bases) {
          if (pathname === base || pathname.startsWith(base + "/")) {
            return { base, rest: pathname.slice(base.length) };
          }
        }
        return { base: config.embeddedShell ? "/workbench/mail/tab" : "/workbench/mail", rest: "" };
      }

      function parseRoute(pathname, search) {
        const parsed = {
          mode: null,
          accountId: null,
          inboxId: null,
          roomKey: null,
          mailboxId: null,
          status: "",
          originKind: "",
          approvalStatus: ""
        };
        const base = normalizeBasePath(pathname);
        const segments = base.rest.split("/").filter(Boolean);
        if (segments[0] === "connect") {
          parsed.mode = "connect";
        }
        if (segments[0] === "accounts" && segments[1]) {
          parsed.accountId = decodeURIComponent(segments[1]);
          parsed.mode = "accounts";
        }
        if (segments[0] === "rooms" && segments[1]) {
          parsed.roomKey = decodeURIComponent(segments[1]);
          parsed.mode = "rooms";
        }
        if (segments[0] === "inboxes" && segments[1] && segments[2]) {
          parsed.accountId = decodeURIComponent(segments[1]);
          parsed.inboxId = decodeURIComponent(segments[2]);
          parsed.mode = "mailboxes";
        }
        if (segments[0] === "mailboxes" && segments[1] && segments[2]) {
          parsed.accountId = decodeURIComponent(segments[1]);
          parsed.mailboxId = decodeURIComponent(segments[2]);
          parsed.mode = "mailboxes";
        }
        const params = new URLSearchParams(search);
        if (!parsed.mode && params.get("mode")) {
          parsed.mode = params.get("mode");
        }
        if (!parsed.accountId && params.get("accountId")) {
          parsed.accountId = params.get("accountId");
        }
        if (!parsed.roomKey && params.get("roomKey")) {
          parsed.roomKey = params.get("roomKey");
        }
        if (!parsed.mailboxId && params.get("mailboxId")) {
          parsed.mailboxId = params.get("mailboxId");
        }
        parsed.status = params.get("status") || "";
        parsed.originKind = params.get("originKind") || "";
        parsed.approvalStatus = params.get("approvalStatus") || "";
        if (!parsed.mode) {
          parsed.mode = "connect";
        }
        return parsed;
      }

      function routeBasePath() {
        const normalized = normalizeBasePath(window.location.pathname);
        return normalized.base;
      }

      function hrefForRoute(route) {
        const routeBase = routeBasePath();
        let pathname = routeBase;
        if (route.inboxId && route.accountId) {
          pathname = routeBase + "/inboxes/" + encodeURIComponent(route.accountId) + "/" + encodeURIComponent(route.inboxId);
        } else if (route.mailboxId && route.accountId) {
          pathname = routeBase + "/mailboxes/" + encodeURIComponent(route.accountId) + "/" + encodeURIComponent(route.mailboxId);
        } else if (route.roomKey) {
          pathname = routeBase + "/rooms/" + encodeURIComponent(route.roomKey);
        } else if (route.accountId && (!route.mode || route.mode === "accounts")) {
          pathname = routeBase + "/accounts/" + encodeURIComponent(route.accountId);
        }
        const params = new URLSearchParams();
        if (pathname === routeBase && route.mode) {
          params.set("mode", route.mode);
        }
        if (pathname === routeBase && route.accountId) {
          params.set("accountId", route.accountId);
        }
        if (route.status) {
          params.set("status", route.status);
        }
        if (route.originKind) {
          params.set("originKind", route.originKind);
        }
        if (route.approvalStatus) {
          params.set("approvalStatus", route.approvalStatus);
        }
        if (route.mailboxId && route.roomKey) {
          params.set("roomKey", route.roomKey);
        }
        if (config.embeddedShell) {
          params.set("shell", "embedded");
        }
        const search = params.toString();
        return pathname + (search ? "?" + search : "");
      }

      function notifyHost(type, payload) {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ source: "mailclaws", type, payload }, "*");
        }
      }

      async function requestJson(path, init) {
        const response = await fetch(path, {
          ...init,
          headers: {
            accept: "application/json",
            ...(init && init.headers ? init.headers : {})
          }
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || ("request failed: " + response.status));
        }
        return response.json();
      }

      function renderPill(label, tone) {
        return '<span class="pill' + (tone ? " " + tone : "") + '">' + escapeHtmlClient(label) + "</span>";
      }

      function renderMetric(label, value) {
        return (
          '<div class="stat">' +
          '<div class="stat-label">' + escapeHtmlClient(label) + "</div>" +
          '<div class="stat-value">' + escapeHtmlClient(value) + "</div>" +
          "</div>"
        );
      }

      function renderSummaryItem(label, value) {
        return (
          '<div class="summary-item">' +
          '<div class="summary-item__label">' + escapeHtmlClient(label) + '</div>' +
          '<div class="summary-item__value">' + escapeHtmlClient(value) + '</div>' +
          '</div>'
        );
      }

      function renderWorkspaceHero(input) {
        return (
          '<section class="workspace-hero">' +
          '<div class="workspace-hero__grid">' +
          '<div>' +
          '<div class="workspace-hero__eyebrow">' + escapeHtmlClient(input.eyebrow || "Mail workbench") + '</div>' +
          '<div class="workspace-hero__title">' + escapeHtmlClient(input.title || "Mail") + '</div>' +
          (input.copy ? '<div class="workspace-hero__copy">' + escapeHtmlClient(input.copy) + '</div>' : '') +
          (input.actions ? '<div class="workspace-hero__actions">' + input.actions + '</div>' : '') +
          '</div>' +
          '<div class="summary-strip">' + (input.summaryItems || []).map(function(item) {
            return renderSummaryItem(item.label, item.value);
          }).join("") + '</div>' +
          '</div>' +
          '</section>'
        );
      }

      function renderAccountCard(account) {
        return (
          '<button class="list-card' + (account.accountId === state.route.accountId ? " active" : "") + '" data-action="select-account" data-account-id="' + escapeHtmlClient(account.accountId) + '">' +
          '<div class="card-top">' +
          '<div>' +
          '<div class="card-title">' + escapeHtmlClient(account.displayName || account.emailAddress || account.accountId) + "</div>" +
          '<div class="card-subtitle code">' + escapeHtmlClient(account.accountId) + "</div>" +
          "</div>" +
          renderPill(account.health || "unknown", account.pendingApprovalCount > 0 ? "pill--warn" : "pill--ok") +
          "</div>" +
          '<div class="chips">' +
          renderPill((account.provider || "provider") + "", "") +
          renderPill(String(account.roomCount || 0) + " rooms", "") +
          renderPill(String(account.pendingApprovalCount || 0) + " approvals", Number(account.pendingApprovalCount || 0) > 0 ? "pill--warn" : "") +
          "</div>" +
          '<div class="detail">Latest activity ' + escapeHtmlClient(formatTime(account.latestActivityAt)) + "</div>" +
          "</button>"
        );
      }

      function renderRoomCard(room) {
        return (
          '<button class="list-card' + (room.roomKey === state.route.roomKey ? " active" : "") + '" data-action="select-room" data-room-key="' + escapeHtmlClient(room.roomKey) + '" data-account-id="' + escapeHtmlClient(room.accountId || "") + '">' +
          '<div class="card-top">' +
          '<div>' +
          '<div class="card-title">' + escapeHtmlClient(room.latestSubject || room.roomKey) + "</div>" +
          '<div class="card-subtitle code">' + escapeHtmlClient(room.roomKey) + "</div>" +
          "</div>" +
          renderPill(room.state || "open", "") +
          "</div>" +
          '<div class="chips">' +
          renderPill("attention " + escapeHtmlClient(room.attention || "normal"), "") +
          renderPill("rev " + escapeHtmlClient(room.revision || 0), "") +
          renderPill(String(room.pendingApprovalCount || 0) + " approvals", Number(room.pendingApprovalCount || 0) > 0 ? "pill--warn" : "") +
          (room.mailTaskKind ? renderPill("task " + room.mailTaskKind, "") : "") +
          (room.mailTaskStage ? renderPill("stage " + room.mailTaskStage, "") : "") +
          '</div>' +
          '<div class="detail">Updated ' + escapeHtmlClient(formatTime(room.latestActivityAt)) + '</div>' +
          '</button>'
        );
      }

      function renderApprovalCard(approval) {
        return (
          '<button class="list-card" data-action="select-room" data-room-key="' + escapeHtmlClient(approval.roomKey) + '" data-account-id="' + escapeHtmlClient(approval.accountId || "") + '">' +
          '<div class="card-top">' +
          '<div><div class="card-title">' + escapeHtmlClient(approval.subject || approval.requestId) + '</div><div class="card-subtitle code">' + escapeHtmlClient(approval.requestId) + "</div></div>" +
          renderPill(approval.status || "requested", approval.status === "requested" ? "pill--warn" : approval.status === "rejected" ? "pill--danger" : "pill--ok") +
          "</div>" +
          '<div class="chips">' +
          (approval.outboxStatus ? renderPill(approval.outboxStatus, "") : "") +
          renderPill(String((approval.recipients && approval.recipients.to ? approval.recipients.to.length : 0)) + " to", "") +
          "</div>" +
          '<div class="detail">Updated ' + escapeHtmlClient(formatTime(approval.updatedAt)) + "</div>" +
          "</button>"
        );
      }

      function renderMailboxCard(mailbox) {
        return (
          '<button class="list-card' + (mailbox.mailboxId === state.route.mailboxId ? " active" : "") + '" data-action="select-mailbox" data-account-id="' + escapeHtmlClient(mailbox.accountId || state.route.accountId || "") + '" data-mailbox-id="' + escapeHtmlClient(mailbox.mailboxId) + '">' +
          '<div class="card-top">' +
          '<div><div class="card-title code">' + escapeHtmlClient(mailbox.mailboxId) + '</div><div class="card-subtitle">' + escapeHtmlClient(mailbox.kind || "mailbox") + (mailbox.role ? " / " + escapeHtmlClient(mailbox.role) : "") + "</div></div>" +
          renderPill(mailbox.active ? "active" : "inactive", mailbox.active ? "pill--ok" : "pill--warn") +
          "</div>" +
          '<div class="chips">' +
          renderPill(String(mailbox.messageCount || 0) + " msgs", "") +
          renderPill(String(mailbox.roomCount || 0) + " rooms", "") +
          "</div>" +
          '<div class="detail">Latest ' + escapeHtmlClient(formatTime(mailbox.latestMessageAt)) + "</div>" +
          "</button>"
        );
      }

      function renderInboxCard(entry) {
        const inbox = entry.inbox || {};
        const items = entry.items || [];
        return (
          '<button class="list-card' + (inbox.inboxId === state.route.inboxId ? " active" : "") + '" data-action="select-inbox" data-account-id="' + escapeHtmlClient(inbox.accountId || state.route.accountId || "") + '" data-inbox-id="' + escapeHtmlClient(inbox.inboxId || "") + '">' +
          '<div class="card-top">' +
          '<div><div class="card-title code">' + escapeHtmlClient(inbox.inboxId || "inbox") + '</div><div class="card-subtitle">' + escapeHtmlClient(inbox.agentId || "agent") + " / public inbox</div></div>" +
          renderPill(String(items.length) + " rooms", items.length > 0 ? "pill--warn" : "") +
          "</div>" +
          '<div class="chips">' +
          renderPill("ACK " + escapeHtmlClient(inbox.ackSlaSeconds || 0) + "s", "") +
          renderPill("limit " + escapeHtmlClient(inbox.activeRoomLimit || 0), "") +
          renderPill("burst " + escapeHtmlClient(inbox.burstCoalesceSeconds || 0) + "s", "") +
          "</div>" +
          '<div class="detail">' + escapeHtmlClient(items.slice(0, 2).map(function(item) { return item.roomKey; }).join(", ") || "No projected rooms yet") + "</div>" +
          "</button>"
        );
      }

      function renderFeedEntry(entry) {
        return (
          '<button class="feed-entry" data-action="select-room" data-room-key="' + escapeHtmlClient(entry.delivery && entry.delivery.roomKey ? entry.delivery.roomKey : "") + '" data-account-id="' + escapeHtmlClient((entry.message && entry.message.accountId) || state.route.accountId || "") + '">' +
          '<div class="meta"><span>' + escapeHtmlClient((entry.message && entry.message.kind) || "message") + " / " + escapeHtmlClient((entry.message && entry.message.originKind) || "origin") + '</span><span>' + escapeHtmlClient(formatTime(entry.message && entry.message.createdAt)) + "</span></div>" +
          '<div class="title">' + escapeHtmlClient((entry.message && entry.message.subject) || "Message") + "</div>" +
          '<div class="detail code">' + escapeHtmlClient(((entry.message && entry.message.fromMailboxId) || "?") + " -> " + (((entry.message && entry.message.toMailboxIds) || []).join(", "))) + "</div>" +
          '<div class="chips">' +
          renderPill((entry.delivery && entry.delivery.status) || "queued", "") +
          '</div>' +
          '</button>'
        );
      }

      function renderTimelineEntry(entry) {
        return (
          '<div class="timeline-entry">' +
          '<div class="meta"><span>' + escapeHtmlClient(entry.category || "event") + " / " + escapeHtmlClient(entry.type || "type") + '</span><span>' + escapeHtmlClient(formatTime(entry.at)) + "</span></div>" +
          '<div class="title">' + escapeHtmlClient(entry.title || entry.type || "Event") + "</div>" +
          (entry.detail ? '<div class="detail">' + escapeHtmlClient(entry.detail) + "</div>" : "") +
          '<div class="chips">' +
          (entry.revision ? renderPill("rev " + entry.revision, "") : "") +
          (entry.status ? renderPill(entry.status, "") : "") +
          "</div>" +
          "</div>"
        );
      }

      function renderVirtualMessageEntry(message) {
        return (
          '<div class="timeline-entry">' +
          '<div class="meta"><span>' + escapeHtmlClient(message.kind || "message") + " / " + escapeHtmlClient(message.originKind || "origin") + '</span><span>' + escapeHtmlClient(formatTime(message.createdAt)) + "</span></div>" +
          '<div class="title">' + escapeHtmlClient(message.subject || message.messageId || "Message") + "</div>" +
          '<div class="detail code">' + escapeHtmlClient((message.fromMailboxId || "?") + " -> " + (((message.toMailboxIds || []).join(", ")) || "n/a")) + "</div>" +
          '<div class="chips">' +
          renderPill(message.visibility || "room", "") +
          renderPill("rev " + escapeHtmlClient(message.roomRevision || 0), "") +
          (message.parentMessageId ? renderPill("reply", "") : renderPill("root", "")) +
          (message.ccMailboxIds && message.ccMailboxIds.length > 0 ? renderPill("cc " + message.ccMailboxIds.length, "") : "") +
          "</div>" +
          "</div>"
        );
      }

      function renderDeliveryEntry(entry) {
        return (
          '<div class="timeline-entry">' +
          '<div class="meta"><span>' + escapeHtmlClient(entry.mailboxId || "mailbox") + '</span><span>' + escapeHtmlClient(formatTime(entry.updatedAt)) + "</span></div>" +
          '<div class="title code">' + escapeHtmlClient(entry.messageId || entry.deliveryId || "delivery") + "</div>" +
          '<div class="chips">' +
          renderPill(entry.status || "queued", entry.status === "consumed" ? "pill--ok" : entry.status === "stale" || entry.status === "vetoed" || entry.status === "superseded" ? "pill--warn" : "") +
          (entry.leaseOwner ? renderPill("lease " + entry.leaseOwner, "") : "") +
          (entry.consumedAt ? renderPill("consumed", "pill--ok") : "") +
          "</div>" +
          (entry.leaseUntil ? '<div class="detail">Lease until ' + escapeHtmlClient(formatTime(entry.leaseUntil)) + "</div>" : "") +
          "</div>"
        );
      }

      function renderOutboxEntry(entry) {
        return (
          '<div class="timeline-entry">' +
          '<div class="meta"><span>' + escapeHtmlClient(entry.kind || "outbox") + '</span><span>' + escapeHtmlClient(formatTime(entry.updatedAt)) + "</span></div>" +
          '<div class="title">' + escapeHtmlClient(entry.subject || entry.intentId || "Outbox intent") + "</div>" +
          '<div class="detail code">' + escapeHtmlClient((entry.to || []).join(", ") || "no visible recipients") + "</div>" +
          '<div class="chips">' +
          renderPill(entry.status || "queued", entry.status === "sent" ? "pill--ok" : entry.status === "failed" || entry.status === "rejected" ? "pill--danger" : entry.status === "pending_approval" ? "pill--warn" : "") +
          renderPill(entry.kind || "final", "") +
          (entry.providerMessageId ? renderPill("provider ack", "pill--ok") : "") +
          "</div>" +
          (entry.errorText ? '<div class="detail">' + escapeHtmlClient(entry.errorText) + "</div>" : "") +
          "</div>"
        );
      }

      function renderMailboxChip(mailboxId, roomKey) {
        return '<button class="link-chip' + (mailboxId === state.route.mailboxId ? " active" : "") + '" data-action="select-mailbox" data-account-id="' + escapeHtmlClient((state.route.accountId || (state.data && state.data.selection && state.data.selection.accountId) || "")) + '" data-mailbox-id="' + escapeHtmlClient(mailboxId) + '"' + (roomKey ? ' data-room-key="' + escapeHtmlClient(roomKey) + '"' : "") + ">" + escapeHtmlClient(mailboxId) + "</button>";
      }

      function renderAgentTemplateCard(template, connect) {
        const accountId = connect && connect.templateApplyAccountId ? connect.templateApplyAccountId : "";
        const tenantId = connect && connect.templateApplyTenantId ? connect.templateApplyTenantId : "";
        const canApply = accountId.length > 0;
        return (
          '<div class="timeline-entry">' +
          '<div class="meta"><span>' + escapeHtmlClient(template.displayName || template.templateId || "template") + '</span><span>' + escapeHtmlClient(String((template.headcount && template.headcount.persistentAgents) || 0) + " agents") + "</span></div>" +
          '<div class="title">' + escapeHtmlClient(template.summary || "") + "</div>" +
          '<div class="detail">' + escapeHtmlClient(template.inspiration || "") + "</div>" +
          '<div class="chips">' +
          renderPill(template.templateId || "template", "") +
          renderPill("burst " + String((template.headcount && template.headcount.burstTargets) || 0), "") +
          "</div>" +
          '<div class="detail">' + escapeHtmlClient(((template.persistentAgents || []).map(function(agent) { return agent.displayName || agent.agentId; }).join(", ")) || "No agents") + "</div>" +
          (canApply
            ? '<div class="actions-inline"><button class="btn" data-action="apply-agent-template" data-template-id="' + escapeHtmlClient(template.templateId || "") + '" data-account-id="' + escapeHtmlClient(accountId) + '" data-tenant-id="' + escapeHtmlClient(tenantId || accountId) + '">Apply Template</button></div>'
            : '<div class="detail">Connect an account first, then apply this template into that workspace.</div>') +
          "</div>"
        );
      }

      function renderAgentDirectoryCard(entry) {
        return (
          '<div class="timeline-entry">' +
          '<div class="meta"><span>' + escapeHtmlClient(entry.displayName || entry.agentId || "agent") + '</span><span>' + escapeHtmlClient(String((entry.virtualMailboxes || []).length) + " mailboxes") + "</span></div>" +
          '<div class="title code">' + escapeHtmlClient(entry.publicMailboxId || ("public:" + (entry.agentId || "agent"))) + "</div>" +
          '<div class="detail">' + escapeHtmlClient(entry.purpose || "") + "</div>" +
          '<div class="chips">' +
          (entry.templateId ? renderPill(entry.templateId, "") : "") +
          ((entry.collaboratorAgentIds || []).slice(0, 3).map(function(agentId) { return renderPill("works with " + agentId, ""); }).join("")) +
          "</div>" +
          ((entry.virtualMailboxes || []).length > 0
            ? '<div class="detail code">' + escapeHtmlClient((entry.virtualMailboxes || []).join(", ")) + "</div>"
            : "") +
          "</div>"
        );
      }

      function renderAgentSkillGroup(entry) {
        const skills = Array.isArray(entry.skills) ? entry.skills : [];
        return (
          '<div class="timeline-entry">' +
          '<div class="meta"><span>' + escapeHtmlClient(entry.displayName || entry.agentId || "agent") + '</span><span>' + escapeHtmlClient(String(skills.length) + " skills") + "</span></div>" +
          '<div class="title code">' + escapeHtmlClient(entry.agentId || "agent") + "</div>" +
          (skills.length > 0
            ? '<div class="chips">' + skills.map(function(skill) {
                return renderPill((skill.source || "default") + " " + (skill.skillId || "skill"), skill.source === "managed" ? "pill--ok" : "");
              }).join("") + "</div>" +
              '<div class="detail">' + escapeHtmlClient(skills.map(function(skill) { return skill.title || skill.skillId || "skill"; }).join(" | ")) + "</div>"
            : '<div class="detail">No skills discovered yet.</div>') +
          "</div>"
        );
      }

      function renderConnectHome() {
        const workspace = state.data && state.data.workspace ? state.data.workspace : null;
        const connect = workspace && workspace.connect ? workspace.connect : null;
        const providerCount = connect && Array.isArray(connect.providerOptions) ? connect.providerOptions.length : 0;
        const loginCommand = (connect && connect.recommendedLoginCommand) || "mailclaws login";
        const templates = connect && Array.isArray(connect.agentTemplates) ? connect.agentTemplates : [];
        const directory = connect && Array.isArray(connect.agentDirectory) ? connect.agentDirectory : [];
        const headcount = connect && Array.isArray(connect.headcountRecommendations) ? connect.headcountRecommendations : [];
        const skills = connect && Array.isArray(connect.skills) ? connect.skills : [];
        return (
          renderWorkspaceHero({
            eyebrow: "Mail setup",
            title: "Connect one mailbox and start from the room.",
            copy: "This workbench is for the durable truth layer: account health, rooms, internal mailboxes, approvals, gateway projections, and the durable agent roster all stay visible from one route.",
            actions:
              '<a class="btn primary" href="' + escapeHtmlClient((connect && connect.browserPath) || routeBasePath()) + '">Open Mail</a>' +
              '<a class="btn" href="' + escapeHtmlClient((connect && connect.onboardingApiPath) || ((config.apiBasePath || "/api") + "/connect/onboarding")) + '" target="_blank" rel="noreferrer">Onboarding API</a>',
            summaryItems: [
              { label: "providers", value: String(providerCount) },
              { label: "accounts", value: String((state.data && state.data.accounts ? state.data.accounts.length : 0)) },
              { label: "rooms", value: String((state.data && state.data.rooms ? state.data.rooms.length : 0)) },
              { label: "approvals", value: String((state.data && state.data.approvals ? state.data.approvals.length : 0)) }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>Connect a mailbox</h3><span class="muted">Workbench mail tab</span></div>' +
          '<div class="panel-body">' +
          '<div class="card-title">Start with one real mailbox, then inspect rooms and internal mail from the same workbench route.</div>' +
          '<div class="detail">The workbench keeps the setup path narrow on purpose: connect, verify, send one real test email, then switch to room and mailbox inspection.</div>' +
          '<div class="mono-block">' + escapeHtmlClient((connect && connect.recommendedStartCommand) || "mailclaws dashboard") + "</div>" +
          '<div class="mono-block">' + escapeHtmlClient(loginCommand) + "</div>" +
          "</div></div>" +
          '<div class="panel"><div class="panel-header"><h3>Agent Templates</h3><span class="muted">' + escapeHtmlClient(String(templates.length)) + ' presets</span></div><div class="panel-body">' +
          (templates.length > 0
            ? '<div class="mailbox-feed">' + templates.map(function(template) { return renderAgentTemplateCard(template, connect); }).join("") + "</div>"
            : '<div class="empty">No agent templates are available.</div>') +
          "</div></div>" +
          '<div class="panel"><div class="panel-header"><h3>Custom Agent</h3><span class="muted">durable soul + mailbox</span></div><div class="panel-body">' +
          '<div class="detail">Create one durable agent with its own SOUL.md, internal mailboxes, inbox policy, and directory entry.</div>' +
          '<div class="detail-grid">' +
          '<label><div class="section-label">Agent ID</div><input class="console-input" data-custom-agent-field="agentId" placeholder="assistant-ops" /></label>' +
          '<label><div class="section-label">Display Name</div><input class="console-input" data-custom-agent-field="displayName" placeholder="Assistant Ops" /></label>' +
          '<label><div class="section-label">Public Mailbox</div><input class="console-input" data-custom-agent-field="publicMailboxId" placeholder="public:assistant-ops" /></label>' +
          '<label><div class="section-label">Collaborators</div><input class="console-input" data-custom-agent-field="collaboratorAgentIds" placeholder="assistant,research" /></label>' +
          '</div>' +
          '<label><div class="section-label">Purpose</div><textarea class="console-textarea" data-custom-agent-field="purpose" placeholder="Own escalations, coordinate approvals, and feed final-ready packets back to the front desk."></textarea></label>' +
          (((connect && connect.templateApplyAccountId) || "").length > 0
            ? '<div class="actions-inline"><button class="btn" data-action="create-custom-agent" data-account-id="' + escapeHtmlClient(connect.templateApplyAccountId || "") + '" data-tenant-id="' + escapeHtmlClient((connect && connect.templateApplyTenantId) || connect.templateApplyAccountId || "") + '">Create Agent</button></div>'
            : '<div class="detail">Connect an account first, then create custom durable agents in that workspace.</div>') +
          "</div></div>" +
          '<div class="panel"><div class="panel-header"><h3>Agent Directory</h3><span class="muted">' + escapeHtmlClient(String(directory.length)) + ' durable agents</span></div><div class="panel-body">' +
          (directory.length > 0
            ? '<div class="mailbox-feed">' + directory.map(renderAgentDirectoryCard).join("") + "</div>"
            : '<div class="empty">Apply a template or initialize an agent memory workspace to create durable souls.</div>') +
          "</div></div>" +
          '<div class="panel"><div class="panel-header"><h3>Skills</h3><span class="muted">' + escapeHtmlClient(String(skills.reduce(function(total, entry) { return total + ((entry.skills || []).length || 0); }, 0))) + ' visible skills</span></div><div class="panel-body">' +
          '<div class="detail">Every durable agent starts with two built-in mail skills. Add markdown skills when you want reusable reading, writing, or review behavior without carrying more transcript.</div>' +
          '<div class="mono-block">mailclaws skills list ' + escapeHtmlClient((connect && connect.templateApplyAccountId) || "[accountId]") + "</div>" +
          (skills.length > 0
            ? '<div class="mailbox-feed">' + skills.map(renderAgentSkillGroup).join("") + "</div>"
            : '<div class="empty">Connect or create a durable agent to inspect skills.</div>') +
          "</div></div>" +
          '<div class="panel"><div class="panel-header"><h3>HeadCount</h3><span class="muted">recommended starting shapes</span></div><div class="panel-body">' +
          (headcount.length > 0
            ? '<div class="mailbox-feed">' + headcount.map(function(entry) {
                return (
                  '<div class="timeline-entry">' +
                  '<div class="meta"><span>' + escapeHtmlClient(entry.displayName || entry.templateId || "template") + '</span><span>' + escapeHtmlClient(entry.confidence || "starter") + "</span></div>" +
                  '<div class="title">' + escapeHtmlClient(entry.summary || "") + "</div>" +
                  '<div class="chips">' +
                  renderPill("persistent " + String(entry.persistentAgents || 0), "") +
                  renderPill("burst " + String(entry.burstTargets || 0), "") +
                  "</div>" +
                  '<div class="detail">' + escapeHtmlClient((entry.reasons || []).join(" | ")) + "</div>" +
                  "</div>"
                );
              }).join("") + "</div>"
            : '<div class="empty">Headcount recommendations appear after MailClaws can see account or burst-work load.</div>') +
          "</div></div>"
        );
      }

      function renderProviderPanel() {
        if (!state.data || !state.data.mailboxConsole || !state.data.mailboxConsole.providerState) {
          return '<div class="panel"><div class="panel-header"><h3>Provider State</h3></div><div class="panel-body"><div class="empty">Select an account to inspect provider watch, cursors, and mailbox projection state.</div></div></div>';
        }
        const summary = state.data.mailboxConsole.providerState.summary || {};
        return (
          '<div class="panel">' +
          '<div class="panel-header"><h3>Provider State</h3><span class="muted">' + escapeHtmlClient((summary.watch && summary.watch.state) || "idle") + "</span></div>" +
          '<div class="panel-body">' +
          '<div class="detail-grid">' +
          renderMetric("Ingress", (summary.ingress && summary.ingress.mode) || "unknown") +
          renderMetric("Outbound", (summary.outbound && summary.outbound.mode) || "unknown") +
          renderMetric("Watch", (summary.watch && summary.watch.state) || "idle") +
          renderMetric("Last event", summary.lastEventType || "none") +
          '</div>' +
          '<div class="detail">MailClaws still uses the runtime kernel as truth. Provider watch and mailbox projections stay observable here, not authoritative.</div>' +
          '</div>' +
          '</div>'
        );
      }

      function renderAccountDetail() {
        if (!state.data || !state.data.accountDetail) {
          return '<div class="empty">Select an account to inspect provider state, inboxes, rooms, and mailbox projections.</div>';
        }
        const detail = state.data.accountDetail;
        const account = detail.account || {};
        const inboxes = detail.inboxes || [];
        const mailboxes = detail.mailboxes || [];
        const rooms = detail.rooms || [];
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: "Mailbox account",
            title: account.displayName || account.emailAddress || account.accountId || "Mailbox account",
            copy: "Inspect provider posture first, then public inbox intake, recent rooms, and mailbox-local collaboration feeds for this connected account.",
            summaryItems: [
              { label: "rooms", value: String(account.roomCount || 0) },
              { label: "active", value: String(account.activeRoomCount || 0) },
              { label: "mailboxes", value: String(account.mailboxCount || 0) },
              { label: "inboxes", value: String(account.inboxCount || 0) }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>Mailbox Account</h3><span class="muted code">' + escapeHtmlClient(account.accountId || state.route.accountId || "") + '</span></div><div class="panel-body">' +
          '<div class="chips">' +
          renderPill(account.provider || "provider", "") +
          renderPill(account.health || "healthy", "") +
          renderPill(account.status || "active", "") +
          '</div>' +
          '<div class="detail">' + escapeHtmlClient(account.displayName || account.emailAddress || "") + '</div>' +
          '<div class="detail">Latest activity ' + escapeHtmlClient(formatTime(account.latestActivityAt)) + '</div>' +
          '</div></div>' +
          renderProviderPanel() +
          '<div class="panel"><div class="panel-header"><h3>Public Inboxes</h3><span class="muted">' + escapeHtmlClient(inboxes.length) + ' configured</span></div><div class="panel-body">' +
          (inboxes.length > 0
            ? '<div class="list">' + inboxes.map(function(inbox) { return renderInboxCard({ inbox: inbox, items: [] }); }).join("") + '</div>'
            : '<div class="empty">No public inbox projection exists for this account yet.</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>Recent Mailboxes</h3><span class="muted">' + escapeHtmlClient(Math.min(mailboxes.length, 6)) + ' shown</span></div><div class="panel-body">' +
          (mailboxes.length > 0 ? '<div class="list">' + mailboxes.slice(0, 6).map(renderMailboxCard).join("") + '</div>' : '<div class="empty">No virtual mailboxes are visible for this account.</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>Recent Conversations</h3><span class="muted">' + escapeHtmlClient(Math.min(rooms.length, 6)) + ' shown</span></div><div class="panel-body">' +
          (rooms.length > 0 ? '<div class="list">' + rooms.slice(0, 6).map(renderRoomCard).join("") + '</div>' : '<div class="empty">No room activity has been recorded for this account yet.</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderInboxDetail() {
        const mailboxConsole = state.data && state.data.mailboxConsole ? state.data.mailboxConsole : null;
        if (!mailboxConsole || !state.route.inboxId) {
          return '<div class="empty">Select a public inbox to inspect room-level intake, ACK pressure, and work backlog.</div>';
        }
        const projection = (mailboxConsole.publicAgentInboxes || []).find(function(entry) {
          return entry.inbox && entry.inbox.inboxId === state.route.inboxId;
        });
        if (!projection) {
          return '<div class="empty">The selected inbox is not visible in the current account scope.</div>';
        }
        const inbox = projection.inbox || {};
        const items = projection.items || [];
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: "Public inbox",
            title: inbox.inboxId || state.route.inboxId || "Inbox",
            copy: "Inbox items are room-granularity workload, not raw-message tasks. That keeps ACK pressure, backlog, and delegation aligned with the room kernel.",
            summaryItems: [
              { label: "rooms", value: String(items.length) },
              { label: "ack sla", value: String(inbox.ackSlaSeconds || 0) + "s" },
              { label: "active limit", value: String(inbox.activeRoomLimit || 0) },
              { label: "burst", value: String(inbox.burstCoalesceSeconds || 0) + "s" }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>Inbox Summary</h3><span class="muted code">' + escapeHtmlClient(inbox.inboxId || state.route.inboxId) + '</span></div><div class="panel-body">' +
          '<div class="chips">' +
          renderPill(inbox.agentId || "agent", "") +
          renderPill("account " + (inbox.accountId || state.route.accountId || ""), "") +
          '</div>' +
          '<div class="detail">Select a room below to move from queue posture into full room inspection.</div>' +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>Inbox Items</h3><span class="muted">' + escapeHtmlClient(items.length) + ' rooms</span></div><div class="panel-body">' +
          (items.length > 0
            ? '<div class="mailbox-feed">' + items.map(function(item) {
                return (
                  '<button class="feed-entry" data-action="select-room" data-room-key="' + escapeHtmlClient(item.roomKey) + '" data-account-id="' + escapeHtmlClient(item.accountId || state.route.accountId || "") + '">' +
                  '<div class="meta"><span>' + escapeHtmlClient(item.state || "new") + " / " + escapeHtmlClient(item.participantRole || "participant") + '</span><span>' + escapeHtmlClient(formatTime(item.newestMessageAt)) + '</span></div>' +
                  '<div class="title code">' + escapeHtmlClient(item.roomKey) + '</div>' +
                  '<div class="detail">Unread ' + escapeHtmlClient(item.unreadCount || 0) + ", urgency " + escapeHtmlClient(item.urgency || "normal") + ", effort " + escapeHtmlClient(item.estimatedEffort || "medium") + '.</div>' +
                  '<div class="chips">' +
                  renderPill("priority " + escapeHtmlClient(item.priority || 0), "") +
                  (item.needsAckBy ? renderPill("ack by " + formatTime(item.needsAckBy), "pill--warn") : "") +
                  '</div>' +
                  '</button>'
                );
              }).join("") + '</div>'
            : '<div class="empty">No room projections are currently visible in this inbox.</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderMailboxWorkspaceHome() {
        const mailboxConsole = state.data && state.data.mailboxConsole ? state.data.mailboxConsole : null;
        if (!mailboxConsole) {
          return '<div class="empty">Select an account to inspect mailboxes and public inboxes.</div>';
        }
        const mailboxes = mailboxConsole.virtualMailboxes || [];
        const inboxes = mailboxConsole.publicAgentInboxes || [];
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: "Mailbox workspace",
            title: "Mailboxes and intake routes",
            copy: "Use this view when you want to scan internal role mailboxes, public inbox bindings, and the provider posture for one connected account.",
            summaryItems: [
              { label: "mailboxes", value: String(mailboxes.length) },
              { label: "inboxes", value: String(inboxes.length) },
              { label: "active", value: String(mailboxes.filter(function(entry) { return entry.active; }).length) },
              { label: "rooms", value: String((state.data && state.data.rooms ? state.data.rooms.length : 0)) }
            ]
          }) +
          renderProviderPanel() +
          '<div class="panel"><div class="panel-header"><h3>Public Inboxes</h3><span class="muted">' + escapeHtmlClient(inboxes.length) + ' projected</span></div><div class="panel-body">' +
          (inboxes.length > 0 ? '<div class="list">' + inboxes.map(renderInboxCard).join("") + '</div>' : '<div class="empty">No public inbox projection exists for this account yet.</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>Virtual Mailboxes</h3><span class="muted">' + escapeHtmlClient(mailboxes.length) + ' visible</span></div><div class="panel-body">' +
          (mailboxes.length > 0 ? '<div class="list">' + mailboxes.map(renderMailboxCard).join("") + '</div>' : '<div class="empty">No virtual mailbox is attached to this account yet.</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderAccountsHome() {
        const accounts = state.data && state.data.accounts ? state.data.accounts : [];
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: "Accounts",
            title: "Connected mailbox accounts",
            copy: "Select one connected mailbox account to inspect provider health, public inboxes, recent rooms, and mailbox-local collaboration state.",
            summaryItems: [
              { label: "accounts", value: String(accounts.length) },
              { label: "healthy", value: String(accounts.filter(function(account) { return (account.health || "") === "healthy"; }).length) },
              { label: "active rooms", value: String(accounts.reduce(function(total, account) { return total + Number(account.activeRoomCount || 0); }, 0)) },
              { label: "mailboxes", value: String(accounts.reduce(function(total, account) { return total + Number(account.mailboxCount || 0); }, 0)) }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>Accounts</h3><span class="muted">' + escapeHtmlClient(accounts.length) + ' connected</span></div><div class="panel-body">' +
          (accounts.length > 0 ? '<div class="list">' + accounts.map(renderAccountCard).join("") + '</div>' : '<div class="empty">No mailbox accounts have been connected yet.</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderRoomsHome() {
        const rooms = state.data && state.data.rooms ? state.data.rooms : [];
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: "Rooms",
            title: "Durable room timeline",
            copy: "Rooms are the truth boundary for external mail, internal collaboration, approvals, and gateway projection. Open one room to inspect the full timeline.",
            summaryItems: [
              { label: "rooms", value: String(rooms.length) },
              { label: "active", value: String(rooms.filter(function(room) { return (room.state || "") !== "closed"; }).length) },
              { label: "approvals", value: String(rooms.reduce(function(total, room) { return total + Number(room.pendingApprovalCount || 0); }, 0)) },
              { label: "deliveries", value: String(rooms.reduce(function(total, room) { return total + Number(room.mailboxDeliveryCount || 0); }, 0)) }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>Rooms</h3><span class="muted">' + escapeHtmlClient(rooms.length) + ' visible</span></div><div class="panel-body">' +
          (rooms.length > 0 ? '<div class="list">' + rooms.map(renderRoomCard).join("") + '</div>' : '<div class="empty">No rooms are visible under the current filters.</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderApprovalsHome() {
        const approvals = state.data && state.data.approvals ? state.data.approvals : [];
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: "Approvals",
            title: "Approval queue",
            copy: "Outbound side effects stay gated here. Review one request to inspect draft hash, room linkage, and approval lineage before delivery.",
            summaryItems: [
              { label: "requests", value: String(approvals.length) },
              { label: "requested", value: String(approvals.filter(function(approval) { return (approval.status || "") === "requested"; }).length) },
              { label: "approved", value: String(approvals.filter(function(approval) { return (approval.status || "") === "approved"; }).length) },
              { label: "rejected", value: String(approvals.filter(function(approval) { return (approval.status || "") === "rejected"; }).length) }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>Approval requests</h3><span class="muted">' + escapeHtmlClient(approvals.length) + ' visible</span></div><div class="panel-body">' +
          (approvals.length > 0 ? '<div class="list">' + approvals.map(renderApprovalCard).join("") + '</div>' : '<div class="empty">No approval requests are visible under the current filters.</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderMailboxDetail() {
        const mailboxConsole = state.data && state.data.mailboxConsole ? state.data.mailboxConsole : null;
        if (!mailboxConsole || !state.route.mailboxId) {
          return '<div class="empty">Select a mailbox to inspect mailbox-local feed and room participation.</div>';
        }
        const mailbox = (mailboxConsole.virtualMailboxes || []).find(function(entry) {
          return entry.mailboxId === state.route.mailboxId;
        });
        if (!mailbox) {
          return '<div class="empty">The selected mailbox is not visible in the current account scope.</div>';
        }
        const linkedInboxes = (mailboxConsole.publicAgentInboxes || []).filter(function(entry) {
          return "public:" + entry.inbox.agentId === mailbox.mailboxId;
        });
        const feed = state.data && state.data.mailboxFeed ? state.data.mailboxFeed : [];
        const roomMailboxView = state.data && state.data.roomMailboxView ? state.data.roomMailboxView : [];
        const roomDetail = state.data && state.data.roomDetail ? state.data.roomDetail : null;
        const roomKey = roomDetail && roomDetail.room ? roomDetail.room.roomKey : state.route.roomKey;
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: "Virtual mailbox",
            title: mailbox.mailboxId,
            copy: "This is the mailbox-local view of internal collaboration. Use it to inspect what one role mailbox can see across feeds and room-local projections.",
            summaryItems: [
              { label: "messages", value: String(mailbox.messageCount || 0) },
              { label: "rooms", value: String(mailbox.roomCount || 0) },
              { label: "inboxes", value: String(linkedInboxes.length) },
              { label: "latest room", value: String(mailbox.latestRoomKey || "n/a") }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>Mailbox Summary</h3><span class="muted code">' + escapeHtmlClient(mailbox.mailboxId) + '</span></div><div class="panel-body">' +
          '<div class="chips">' +
          renderPill(mailbox.kind || "mailbox", "") +
          (mailbox.role ? renderPill(mailbox.role, "") : "") +
          renderPill(mailbox.active ? "active" : "inactive", mailbox.active ? "pill--ok" : "pill--warn") +
          ((mailbox.originKinds || []).map(function(kind) { return renderPill(kind, ""); }).join("")) +
          '</div>' +
          '<div class="detail">Latest message ' + escapeHtmlClient(formatTime(mailbox.latestMessageAt)) + '</div>' +
          '<div class="detail">Latest room ' + escapeHtmlClient(mailbox.latestRoomKey || "n/a") + '</div>' +
          (linkedInboxes.length > 0
            ? '<div class="list">' + linkedInboxes.map(renderInboxCard).join("") + '</div>'
            : '<div class="detail">No public inbox binding is attached to this mailbox.</div>') +
          '</div></div>' +
          (roomKey
            ? '<div class="panel"><div class="panel-header"><h3>Room Thread In Mailbox</h3><span class="muted code">' + escapeHtmlClient(roomKey) + '</span></div><div class="panel-body">' +
              (roomMailboxView.length > 0
                ? '<div class="mailbox-feed">' + roomMailboxView.map(function(entry) {
                    return (
                      '<div class="feed-entry">' +
                      '<div class="meta"><span>' + escapeHtmlClient((entry.message && entry.message.kind) || "message") + " / " + escapeHtmlClient((entry.thread && entry.thread.kind) || "thread") + '</span><span>' + escapeHtmlClient(formatTime(entry.message && entry.message.createdAt)) + '</span></div>' +
                      '<div class="title">' + escapeHtmlClient((entry.message && entry.message.subject) || "Message") + '</div>' +
                      '<div class="detail code">' + escapeHtmlClient(((entry.message && entry.message.fromMailboxId) || "?") + " -> " + (((entry.message && entry.message.toMailboxIds) || []).join(", "))) + '</div>' +
                      '</div>'
                    );
                  }).join("") + '</div>'
                : '<div class="empty">No projected entries for this room are visible in the selected mailbox.</div>') +
              '</div></div>'
            : '') +
          '<div class="panel"><div class="panel-header"><h3>Mailbox Feed</h3><span class="muted">' + escapeHtmlClient(feed.length) + ' items loaded</span></div><div class="panel-body">' +
          (feed.length > 0 ? '<div class="mailbox-feed">' + feed.map(renderFeedEntry).join("") + '</div>' : '<div class="empty">No messages are currently projected into the selected mailbox.</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderRoomDetail() {
        const roomDetail = state.data && state.data.roomDetail ? state.data.roomDetail : null;
        if (!roomDetail || !roomDetail.room) {
          return '<div class="empty">Select a room to inspect its timeline, mailbox participation, approvals, and gateway trace.</div>';
        }
        const room = roomDetail.room;
        const trace = roomDetail.gatewayTrace || {};
        const tasks = roomDetail.tasks || [];
        const timeline = roomDetail.timeline || [];
        const virtualMessages = roomDetail.virtualMessages || [];
        const mailboxDeliveries = roomDetail.mailboxDeliveries || [];
        const outboxIntents = roomDetail.outboxIntents || [];
        const hostIntegration = state.data && state.data.workspace ? state.data.workspace.hostIntegration || null : null;
        const integrationApis = hostIntegration && hostIntegration.apis ? hostIntegration.apis : null;
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: "Room",
            title: room.latestSubject || room.roomKey,
            copy: "Room detail is the durable truth view: revisioned room state, mailbox participation, gateway outcomes, task tracking, and the replay-visible timeline all stay here.",
            summaryItems: [
              { label: "revision", value: String(room.revision || 0) },
              { label: "tasks", value: String(roomDetail.counts && roomDetail.counts.taskNodes ? roomDetail.counts.taskNodes : 0) },
              { label: "messages", value: String(roomDetail.counts && roomDetail.counts.virtualMessages ? roomDetail.counts.virtualMessages : 0) },
              { label: "deliveries", value: String(roomDetail.counts && roomDetail.counts.mailboxDeliveries ? roomDetail.counts.mailboxDeliveries : 0) }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>Room Summary</h3><span class="muted code">' + escapeHtmlClient(room.roomKey) + '</span></div><div class="panel-body">' +
          '<div class="chips">' +
          renderPill(room.state || "open", "") +
          renderPill("account " + (room.accountId || ""), "") +
          (room.mailTaskKind ? renderPill("task " + room.mailTaskKind, "") : "") +
          (room.mailTaskStage ? renderPill("stage " + room.mailTaskStage, "") : "") +
          renderPill(String(room.pendingApprovalCount || 0) + " approvals", Number(room.pendingApprovalCount || 0) > 0 ? "pill--warn" : "") +
          '</div>' +
          '<div class="detail">Front agent ' + escapeHtmlClient(room.frontAgentId || room.frontAgentAddress || "n/a") + '</div>' +
          ((room.publicAgentAddresses || []).length > 0 || (room.publicAgentIds || []).length > 0 || (room.collaboratorAgentAddresses || []).length > 0 || (room.collaboratorAgentIds || []).length > 0 || (room.summonedRoles || []).length > 0
            ? '<div><div class="section-label">Routing</div><div class="chips">' +
              (room.publicAgentIds || []).map(function(agentId) { return renderPill("public " + agentId, ""); }).join("") +
              (room.publicAgentAddresses || []).map(function(address) { return renderPill("public " + address, ""); }).join("") +
              (room.collaboratorAgentIds || []).map(function(agentId) { return renderPill("collab " + agentId, ""); }).join("") +
              (room.collaboratorAgentAddresses || []).map(function(address) { return renderPill("collab " + address, ""); }).join("") +
              (room.summonedRoles || []).map(function(role) { return renderPill("role " + role, ""); }).join("") +
              '</div></div>'
            : '') +
          '<div class="section-label">Mailboxes</div><div class="chips">' + ((roomDetail.mailboxes || []).map(function(mailbox) { return renderMailboxChip(mailbox.mailboxId, room.roomKey); }).join("") || '<span class="muted">No mailbox participation recorded.</span>') + '</div>' +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>Gateway Projection</h3><span class="muted">' + escapeHtmlClient(trace.projectedMessageCount || 0) + ' projected messages</span></div><div class="panel-body">' +
          '<div class="detail-grid">' +
          renderMetric("Control planes", (trace.controlPlanes || []).length) +
          renderMetric("Session keys", (trace.sessionKeys || []).length) +
          renderMetric("Projected deliveries", trace.projectedDeliveryCount || 0) +
          renderMetric("Projected outcomes", trace.projectedOutcomeCount || 0) +
          '</div>' +
          '<div class="chips">' +
          (trace.controlPlanes || []).map(function(value) { return renderPill(value, ""); }).join("") +
          (trace.outcomeModes || []).map(function(value) { return renderPill(value, ""); }).join("") +
          ((trace.pendingDispatchCount || 0) > 0 ? renderPill("pending " + trace.pendingDispatchCount, "pill--warn") : "") +
          ((trace.failedDispatchCount || 0) > 0 ? renderPill("failed " + trace.failedDispatchCount, "pill--danger") : "") +
          '</div>' +
          ((trace.outcomeProjections || []).length > 0
            ? '<div class="timeline-list">' + trace.outcomeProjections.map(function(entry) {
                return (
                  '<div class="timeline-entry">' +
                  '<div class="meta"><span>' + escapeHtmlClient(entry.mode || "mode") + '</span><span>' + escapeHtmlClient(formatTime(entry.projectedAt)) + '</span></div>' +
                  '<div class="title code">' + escapeHtmlClient(entry.messageId || "") + '</div>' +
                  '<div class="chips">' + renderPill(entry.dispatchStatus || "queued", "") + '</div>' +
                  '<div class="detail">session ' + escapeHtmlClient(entry.sessionKey || "") + '</div>' +
                  '</div>'
                );
              }).join("") + '</div>'
            : '<div class="detail">No Gateway outcome projection has been recorded for this room yet.</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>Gateway And Mail Sync</h3><span class="muted">governed bridge</span></div><div class="panel-body">' +
          '<div class="detail">Gateway data can be imported into internal mail, and selected room messages can be synchronized back into governed email outbox delivery.</div>' +
          '<div class="detail-grid">' +
          renderMetric("Gateway ingress", hostIntegration && hostIntegration.capabilities && hostIntegration.capabilities.gatewayIngress ? "enabled" : "off") +
          renderMetric("Email sync", hostIntegration && hostIntegration.capabilities && hostIntegration.capabilities.outboundMailSync ? "enabled" : "off") +
          renderMetric("Gateway dispatch", roomDetail.boundaries && roomDetail.boundaries.automaticGatewayRoundTrip ? "automatic" : "manual") +
          renderMetric("Approval gate", Number(room.pendingApprovalCount || 0) > 0 ? "pending" : "ready") +
          '</div>' +
          (integrationApis
            ? '<div class="detail code">' + escapeHtmlClient('POST ' + integrationApis.gatewayHistoryImport + ' | POST ' + String(integrationApis.roomMessageEmailSync || '').replace(':roomKey', room.roomKey).replace(':messageId', '<messageId>')) + '</div>'
            : '') +
          '<div class="detail code">mailctl gateway import-history &lt;sessionKey&gt; ' + escapeHtmlClient(room.roomKey) + ' history.json</div>' +
          '<div class="detail code">mailctl gateway sync-mail ' + escapeHtmlClient(room.roomKey) + ' &lt;messageId&gt;</div>' +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>Mail Tasks</h3><span class="muted">' + escapeHtmlClient(tasks.length) + ' tracked</span></div><div class="panel-body">' +
          (tasks.length > 0
            ? '<div class="timeline-list">' + tasks.map(function(task) {
                return (
                  '<div class="timeline-entry">' +
                  '<div class="meta"><span>r' + escapeHtmlClient(task.revision || 0) + '</span><span>' + escapeHtmlClient(task.status || "open") + '</span></div>' +
                  '<div class="title">' + escapeHtmlClient(task.title || task.kind || "Task") + '</div>' +
                  '<div class="chips">' + renderPill(task.kind || "task", "") + renderPill(task.stage || "stage", "") + '</div>' +
                  (task.summary ? '<div class="detail">' + escapeHtmlClient(task.summary) + '</div>' : '') +
                  '</div>'
                );
              }).join("") + '</div>'
            : '<div class="empty">No mail task classification has been recorded for this room yet.</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>Virtual Mail</h3><span class="muted">' + escapeHtmlClient(virtualMessages.length) + ' messages</span></div><div class="panel-body">' +
          '<div class="detail">This is the internal collaboration chain for the room: single-parent replies, mailbox routing, and origin kinds are visible here without reopening raw transcripts.</div>' +
          (virtualMessages.length > 0
            ? '<div class="timeline-list">' + virtualMessages.slice(0, 24).map(renderVirtualMessageEntry).join("") + '</div>'
            : '<div class="empty">No virtual mail has been recorded for this room yet.</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>Mailbox Deliveries</h3><span class="muted">' + escapeHtmlClient(mailboxDeliveries.length) + ' deliveries</span></div><div class="panel-body">' +
          '<div class="detail">Delivery rows show where each internal message was queued, leased, consumed, or marked stale inside the virtual mail plane.</div>' +
          (mailboxDeliveries.length > 0
            ? '<div class="timeline-list">' + mailboxDeliveries.slice(0, 24).map(renderDeliveryEntry).join("") + '</div>'
            : '<div class="empty">No mailbox delivery rows have been recorded for this room yet.</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>Governed Outbox</h3><span class="muted">' + escapeHtmlClient(outboxIntents.length) + ' intents</span></div><div class="panel-body">' +
          '<div class="detail">Only this governed outbox path can produce real external email. Review it alongside approvals when checking what may leave the room.</div>' +
          (outboxIntents.length > 0
            ? '<div class="timeline-list">' + outboxIntents.slice(0, 12).map(renderOutboxEntry).join("") + '</div>'
            : '<div class="empty">No outbox intents have been recorded for this room yet.</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>Timeline</h3><span class="muted">' + escapeHtmlClient(timeline.length) + ' entries</span></div><div class="panel-body">' +
          (timeline.length > 0 ? '<div class="timeline-list">' + timeline.slice(0, 30).map(renderTimelineEntry).join("") + '</div>' : '<div class="empty">No room timeline entries have been recorded yet.</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderSidePanels() {
        const accounts = state.data && state.data.accounts ? state.data.accounts : [];
        const rooms = state.data && state.data.rooms ? state.data.rooms : [];
        const approvals = state.data && state.data.approvals ? state.data.approvals : [];
        const mailboxConsole = state.data && state.data.mailboxConsole ? state.data.mailboxConsole : null;
        const mailboxes = mailboxConsole ? mailboxConsole.virtualMailboxes || [] : [];
        const inboxes = mailboxConsole ? mailboxConsole.publicAgentInboxes || [] : [];
        return (
          '<div class="mail-workbench-side">' +
          '<div class="panel"><div class="panel-header"><h3>Accounts</h3><span class="muted">' + escapeHtmlClient(accounts.length) + '</span></div><div class="panel-body">' +
          (accounts.length > 0 ? '<div class="list">' + accounts.slice(0, 8).map(renderAccountCard).join("") + '</div>' : '<div class="empty">No mailbox accounts have been connected yet.</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>Rooms</h3><span class="muted">' + escapeHtmlClient(rooms.length) + '</span></div><div class="panel-body">' +
          (rooms.length > 0 ? '<div class="list">' + rooms.slice(0, 8).map(renderRoomCard).join("") + '</div>' : '<div class="empty">No rooms are visible under the current filters.</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>Approvals</h3><span class="muted">' + escapeHtmlClient(approvals.length) + '</span></div><div class="panel-body">' +
          (approvals.length > 0 ? '<div class="list">' + approvals.slice(0, 8).map(renderApprovalCard).join("") + '</div>' : '<div class="empty">No pending approval requests are visible right now.</div>') +
          '</div></div>' +
          (mailboxes.length > 0
            ? '<div class="panel"><div class="panel-header"><h3>Mailboxes</h3><span class="muted">' + escapeHtmlClient(mailboxes.length) + '</span></div><div class="panel-body"><div class="list">' + mailboxes.slice(0, 8).map(renderMailboxCard).join("") + '</div></div></div>'
            : '') +
          (inboxes.length > 0
            ? '<div class="panel"><div class="panel-header"><h3>Public Inboxes</h3><span class="muted">' + escapeHtmlClient(inboxes.length) + '</span></div><div class="panel-body"><div class="list">' + inboxes.slice(0, 8).map(renderInboxCard).join("") + '</div></div></div>'
            : '') +
          '</div>'
        );
      }

      function renderMainContent() {
        if (state.loading) {
          return '<div class="loading">Loading mail workspace…</div>';
        }
        if (state.error) {
          return '<div class="error-banner">' + escapeHtmlClient(state.error) + '</div>';
        }
        if (!state.data) {
          return '<div class="empty">No workbench payload was returned.</div>';
        }
        let primary = renderConnectHome();
        if (state.route.mailboxId) {
          primary = renderMailboxDetail();
        } else if (state.route.inboxId) {
          primary = renderInboxDetail();
        } else if (state.route.mode === "mailboxes") {
          primary = renderMailboxWorkspaceHome();
        } else if (state.route.mode === "accounts" && state.route.accountId && !state.route.roomKey) {
          primary = renderAccountDetail();
        } else if (state.route.roomKey) {
          primary = renderRoomDetail();
        } else if (state.route.mode === "accounts") {
          primary = renderAccountsHome();
        } else if (state.route.mode === "rooms") {
          primary = renderRoomsHome();
        } else if (state.route.mode === "approvals") {
          primary = renderApprovalsHome();
        } else if (state.route.accountId) {
          primary = renderAccountDetail();
        }
        return '<div class="mail-workbench-grid">' + primary + renderSidePanels() + '</div>';
      }

      function updateShellClasses() {
        const shell = document.getElementById("app-shell");
        const sidebar = document.getElementById("sidebar");
        if (!shell || !sidebar) return;
        shell.classList.toggle("shell--nav-collapsed", state.navCollapsed);
        shell.classList.toggle("shell--nav-drawer-open", state.navDrawerOpen);
        sidebar.classList.toggle("sidebar--collapsed", state.navCollapsed);
      }

      function renderNav() {
        const navRoot = document.getElementById("nav-items");
        if (!navRoot) return;
        const workspace = state.data && state.data.workspace ? state.data.workspace : null;
        const tabs = workspace && Array.isArray(workspace.tabs) ? workspace.tabs : [];
        navRoot.innerHTML = tabs.map(function(tab) {
          const icon = ICONS[tab.id] || ICONS.mail;
          return (
            '<a class="nav-item ' + (tab.active ? 'nav-item--active' : '') + '" href="' + escapeHtmlClient(tab.href) + '">' +
            '<span class="nav-item__icon" aria-hidden="true">' + icon + '</span>' +
            '<span class="nav-item__text">' + escapeHtmlClient(tab.label) + '</span>' +
            '</a>'
          );
        }).join("");
      }

      function renderHeader() {
        const workspace = state.data && state.data.workspace ? state.data.workspace : null;
        const activeTab = workspace && workspace.activeTab ? workspace.activeTab : "mail";
        const pageTitle = document.getElementById("page-title");
        const pageSub = document.getElementById("page-sub");
        const breadcrumb = document.getElementById("breadcrumb-current");
        const pageMeta = document.getElementById("page-meta");
        const accountsPill = document.getElementById("accounts-pill");
        const roomsPill = document.getElementById("rooms-pill");
        const approvalsPill = document.getElementById("approvals-pill");
        if (pageTitle) {
          pageTitle.textContent =
            activeTab === "rooms" ? "Room Workbench" :
            activeTab === "mailboxes" ? "Mailbox Workbench" :
            activeTab === "accounts" ? "Mailbox Accounts" :
            activeTab === "approvals" ? "Approvals" :
            "Mail Workbench";
        }
        if (pageSub) {
          pageSub.textContent =
            state.route.roomKey
              ? "Inspect one room, its mailbox participation, approvals, and gateway projection trace."
              : state.route.mailboxId
                ? "Inspect one mailbox feed and the room-local projection visible inside it."
                : state.route.accountId
                  ? "Inspect provider state, public inboxes, rooms, and mailboxes for one connected account."
                  : "OpenClaw-style shell with MailClaws runtime data rendered directly in the workbench.";
        }
        if (breadcrumb) {
          breadcrumb.textContent =
            state.route.roomKey || state.route.mailboxId || state.route.inboxId || state.route.accountId || "Mail";
        }
        if (pageMeta) {
          const bits = [];
          if (state.route.accountId) bits.push(renderPill("account " + state.route.accountId, ""));
          if (state.route.roomKey) bits.push(renderPill("room " + state.route.roomKey, ""));
          if (state.route.mailboxId) bits.push(renderPill("mailbox " + state.route.mailboxId, ""));
          if (state.route.inboxId) bits.push(renderPill("inbox " + state.route.inboxId, ""));
          if (workspace && workspace.hostIntegration && workspace.hostIntegration.capabilities && workspace.hostIntegration.capabilities.internalMail) {
            bits.push(renderPill("internal mail", "pill--ok"));
          }
          pageMeta.innerHTML = bits.join("");
        }
        if (accountsPill) accountsPill.textContent = "accounts " + String((state.data && state.data.accounts ? state.data.accounts.length : 0));
        if (roomsPill) roomsPill.textContent = "rooms " + String((state.data && state.data.rooms ? state.data.rooms.length : 0));
        if (approvalsPill) approvalsPill.textContent = "approvals " + String((state.data && state.data.approvals ? state.data.approvals.length : 0));
      }

      function render() {
        updateShellClasses();
        renderNav();
        renderHeader();
        const content = document.getElementById("content-root");
        if (content) {
          content.innerHTML = renderMainContent();
        }
      }

      function syncUrl(replace) {
        const href = hrefForRoute(state.route);
        const current = window.location.pathname + window.location.search;
        if (href !== current) {
          if (replace) {
            window.history.replaceState({}, "", href);
          } else {
            window.history.pushState({}, "", href);
          }
        }
        notifyHost("mailclaws.workbench.route", {
          href: href,
          routeMode: state.route.mode || "connect",
          accountId: state.route.accountId,
          roomKey: state.route.roomKey,
          mailboxId: state.route.mailboxId
        });
      }

      async function refresh(replaceUrl) {
        state.loading = true;
        state.error = null;
        render();
        try {
          const params = new URLSearchParams();
          if (state.route.mode) params.set("mode", state.route.mode);
          if (state.route.accountId) params.set("accountId", state.route.accountId);
          if (state.route.roomKey) params.set("roomKey", state.route.roomKey);
          if (state.route.mailboxId) params.set("mailboxId", state.route.mailboxId);
          if (state.route.status) params.set("roomStatuses", state.route.status);
          if (state.route.originKind) params.set("originKinds", state.route.originKind);
          if (state.route.approvalStatus) params.set("approvalStatuses", state.route.approvalStatus);
          const payload = await requestJson((config.apiBasePath || "/api") + "/console/workbench" + (params.toString() ? "?" + params.toString() : ""));
          state.data = payload;
          if (payload && payload.selection) {
            if (state.route.accountId) {
              state.route.accountId = payload.selection.accountId || state.route.accountId;
            }
            if (state.route.roomKey) {
              state.route.roomKey = payload.selection.roomKey || state.route.roomKey;
            }
            if (state.route.mailboxId) {
              state.route.mailboxId = payload.selection.mailboxId || state.route.mailboxId;
            }
          }
          if (!state.route.mode && payload && payload.workspace && payload.workspace.activeTab) {
            state.route.mode = payload.workspace.activeTab;
          }
          syncUrl(Boolean(replaceUrl));
          notifyHost("mailclaws.workbench.state", {
            routeMode: state.route.mode || "connect",
            accountCount: payload && payload.accounts ? payload.accounts.length : 0,
            roomCount: payload && payload.rooms ? payload.rooms.length : 0,
            approvalCount: payload && payload.approvals ? payload.approvals.length : 0,
            selectedAccountId: state.route.accountId,
            selectedRoomKey: state.route.roomKey,
            selectedMailboxId: state.route.mailboxId,
            hostIntegration: payload && payload.workspace ? payload.workspace.hostIntegration : null
          });
        } catch (error) {
          state.error = error instanceof Error ? error.message : String(error);
        } finally {
          state.loading = false;
          render();
        }
      }

      function navigate(nextRoute) {
        state.route = {
          mode: nextRoute.mode || state.route.mode || "connect",
          accountId: nextRoute.accountId ?? null,
          inboxId: nextRoute.inboxId ?? null,
          roomKey: nextRoute.roomKey ?? null,
          mailboxId: nextRoute.mailboxId ?? null,
          status: state.route.status || "",
          originKind: state.route.originKind || "",
          approvalStatus: state.route.approvalStatus || ""
        };
        if (state.route.mailboxId || state.route.inboxId) {
          state.route.mode = "mailboxes";
        } else if (state.route.roomKey) {
          state.route.mode = "rooms";
        } else if (state.route.accountId) {
          state.route.mode = "accounts";
        }
        void refresh(false);
      }

      function applyThemeMode(mode) {
        document.documentElement.setAttribute("data-theme-mode", mode);
        document.querySelectorAll("[data-theme-mode]").forEach(function(button) {
          button.classList.toggle("topbar-theme-mode__btn--active", button.getAttribute("data-theme-mode") === mode);
        });
      }

      function readCustomAgentPayload(target) {
        const root = target.closest(".panel") || document;
        function readField(name) {
          const element = root.querySelector('[data-custom-agent-field="' + name + '"]');
          return element && "value" in element ? String(element.value || "").trim() : "";
        }
        return {
          agentId: readField("agentId"),
          displayName: readField("displayName"),
          publicMailboxId: readField("publicMailboxId"),
          collaboratorAgentIds: readField("collaboratorAgentIds"),
          purpose: readField("purpose")
        };
      }

      document.addEventListener("click", function(event) {
        const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
        if (!target) return;
        const action = target.getAttribute("data-action");
        if (action === "apply-agent-template") {
          event.preventDefault();
          const templateId = target.getAttribute("data-template-id");
          const accountId = target.getAttribute("data-account-id");
          const tenantId = target.getAttribute("data-tenant-id");
          if (!templateId || !accountId) {
            return;
          }
          state.loading = true;
          state.error = "";
          render();
          void requestJson((config.apiBasePath || "/api") + "/console/agent-templates/" + encodeURIComponent(templateId) + "/apply", {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              accountId: accountId,
              tenantId: tenantId || accountId
            })
          })
            .then(function() {
              return refresh(true);
            })
            .catch(function(error) {
              state.error = error instanceof Error ? error.message : String(error);
            })
            .finally(function() {
              state.loading = false;
              render();
            });
          return;
        }
        if (action === "create-custom-agent") {
          event.preventDefault();
          const accountId = target.getAttribute("data-account-id");
          const tenantId = target.getAttribute("data-tenant-id");
          const payload = readCustomAgentPayload(target);
          if (!accountId || !payload.agentId) {
            state.error = "agentId and accountId are required";
            render();
            return;
          }
          state.loading = true;
          state.error = "";
          render();
          void requestJson((config.apiBasePath || "/api") + "/console/agents", {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              accountId: accountId,
              tenantId: tenantId || accountId,
              agentId: payload.agentId,
              displayName: payload.displayName || undefined,
              publicMailboxId: payload.publicMailboxId || undefined,
              collaboratorAgentIds: payload.collaboratorAgentIds
                ? payload.collaboratorAgentIds.split(",").map(function(value) { return value.trim(); }).filter(Boolean)
                : undefined,
              purpose: payload.purpose || undefined
            })
          })
            .then(function() {
              return refresh(true);
            })
            .catch(function(error) {
              state.error = error instanceof Error ? error.message : String(error);
            })
            .finally(function() {
              state.loading = false;
              render();
            });
          return;
        }
        if (action === "select-account") {
          event.preventDefault();
          navigate({
            accountId: target.getAttribute("data-account-id"),
            inboxId: null,
            roomKey: null,
            mailboxId: null,
            mode: "accounts"
          });
        }
        if (action === "select-room") {
          event.preventDefault();
          navigate({
            accountId: target.getAttribute("data-account-id") || state.route.accountId,
            inboxId: null,
            roomKey: target.getAttribute("data-room-key"),
            mailboxId: null,
            mode: "rooms"
          });
        }
        if (action === "select-mailbox") {
          event.preventDefault();
          navigate({
            accountId: target.getAttribute("data-account-id") || state.route.accountId,
            inboxId: null,
            roomKey: target.getAttribute("data-room-key") || null,
            mailboxId: target.getAttribute("data-mailbox-id"),
            mode: "mailboxes"
          });
        }
        if (action === "select-inbox") {
          event.preventDefault();
          navigate({
            accountId: target.getAttribute("data-account-id") || state.route.accountId,
            inboxId: target.getAttribute("data-inbox-id"),
            roomKey: null,
            mailboxId: null,
            mode: "mailboxes"
          });
        }
      });

      document.addEventListener("click", function(event) {
        const anchor = event.target instanceof Element ? event.target.closest("a.nav-item") : null;
        if (!anchor) return;
        const href = anchor.getAttribute("href");
        if (!href || !href.startsWith("/")) return;
        event.preventDefault();
        const nextUrl = new URL(href, window.location.origin);
        state.route = parseRoute(nextUrl.pathname, nextUrl.search);
        void refresh(false);
      });

      const refreshButton = document.getElementById("refresh-button");
      if (refreshButton) {
        refreshButton.addEventListener("click", function() {
          void refresh(true);
        });
      }

      const topbarNavToggle = document.getElementById("topbar-nav-toggle");
      if (topbarNavToggle) {
        topbarNavToggle.addEventListener("click", function() {
          state.navDrawerOpen = !state.navDrawerOpen;
          render();
        });
      }

      const navCollapseToggle = document.getElementById("nav-collapse-toggle");
      if (navCollapseToggle) {
        navCollapseToggle.addEventListener("click", function() {
          state.navCollapsed = !state.navCollapsed;
          render();
        });
      }

      const navBackdrop = document.getElementById("nav-backdrop");
      if (navBackdrop) {
        navBackdrop.addEventListener("click", function() {
          state.navDrawerOpen = false;
          render();
        });
      }

      document.querySelectorAll("[data-theme-mode]").forEach(function(button) {
        button.addEventListener("click", function() {
          applyThemeMode(button.getAttribute("data-theme-mode") || "dark");
        });
      });

      window.addEventListener("popstate", function() {
        state.route = parseRoute(window.location.pathname, window.location.search);
        void refresh(true);
      });

      state.route = parseRoute(window.location.pathname, window.location.search);
      applyThemeMode(document.documentElement.getAttribute("data-theme-mode") || "dark");
      notifyHost("mailclaws.workbench.ready", {
        embeddedShell: Boolean(config.embeddedShell),
        href: window.location.pathname + window.location.search
      });
      void refresh(true);
    </script>
  </body>
</html>`;
}
