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

.topbar-locale {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--bg-elevated) 78%, transparent);
}

.topbar-locale__btn {
  min-width: 42px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
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

.topbar-locale__btn:hover {
  color: var(--text);
  background: var(--bg-hover);
}

.topbar-locale__btn--active {
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
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

.mail-workbench-main {
  display: grid;
  gap: 16px;
}

.workspace-split {
  display: grid;
  gap: 16px;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  align-items: start;
}

.workspace-split__main,
.workspace-split__side {
  display: grid;
  gap: 16px;
}

.stack {
  display: grid;
  gap: 12px;
}

.list-card__actions,
.timeline-entry__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.btn.danger {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 30%, var(--border));
}

.btn.danger:hover {
  background: color-mix(in srgb, var(--danger) 10%, transparent);
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
  position: relative;
  overflow: hidden;
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

.timeline-entry.active {
  border-color: color-mix(in srgb, var(--accent) 26%, transparent);
  background: color-mix(in srgb, var(--accent-subtle) 86%, var(--bg-elevated) 14%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 10%, transparent),
    0 10px 22px color-mix(in srgb, black 10%, transparent);
}

.source-mail-list {
  display: grid;
  gap: 12px;
}

.source-mail-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
  overflow: hidden;
}

.source-mail-card[open] {
  border-color: color-mix(in srgb, var(--accent) 20%, transparent);
  box-shadow: var(--shadow-sm);
}

.source-mail-card > summary {
  list-style: none;
  cursor: pointer;
  padding: 14px;
}

.source-mail-card > summary::-webkit-details-marker {
  display: none;
}

.source-mail-card__summary {
  display: grid;
  gap: 10px;
}

.source-mail-card__meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.source-mail-card__body {
  padding: 0 14px 14px;
  display: grid;
  gap: 12px;
  border-top: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
}

.source-mail-card__grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.source-mail-card__field {
  display: grid;
  gap: 6px;
}

.mail-body {
  margin: 0;
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
  background: color-mix(in srgb, var(--bg) 34%, transparent);
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  font: 400 13px/1.6 var(--font-body);
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

.list-card--working::after {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--room-progress, 42%);
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--ok) 18%, transparent),
    color-mix(in srgb, var(--ok) 8%, transparent)
  );
  border-right: 1px solid color-mix(in srgb, var(--ok) 22%, transparent);
  pointer-events: none;
}

.list-card--working > * {
  position: relative;
  z-index: 1;
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

.setup-stack {
  display: grid;
  gap: 14px;
}

.setup-note {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-content) 82%, transparent);
  padding: 12px 14px;
}

.advanced-settings {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-content) 82%, transparent);
  padding: 12px 14px;
}

.advanced-settings > summary {
  cursor: pointer;
  color: var(--text-strong);
  font-weight: 600;
  list-style: none;
}

.advanced-settings > summary::-webkit-details-marker {
  display: none;
}

.advanced-settings[open] > summary {
  margin-bottom: 12px;
}

.setup-note--ok {
  border-color: color-mix(in srgb, var(--ok) 24%, transparent);
  background: color-mix(in srgb, var(--ok) 10%, var(--bg-content) 90%);
}

.setup-note--warn {
  border-color: color-mix(in srgb, var(--warn) 24%, transparent);
  background: color-mix(in srgb, var(--warn) 10%, var(--bg-content) 90%);
}

.setup-note--danger {
  border-color: color-mix(in srgb, var(--danger) 22%, transparent);
  background: color-mix(in srgb, var(--danger-subtle) 80%, var(--bg-content) 20%);
}

.field-note {
  margin-top: 6px;
  color: var(--muted);
  font-size: 12px;
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

  .workspace-hero__grid {
    grid-template-columns: 1fr;
  }

  .workspace-split {
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
            <div class="topbar-locale" role="group" aria-label="Language">
              <button type="button" class="topbar-locale__btn topbar-locale__btn--active" data-locale="en" aria-label="English">EN</button>
              <button type="button" class="topbar-locale__btn" data-locale="zh-CN" aria-label="中文">中文</button>
              <button type="button" class="topbar-locale__btn" data-locale="fr" aria-label="Français">FR</button>
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
        home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5"></path><path d="M5 10.5V20h14v-9.5"></path><path d="M9 20v-6h6v6"></path></svg>',
        accounts: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
        rooms: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
        agents: '<svg viewBox="0 0 24 24"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"></path><path d="M4 20a8 8 0 0 1 16 0"></path><path d="M19 8h2"></path><path d="M20 7v2"></path></svg>',
        skills: '<svg viewBox="0 0 24 24"><path d="m14 7 3-3 3 3"></path><path d="M17 4v10"></path><path d="M10 17 7 20l-3-3"></path><path d="M7 20V10"></path><path d="M14 17h7"></path><path d="M3 7h7"></path></svg>',
        mailboxes: '<svg viewBox="0 0 24 24"><path d="M3 7h18"></path><path d="M5 7l2-3h10l2 3"></path><path d="M5 7v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7"></path><path d="M9 11h6"></path></svg>'
      };

      const state = {
        loading: true,
        error: null,
        data: null,
        runtime: null,
        connect: null,
        locale: "en",
        themeMode: "dark",
        navCollapsed: false,
        navDrawerOpen: false,
        route: null
      };

      const LOCALE_STORAGE_KEY = "mailclaws.workbench.locale";
      const THEME_STORAGE_KEY = "mailclaws.workbench.theme";

      const TRANSLATIONS = {
        en: {
          workbench: "Workbench",
          home: "Home",
          accounts: "External Accounts",
          rooms: "Room",
          agents: "Agent",
          skills: "Skill",
          pageHome: "Home",
          pageAccounts: "External Accounts",
          pageRooms: "Room Workbench",
          pageAgents: "Agent Directory",
          pageSkills: "Skill Library",
          pageMailboxes: "Mailbox Workbench",
          homeTitle: "MailClaws workbench",
          homeCopy: "External email enters by room. Rooms hold working memory, virtual mail, attachments, and shared resources. Agents provide soul and reusable skills around that room kernel.",
          openRooms: "Open Room",
          connectMailbox: "Connect Mailbox",
          systemSnapshot: "System Snapshot",
          coreSurfaces: "core surfaces",
          recentRooms: "Recent Rooms",
          recentShown: "{count} shown",
          noRoomsYet: "No rooms are visible yet.",
          accountsTitle: "Connected external mailboxes",
          accountsCopy: "Connect real IMAP, SMTP, OAuth, or forward-ingest accounts here. External mail lands in new rooms, and replies return through the existing room.",
          roomsTitle: "Room is the core work surface",
          roomsCopy: "Each new external email creates a new room. Replies stay in the same room. A room holds shared virtual mail, attachments, notes, and recruited agents for the job.",
          agentsTitle: "Agent templates and souls",
          agentsCopy: "Agents do not carry per-room working context. This page manages reusable templates, durable SOUL.md state, mailbox bindings, and the agent roster that rooms can recruit.",
          skillsTitle: "Reusable agent skills",
          skillsCopy: "Skills stay outside room working memory. Install them onto durable agents so rooms can recruit the same behavior repeatedly without copying prompts into every thread.",
          connectPanel: "Connect A Mailbox",
          loadSetup: "Load Setup",
          continueWith: "Continue With {provider}",
          saveMailboxConfig: "Save Mailbox Config",
          installOrReuseSkill: "Install Or Reuse Skill",
          installFromSource: "Install From Source",
          createAgent: "Create Agent",
          agentTemplates: "Agent Templates",
          customAgent: "Custom Agent",
          agentDirectory: "Agent Directory",
          headcount: "Headcount",
          skillsPanel: "Skills",
          accountsPanel: "Accounts",
          providerState: "Provider State",
          mailboxAccount: "Mailbox Account",
          publicInboxes: "Public Inboxes",
          recentMailboxes: "Recent Mailboxes",
          recentConversations: "Recent Conversations",
          roomsPanel: "Rooms",
          approvalQueue: "Approval queue",
          approvalRequests: "Approval requests",
          inboxSummary: "Inbox Summary",
          inboxItems: "Inbox Items",
          mailboxWorkspace: "Mailbox workspace",
          mailboxesAndRoutes: "Mailboxes and intake routes",
          virtualMailboxes: "Virtual Mailboxes",
          roomSummary: "Room Summary",
          sharedResources: "Shared Resources",
          tracked: "{count} tracked",
          languageLabel: "Language",
          statusOverview: "Overview of external accounts, rooms, agents, and reusable skills.",
          statusAccount: "Inspect provider state, public inboxes, rooms, and mailboxes for one connected account.",
          statusRoom: "Inspect one room, its mailbox participation, approvals, and gateway projection trace.",
          statusMailbox: "Inspect one mailbox feed and the room-local projection visible inside it.",
          statusAgents: "Apply templates, inspect soul files, and manage the durable agent roster.",
          statusSkills: "Inspect and install reusable markdown skills onto durable agents.",
          connectedCount: "{count} connected",
          configuredCount: "{count} configured",
          projectedCount: "{count} projected",
          shownCount: "{count} shown",
          visibleCount: "{count} visible",
          visibleSkillsCount: "{count} visible skills",
          durableAgentsCount: "{count} durable agents",
          presetsCount: "{count} presets",
          targetAgentsCount: "{count} target agents",
          latestActivity: "Latest activity",
          latestMessage: "Latest message",
          latestRoom: "Latest room",
          latest: "Latest",
          processed: "Processed",
          updated: "Updated",
          noProjectedRooms: "No projected rooms yet",
          loadingWorkspace: "Loading mail workspace…",
          noWorkbenchPayload: "No workbench payload was returned.",
          providerEmpty: "Select an account to inspect provider watch, cursors, and mailbox projection state.",
          providerObserveCopy: "MailClaws keeps the runtime kernel as truth. Provider watch and mailbox projections are observable here, not authoritative.",
          ingress: "Ingress",
          outbound: "Outbound",
          watch: "Watch",
          lastEvent: "Last event",
          selectAccountHint: "Select an account to inspect provider state, inboxes, rooms, and mailbox projections.",
          noPublicInboxProjection: "No public inbox projection exists for this account yet.",
          noVirtualMailboxesForAccount: "No virtual mailboxes are visible for this account.",
          noAccountRoomActivity: "No room activity has been recorded for this account yet.",
          selectInboxHint: "Select a public inbox to inspect room-level intake, ACK pressure, and work backlog.",
          inboxNotVisible: "The selected inbox is not visible in the current account scope.",
          publicInbox: "Public Inbox",
          inboxCopy: "Inbox items are room-level workload, not raw-message tasks. That keeps ACK pressure, backlog, and delegation aligned with the room kernel.",
          selectRoomHint: "Select a room below to move from queue posture into full room inspection.",
          noInboxRoomProjection: "No room projections are currently visible in this inbox.",
          selectMailboxHint: "Select a mailbox to inspect mailbox-local feed and room participation.",
          mailboxNotVisible: "The selected mailbox is not visible in the current account scope.",
          mailboxSummary: "Mailbox Summary",
          roomThreadInMailbox: "Room Thread In Mailbox",
          noMailboxRoomProjection: "No projected entries for this room are visible in the selected mailbox.",
          mailboxFeed: "Mailbox Feed",
          itemsLoaded: "{count} items loaded",
          noMailboxMessagesProjected: "No messages are currently projected into the selected mailbox.",
          noPublicInboxBinding: "No public inbox binding is attached to this mailbox.",
          selectAccountForMailboxes: "Select an account to inspect mailboxes and public inboxes.",
          mailboxWorkspaceCopy: "Use this view to scan internal role mailboxes, public inbox bindings, and provider posture for one connected account.",
          noVirtualMailboxAttached: "No virtual mailbox is attached to this account yet.",
          noMailboxAccountsConnected: "No mailbox accounts have been connected yet.",
          roomsEmptyFiltered: "No rooms are visible under the current filters.",
          approvalTitle: "Approval Queue",
          approvalCopy: "Outbound side effects stay gated here. Review one request to inspect draft hash, room linkage, and approval lineage before delivery.",
          noApprovalsVisible: "No approval requests are visible under the current filters.",
          requests: "requests",
          requested: "requested",
          approved: "approved",
          rejected: "rejected",
          virtualMailbox: "Virtual Mailbox",
          virtualMailboxCopy: "This is the mailbox-local view of internal collaboration. Use it to inspect what one role mailbox can see across feeds and room-local projections.",
          roomTitleDetail: "Room",
          roomCopyDetail: "Room detail is the durable truth view: revisioned room state, mailbox participation, gateway outcomes, task tracking, and the replay-visible timeline all stay here.",
          frontAgent: "Front agent",
          routing: "Routing",
          mailboxesLabel: "Mailboxes",
          noMailboxParticipation: "No mailbox participation recorded.",
          sharedResourcesCopy: "Attachments and room documents are room-scoped shared resources. They can be referenced from virtual mail without leaving the room boundary.",
          attachmentsLabel: "attachments",
          documentsLabel: "documents",
          preSnapshots: "pre snapshots",
          visibleAgentsLabel: "visible agents",
          noSharedResources: "No shared attachments or room documents have been recorded yet.",
          gatewayProjection: "Gateway Projection",
          projectedMessages: "{count} projected messages",
          controlPlanes: "Control planes",
          sessionKeys: "Session keys",
          projectedDeliveries: "Projected deliveries",
          projectedOutcomes: "Projected outcomes",
          noGatewayProjection: "No Gateway outcome projection has been recorded for this room yet.",
          gatewayAndMailSync: "Gateway And Mail Sync",
          governedBridge: "governed bridge",
          gatewaySyncCopy: "Gateway data can be imported into internal mail, and selected room messages can be synchronized back into governed email outbox delivery.",
          gatewayIngress: "Gateway ingress",
          emailSync: "Email sync",
          gatewayDispatch: "Gateway dispatch",
          approvalGate: "Approval gate",
          mailTasks: "Mail Tasks",
          noMailTasks: "No mail task classification has been recorded for this room yet.",
          virtualMailCopy: "This is the internal collaboration chain for the room: single-parent replies, mailbox routing, and origin kinds stay visible here without reopening raw transcripts.",
          noVirtualMail: "No virtual mail has been recorded for this room yet.",
          mailboxDeliveriesCopy: "Delivery rows show where each internal message was queued, leased, consumed, or marked stale inside the virtual mail plane.",
          noMailboxDeliveries: "No mailbox delivery rows have been recorded for this room yet.",
          governedOutbox: "Governed Outbox",
          governedOutboxCopy: "Only this governed outbox path can produce real external email. Review it alongside approvals when checking what may leave the room.",
          noOutboxIntents: "No outbox intents have been recorded for this room yet.",
          timeline: "Timeline",
          entriesCount: "{count} entries",
          noTimelineEntries: "No room timeline entries have been recorded yet.",
          roomFocusCopy: "Focus this room on the creating task mail, the public mail thread, the current agents, and the latest runtime only.",
          taskMailPanel: "Task Mail",
          taskMailCopy: "The external email that created this room.",
          noTaskMail: "No source task mail was recorded for this room.",
          publicMailPanel: "Public Mail",
          publicMailCopy: "Later public emails in this thread. Open a card to inspect the original message detail.",
          noPublicMail: "No additional public mail has been recorded for this room.",
          currentAgentsPanel: "Current Agents",
          currentAgentsCopy: "Open an agent to reveal only its room mailboxes. Select a mailbox chip to inspect the correspondence.",
          noAgentsVisible: "No visible agent has been recorded for this room yet.",
          latestRuntimePanel: "Latest Runtime",
          latestRuntimeCopy: "The latest room execution attempt and how long it ran.",
          noRuntimeYet: "This room has not run yet.",
          runtimeStatusLabel: "Status",
          runtimeStartedAtLabel: "Started",
          runtimeCompletedAtLabel: "Completed",
          runtimeDurationLabel: "Runtime",
          runtimeRunning: "Running",
          runtimeCompleted: "Completed",
          runtimeFailed: "Failed",
          durationNotAvailable: "n/a",
          installAllSkills: "Reuse All Skills",
          installAllSkillsHelp: "Install every reusable local skill into the selected target agent.",
          installAllSkillsDone: "Installed {count} skills for {agentId}.",
          installAllSkillsPartial: "Installed {done}/{total} skills for {agentId} before stopping on {skillId}.",
          noReusableSkillSources: "No reusable local skill sources are available yet.",
          batchInstallRequiresTarget: "Target agent and account are required before reusing all skills.",
          skillInstallRequiresTarget: "Target agent and source are required before installing a skill.",
          roomCountLabel: "rooms",
          skillCountLabel: "skills",
          mailboxCountLabel: "mailboxes",
          sourceReadyLabel: "source ready",
          inlineOnlyLabel: "inline only",
          replyLabel: "reply",
          rootLabel: "root",
          bodyLabel: "Body",
          fromLabel: "From",
          toLabel: "To",
          ccLabel: "CC",
          receivedAtLabel: "Received",
          createdAtLabel: "Created",
          openOriginalDetails: "Open original detail",
          virtualMail: "Virtual Mail",
          mailboxDeliveries: "Mailbox Deliveries",
          noSoulInitialized: "SOUL.md has not been initialized yet.",
          noSourceReference: "No reusable source reference recorded.",
          noSkillsDiscovered: "No skills discovered yet.",
          noDurableAgentSkills: "Connect or create a durable agent to inspect skills.",
          emailAddressLabel: "Email address",
          providerLabel: "Provider",
          accountIdLabel: "Account ID",
          displayNameLabel: "Display name",
          recommendedPath: "Recommended path",
          autoconfigReady: "Autoconfig ready",
          requiredEnvLabel: "Required env when left blank here",
          oauthClientId: "OAuth client ID",
          oauthClientSecret: "OAuth client secret",
          tenantLabel: "Tenant",
          userIdLabel: "User ID",
          scopesLabel: "Scopes",
          pubsubTopic: "Pub/Sub topic",
          labelIdsLabel: "Label IDs",
          passwordPathCopy: "This path stores IMAP/SMTP settings directly through the HTTP API. It does not verify the credentials before saving.",
          imapHostLabel: "IMAP host",
          imapPortLabel: "IMAP port",
          imapSecureLabel: "IMAP secure",
          imapMailboxLabel: "IMAP mailbox",
          smtpHostLabel: "SMTP host",
          smtpPortLabel: "SMTP port",
          smtpSecureLabel: "SMTP secure",
          smtpFromLabel: "SMTP from",
          cliFallback: "CLI Fallback",
          sameRuntimeModel: "same runtime, same account model",
          noAgentTemplatesAvailable: "No agent templates are available.",
          durableSoulMailbox: "durable soul + mailbox",
          createDurableAgentCopy: "Create one durable agent with its own SOUL.md, internal mailboxes, inbox policy, and directory entry.",
          agentIdLabel: "Agent ID",
          publicMailboxLabel: "Public Mailbox",
          collaboratorsLabel: "Collaborators",
          purposeLabel: "Purpose",
          createCustomAgentAfterConnect: "Connect an account first, then create custom durable agents in that workspace.",
          noDurableSouls: "Apply a template or initialize an agent memory workspace to create durable souls.",
          recommendedShapes: "recommended shapes",
          headcountWaiting: "Headcount recommendations appear after MailClaws can see account or burst-work load.",
          builtInLabel: "built-in",
          installerLabel: "installer",
          builtInSkillsNote: "Default durable agents start with read-email and write-email. Add markdown skills when you want reusable reading, writing, routing, or review behavior.",
          targetAgentLabel: "Target Agent",
          skillIdLabel: "Skill ID",
          titleLabel: "Title",
          sourceLabel: "Source",
          connectMailboxFirstThenInstall: "Connect a mailbox first. Then create a durable agent or apply a template before installing skills.",
          mailSetupEyebrow: "Mail setup",
          mailSetupTitle: "Connect one mailbox and start from the room.",
          mailSetupCopy: "This workbench is for the durable truth layer: account health, rooms, internal mailboxes, approvals, gateway projections, and the durable agent roster all stay visible from one route.",
          openMail: "Open Mail",
          onboardingApi: "Onboarding API",
          runtimeAndLlm: "Runtime And LLM",
          loadingRuntimeBoundary: "Loading runtime boundary…",
          openclawRuntimeActive: "OpenClaw runtime is active",
          localRuntimeActive: "Local runtime is active",
          openclawRuntimeCopy: "Configure mailbox here and keep your existing OpenClaw runtime/LLM. MailClaws will reuse that execution path for room work.",
          localRuntimeCopy: "This server is running with the built-in embedded adapter. You can still connect mailbox accounts here, but a real external LLM path needs bridge mode.",
          openclawBridgeHint: "If you are an OpenClaw user, restart MailClaws in bridge mode, then reopen this workbench and only configure mailbox here.",
          sameSetupPaths: "If you prefer the terminal, these are the same setup paths the workbench is using.",
          providersLabel: "providers",
          approvalsLabel: "approvals",
          templatesLabel: "templates",
          withSoulLabel: "with soul",
          recommendedLabel: "recommended",
          sharedLabel: "shared",
          applyTemplate: "Apply Template",
          templateNeedsAccount: "Connect an account first, then apply this template into that workspace.",
          manageAgent: "Manage",
          selectedAgent: "Selected",
          agentPanel: "Agent",
          noVisibleAgentYet: "No durable agent is visible yet.",
          soulLabel: "SOUL.md",
          soulPlaceholder: "# Soul",
          loadSoul: "Load Soul",
          reloadSoul: "Reload Soul",
          saveSoul: "Save Soul",
          deleteAgent: "Delete Agent",
          useAsSource: "Use As Source",
          reusableSkills: "Reusable Skills",
          installedSkills: "Installed Skills",
          createSkill: "Create Skill",
          sharedLibrary: "shared library",
          markdownLabel: "Markdown",
          markdownPlaceholder: "# Skill\\n\\nWrite the reusable prompt here.",
          saveSkill: "Save Skill",
          reusableSkillHelp: "Reuse an existing OpenClaw skill by pasting a local markdown path. Download a new one by pasting a GitHub raw/blob URL or any direct markdown URL.",
          sourceReady: "source ready",
          inlineOnly: "inline only",
          targetLabel: "target",
          installLabel: "Install",
          connectAccountFirst: "Connect an account first.",
          advancedSettings: "Advanced settings",
          advancedSettingsCopy: "Only open this when the provider preset is wrong or you need to override IMAP/SMTP.",
          availableSkills: "Available Skills",
          sharedSkillsPanel: "Shared Skills",
          reusableSkillSources: "One-Click Reuse",
          reusableSkillSourcesCopy: "Pick an existing local skill source on the right and install it into a MailClaws agent in one step.",
          noSharedSkillsYet: "No shared MailClaws skills yet.",
          providerHelp: "Provider Help",
          providerMail: "Open Provider Mail",
          oauthStartsHere: "Browser OAuth starts from this workbench. Leave client credentials blank when the server already has them in env.",
          oauthDetectedCopy: "OAuth provider detected. The next click opens the provider login page directly.",
          forwardIngestTitle: "Forward ingest stays API-first.",
          forwardIngestCopy: "Use raw MIME forward only when there is no provider-native or IMAP/OAuth path for this mailbox.",
          matchReasonLabel: "Match reason",
          setupKindLabel: "Setup kind",
          useRecommendedProviderCopy: "Use the recommended provider path, then confirm the account shows up under Accounts.",
          emailRequiredForSetup: "Email address is required before MailClaws can recommend a mailbox path.",
          loadedSetupGuidance: "Loaded mailbox setup guidance.",
          loadedSetupGuidanceFor: "Loaded {provider} setup guidance.",
          oauthAuthorizeUrlMissing: "OAuth start did not return an authorizeUrl",
          providerAccountRequired: "Provider and account ID are required before starting OAuth.",
          passwordConfigRequired: "Email, account ID, password, IMAP host, and SMTP host are required.",
          mailboxSaved: "Saved mailbox {email}.",
          soulLoadedMessage: "Soul loaded.",
          soulSavedMessage: "Soul saved.",
          agentDeletedMessage: "Agent deleted.",
          sourceCopiedMessage: "Source copied into the installer form.",
          sourceNotReusableMessage: "That skill does not expose a reusable source.",
          skillInstalledMessage: "Skill installed.",
          installedSkillForAgent: "Installed {skillId} for {agentId}.",
          sharedSkillSavedMessage: "Shared skill saved.",
          authorizationCodeOrAppPassword: "Authorization code or app password",
          passwordOrAppPassword: "Password or app password",
          authorizationCodePlaceholder: "paste the provider-issued authorization code",
          passwordPlaceholder: "required for IMAP/SMTP"
        },
        "zh-CN": {
          workbench: "工作台",
          home: "主页",
          accounts: "外部账户",
          rooms: "房间",
          agents: "智能体",
          skills: "技能",
          pageHome: "主页",
          pageAccounts: "外部账户",
          pageRooms: "房间工作台",
          pageAgents: "智能体目录",
          pageSkills: "技能库",
          pageMailboxes: "邮箱工作台",
          homeTitle: "MailClaws 工作台",
          homeCopy: "外部邮件按房间进入。房间保存工作记忆、虚拟邮件、附件和共享资源。智能体提供 soul 和可复用技能，围绕房间内核协作。",
          openRooms: "进入房间",
          connectMailbox: "连接邮箱",
          systemSnapshot: "系统概览",
          coreSurfaces: "核心对象",
          recentRooms: "最近房间",
          recentShown: "显示 {count} 个",
          noRoomsYet: "目前还没有可见房间。",
          accountsTitle: "已连接的外部邮箱",
          accountsCopy: "在这里连接真实 IMAP、SMTP、OAuth 或 forward-ingest 邮箱。新的外部邮件会进入新房间，回信则回到原房间。",
          roomsTitle: "Room 是核心工作面",
          roomsCopy: "每封新的外部邮件都会创建一个新房间。回信继续留在原房间。房间承载共享虚拟邮件、附件、笔记和被招募的智能体。",
          agentsTitle: "智能体模板与 soul",
          agentsCopy: "智能体本身不携带房间工作上下文。这里管理可复用模板、持久 SOUL.md、邮箱绑定，以及可被房间招募的智能体 roster。",
          skillsTitle: "可复用智能体技能",
          skillsCopy: "技能不放在房间工作记忆里。把技能安装到常驻智能体上，房间就能反复招募同一能力，而不用每次复制 prompt。",
          connectPanel: "连接邮箱",
          loadSetup: "加载配置",
          continueWith: "继续使用 {provider}",
          saveMailboxConfig: "保存邮箱配置",
          installOrReuseSkill: "安装或复用技能",
          installFromSource: "从来源安装",
          createAgent: "创建智能体",
          agentTemplates: "智能体模板",
          customAgent: "自定义智能体",
          agentDirectory: "智能体目录",
          headcount: "编制建议",
          skillsPanel: "技能",
          accountsPanel: "账户",
          providerState: "Provider 状态",
          mailboxAccount: "邮箱账户",
          publicInboxes: "公开收件箱",
          recentMailboxes: "最近邮箱",
          recentConversations: "最近会话",
          roomsPanel: "房间",
          approvalQueue: "审批队列",
          approvalRequests: "审批请求",
          inboxSummary: "收件箱摘要",
          inboxItems: "收件箱项目",
          mailboxWorkspace: "邮箱工作区",
          mailboxesAndRoutes: "邮箱与收件路线",
          virtualMailboxes: "虚拟邮箱",
          roomSummary: "房间摘要",
          sharedResources: "共享资源",
          tracked: "共 {count} 项",
          languageLabel: "语言",
          statusOverview: "总览外部账户、房间、智能体和可复用技能。",
          statusAccount: "查看单个已连接账户的 provider 状态、公开收件箱、房间和邮箱。",
          statusRoom: "查看单个房间的邮箱参与、审批和网关映射轨迹。",
          statusMailbox: "查看单个邮箱 feed，以及它在房间里的局部投影。",
          statusAgents: "应用模板、查看 soul 文件，并管理常驻智能体 roster。",
          statusSkills: "查看并安装可复用 markdown 技能到常驻智能体。",
          connectedCount: "已连接 {count} 个",
          configuredCount: "已配置 {count} 个",
          projectedCount: "已投影 {count} 个",
          shownCount: "显示 {count} 个",
          visibleCount: "可见 {count} 个",
          visibleSkillsCount: "可见技能 {count} 个",
          durableAgentsCount: "常驻智能体 {count} 个",
          presetsCount: "预设 {count} 个",
          targetAgentsCount: "目标智能体 {count} 个",
          latestActivity: "最近活动",
          latestMessage: "最新邮件",
          latestRoom: "最新房间",
          latest: "最近",
          processed: "处理于",
          updated: "更新于",
          noProjectedRooms: "还没有投影出的房间",
          loadingWorkspace: "正在加载邮件工作台…",
          noWorkbenchPayload: "没有返回工作台数据。",
          providerEmpty: "选择一个账户以查看 provider 监听、游标和邮箱投影状态。",
          providerObserveCopy: "MailClaws 仍以运行时内核为准。这里展示 provider 监听和邮箱投影，但它们不是权威状态。",
          ingress: "入站",
          outbound: "出站",
          watch: "监听",
          lastEvent: "最近事件",
          selectAccountHint: "选择一个账户，查看 provider 状态、收件箱、房间和邮箱投影。",
          noPublicInboxProjection: "这个账户还没有公开收件箱投影。",
          noVirtualMailboxesForAccount: "这个账户下还没有可见虚拟邮箱。",
          noAccountRoomActivity: "这个账户下还没有记录到房间活动。",
          selectInboxHint: "选择一个公开收件箱，查看按房间聚合的 intake、ACK 压力和待办积压。",
          inboxNotVisible: "当前账户范围内看不到所选收件箱。",
          publicInbox: "公开收件箱",
          inboxCopy: "收件箱项目以房间为粒度，而不是原始邮件任务。这样 ACK 压力、积压和委派都与房间内核保持一致。",
          selectRoomHint: "在下方选择一个房间，进入完整房间视图。",
          noInboxRoomProjection: "这个收件箱里暂时还没有可见房间投影。",
          selectMailboxHint: "选择一个邮箱，查看它的局部 feed 和房间参与情况。",
          mailboxNotVisible: "当前账户范围内看不到所选邮箱。",
          mailboxSummary: "邮箱摘要",
          roomThreadInMailbox: "邮箱中的房间线程",
          noMailboxRoomProjection: "所选邮箱里还没有这个房间的投影条目。",
          mailboxFeed: "邮箱 Feed",
          itemsLoaded: "已加载 {count} 项",
          noMailboxMessagesProjected: "所选邮箱里当前还没有投影出的消息。",
          noPublicInboxBinding: "这个邮箱还没有绑定公开收件箱。",
          selectAccountForMailboxes: "选择一个账户，查看邮箱和公开收件箱。",
          mailboxWorkspaceCopy: "这个视图用于查看内部角色邮箱、公开收件箱绑定，以及单个已连接账户的 provider 姿态。",
          noVirtualMailboxAttached: "这个账户还没有挂接虚拟邮箱。",
          noMailboxAccountsConnected: "还没有连接任何邮箱账户。",
          roomsEmptyFiltered: "当前筛选条件下没有可见房间。",
          approvalTitle: "审批队列",
          approvalCopy: "所有外发副作用都在这里受控。交付前可逐条检查草稿哈希、房间关联和审批链路。",
          noApprovalsVisible: "当前筛选条件下没有可见审批请求。",
          requests: "请求",
          requested: "待审批",
          approved: "已批准",
          rejected: "已拒绝",
          virtualMailbox: "虚拟邮箱",
          virtualMailboxCopy: "这是内部协作在邮箱侧的局部视图，用来查看某个角色邮箱在各个 feed 和房间投影里能看到什么。",
          roomTitleDetail: "房间",
          roomCopyDetail: "房间详情是持久真相视图：修订版房间状态、邮箱参与、网关结果、任务跟踪和可重放时间线都留在这里。",
          frontAgent: "前台智能体",
          routing: "路由",
          mailboxesLabel: "邮箱",
          noMailboxParticipation: "还没有记录任何邮箱参与。",
          sharedResourcesCopy: "附件和房间文档都是房间范围的共享资源。它们可以被虚拟邮件引用，而不离开房间边界。",
          attachmentsLabel: "附件",
          documentsLabel: "文档",
          preSnapshots: "预快照",
          visibleAgentsLabel: "可见智能体",
          noSharedResources: "这个房间还没有记录共享附件或房间文档。",
          gatewayProjection: "网关投影",
          projectedMessages: "已投影消息 {count} 条",
          controlPlanes: "控制面",
          sessionKeys: "会话键",
          projectedDeliveries: "投影投递",
          projectedOutcomes: "投影结果",
          noGatewayProjection: "这个房间还没有记录网关结果投影。",
          gatewayAndMailSync: "网关与邮件同步",
          governedBridge: "受控桥接",
          gatewaySyncCopy: "网关数据可以导入内部邮件，房间中的选定消息也可以同步回受控外发邮箱。",
          gatewayIngress: "网关入站",
          emailSync: "邮件同步",
          gatewayDispatch: "网关派发",
          approvalGate: "审批闸门",
          mailTasks: "邮件任务",
          noMailTasks: "这个房间还没有记录邮件任务分类。",
          virtualMailCopy: "这里展示房间内的内部协作链：单父回复、邮箱路由和来源类型都可见，无需重新打开原始转录。",
          noVirtualMail: "这个房间还没有记录虚拟邮件。",
          mailboxDeliveriesCopy: "投递行展示每条内部消息在虚拟邮件平面里被排队、租约、消费或标记陈旧的过程。",
          noMailboxDeliveries: "这个房间还没有记录邮箱投递行。",
          governedOutbox: "受控发件箱",
          governedOutboxCopy: "只有这条受控发件链路能产生真实外部邮件。检查将离开房间的内容时，应与审批一起查看。",
          noOutboxIntents: "这个房间还没有记录发件意图。",
          timeline: "时间线",
          entriesCount: "共 {count} 条",
          noTimelineEntries: "这个房间还没有记录时间线条目。",
          roomFocusCopy: "这个房间只聚焦创建房间的任务邮件、公开邮件线程、当前智能体和最近一次运行时间。",
          taskMailPanel: "任务邮件",
          taskMailCopy: "这封外部邮件创建了当前房间。",
          noTaskMail: "这个房间还没有记录来源任务邮件。",
          publicMailPanel: "公开邮件",
          publicMailCopy: "这是当前线程后续的公开邮件。点击卡片可展开查看原始邮件详情。",
          noPublicMail: "这个房间还没有后续公开邮件。",
          currentAgentsPanel: "当前智能体",
          currentAgentsCopy: "点开智能体即可看到它在当前房间里的虚拟邮箱。点邮箱标签可查看往来信件。",
          noAgentsVisible: "这个房间还没有记录可见智能体。",
          latestRuntimePanel: "最近运行",
          latestRuntimeCopy: "展示最近一次房间执行及其运行时长。",
          noRuntimeYet: "这个房间还没有运行记录。",
          runtimeStatusLabel: "状态",
          runtimeStartedAtLabel: "开始时间",
          runtimeCompletedAtLabel: "完成时间",
          runtimeDurationLabel: "运行时长",
          runtimeRunning: "运行中",
          runtimeCompleted: "已完成",
          runtimeFailed: "失败",
          durationNotAvailable: "暂无",
          installAllSkills: "一键复用全部技能",
          installAllSkillsHelp: "把全部可复用本地技能安装到当前选中的目标智能体。",
          installAllSkillsDone: "已为 {agentId} 安装 {count} 个技能。",
          installAllSkillsPartial: "已为 {agentId} 安装 {done}/{total} 个技能，在 {skillId} 处停止。",
          noReusableSkillSources: "当前还没有可复用的本地技能来源。",
          batchInstallRequiresTarget: "一键复用全部技能前，必须先确定账户和目标智能体。",
          skillInstallRequiresTarget: "安装技能前，必须先提供目标智能体和来源。",
          roomCountLabel: "房间",
          skillCountLabel: "技能",
          mailboxCountLabel: "邮箱",
          sourceReadyLabel: "来源可用",
          inlineOnlyLabel: "仅内联",
          replyLabel: "回复",
          rootLabel: "首条",
          bodyLabel: "正文",
          fromLabel: "发件人",
          toLabel: "收件人",
          ccLabel: "抄送",
          receivedAtLabel: "接收时间",
          createdAtLabel: "创建时间",
          openOriginalDetails: "展开原文详情",
          virtualMail: "虚拟邮件",
          mailboxDeliveries: "邮箱投递",
          noSoulInitialized: "SOUL.md 还没有初始化。",
          noSourceReference: "还没有记录可复用来源引用。",
          noSkillsDiscovered: "还没有发现任何技能。",
          noDurableAgentSkills: "先连接或创建一个常驻智能体，才能查看技能。",
          emailAddressLabel: "邮箱地址",
          providerLabel: "Provider",
          accountIdLabel: "账户 ID",
          displayNameLabel: "显示名",
          recommendedPath: "推荐路径",
          autoconfigReady: "自动配置已就绪",
          requiredEnvLabel: "若此处留空所需环境变量",
          oauthClientId: "OAuth Client ID",
          oauthClientSecret: "OAuth Client Secret",
          tenantLabel: "租户",
          userIdLabel: "用户 ID",
          scopesLabel: "Scopes",
          pubsubTopic: "Pub/Sub 主题",
          labelIdsLabel: "标签 ID",
          passwordPathCopy: "这个路径会通过 HTTP API 直接保存 IMAP/SMTP 配置，保存前不会校验凭证。",
          imapHostLabel: "IMAP 主机",
          imapPortLabel: "IMAP 端口",
          imapSecureLabel: "IMAP 加密",
          imapMailboxLabel: "IMAP 邮箱",
          smtpHostLabel: "SMTP 主机",
          smtpPortLabel: "SMTP 端口",
          smtpSecureLabel: "SMTP 加密",
          smtpFromLabel: "SMTP 发件人",
          cliFallback: "CLI 备用路径",
          sameRuntimeModel: "同一运行时，同一账户模型",
          noAgentTemplatesAvailable: "当前没有可用的智能体模板。",
          durableSoulMailbox: "持久 soul + 邮箱",
          createDurableAgentCopy: "创建一个带独立 SOUL.md、内部邮箱、收件策略和目录条目的常驻智能体。",
          agentIdLabel: "智能体 ID",
          publicMailboxLabel: "公开邮箱",
          collaboratorsLabel: "协作者",
          purposeLabel: "用途",
          createCustomAgentAfterConnect: "先连接账户，再在这个工作区里创建自定义常驻智能体。",
          noDurableSouls: "先应用模板或初始化智能体记忆工作区，才能创建常驻 soul。",
          recommendedShapes: "推荐形态",
          headcountWaiting: "MailClaws 看到账户或突发负载后，才会给出编制建议。",
          builtInLabel: "内置",
          installerLabel: "安装器",
          builtInSkillsNote: "默认常驻智能体自带 read-email 和 write-email。需要可复用的阅读、写作、路由或审阅能力时，再添加 markdown 技能。",
          targetAgentLabel: "目标智能体",
          skillIdLabel: "技能 ID",
          titleLabel: "标题",
          sourceLabel: "来源",
          connectMailboxFirstThenInstall: "先连接邮箱，再创建常驻智能体或应用模板，然后安装技能。",
          mailSetupEyebrow: "邮箱接入",
          mailSetupTitle: "先连一个邮箱，再从房间开始工作。",
          mailSetupCopy: "这个工作台展示持久真相层：账户健康、房间、内部邮箱、审批、网关投影和常驻智能体 roster 都在同一路由里可见。",
          openMail: "打开邮件台",
          onboardingApi: "Onboarding API",
          runtimeAndLlm: "运行时与 LLM",
          loadingRuntimeBoundary: "正在加载运行时边界…",
          openclawRuntimeActive: "OpenClaw 运行时已启用",
          localRuntimeActive: "本地运行时已启用",
          openclawRuntimeCopy: "在这里配置邮箱，同时继续沿用现有 OpenClaw 运行时和 LLM。MailClaws 会复用这条执行路径处理房间工作。",
          localRuntimeCopy: "当前服务运行在内置 embedded adapter 上。你仍可在这里连接邮箱账户，但真正的外部 LLM 路径仍需要 bridge 模式。",
          openclawBridgeHint: "如果你本来就在用 OpenClaw，请以 bridge 模式重启 MailClaws，然后回到这里只配置邮箱。",
          sameSetupPaths: "如果你更偏好终端，这里展示的就是工作台正在使用的同一套接入路径。",
          providersLabel: "提供方",
          approvalsLabel: "审批",
          templatesLabel: "模板",
          withSoulLabel: "有 soul",
          recommendedLabel: "推荐",
          sharedLabel: "共享",
          applyTemplate: "应用模板",
          templateNeedsAccount: "先连接一个账户，再把这个模板应用到对应工作区。",
          manageAgent: "管理",
          selectedAgent: "已选中",
          agentPanel: "智能体",
          noVisibleAgentYet: "当前还没有可见的常驻智能体。",
          soulLabel: "SOUL.md",
          soulPlaceholder: "# Soul",
          loadSoul: "加载 Soul",
          reloadSoul: "重新加载 Soul",
          saveSoul: "保存 Soul",
          deleteAgent: "删除智能体",
          useAsSource: "作为来源",
          reusableSkills: "可复用技能",
          installedSkills: "已安装技能",
          createSkill: "创建技能",
          sharedLibrary: "共享技能库",
          markdownLabel: "Markdown",
          markdownPlaceholder: "# Skill\\n\\n在这里写可复用提示词。",
          saveSkill: "保存技能",
          reusableSkillHelp: "可直接粘贴本地 markdown 路径复用已有 OpenClaw 技能；也可以粘贴 GitHub raw/blob URL 或其他直接 markdown URL 下载新技能。",
          sourceReady: "来源可用",
          inlineOnly: "仅内联",
          targetLabel: "目标",
          installLabel: "安装",
          connectAccountFirst: "先连接一个账户。",
          advancedSettings: "高级配置",
          advancedSettingsCopy: "只有当 provider 预设不对，或者你需要手动覆盖 IMAP/SMTP 时才展开这里。",
          availableSkills: "已有技能",
          sharedSkillsPanel: "共享技能",
          reusableSkillSources: "一键复用",
          reusableSkillSourcesCopy: "右侧选择已有本地技能来源，一步安装到 MailClaws 智能体。",
          noSharedSkillsYet: "当前还没有共享的 MailClaws 技能。",
          providerHelp: "提供方帮助",
          providerMail: "打开提供方邮箱",
          oauthStartsHere: "浏览器 OAuth 会直接从这个工作台发起。如果服务端环境变量里已经有 client 凭证，这里可以留空。",
          oauthDetectedCopy: "检测到 OAuth 提供方。下一次点击会直接打开对应登录页。",
          forwardIngestTitle: "Forward ingest 仍应走 API 优先。",
          forwardIngestCopy: "只有在没有 provider 原生路径，也没有 IMAP/OAuth 路径时，才使用原始 MIME 转发。",
          matchReasonLabel: "匹配原因",
          setupKindLabel: "接入方式",
          useRecommendedProviderCopy: "优先走推荐的 provider 路径，然后确认账户已经出现在“外部账户”里。",
          emailRequiredForSetup: "MailClaws 需要先拿到邮箱地址，才能推荐接入路径。",
          loadedSetupGuidance: "已加载邮箱接入指引。",
          loadedSetupGuidanceFor: "已加载 {provider} 的接入指引。",
          oauthAuthorizeUrlMissing: "OAuth 启动后没有返回 authorizeUrl",
          providerAccountRequired: "开始 OAuth 前必须有 provider 和账户 ID。",
          passwordConfigRequired: "邮箱、账户 ID、密码、IMAP 主机和 SMTP 主机都是必填项。",
          mailboxSaved: "已保存邮箱 {email}。",
          soulLoadedMessage: "Soul 已加载。",
          soulSavedMessage: "Soul 已保存。",
          agentDeletedMessage: "智能体已删除。",
          sourceCopiedMessage: "已把来源复制进安装表单。",
          sourceNotReusableMessage: "这个技能没有暴露可复用来源。",
          skillInstalledMessage: "技能已安装。",
          installedSkillForAgent: "已为 {agentId} 安装 {skillId}。",
          sharedSkillSavedMessage: "共享技能已保存。",
          authorizationCodeOrAppPassword: "授权码或应用专用密码",
          passwordOrAppPassword: "密码或应用专用密码",
          authorizationCodePlaceholder: "粘贴服务商提供的授权码",
          passwordPlaceholder: "IMAP/SMTP 必填"
        },
        fr: {
          workbench: "Workbench",
          home: "Accueil",
          accounts: "Comptes externes",
          rooms: "Room",
          agents: "Agent",
          skills: "Compétence",
          pageHome: "Accueil",
          pageAccounts: "Comptes externes",
          pageRooms: "Workbench Room",
          pageAgents: "Directory d’agents",
          pageSkills: "Bibliothèque de compétences",
          pageMailboxes: "Workbench Mailbox",
          homeTitle: "Workbench MailClaws",
          homeCopy: "L’email externe entre par room. Les rooms portent la mémoire de travail, le virtual mail, les pièces jointes et les ressources partagées. Les agents apportent le soul et les compétences réutilisables autour de ce noyau room.",
          openRooms: "Ouvrir Room",
          connectMailbox: "Connecter Boîte Mail",
          systemSnapshot: "Vue système",
          coreSurfaces: "surfaces clés",
          recentRooms: "Rooms récentes",
          recentShown: "{count} affichées",
          noRoomsYet: "Aucune room visible pour le moment.",
          accountsTitle: "Boîtes mail externes connectées",
          accountsCopy: "Connectez ici de vraies boîtes IMAP, SMTP, OAuth ou forward-ingest. Un nouvel email externe ouvre une nouvelle room, et une réponse retourne dans la room existante.",
          roomsTitle: "La room est la surface de travail centrale",
          roomsCopy: "Chaque nouvel email externe crée une nouvelle room. Les réponses restent dans la même room. Une room porte le virtual mail partagé, les pièces jointes, les notes et les agents recrutés.",
          agentsTitle: "Templates d’agents et souls",
          agentsCopy: "Les agents ne portent pas le contexte de travail actif d’une room. Cette page gère les templates réutilisables, l’état durable de SOUL.md, les bindings mailbox et le roster d’agents recrutables.",
          skillsTitle: "Compétences d’agent réutilisables",
          skillsCopy: "Les compétences restent hors de la mémoire de travail de la room. Installez-les sur des agents durables pour qu’une room puisse recruter le même comportement sans recopier les prompts.",
          connectPanel: "Connecter Une Boîte Mail",
          loadSetup: "Charger Setup",
          continueWith: "Continuer Avec {provider}",
          saveMailboxConfig: "Enregistrer La Configuration",
          installOrReuseSkill: "Installer Ou Réutiliser Une Compétence",
          installFromSource: "Installer Depuis La Source",
          createAgent: "Créer Agent",
          agentTemplates: "Templates d’agents",
          customAgent: "Agent personnalisé",
          agentDirectory: "Directory d’agents",
          headcount: "HeadCount",
          skillsPanel: "Compétences",
          accountsPanel: "Comptes",
          providerState: "État Provider",
          mailboxAccount: "Compte Mailbox",
          publicInboxes: "Public Inboxes",
          recentMailboxes: "Mailboxes récentes",
          recentConversations: "Conversations récentes",
          roomsPanel: "Rooms",
          approvalQueue: "File d’approbation",
          approvalRequests: "Demandes d’approbation",
          inboxSummary: "Résumé Inbox",
          inboxItems: "Éléments Inbox",
          mailboxWorkspace: "Workspace Mailbox",
          mailboxesAndRoutes: "Mailboxes et routes d’entrée",
          virtualMailboxes: "Mailboxes virtuelles",
          roomSummary: "Résumé de la room",
          sharedResources: "Ressources partagées",
          tracked: "{count} suivies",
          languageLabel: "Langue",
          statusOverview: "Vue d’ensemble des comptes externes, rooms, agents et compétences réutilisables.",
          statusAccount: "Inspecter l’état provider, les public inboxes, les rooms et les mailboxes d’un compte connecté.",
          statusRoom: "Inspecter une room, sa participation mailbox, ses approvals et sa trace de projection Gateway.",
          statusMailbox: "Inspecter un feed mailbox et la projection locale visible dans cette room.",
          statusAgents: "Appliquer des templates, inspecter les fichiers soul et gérer le roster d’agents durables.",
          statusSkills: "Inspecter et installer des compétences markdown réutilisables sur des agents durables.",
          connectedCount: "{count} connectés",
          configuredCount: "{count} configurés",
          projectedCount: "{count} projetés",
          shownCount: "{count} affichés",
          visibleCount: "{count} visibles",
          visibleSkillsCount: "{count} compétences visibles",
          durableAgentsCount: "{count} agents durables",
          presetsCount: "{count} presets",
          targetAgentsCount: "{count} agents cibles",
          latestActivity: "Dernière activité",
          latestMessage: "Dernier message",
          latestRoom: "Dernière room",
          latest: "Dernier",
          processed: "Traité",
          updated: "Mis à jour",
          noProjectedRooms: "Aucune room projetée pour l’instant",
          loadingWorkspace: "Chargement du workbench mail…",
          noWorkbenchPayload: "Aucune charge utile du workbench n’a été renvoyée.",
          providerEmpty: "Sélectionnez un compte pour inspecter la surveillance provider, les curseurs et l’état de projection mailbox.",
          providerObserveCopy: "MailClaws garde le noyau runtime comme vérité. La surveillance provider et les projections mailbox sont observables ici, sans être autoritaires.",
          ingress: "Entrée",
          outbound: "Sortie",
          watch: "Surveillance",
          lastEvent: "Dernier événement",
          selectAccountHint: "Sélectionnez un compte pour inspecter l’état provider, les inboxes, les rooms et les projections mailbox.",
          noPublicInboxProjection: "Aucune projection de public inbox n’existe encore pour ce compte.",
          noVirtualMailboxesForAccount: "Aucune mailbox virtuelle n’est visible pour ce compte.",
          noAccountRoomActivity: "Aucune activité de room n’a encore été enregistrée pour ce compte.",
          selectInboxHint: "Sélectionnez une public inbox pour inspecter l’entrée par room, la pression ACK et le backlog.",
          inboxNotVisible: "L’inbox sélectionnée n’est pas visible dans le périmètre du compte courant.",
          publicInbox: "Public Inbox",
          inboxCopy: "Les éléments d’inbox sont une charge de travail au niveau room, pas des tâches de message brut. Cela garde la pression ACK, le backlog et la délégation alignés sur le noyau room.",
          selectRoomHint: "Sélectionnez une room ci-dessous pour passer de la file à l’inspection complète.",
          noInboxRoomProjection: "Aucune projection de room n’est visible dans cette inbox.",
          selectMailboxHint: "Sélectionnez une mailbox pour inspecter son flux local et la participation des rooms.",
          mailboxNotVisible: "La mailbox sélectionnée n’est pas visible dans le périmètre du compte courant.",
          mailboxSummary: "Résumé Mailbox",
          roomThreadInMailbox: "Thread de room dans la mailbox",
          noMailboxRoomProjection: "Aucune entrée projetée de cette room n’est visible dans la mailbox sélectionnée.",
          mailboxFeed: "Flux Mailbox",
          itemsLoaded: "{count} éléments chargés",
          noMailboxMessagesProjected: "Aucun message n’est actuellement projeté dans la mailbox sélectionnée.",
          noPublicInboxBinding: "Aucun binding de public inbox n’est attaché à cette mailbox.",
          selectAccountForMailboxes: "Sélectionnez un compte pour inspecter les mailboxes et les public inboxes.",
          mailboxWorkspaceCopy: "Utilisez cette vue pour parcourir les mailboxes de rôle internes, les bindings de public inbox et l’état provider d’un compte connecté.",
          noVirtualMailboxAttached: "Aucune mailbox virtuelle n’est attachée à ce compte.",
          noMailboxAccountsConnected: "Aucun compte mailbox n’a encore été connecté.",
          roomsEmptyFiltered: "Aucune room visible avec les filtres actuels.",
          approvalTitle: "File d’approbation",
          approvalCopy: "Les effets sortants restent contrôlés ici. Vérifiez une requête pour inspecter le hash de brouillon, le lien room et la lignée d’approbation avant livraison.",
          noApprovalsVisible: "Aucune demande d’approbation n’est visible avec les filtres actuels.",
          requests: "demandes",
          requested: "demandé",
          approved: "approuvé",
          rejected: "rejeté",
          virtualMailbox: "Mailbox virtuelle",
          virtualMailboxCopy: "Ceci est la vue locale mailbox de la collaboration interne. Utilisez-la pour inspecter ce qu’une mailbox de rôle voit à travers les flux et projections de room.",
          roomTitleDetail: "Room",
          roomCopyDetail: "Le détail de room est la vue de vérité durable : état révisé, participation mailbox, résultats Gateway, suivi des tâches et timeline rejouable restent ici.",
          frontAgent: "Agent de façade",
          routing: "Routage",
          mailboxesLabel: "Mailboxes",
          noMailboxParticipation: "Aucune participation mailbox enregistrée.",
          sharedResourcesCopy: "Les pièces jointes et documents de room sont des ressources partagées à l’échelle de la room. Ils peuvent être référencés depuis le virtual mail sans sortir de la room.",
          attachmentsLabel: "pièces jointes",
          documentsLabel: "documents",
          preSnapshots: "pré-snapshots",
          visibleAgentsLabel: "agents visibles",
          noSharedResources: "Aucune pièce jointe partagée ni document de room n’a encore été enregistré.",
          gatewayProjection: "Projection Gateway",
          projectedMessages: "{count} messages projetés",
          controlPlanes: "Plans de contrôle",
          sessionKeys: "Clés de session",
          projectedDeliveries: "Livraisons projetées",
          projectedOutcomes: "Résultats projetés",
          noGatewayProjection: "Aucune projection de résultat Gateway n’a encore été enregistrée pour cette room.",
          gatewayAndMailSync: "Gateway et synchro mail",
          governedBridge: "pont gouverné",
          gatewaySyncCopy: "Les données Gateway peuvent être importées dans le mail interne, et des messages de room sélectionnés peuvent être synchronisés vers l’outbox email gouvernée.",
          gatewayIngress: "Entrée Gateway",
          emailSync: "Synchro email",
          gatewayDispatch: "Dispatch Gateway",
          approvalGate: "Porte d’approbation",
          mailTasks: "Tâches mail",
          noMailTasks: "Aucune classification de tâche mail n’a encore été enregistrée pour cette room.",
          virtualMailCopy: "Ceci est la chaîne de collaboration interne de la room : réponses à parent unique, routage mailbox et types d’origine restent visibles ici sans rouvrir les transcriptions brutes.",
          noVirtualMail: "Aucun virtual mail n’a encore été enregistré pour cette room.",
          mailboxDeliveriesCopy: "Les lignes de livraison montrent où chaque message interne a été mis en file, loué, consommé ou marqué périmé dans le plan virtual mail.",
          noMailboxDeliveries: "Aucune ligne de livraison mailbox n’a encore été enregistrée pour cette room.",
          governedOutbox: "Outbox gouvernée",
          governedOutboxCopy: "Seul ce chemin d’outbox gouvernée peut produire un vrai email externe. Vérifiez-le avec les approbations pour voir ce qui peut quitter la room.",
          noOutboxIntents: "Aucune intention d’outbox n’a encore été enregistrée pour cette room.",
          timeline: "Timeline",
          entriesCount: "{count} entrées",
          noTimelineEntries: "Aucune entrée de timeline n’a encore été enregistrée pour cette room.",
          roomFocusCopy: "Cette room se concentre uniquement sur l’email de création, le fil d’emails publics, les agents visibles et le dernier temps d’exécution.",
          taskMailPanel: "Mail de tâche",
          taskMailCopy: "L’email externe qui a créé cette room.",
          noTaskMail: "Aucun mail source n’a été enregistré pour cette room.",
          publicMailPanel: "Mail public",
          publicMailCopy: "Les emails publics suivants dans ce fil. Ouvrez une carte pour lire le détail du message original.",
          noPublicMail: "Aucun mail public supplémentaire n’a été enregistré pour cette room.",
          currentAgentsPanel: "Agents actuels",
          currentAgentsCopy: "Ouvrez un agent pour afficher uniquement ses boîtes de room. Sélectionnez une puce de boîte pour consulter la correspondance.",
          noAgentsVisible: "Aucun agent visible n’a encore été enregistré pour cette room.",
          latestRuntimePanel: "Dernière exécution",
          latestRuntimeCopy: "La dernière exécution de room et sa durée.",
          noRuntimeYet: "Cette room n’a encore aucune exécution.",
          runtimeStatusLabel: "Statut",
          runtimeStartedAtLabel: "Début",
          runtimeCompletedAtLabel: "Fin",
          runtimeDurationLabel: "Durée",
          runtimeRunning: "En cours",
          runtimeCompleted: "Terminée",
          runtimeFailed: "Échouée",
          durationNotAvailable: "n/d",
          installAllSkills: "Réutiliser toutes les compétences",
          installAllSkillsHelp: "Installer toutes les compétences locales réutilisables dans l’agent cible sélectionné.",
          installAllSkillsDone: "{count} compétences installées pour {agentId}.",
          installAllSkillsPartial: "{done}/{total} compétences installées pour {agentId} avant l’arrêt sur {skillId}.",
          noReusableSkillSources: "Aucune source locale réutilisable n’est disponible pour le moment.",
          batchInstallRequiresTarget: "Un compte et un agent cible sont requis avant de réutiliser toutes les compétences.",
          skillInstallRequiresTarget: "Un agent cible et une source sont requis avant d’installer une compétence.",
          roomCountLabel: "rooms",
          skillCountLabel: "compétences",
          mailboxCountLabel: "mailboxes",
          sourceReadyLabel: "source prête",
          inlineOnlyLabel: "inline seulement",
          replyLabel: "réponse",
          rootLabel: "racine",
          bodyLabel: "Corps",
          fromLabel: "De",
          toLabel: "À",
          ccLabel: "CC",
          receivedAtLabel: "Reçu",
          createdAtLabel: "Créé",
          openOriginalDetails: "Ouvrir le détail original",
          virtualMail: "Mail virtuel",
          mailboxDeliveries: "Livraisons mailbox",
          noSoulInitialized: "SOUL.md n’a pas encore été initialisé.",
          noSourceReference: "Aucune référence de source réutilisable enregistrée.",
          noSkillsDiscovered: "Aucune compétence découverte pour l’instant.",
          noDurableAgentSkills: "Connectez ou créez un agent durable pour inspecter les compétences.",
          emailAddressLabel: "Adresse email",
          providerLabel: "Provider",
          accountIdLabel: "ID de compte",
          displayNameLabel: "Nom affiché",
          recommendedPath: "Chemin recommandé",
          autoconfigReady: "Autoconfig prête",
          requiredEnvLabel: "Variables d’environnement requises si laissé vide ici",
          oauthClientId: "ID client OAuth",
          oauthClientSecret: "Secret client OAuth",
          tenantLabel: "Tenant",
          userIdLabel: "ID utilisateur",
          scopesLabel: "Scopes",
          pubsubTopic: "Sujet Pub/Sub",
          labelIdsLabel: "IDs de labels",
          passwordPathCopy: "Cette voie enregistre directement les réglages IMAP/SMTP via l’API HTTP. Les identifiants ne sont pas vérifiés avant l’enregistrement.",
          imapHostLabel: "Hôte IMAP",
          imapPortLabel: "Port IMAP",
          imapSecureLabel: "IMAP sécurisé",
          imapMailboxLabel: "Boîte IMAP",
          smtpHostLabel: "Hôte SMTP",
          smtpPortLabel: "Port SMTP",
          smtpSecureLabel: "SMTP sécurisé",
          smtpFromLabel: "Expéditeur SMTP",
          cliFallback: "Fallback CLI",
          sameRuntimeModel: "même runtime, même modèle de compte",
          noAgentTemplatesAvailable: "Aucun template d’agent disponible.",
          durableSoulMailbox: "soul durable + mailbox",
          createDurableAgentCopy: "Créez un agent durable avec son propre SOUL.md, ses mailboxes internes, sa politique d’inbox et son entrée d’annuaire.",
          agentIdLabel: "ID agent",
          publicMailboxLabel: "Mailbox publique",
          collaboratorsLabel: "Collaborateurs",
          purposeLabel: "But",
          createCustomAgentAfterConnect: "Connectez d’abord un compte, puis créez des agents durables personnalisés dans cet espace.",
          noDurableSouls: "Appliquez un template ou initialisez un espace mémoire d’agent pour créer des souls durables.",
          recommendedShapes: "formes recommandées",
          headcountWaiting: "Les recommandations de headcount apparaissent quand MailClaws voit le compte ou la charge burst.",
          builtInLabel: "intégré",
          installerLabel: "installateur",
          builtInSkillsNote: "Les agents durables démarrent avec read-email et write-email. Ajoutez des compétences markdown pour des comportements réutilisables de lecture, rédaction, routage ou revue.",
          targetAgentLabel: "Agent cible",
          skillIdLabel: "ID compétence",
          titleLabel: "Titre",
          sourceLabel: "Source",
          connectMailboxFirstThenInstall: "Connectez d’abord une mailbox, puis créez un agent durable ou appliquez un template avant d’installer des compétences.",
          mailSetupEyebrow: "Connexion mail",
          mailSetupTitle: "Connectez une boîte mail puis partez de la room.",
          mailSetupCopy: "Ce workbench expose la couche de vérité durable : santé des comptes, rooms, mailboxes internes, approbations, projections gateway et roster d’agents durables restent visibles sur une seule route.",
          openMail: "Ouvrir Mail",
          onboardingApi: "API d’onboarding",
          runtimeAndLlm: "Runtime et LLM",
          loadingRuntimeBoundary: "Chargement de la frontière runtime…",
          openclawRuntimeActive: "Le runtime OpenClaw est actif",
          localRuntimeActive: "Le runtime local est actif",
          openclawRuntimeCopy: "Configurez la mailbox ici tout en gardant votre runtime/LLM OpenClaw existant. MailClaws réutilisera ce chemin d’exécution pour le travail de room.",
          localRuntimeCopy: "Ce serveur tourne avec l’adaptateur embarqué. Vous pouvez toujours connecter des comptes mailbox ici, mais une vraie voie LLM externe demande le mode bridge.",
          openclawBridgeHint: "Si vous utilisez déjà OpenClaw, redémarrez MailClaws en mode bridge puis rouvrez ce workbench pour ne configurer que la mailbox ici.",
          sameSetupPaths: "Si vous préférez le terminal, voici exactement les mêmes chemins de configuration que ceux utilisés par le workbench.",
          providersLabel: "providers",
          approvalsLabel: "approbations",
          templatesLabel: "templates",
          withSoulLabel: "avec soul",
          recommendedLabel: "recommandé",
          sharedLabel: "partagé",
          applyTemplate: "Appliquer le template",
          templateNeedsAccount: "Connectez d’abord un compte, puis appliquez ce template dans cet espace.",
          manageAgent: "Gérer",
          selectedAgent: "Sélectionné",
          agentPanel: "Agent",
          noVisibleAgentYet: "Aucun agent durable visible pour le moment.",
          soulLabel: "SOUL.md",
          soulPlaceholder: "# Soul",
          loadSoul: "Charger Soul",
          reloadSoul: "Recharger Soul",
          saveSoul: "Enregistrer Soul",
          deleteAgent: "Supprimer l’agent",
          useAsSource: "Utiliser comme source",
          reusableSkills: "Compétences réutilisables",
          installedSkills: "Compétences installées",
          createSkill: "Créer une compétence",
          sharedLibrary: "bibliothèque partagée",
          markdownLabel: "Markdown",
          markdownPlaceholder: "# Skill\\n\\nÉcrivez ici le prompt réutilisable.",
          saveSkill: "Enregistrer la compétence",
          reusableSkillHelp: "Réutilisez une compétence OpenClaw existante en collant un chemin markdown local. Vous pouvez aussi coller une URL GitHub raw/blob ou toute URL markdown directe pour en télécharger une nouvelle.",
          sourceReady: "source prête",
          inlineOnly: "inline seulement",
          targetLabel: "cible",
          installLabel: "Installer",
          connectAccountFirst: "Connectez d’abord un compte.",
          advancedSettings: "Réglages avancés",
          advancedSettingsCopy: "Ouvrez ceci seulement si le preset provider est incorrect ou si vous devez forcer IMAP/SMTP.",
          availableSkills: "Compétences disponibles",
          sharedSkillsPanel: "Compétences partagées",
          reusableSkillSources: "Réutilisation en un clic",
          reusableSkillSourcesCopy: "Choisissez à droite une source locale existante et installez-la en une étape dans un agent MailClaws.",
          noSharedSkillsYet: "Aucune compétence MailClaws partagée pour le moment.",
          providerHelp: "Aide provider",
          providerMail: "Ouvrir la mailbox provider",
          oauthStartsHere: "L’OAuth navigateur démarre depuis ce workbench. Laissez les identifiants client vides si le serveur les possède déjà dans l’environnement.",
          oauthDetectedCopy: "Provider OAuth détecté. Le prochain clic ouvre directement la page de connexion du provider.",
          forwardIngestTitle: "Le forward ingest reste API-first.",
          forwardIngestCopy: "Utilisez le transfert MIME brut seulement s’il n’existe ni chemin provider natif, ni chemin IMAP/OAuth pour cette mailbox.",
          matchReasonLabel: "Raison du choix",
          setupKindLabel: "Type de configuration",
          useRecommendedProviderCopy: "Utilisez le chemin provider recommandé, puis vérifiez que le compte apparaît sous Comptes externes.",
          emailRequiredForSetup: "L’adresse email est requise avant que MailClaws puisse recommander un chemin de mailbox.",
          loadedSetupGuidance: "Guide de configuration mailbox chargé.",
          loadedSetupGuidanceFor: "Guide de configuration {provider} chargé.",
          oauthAuthorizeUrlMissing: "Le démarrage OAuth n’a pas renvoyé authorizeUrl",
          providerAccountRequired: "Le provider et l’ID de compte sont requis avant de démarrer OAuth.",
          passwordConfigRequired: "Email, ID de compte, mot de passe, hôte IMAP et hôte SMTP sont requis.",
          mailboxSaved: "Mailbox {email} enregistrée.",
          soulLoadedMessage: "Soul chargée.",
          soulSavedMessage: "Soul enregistrée.",
          agentDeletedMessage: "Agent supprimé.",
          sourceCopiedMessage: "La source a été copiée dans le formulaire d’installation.",
          sourceNotReusableMessage: "Cette compétence n’expose pas de source réutilisable.",
          skillInstalledMessage: "Compétence installée.",
          installedSkillForAgent: "{skillId} installé pour {agentId}.",
          sharedSkillSavedMessage: "Compétence partagée enregistrée.",
          authorizationCodeOrAppPassword: "Code d’autorisation ou mot de passe d’application",
          passwordOrAppPassword: "Mot de passe ou mot de passe d’application",
          authorizationCodePlaceholder: "collez le code d’autorisation fourni par le provider",
          passwordPlaceholder: "requis pour IMAP/SMTP"
        }
      };

      function escapeHtmlClient(value) {
        return String(value == null ? "" : value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function resolveInitialLocale() {
        try {
          const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
          if (stored === "en" || stored === "zh-CN" || stored === "fr") {
            return stored;
          }
        } catch {}
        const browserLanguage = typeof navigator !== "undefined" ? String(navigator.language || "") : "";
        if (browserLanguage.toLowerCase().startsWith("zh")) {
          return "zh-CN";
        }
        if (browserLanguage.toLowerCase().startsWith("fr")) {
          return "fr";
        }
        return "en";
      }

      function resolveInitialThemeMode() {
        try {
          const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
          if (stored === "light" || stored === "dark") {
            return stored;
          }
        } catch {}
        return document.documentElement.getAttribute("data-theme-mode") === "light" ? "light" : "dark";
      }

      function interpolate(template, values) {
        return String(template || "").replace(/\{(\w+)\}/g, function(_, key) {
          return values && values[key] != null ? String(values[key]) : "";
        });
      }

      function t(key, values) {
        const table = TRANSLATIONS[state.locale] || TRANSLATIONS.en;
        const fallback = TRANSLATIONS.en[key] || key;
        return interpolate(table[key] || fallback, values);
      }

      function formatTime(value) {
        if (!value) return "n/a";
        try {
          const locale = state.locale === "zh-CN" ? "zh-CN" : state.locale === "fr" ? "fr-FR" : "en-US";
          return new Date(value).toLocaleString(locale);
        } catch {
          return String(value);
        }
      }

      function formatDurationMs(value) {
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
          return t("durationNotAvailable");
        }
        const totalSeconds = Math.max(0, Math.round(value / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) {
          return hours + "h " + minutes + "m";
        }
        if (minutes > 0) {
          return minutes + "m " + seconds + "s";
        }
        return seconds + "s";
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
        if (segments[0] === "home") {
          parsed.mode = "home";
        }
        if (segments[0] === "connect") {
          parsed.mode = "home";
        }
        if (segments[0] === "accounts" && segments[1]) {
          parsed.accountId = decodeURIComponent(segments[1]);
          parsed.mode = "accounts";
        }
        if (segments[0] === "agents") {
          parsed.mode = "agents";
        }
        if (segments[0] === "skills") {
          parsed.mode = "skills";
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
          parsed.mode = params.get("mode") === "connect" ? "home" : params.get("mode");
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
          parsed.mode = "home";
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

      function getRoomDisplayTitle(room) {
        if (!room) {
          return "";
        }
        return room.displayTitle || room.latestSubject || room.roomKey || "";
      }

      function findRoomByKey(roomKey) {
        const rooms = state.data && Array.isArray(state.data.rooms) ? state.data.rooms : [];
        return rooms.find(function(room) { return room.roomKey === roomKey; }) || null;
      }

      function getRoomVisibleAgents(room) {
        if (!room) {
          return [];
        }
        const agents = [];
        [
          room.frontAgentId,
          room.frontAgentAddress
        ].concat(
          room.publicAgentIds || [],
          room.publicAgentAddresses || [],
          room.collaboratorAgentIds || [],
          room.collaboratorAgentAddresses || [],
          room.summonedRoles || []
        ).forEach(function(value) {
          const normalized = String(value || "").trim();
          if (normalized && !agents.includes(normalized)) {
            agents.push(normalized);
          }
        });
        return agents;
      }

      function isAgentVirtualMailbox(mailbox) {
        const mailboxId = String(mailbox && mailbox.mailboxId ? mailbox.mailboxId : "").trim();
        const kind = String(mailbox && mailbox.kind ? mailbox.kind : "").trim();
        if (!mailboxId || kind === "human" || kind === "system") {
          return false;
        }
        return (
          mailboxId.startsWith("public:") ||
          mailboxId.startsWith("internal:") ||
          kind === "public" ||
          kind === "internal_role" ||
          kind === "governance"
        );
      }

      function getRoomAgentMailboxEntries(roomDetail) {
        const room = roomDetail && roomDetail.room ? roomDetail.room : null;
        const connect = getConnectWorkspace();
        const directory = connect && Array.isArray(connect.agentDirectory) ? connect.agentDirectory : [];
        const visibleTokenSet = new Set(getRoomVisibleAgents(room).map(function(value) {
          return String(value || "").trim();
        }).filter(Boolean));
        const roomMailboxes = Array.isArray(roomDetail && roomDetail.mailboxes)
          ? roomDetail.mailboxes.filter(isAgentVirtualMailbox)
          : [];
        return directory.map(function(entry) {
          const entryMailboxIds = Array.isArray(entry && entry.virtualMailboxes) ? entry.virtualMailboxes : [];
          const matchedRoomMailboxes = roomMailboxes.filter(function(mailbox) {
            return entryMailboxIds.includes(mailbox.mailboxId);
          });
          const visible =
            [
              entry && entry.agentId,
              entry && entry.publicMailboxId,
              entry && entry.displayName
            ].concat(entryMailboxIds).some(function(value) {
              const normalized = String(value || "").trim();
              return normalized.length > 0 && visibleTokenSet.has(normalized);
            }) || matchedRoomMailboxes.length > 0;
          if (!visible) {
            return null;
          }
          return {
            ...entry,
            roomMailboxes: matchedRoomMailboxes
          };
        }).filter(Boolean);
      }

      function renderRoomAgentMailboxCard(entry, room) {
        const roomMailboxes = Array.isArray(entry && entry.roomMailboxes) ? entry.roomMailboxes : [];
        const roomKey = room && room.roomKey ? room.roomKey : null;
        const accountId = room && room.accountId ? room.accountId : null;
        const roomDetail = state.data && state.data.roomDetail ? state.data.roomDetail : null;
        const roomMessages = Array.isArray(roomDetail && roomDetail.virtualMessages) ? roomDetail.virtualMessages : [];
        return (
          '<details class="source-mail-card">' +
          '<summary class="source-mail-card__summary">' +
          '<div class="source-mail-card__meta"><div><div class="title">' + escapeHtmlClient(entry.displayName || entry.agentId || "agent") + '</div><div class="card-subtitle code">' + escapeHtmlClient(entry.agentId || "agent") + '</div></div><span class="muted">' + escapeHtmlClient(String(roomMailboxes.length) + " " + t("mailboxCountLabel")) + '</span></div>' +
          '<div class="detail">' + escapeHtmlClient(roomMailboxes.map(function(mailbox) { return mailbox.mailboxId; }).join(" · ") || t("noMailboxParticipation")) + '</div>' +
          '</summary>' +
          '<div class="source-mail-card__body">' +
          (entry.purpose ? '<div class="detail">' + escapeHtmlClient(entry.purpose) + '</div>' : '') +
          (roomMailboxes.length > 0
            ? '<div class="mailbox-feed">' + roomMailboxes.map(function(mailbox) {
                const mailboxMessages = roomMessages.filter(function(message) {
                  return (
                    message.fromMailboxId === mailbox.mailboxId ||
                    (Array.isArray(message.toMailboxIds) && message.toMailboxIds.includes(mailbox.mailboxId)) ||
                    (Array.isArray(message.ccMailboxIds) && message.ccMailboxIds.includes(mailbox.mailboxId))
                  );
                });
                const latestLine = mailbox.latestSubject
                  ? t("latestMessage") + ": " + mailbox.latestSubject
                  : t("noMailboxMessagesProjected");
                return (
                  '<div class="feed-entry">' +
                  '<div class="meta"><span>' + escapeHtmlClient(mailbox.kind || "mailbox") + (mailbox.role ? " / " + escapeHtmlClient(mailbox.role) : "") + '</span><span>' + escapeHtmlClient(formatTime(mailbox.latestMessageAt)) + '</span></div>' +
                  '<div class="chips">' + renderMailboxChip(mailbox.mailboxId, roomKey, accountId) + '</div>' +
                  '<div class="detail">' + escapeHtmlClient(latestLine) + '</div>' +
                  (mailboxMessages.length > 0
                    ? '<div class="mailbox-feed">' + mailboxMessages.map(function(message) {
                        return renderVirtualMessageEntry(message);
                      }).join("") + '</div>'
                    : '<div class="empty">' + escapeHtmlClient(t("noMailboxMessagesProjected")) + '</div>') +
                  '</div>'
                );
              }).join("") + '</div>'
            : '<div class="empty">' + escapeHtmlClient(t("noMailboxParticipation")) + '</div>') +
          '</div>' +
          '</details>'
        );
      }

      function renderSourceMailCard(mail, options) {
        const expanded = options && options.expanded;
        const summaryLine = mail && mail.excerpt ? mail.excerpt : t("openOriginalDetails");
        const recipients = Array.isArray(mail && mail.to) && mail.to.length > 0 ? mail.to.join(", ") : "n/a";
        const ccList = Array.isArray(mail && mail.cc) && mail.cc.length > 0 ? mail.cc.join(", ") : "";
        const body = mail && mail.textBody ? mail.textBody : summaryLine;
        return (
          '<details class="source-mail-card"' + (expanded ? " open" : "") + '>' +
          '<summary class="source-mail-card__summary">' +
          '<div class="source-mail-card__meta"><div><div class="title">' + escapeHtmlClient((mail && mail.subject) || "Mail") + '</div><div class="card-subtitle">' + escapeHtmlClient((mail && mail.from) || "n/a") + '</div></div><span class="muted">' + escapeHtmlClient(formatTime(mail && mail.receivedAt)) + '</span></div>' +
          '<div class="detail">' + escapeHtmlClient(summaryLine) + '</div>' +
          '</summary>' +
          '<div class="source-mail-card__body">' +
          '<div class="source-mail-card__grid">' +
          '<div class="source-mail-card__field"><div class="section-label">' + escapeHtmlClient(t("fromLabel")) + '</div><div class="detail">' + escapeHtmlClient((mail && mail.from) || "n/a") + '</div></div>' +
          '<div class="source-mail-card__field"><div class="section-label">' + escapeHtmlClient(t("toLabel")) + '</div><div class="detail">' + escapeHtmlClient(recipients) + '</div></div>' +
          (ccList ? '<div class="source-mail-card__field"><div class="section-label">' + escapeHtmlClient(t("ccLabel")) + '</div><div class="detail">' + escapeHtmlClient(ccList) + '</div></div>' : '') +
          '<div class="source-mail-card__field"><div class="section-label">' + escapeHtmlClient(t("receivedAtLabel")) + '</div><div class="detail">' + escapeHtmlClient(formatTime(mail && mail.receivedAt)) + '</div></div>' +
          '</div>' +
          '<div class="section-label">' + escapeHtmlClient(t("bodyLabel")) + '</div>' +
          '<pre class="mail-body">' + escapeHtmlClient(body || "") + '</pre>' +
          '</div>' +
          '</details>'
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

      function getSelectedAgentId(connect) {
        const directory = connect && Array.isArray(connect.agentDirectory) ? connect.agentDirectory : [];
        const stored =
          state.connect && typeof state.connect.selectedAgentId === "string" ? state.connect.selectedAgentId.trim() : "";
        if (stored && directory.some(function(entry) { return entry.agentId === stored; })) {
          return stored;
        }
        return directory[0] && directory[0].agentId ? directory[0].agentId : "";
      }

      function getSelectedAgentEntry(connect) {
        const directory = connect && Array.isArray(connect.agentDirectory) ? connect.agentDirectory : [];
        const selectedAgentId = getSelectedAgentId(connect);
        return directory.find(function(entry) { return entry.agentId === selectedAgentId; }) || null;
      }

      function getConnectWorkspace() {
        const workspace = state.data && state.data.workspace ? state.data.workspace : null;
        return workspace && workspace.connect ? workspace.connect : null;
      }

      function getConnectSetupState() {
        const connect = getConnectWorkspace();
        const stored = state.connect || {};
        const plan = stored.plan || (connect && connect.defaultPlan ? connect.defaultPlan : null);
        const providerOptions = connect && Array.isArray(connect.providerOptions) ? connect.providerOptions : [];
        const provider = stored.provider || (plan && plan.recommendation ? plan.recommendation.provider : null);
        const providerId =
          (typeof stored.providerId === "string" && stored.providerId.trim().length > 0 ? stored.providerId.trim() : "") ||
          (provider && typeof provider.id === "string" ? provider.id : "") ||
          (providerOptions[0] && typeof providerOptions[0].id === "string" ? providerOptions[0].id : "imap");
        const autoconfig = stored.autoconfig || (plan && plan.autoconfig ? plan.autoconfig : null);
        const accountIdSuggestion =
          plan && plan.input && typeof plan.input.accountIdSuggestion === "string" ? plan.input.accountIdSuggestion : "";
        const displayNameSuggestion =
          plan && plan.input && typeof plan.input.displayNameSuggestion === "string" ? plan.input.displayNameSuggestion : "";

        return {
          connect,
          plan,
          provider,
          providerId,
          providerOptions,
          autoconfig,
          emailAddress:
            typeof stored.emailAddress === "string"
              ? stored.emailAddress
              : plan && plan.input && typeof plan.input.emailAddress === "string"
                ? plan.input.emailAddress
                : "",
          accountId:
            typeof stored.accountId === "string" && stored.accountId.trim().length > 0
              ? stored.accountId
              : accountIdSuggestion === "<accountId>"
                ? ""
                : accountIdSuggestion,
          displayName:
            typeof stored.displayName === "string" && stored.displayName.trim().length > 0
              ? stored.displayName
              : displayNameSuggestion,
          password: typeof stored.password === "string" ? stored.password : "",
          imapHost:
            typeof stored.imapHost === "string" && stored.imapHost.trim().length > 0
              ? stored.imapHost
              : autoconfig && typeof autoconfig.imapHost === "string"
                ? autoconfig.imapHost
                : "",
          imapPort:
            typeof stored.imapPort === "string" && stored.imapPort.trim().length > 0
              ? stored.imapPort
              : autoconfig && typeof autoconfig.imapPort === "number"
                ? String(autoconfig.imapPort)
                : "993",
          imapSecure:
            typeof stored.imapSecure === "string" && stored.imapSecure.trim().length > 0
              ? stored.imapSecure
              : autoconfig && typeof autoconfig.imapSecure === "boolean"
                ? (autoconfig.imapSecure ? "yes" : "no")
                : "yes",
          imapMailbox:
            typeof stored.imapMailbox === "string" && stored.imapMailbox.trim().length > 0
              ? stored.imapMailbox
              : autoconfig && typeof autoconfig.imapMailbox === "string"
                ? autoconfig.imapMailbox
                : "INBOX",
          smtpHost:
            typeof stored.smtpHost === "string" && stored.smtpHost.trim().length > 0
              ? stored.smtpHost
              : autoconfig && typeof autoconfig.smtpHost === "string"
                ? autoconfig.smtpHost
                : "",
          smtpPort:
            typeof stored.smtpPort === "string" && stored.smtpPort.trim().length > 0
              ? stored.smtpPort
              : autoconfig && typeof autoconfig.smtpPort === "number"
                ? String(autoconfig.smtpPort)
                : "587",
          smtpSecure:
            typeof stored.smtpSecure === "string" && stored.smtpSecure.trim().length > 0
              ? stored.smtpSecure
              : autoconfig && typeof autoconfig.smtpSecure === "boolean"
                ? (autoconfig.smtpSecure ? "yes" : "no")
                : "no",
          smtpFrom:
            typeof stored.smtpFrom === "string" && stored.smtpFrom.trim().length > 0
              ? stored.smtpFrom
              : typeof stored.emailAddress === "string" && stored.emailAddress.trim().length > 0
                ? stored.emailAddress
                : plan && plan.input && typeof plan.input.emailAddress === "string"
                  ? plan.input.emailAddress
                  : "",
          clientId: typeof stored.clientId === "string" ? stored.clientId : "",
          clientSecret: typeof stored.clientSecret === "string" ? stored.clientSecret : "",
          tenant: typeof stored.tenant === "string" ? stored.tenant : "",
          topicName: typeof stored.topicName === "string" ? stored.topicName : "",
          userId: typeof stored.userId === "string" ? stored.userId : "",
          labelIds: typeof stored.labelIds === "string" ? stored.labelIds : "",
          scopes: typeof stored.scopes === "string" ? stored.scopes : ""
        };
      }

      function readConnectField(root, name) {
        const element = root.querySelector('[data-connect-field="' + name + '"]');
        return element && "value" in element ? String(element.value || "").trim() : "";
      }

      function readConnectFormState(target) {
        const root = (target && target.closest(".connect-config-panel")) || document;
        const defaults = getConnectSetupState();
        const stored = state.connect || {};
        return {
          emailAddress: readConnectField(root, "emailAddress"),
          providerId:
            readConnectField(root, "providerId") ||
            (typeof stored.providerId === "string" ? stored.providerId : "") ||
            defaults.providerId ||
            "",
          accountId:
            readConnectField(root, "accountId") ||
            (typeof stored.accountId === "string" ? stored.accountId : "") ||
            defaults.accountId ||
            "",
          displayName:
            readConnectField(root, "displayName") ||
            (typeof stored.displayName === "string" ? stored.displayName : "") ||
            defaults.displayName ||
            "",
          password: readConnectField(root, "password"),
          imapHost: readConnectField(root, "imapHost"),
          imapPort: readConnectField(root, "imapPort"),
          imapSecure: readConnectField(root, "imapSecure") || "yes",
          imapMailbox: readConnectField(root, "imapMailbox"),
          smtpHost: readConnectField(root, "smtpHost"),
          smtpPort: readConnectField(root, "smtpPort"),
          smtpSecure: readConnectField(root, "smtpSecure") || "no",
          smtpFrom: readConnectField(root, "smtpFrom"),
          clientId: readConnectField(root, "clientId"),
          clientSecret: readConnectField(root, "clientSecret"),
          tenant: readConnectField(root, "tenant"),
          topicName: readConnectField(root, "topicName"),
          userId: readConnectField(root, "userId"),
          labelIds: readConnectField(root, "labelIds"),
          scopes: readConnectField(root, "scopes")
        };
      }

      function rememberConnectFormState(target) {
        state.connect = {
          ...(state.connect || {}),
          ...readConnectFormState(target)
        };
        return state.connect;
      }

      function renderConnectRuntimePanel(setup) {
        const runtimeResponse = state.runtime;
        const runtime = runtimeResponse && runtimeResponse.runtime ? runtimeResponse.runtime : runtimeResponse;
        const plan = setup.plan;
        const startCommand =
          plan && plan.migration && plan.migration.openClawUsers
            ? plan.migration.openClawUsers.startCommand
            : "MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true MAILCLAW_FEATURE_MAIL_INGEST=true pnpm dev";
        if (!runtime) {
          return '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("runtimeAndLlm")) + '</h3></div><div class="panel-body"><div class="empty">' + escapeHtmlClient(t("loadingRuntimeBoundary")) + '</div></div></div>';
        }

        const reusesOpenClaw = runtime.runtimeKind === "bridge";
        const title = reusesOpenClaw ? t("openclawRuntimeActive") : t("localRuntimeActive");
        const copy = reusesOpenClaw
          ? t("openclawRuntimeCopy")
          : t("localRuntimeCopy");
        const statusTone = reusesOpenClaw ? "setup-note setup-note--ok" : "setup-note setup-note--warn";

        return (
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("runtimeAndLlm")) + '</h3><span class="muted">' + escapeHtmlClient(runtime.runtimeKind || "runtime") + '</span></div><div class="panel-body">' +
          '<div class="' + statusTone + '">' +
          '<div class="title">' + escapeHtmlClient(title) + '</div>' +
          '<div class="detail">' + escapeHtmlClient(copy) + '</div>' +
          '</div>' +
          '<div class="detail-grid">' +
          renderMetric("runtime", runtime.runtimeKind || "unknown") +
          renderMetric("label", runtime.runtimeLabel || "unknown") +
          renderMetric("backend", runtime.backendEnforcement || "unknown") +
          renderMetric("bridge sessions", String(runtimeResponse && typeof runtimeResponse.bridgeSessionCount === "number" ? runtimeResponse.bridgeSessionCount : 0)) +
          '</div>' +
          (!reusesOpenClaw
            ? '<div class="setup-stack">' +
              '<div class="detail">' + escapeHtmlClient(t("openclawBridgeHint")) + '</div>' +
              '<div class="mono-block">' + escapeHtmlClient(startCommand) + '</div>' +
              '</div>'
            : '') +
          '</div></div>'
        );
      }

      function renderConnectMailboxPanel(setup) {
        const provider = setup.provider || {};
        const providerSetupKind = provider.setupKind || "app_password";
        const providerDisplayName = provider.displayName || setup.providerId || "Mailbox";
        const requiredEnvVars = Array.isArray(provider.requiredEnvVars) ? provider.requiredEnvVars : [];
        const notes = Array.isArray(provider.notes) ? provider.notes : [];
        const status = state.connect && state.connect.status ? state.connect.status : null;
        const recommendation = setup.plan && setup.plan.recommendation ? setup.plan.recommendation : null;
        const setupNoteTone = status && status.tone === "danger"
          ? "setup-note setup-note--danger"
          : status && status.tone === "ok"
            ? "setup-note setup-note--ok"
            : "setup-note";

        return (
          '<div class="panel connect-config-panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("connectPanel")) + '</h3><span class="muted">' + escapeHtmlClient(providerDisplayName) + '</span></div><div class="panel-body">' +
          '<div class="setup-stack">' +
          (status
            ? '<div class="' + setupNoteTone + '"><div class="detail-strong">' + escapeHtmlClient(status.message || "") + '</div></div>'
            : '') +
          '<div class="detail-grid">' +
          '<label><div class="section-label">' + escapeHtmlClient(t("emailAddressLabel")) + '</div><input class="console-input" data-connect-field="emailAddress" type="email" placeholder="user@example.com" value="' + escapeHtmlClient(setup.emailAddress || "") + '" /></label>' +
          (setup.plan
            ? '<label><div class="section-label">' + escapeHtmlClient(t("providerLabel")) + '</div><input class="console-input" value="' + escapeHtmlClient(providerDisplayName) + '" readonly /></label>'
            : '') +
          '</div>' +
          '<div class="actions-inline">' +
          '<button class="btn" data-action="prepare-connect-plan">' + escapeHtmlClient(t("loadSetup")) + '</button>' +
          '</div>' +
          (recommendation
            ? '<div class="setup-note"><div class="detail-strong">' + escapeHtmlClient(t("recommendedPath")) + ': ' + escapeHtmlClient(recommendation.provider.displayName || recommendation.provider.id || setup.providerId) + '</div><div class="detail">' + escapeHtmlClient(t("matchReasonLabel")) + ': ' + escapeHtmlClient(recommendation.matchReason || "manual") + '. ' + escapeHtmlClient(t("setupKindLabel")) + ': ' + escapeHtmlClient(recommendation.provider.setupKind || providerSetupKind) + '.</div></div>'
            : '') +
          (setup.autoconfig
            ? '<div class="setup-note"><div class="detail-strong">' + escapeHtmlClient(t("autoconfigReady")) + '</div><div class="detail">IMAP ' + escapeHtmlClient(setup.autoconfig.imapHost || "") + ':' + escapeHtmlClient(setup.autoconfig.imapPort || "") + ' · SMTP ' + escapeHtmlClient(setup.autoconfig.smtpHost || "") + ':' + escapeHtmlClient(setup.autoconfig.smtpPort || "") + (setup.autoconfig.source ? ' · source ' + escapeHtmlClient(setup.autoconfig.source) : '') + '</div>' + (setup.autoconfig.warning ? '<div class="field-note">' + escapeHtmlClient(setup.autoconfig.warning) + '</div>' : '') + '</div>'
            : '') +
          '<div class="setup-note"><div class="detail-strong">' + escapeHtmlClient(providerDisplayName) + '</div><div class="detail">' + escapeHtmlClient(notes[0] || t("useRecommendedProviderCopy")) + '</div>' + (requiredEnvVars.length > 0 ? '<div class="field-note">' + escapeHtmlClient(t("requiredEnvLabel")) + ': ' + escapeHtmlClient(requiredEnvVars.join(", ")) + '</div>' : '') + '</div>' +
          (setup.plan
            ? (providerSetupKind === "browser_oauth"
              ? '<div class="detail">' + escapeHtmlClient(t("oauthDetectedCopy")) + '</div>'
              : providerSetupKind === "forward_ingest"
                ? renderConnectForwardForm(setup)
                : renderConnectPasswordForm(setup, provider))
            : '') +
          '</div>' +
          '</div></div>'
        );
      }

      function renderConnectOAuthForm(setup, provider) {
        const providerId = provider && provider.id ? provider.id : setup.providerId;
        const providerDisplayName = provider && provider.displayName ? provider.displayName : providerId;
        const supportsTopic = providerId === "gmail";
        const supportsTenant = providerId === "outlook";
        const providerHelpUrl = provider && provider.helpUrl ? provider.helpUrl : "";
        const providerHelpLabel = provider && provider.helpLabel ? provider.helpLabel : t("providerHelp");
        const secretAutomationReason =
          provider && provider.secretAutomation === "not_supported" && provider.secretAutomationReason
            ? provider.secretAutomationReason
            : "";

        return (
          '<div class="setup-stack">' +
          '<div class="detail">' + escapeHtmlClient(t("oauthStartsHere")) + '</div>' +
          (secretAutomationReason ? '<div class="field-note">' + escapeHtmlClient(secretAutomationReason) + '</div>' : '') +
          (providerHelpUrl
            ? '<div class="actions-inline"><a class="btn" href="' + escapeHtmlClient(providerHelpUrl) + '" target="_blank" rel="noreferrer">' + escapeHtmlClient(providerHelpLabel) + '</a></div>'
            : '') +
          '<div class="detail-grid">' +
          '<label><div class="section-label">' + escapeHtmlClient(t("oauthClientId")) + '</div><input class="console-input" data-connect-field="clientId" placeholder="optional override" value="' + escapeHtmlClient(setup.clientId || "") + '" /></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("oauthClientSecret")) + '</div><input class="console-input" data-connect-field="clientSecret" type="password" placeholder="optional override" value="' + escapeHtmlClient(setup.clientSecret || "") + '" /></label>' +
          (supportsTenant
            ? '<label><div class="section-label">' + escapeHtmlClient(t("tenantLabel")) + '</div><input class="console-input" data-connect-field="tenant" placeholder="common" value="' + escapeHtmlClient(setup.tenant || "") + '" /></label>'
            : '<label><div class="section-label">' + escapeHtmlClient(t("userIdLabel")) + '</div><input class="console-input" data-connect-field="userId" placeholder="me" value="' + escapeHtmlClient(setup.userId || "") + '" /></label>') +
          '<label><div class="section-label">' + escapeHtmlClient(t("scopesLabel")) + '</div><input class="console-input" data-connect-field="scopes" placeholder="comma separated, optional" value="' + escapeHtmlClient(setup.scopes || "") + '" /></label>' +
          (supportsTopic
            ? '<label><div class="section-label">' + escapeHtmlClient(t("pubsubTopic")) + '</div><input class="console-input" data-connect-field="topicName" placeholder="projects/.../topics/..." value="' + escapeHtmlClient(setup.topicName || "") + '" /></label>'
            : '<label><div class="section-label">' + escapeHtmlClient(t("labelIdsLabel")) + '</div><input class="console-input" data-connect-field="labelIds" placeholder="optional, comma separated" value="' + escapeHtmlClient(setup.labelIds || "") + '" /></label>') +
          '</div>' +
          (supportsTopic
            ? '<label><div class="section-label">' + escapeHtmlClient(t("labelIdsLabel")) + '</div><input class="console-input" data-connect-field="labelIds" placeholder="INBOX,IMPORTANT" value="' + escapeHtmlClient(setup.labelIds || "") + '" /></label>'
            : '') +
          '<div class="actions-inline"><button class="btn primary" data-action="start-oauth-connect" data-provider-id="' + escapeHtmlClient(providerId || "") + '">' + escapeHtmlClient(t("continueWith", { provider: providerDisplayName || "OAuth" })) + '</button></div>' +
          '</div>'
        );
      }

      function renderConnectPasswordForm(setup, provider) {
        const providerPortalUrl = provider && provider.portalUrl ? provider.portalUrl : "";
        const providerPortalLabel =
          provider && provider.portalLabel ? provider.portalLabel : t("providerMail");
        const providerHelpUrl = provider && provider.helpUrl ? provider.helpUrl : "";
        const providerHelpLabel = provider && provider.helpLabel ? provider.helpLabel : t("providerHelp");
        const credentialMode = provider && provider.credentialMode ? provider.credentialMode : "manual_password";
        const secretAutomationReason =
          provider && provider.secretAutomation === "not_supported" && provider.secretAutomationReason
            ? provider.secretAutomationReason
            : "";
        const secretLabel =
          credentialMode === "manual_authorization_code"
            ? t("authorizationCodeOrAppPassword")
            : t("passwordOrAppPassword");
        const secretPlaceholder =
          credentialMode === "manual_authorization_code"
            ? t("authorizationCodePlaceholder")
            : t("passwordPlaceholder");
        return (
          '<div class="setup-stack">' +
          '<div class="detail">' + escapeHtmlClient(t("passwordPathCopy")) + '</div>' +
          (secretAutomationReason ? '<div class="field-note">' + escapeHtmlClient(secretAutomationReason) + '</div>' : '') +
          ((providerPortalUrl || providerHelpUrl)
            ? '<div class="actions-inline">' +
              (providerPortalUrl
                ? '<a class="btn" href="' + escapeHtmlClient(providerPortalUrl) + '" target="_blank" rel="noreferrer">' + escapeHtmlClient(providerPortalLabel) + '</a>'
                : '') +
              (providerHelpUrl
                ? '<a class="btn" href="' + escapeHtmlClient(providerHelpUrl) + '" target="_blank" rel="noreferrer">' + escapeHtmlClient(providerHelpLabel) + '</a>'
                : '') +
              '</div>'
            : '') +
          '<label><div class="section-label">' + escapeHtmlClient(secretLabel) + '</div><input class="console-input" data-connect-field="password" type="password" placeholder="' + escapeHtmlClient(secretPlaceholder) + '" value="' + escapeHtmlClient(setup.password || "") + '" /></label>' +
          '<details class="advanced-settings"><summary>' + escapeHtmlClient(t("advancedSettings")) + '</summary><div class="field-note">' + escapeHtmlClient(t("advancedSettingsCopy")) + '</div>' +
          '<div class="detail-grid">' +
          '<label><div class="section-label">' + escapeHtmlClient(t("imapHostLabel")) + '</div><input class="console-input" data-connect-field="imapHost" placeholder="imap.example.com" value="' + escapeHtmlClient(setup.imapHost || "") + '" /></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("imapPortLabel")) + '</div><input class="console-input" data-connect-field="imapPort" inputmode="numeric" placeholder="993" value="' + escapeHtmlClient(setup.imapPort || "") + '" /></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("imapSecureLabel")) + '</div><select class="console-input" data-connect-field="imapSecure"><option value="yes"' + (setup.imapSecure === "yes" ? ' selected' : '') + '>yes</option><option value="no"' + (setup.imapSecure === "no" ? ' selected' : '') + '>no</option></select></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("imapMailboxLabel")) + '</div><input class="console-input" data-connect-field="imapMailbox" placeholder="INBOX" value="' + escapeHtmlClient(setup.imapMailbox || "INBOX") + '" /></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("smtpHostLabel")) + '</div><input class="console-input" data-connect-field="smtpHost" placeholder="smtp.example.com" value="' + escapeHtmlClient(setup.smtpHost || "") + '" /></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("smtpPortLabel")) + '</div><input class="console-input" data-connect-field="smtpPort" inputmode="numeric" placeholder="587" value="' + escapeHtmlClient(setup.smtpPort || "") + '" /></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("smtpSecureLabel")) + '</div><select class="console-input" data-connect-field="smtpSecure"><option value="yes"' + (setup.smtpSecure === "yes" ? ' selected' : '') + '>yes</option><option value="no"' + (setup.smtpSecure === "no" ? ' selected' : '') + '>no</option></select></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("smtpFromLabel")) + '</div><input class="console-input" data-connect-field="smtpFrom" placeholder="user@example.com" value="' + escapeHtmlClient(setup.smtpFrom || "") + '" /></label>' +
          '</div></details>' +
          '<div class="actions-inline"><button class="btn primary" data-action="save-password-mailbox">' + escapeHtmlClient(t("saveMailboxConfig")) + '</button></div>' +
          '</div>'
        );
      }

      function renderConnectForwardForm(setup) {
        const command =
          setup.plan && setup.plan.commands && typeof setup.plan.commands.inspectProvider === "string"
            ? setup.plan.commands.inspectProvider
            : "mailctl connect providers forward";
        return (
          '<div class="setup-stack">' +
          '<div class="setup-note setup-note--warn"><div class="detail-strong">' + escapeHtmlClient(t("forwardIngestTitle")) + '</div><div class="detail">' + escapeHtmlClient(t("forwardIngestCopy")) + '</div></div>' +
          '<div class="mono-block">' + escapeHtmlClient(command) + '</div>' +
          '</div>'
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
          '<div class="detail">' + escapeHtmlClient(t("latestActivity")) + ' ' + escapeHtmlClient(formatTime(account.latestActivityAt)) + "</div>" +
          "</button>"
        );
      }

      function isWorkingRoom(room) {
        if (room.state === "failed" || room.mailTaskStage === "failed" || room.mailTaskStage === "stale") {
          return false;
        }
        return (
          ["queued", "running", "waiting_workers", "replying", "handoff"].includes(room.state || "") ||
          ["in_progress", "ack", "progress", "follow_up", "handoff"].includes(room.mailTaskStage || "") ||
          Number(room.openDeliveryCount || 0) > 0
        );
      }

      function getRoomProgressPercent(room) {
        if (!isWorkingRoom(room)) {
          return 0;
        }
        if (room.state === "queued" || room.mailTaskStage === "triaged") {
          return 18;
        }
        if (room.state === "running" || room.mailTaskStage === "in_progress") {
          return 42;
        }
        if (room.state === "waiting_workers" || room.mailTaskStage === "progress") {
          return 58;
        }
        if (room.mailTaskStage === "ack" || room.mailTaskStage === "follow_up") {
          return 72;
        }
        if (room.state === "handoff" || room.mailTaskStage === "handoff" || room.mailTaskStage === "waiting_external") {
          return 80;
        }
        if (room.state === "replying" || room.openDeliveryCount > 0 || room.mailTaskStage === "final") {
          return 92;
        }
        return 36;
      }

      function renderRoomCard(room) {
        const working = isWorkingRoom(room);
        const cardClass = "list-card" + (working ? " list-card--working" : "") + (room.roomKey === state.route.roomKey ? " active" : "");
        const progressStyle = working ? ' style="--room-progress:' + escapeHtmlClient(String(getRoomProgressPercent(room))) + '%"' : "";
        return (
          '<button class="' + cardClass + '"' + progressStyle + ' data-action="select-room" data-room-key="' + escapeHtmlClient(room.roomKey) + '" data-account-id="' + escapeHtmlClient(room.accountId || "") + '">' +
          '<div class="card-top">' +
          '<div>' +
          '<div class="card-title">' + escapeHtmlClient(getRoomDisplayTitle(room)) + "</div>" +
          '<div class="card-subtitle code">' + escapeHtmlClient(room.roomKey) + "</div>" +
          "</div>" +
          renderPill(room.state || "open", "") +
          "</div>" +
          '<div class="chips">' +
          renderPill("attention " + escapeHtmlClient(room.attention || "normal"), "") +
          renderPill("rev " + escapeHtmlClient(room.revision || 0), "") +
          renderPill(String(room.visibleAgentCount || 0) + " " + t("agents"), "") +
          renderPill(String(room.messageCount || 0) + " mail", "") +
          renderPill(String(room.resourceCount || 0) + " resources", "") +
          renderPill(String(room.pendingApprovalCount || 0) + " approvals", Number(room.pendingApprovalCount || 0) > 0 ? "pill--warn" : "") +
          (room.mailTaskKind ? renderPill("task " + room.mailTaskKind, "") : "") +
          (room.mailTaskStage ? renderPill("stage " + room.mailTaskStage, "") : "") +
          '</div>' +
          '<div class="detail">' + escapeHtmlClient(t("processed")) + ' ' + escapeHtmlClient(formatTime(room.latestActivityAt)) + '</div>' +
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
          '<div class="detail">' + escapeHtmlClient(t("updated")) + ' ' + escapeHtmlClient(formatTime(approval.updatedAt)) + "</div>" +
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
          '<div class="detail">' + escapeHtmlClient(t("latest")) + ' ' + escapeHtmlClient(formatTime(mailbox.latestMessageAt)) + "</div>" +
          "</button>"
        );
      }

      function renderInboxCard(entry) {
        const inbox = entry.inbox || {};
        const items = entry.items || [];
        return (
          '<button class="list-card' + (inbox.inboxId === state.route.inboxId ? " active" : "") + '" data-action="select-inbox" data-account-id="' + escapeHtmlClient(inbox.accountId || state.route.accountId || "") + '" data-inbox-id="' + escapeHtmlClient(inbox.inboxId || "") + '">' +
          '<div class="card-top">' +
          '<div><div class="card-title code">' + escapeHtmlClient(inbox.inboxId || "inbox") + '</div><div class="card-subtitle">' + escapeHtmlClient(inbox.agentId || "agent") + " / " + escapeHtmlClient(t("publicInbox").toLowerCase()) + '</div></div>' +
          renderPill(String(items.length) + " rooms", items.length > 0 ? "pill--warn" : "") +
          "</div>" +
          '<div class="chips">' +
          renderPill("ACK " + escapeHtmlClient(inbox.ackSlaSeconds || 0) + "s", "") +
          renderPill("limit " + escapeHtmlClient(inbox.activeRoomLimit || 0), "") +
          renderPill("burst " + escapeHtmlClient(inbox.burstCoalesceSeconds || 0) + "s", "") +
          "</div>" +
          '<div class="detail">' + escapeHtmlClient(items.slice(0, 2).map(function(item) { return item.roomKey; }).join(", ") || t("noProjectedRooms")) + "</div>" +
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

      function renderMailboxChip(mailboxId, roomKey, accountId) {
        const resolvedAccountId =
          accountId ||
          state.route.accountId ||
          (state.data && state.data.selection && state.data.selection.accountId) ||
          "";
        return '<button class="link-chip' + (mailboxId === state.route.mailboxId ? " active" : "") + '" data-action="select-mailbox" data-account-id="' + escapeHtmlClient(resolvedAccountId) + '" data-mailbox-id="' + escapeHtmlClient(mailboxId) + '"' + (roomKey ? ' data-room-key="' + escapeHtmlClient(roomKey) + '"' : "") + ">" + escapeHtmlClient(mailboxId) + "</button>";
      }

      function renderAgentTemplateCard(template, connect) {
        const accountId = connect && connect.templateApplyAccountId ? connect.templateApplyAccountId : "";
        const tenantId = connect && connect.templateApplyTenantId ? connect.templateApplyTenantId : "";
        const canApply = accountId.length > 0;
        return (
          '<div class="timeline-entry">' +
          '<div class="meta"><span>' + escapeHtmlClient(template.displayName || template.templateId || "template") + '</span><span>' + escapeHtmlClient(String((template.headcount && template.headcount.persistentAgents) || 0) + " " + t("agents")) + "</span></div>" +
          '<div class="title">' + escapeHtmlClient(template.summary || "") + "</div>" +
          '<div class="detail">' + escapeHtmlClient(template.inspiration || "") + "</div>" +
          '<div class="chips">' +
          renderPill(template.templateId || "template", "") +
          renderPill("burst " + String((template.headcount && template.headcount.burstTargets) || 0), "") +
          "</div>" +
          '<div class="detail">' + escapeHtmlClient(((template.persistentAgents || []).map(function(agent) { return agent.displayName || agent.agentId; }).join(", ")) || t("agents")) + "</div>" +
          (canApply
            ? '<div class="actions-inline"><button class="btn" data-action="apply-agent-template" data-template-id="' + escapeHtmlClient(template.templateId || "") + '" data-account-id="' + escapeHtmlClient(accountId) + '" data-tenant-id="' + escapeHtmlClient(tenantId || accountId) + '">' + escapeHtmlClient(t("applyTemplate")) + '</button></div>'
            : '<div class="detail">' + escapeHtmlClient(t("templateNeedsAccount")) + '</div>') +
          "</div>"
        );
      }

      function renderAgentDirectoryCard(entry, connect) {
        const skillGroups = connect && Array.isArray(connect.skills) ? connect.skills : [];
        const skillCount = (() => {
          const match = skillGroups.find(function(group) {
            return group.agentId === entry.agentId;
          });
          return match && Array.isArray(match.skills) ? match.skills.length : 0;
        })();
        const selected = getSelectedAgentId(connect) === entry.agentId;
        return (
          '<div class="timeline-entry' + (selected ? ' active' : '') + '">' +
          '<div class="meta"><span>' + escapeHtmlClient(entry.displayName || entry.agentId || "agent") + '</span><span>' + escapeHtmlClient(String((entry.virtualMailboxes || []).length) + " mailboxes") + "</span></div>" +
          '<div class="title code">' + escapeHtmlClient(entry.publicMailboxId || ("public:" + (entry.agentId || "agent"))) + "</div>" +
          '<div class="detail">' + escapeHtmlClient(entry.purpose || "") + "</div>" +
          '<div class="chips">' +
          (entry.templateId ? renderPill(entry.templateId, "") : "") +
          renderPill(String(skillCount) + " skills", "") +
          ((entry.collaboratorAgentIds || []).slice(0, 3).map(function(agentId) { return renderPill("works with " + agentId, ""); }).join("")) +
          "</div>" +
          (entry.soulPath ? '<div class="detail code">' + escapeHtmlClient(entry.soulPath) + '</div>' : '<div class="detail">' + escapeHtmlClient(t("noSoulInitialized")) + '</div>') +
          ((entry.virtualMailboxes || []).length > 0
            ? '<div class="detail code">' + escapeHtmlClient((entry.virtualMailboxes || []).join(", ")) + "</div>"
            : "") +
          '<div class="timeline-entry__actions"><button class="btn" data-action="select-agent" data-agent-id="' + escapeHtmlClient(entry.agentId || "") + '">' + escapeHtmlClient(selected ? t("selectedAgent") : t("manageAgent")) + '</button></div>' +
          "</div>"
        );
      }

      function renderSelectedAgentPanel(connect) {
        const selected = getSelectedAgentEntry(connect);
        if (!selected) {
          return "";
        }
        const selectedAgentId = selected.agentId || "";
        const soulLoaded = state.connect && state.connect.agentSoulAgentId === selectedAgentId;
        const soulContent =
          soulLoaded && state.connect && typeof state.connect.agentSoulContent === "string"
            ? state.connect.agentSoulContent
            : "";
        const soulStatus =
          soulLoaded && state.connect && state.connect.agentSoulStatus && typeof state.connect.agentSoulStatus.message === "string"
            ? state.connect.agentSoulStatus
            : null;
        const noteClass =
          !soulStatus
            ? ""
            : soulStatus.tone === "danger"
              ? "setup-note setup-note--danger"
              : "setup-note setup-note--ok";
        return (
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(selected.displayName || selectedAgentId) + '</h3><span class="muted code">' + escapeHtmlClient(selectedAgentId) + '</span></div><div class="panel-body">' +
          '<div class="detail">' + escapeHtmlClient(selected.purpose || "") + '</div>' +
          '<div class="chips">' +
          (selected.templateId ? renderPill(selected.templateId, "") : "") +
          ((selected.virtualMailboxes || []).map(function(mailboxId) { return renderPill(mailboxId, ""); }).join("")) +
          '</div>' +
          (soulStatus ? '<div class="' + noteClass + '">' + escapeHtmlClient(soulStatus.message) + '</div>' : '') +
          '<label><div class="section-label">' + escapeHtmlClient(t("soulLabel")) + '</div><textarea class="console-textarea" data-agent-soul-field="content" placeholder="' + escapeHtmlClient(t("soulPlaceholder")) + '">' + escapeHtmlClient(soulContent) + '</textarea></label>' +
          '<div class="actions-inline">' +
          '<button class="btn" data-action="load-agent-soul" data-agent-id="' + escapeHtmlClient(selectedAgentId) + '">' + escapeHtmlClient(soulLoaded ? t("reloadSoul") : t("loadSoul")) + '</button>' +
          '<button class="btn primary" data-action="save-agent-soul" data-agent-id="' + escapeHtmlClient(selectedAgentId) + '">' + escapeHtmlClient(t("saveSoul")) + '</button>' +
          '<button class="btn danger" data-action="delete-agent" data-agent-id="' + escapeHtmlClient(selectedAgentId) + '">' + escapeHtmlClient(t("deleteAgent")) + '</button>' +
          '</div>' +
          '</div></div>'
        );
      }

      function readSkillSourceValue(skill) {
        return (skill && (skill.sourceRef || skill.path)) ? String(skill.sourceRef || skill.path) : "";
      }

      function renderAgentSkillCard(agentId, skill) {
        const sourceValue = readSkillSourceValue(skill);
        return (
          '<div class="timeline-entry">' +
          '<div class="meta"><span>' + escapeHtmlClient(skill.title || skill.skillId || "skill") + '</span><span>' + escapeHtmlClient(skill.source || "managed") + "</span></div>" +
          '<div class="title code">' + escapeHtmlClient(skill.skillId || "skill") + "</div>" +
          (sourceValue
            ? '<div class="detail code">' + escapeHtmlClient(sourceValue) + "</div>"
            : '<div class="detail">' + escapeHtmlClient(t("noSourceReference")) + '</div>') +
          '<div class="chips">' +
          renderPill(skill.source || "managed", skill.source === "managed" ? "pill--ok" : "") +
          (sourceValue ? renderPill(t("sourceReadyLabel"), "pill--ok") : renderPill(t("inlineOnlyLabel"), "")) +
          "</div>" +
          (sourceValue
            ? '<div class="actions-inline"><button class="btn" data-action="prefill-skill-install" data-agent-id="' + escapeHtmlClient(agentId || "") + '" data-skill-source="' + escapeHtmlClient(sourceValue) + '" data-skill-id="' + escapeHtmlClient(skill.skillId || "") + '" data-skill-title="' + escapeHtmlClient(skill.title || skill.skillId || "skill") + '">' + escapeHtmlClient(t("useAsSource")) + '</button></div>'
            : "") +
          "</div>"
        );
      }

      function renderAgentSkillGroup(entry) {
        const skills = Array.isArray(entry.skills) ? entry.skills : [];
        return (
          '<div class="timeline-entry">' +
          '<div class="meta"><span>' + escapeHtmlClient(entry.displayName || entry.agentId || "agent") + '</span><span>' + escapeHtmlClient(String(skills.length) + " " + t("skillCountLabel")) + "</span></div>" +
          '<div class="title code">' + escapeHtmlClient(entry.agentId || "agent") + "</div>" +
          (skills.length > 0
            ? '<div class="chips">' + skills.map(function(skill) {
                return renderPill((skill.source || "default") + " " + (skill.skillId || "skill"), skill.source === "managed" ? "pill--ok" : "");
              }).join("") + "</div>" +
              '<div class="mailbox-feed">' + skills.map(function(skill) {
                return renderAgentSkillCard(entry.agentId || "", skill);
              }).join("") + "</div>"
            : '<div class="detail">' + escapeHtmlClient(t("noSkillsDiscovered")) + '</div>') +
          "</div>"
        );
      }

      function renderSkillInstallPanel(connect) {
        const stored = state.connect || {};
        const accountId = connect && connect.templateApplyAccountId ? connect.templateApplyAccountId : "";
        const tenantId = connect && connect.templateApplyTenantId ? connect.templateApplyTenantId : (accountId || "");
        const directory = connect && Array.isArray(connect.agentDirectory) ? connect.agentDirectory : [];
        const status = stored.skillStatus || null;
        const targetAgentId =
          typeof stored.skillTargetAgentId === "string" && stored.skillTargetAgentId.trim().length > 0
            ? stored.skillTargetAgentId
            : directory[0] && directory[0].agentId
              ? directory[0].agentId
              : "";
        const source = typeof stored.skillSource === "string" ? stored.skillSource : "";
        const skillId = typeof stored.skillId === "string" ? stored.skillId : "";
        const title = typeof stored.skillTitle === "string" ? stored.skillTitle : "";
        const noteClass =
          !status
            ? "setup-note"
            : status.tone === "danger"
              ? "setup-note setup-note--danger"
              : status.tone === "ok"
                ? "setup-note setup-note--ok"
                : "setup-note";
        return (
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("installOrReuseSkill")) + '</h3><span class="muted">' + escapeHtmlClient(directory.length > 0 ? t("targetAgentsCount", { count: directory.length }) : t("connectMailbox")) + '</span></div><div class="panel-body">' +
          '<div class="detail">' + escapeHtmlClient(t("reusableSkillHelp")) + '</div>' +
          (status ? '<div class="' + noteClass + '">' + escapeHtmlClient(status.message || "") + "</div>" : "") +
          (accountId
            ? '<div class="detail-grid">' +
              '<label><div class="section-label">' + escapeHtmlClient(t("targetAgentLabel")) + '</div><input class="console-input" data-skill-install-field="agentId" list="skill-agent-options" placeholder="assistant-ops" value="' + escapeHtmlClient(targetAgentId) + '" /></label>' +
              '<label><div class="section-label">' + escapeHtmlClient(t("skillIdLabel")) + '</div><input class="console-input" data-skill-install-field="skillId" placeholder="follow-up-skill" value="' + escapeHtmlClient(skillId) + '" /></label>' +
              '<label><div class="section-label">' + escapeHtmlClient(t("titleLabel")) + '</div><input class="console-input" data-skill-install-field="title" placeholder="Follow-up Skill" value="' + escapeHtmlClient(title) + '" /></label>' +
              '</div>' +
              '<label><div class="section-label">' + escapeHtmlClient(t("sourceLabel")) + '</div><input class="console-input" data-skill-install-field="source" placeholder="/Users/me/.codex/skills/reply/SKILL.md or https://github.com/org/repo/blob/main/skill.md" value="' + escapeHtmlClient(source) + '" /></label>' +
              '<datalist id="skill-agent-options">' + directory.map(function(entry) {
                return '<option value="' + escapeHtmlClient(entry.agentId || "") + '">' + escapeHtmlClient(entry.displayName || entry.agentId || "") + "</option>";
              }).join("") + "</datalist>" +
              '<div class="actions-inline"><button class="btn" data-action="install-agent-skill" data-account-id="' + escapeHtmlClient(accountId) + '" data-tenant-id="' + escapeHtmlClient(tenantId) + '">' + escapeHtmlClient(t("installFromSource")) + '</button></div>'
            : '<div class="detail">' + escapeHtmlClient(t("connectMailboxFirstThenInstall")) + '</div>') +
          "</div></div>"
        );
      }

      function renderReusableSkillCard(skill, connect) {
        const targetAgentId =
          state.connect && typeof state.connect.skillTargetAgentId === "string" && state.connect.skillTargetAgentId.trim().length > 0
            ? state.connect.skillTargetAgentId
            : (connect && connect.agentDirectory && connect.agentDirectory[0] ? connect.agentDirectory[0].agentId : "");
        return (
          '<div class="timeline-entry">' +
          '<div class="meta"><span>' + escapeHtmlClient(skill.title || skill.skillId || "skill") + '</span><span>' + escapeHtmlClient(skill.origin || "openclaw") + "</span></div>" +
          '<div class="title code">' + escapeHtmlClient(skill.skillId || "skill") + "</div>" +
          '<div class="detail code">' + escapeHtmlClient(skill.path || "") + "</div>" +
          '<div class="chips">' +
          renderPill(skill.origin || "openclaw", skill.origin === "shared" ? "pill--ok" : "") +
          (targetAgentId ? renderPill(t("targetLabel") + " " + targetAgentId, "") : "") +
          '</div>' +
          '<div class="timeline-entry__actions">' +
          '<button class="btn" data-action="prefill-skill-install" data-agent-id="' + escapeHtmlClient(targetAgentId || "") + '" data-skill-source="' + escapeHtmlClient(skill.path || "") + '" data-skill-id="' + escapeHtmlClient(skill.skillId || "") + '" data-skill-title="' + escapeHtmlClient(skill.title || skill.skillId || "skill") + '">' + escapeHtmlClient(t("useAsSource")) + '</button>' +
          '<button class="btn primary" data-action="quick-install-reusable-skill" data-agent-id="' + escapeHtmlClient(targetAgentId || "") + '" data-skill-source="' + escapeHtmlClient(skill.path || "") + '" data-skill-id="' + escapeHtmlClient(skill.skillId || "") + '" data-skill-title="' + escapeHtmlClient(skill.title || skill.skillId || "skill") + '"' + (connect && connect.templateApplyAccountId ? ' data-account-id="' + escapeHtmlClient(connect.templateApplyAccountId || "") + '" data-tenant-id="' + escapeHtmlClient((connect && connect.templateApplyTenantId) || connect.templateApplyAccountId || "") + '"' : "") + '>' + escapeHtmlClient(t("installLabel")) + '</button>' +
          '</div>' +
          '</div>'
        );
      }

      function renderSharedSkillCreatePanel(connect) {
        const stored = state.connect || {};
        const status = stored.sharedSkillStatus || null;
        const noteClass =
          !status
            ? "setup-note"
            : status.tone === "danger"
              ? "setup-note setup-note--danger"
              : "setup-note setup-note--ok";
        return (
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("createSkill")) + '</h3><span class="muted">' + escapeHtmlClient(t("sharedLibrary")) + '</span></div><div class="panel-body">' +
          (status ? '<div class="' + noteClass + '">' + escapeHtmlClient(status.message || "") + '</div>' : '') +
          '<div class="detail-grid">' +
          '<label><div class="section-label">' + escapeHtmlClient(t("skillIdLabel")) + '</div><input class="console-input" data-shared-skill-field="skillId" placeholder="follow-up-skill" value="' + escapeHtmlClient(stored.sharedSkillId || "") + '" /></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("titleLabel")) + '</div><input class="console-input" data-shared-skill-field="title" placeholder="Follow-up Skill" value="' + escapeHtmlClient(stored.sharedSkillTitle || "") + '" /></label>' +
          '</div>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("markdownLabel")) + '</div><textarea class="console-textarea" data-shared-skill-field="content" placeholder="' + escapeHtmlClient(t("markdownPlaceholder")) + '">' + escapeHtmlClient(stored.sharedSkillContent || "") + '</textarea></label>' +
          (connect && connect.templateApplyTenantId
            ? '<div class="actions-inline"><button class="btn primary" data-action="create-shared-skill" data-tenant-id="' + escapeHtmlClient(connect.templateApplyTenantId || "default") + '" data-account-id="' + escapeHtmlClient(connect.templateApplyAccountId || "") + '">' + escapeHtmlClient(t("saveSkill")) + '</button></div>'
            : '<div class="detail">' + escapeHtmlClient(t("connectAccountFirst")) + '</div>') +
          '</div></div>'
        );
      }

      function renderSharedSkillCard(skill) {
        return (
          '<div class="timeline-entry">' +
          '<div class="meta"><span>' + escapeHtmlClient(skill.title || skill.skillId || "skill") + '</span><span>' + escapeHtmlClient("mailclaws") + '</span></div>' +
          '<div class="title code">' + escapeHtmlClient(skill.skillId || "skill") + '</div>' +
          '<div class="detail code">' + escapeHtmlClient(skill.path || "") + '</div>' +
          '</div>'
        );
      }

      function renderConnectHome() {
        const setup = getConnectSetupState();
        const connect = setup.connect;
        const providerCount = connect && Array.isArray(connect.providerOptions) ? connect.providerOptions.length : 0;
        const loginCommand = (connect && connect.recommendedLoginCommand) || "mailclaws login";
        const templates = connect && Array.isArray(connect.agentTemplates) ? connect.agentTemplates : [];
        const directory = connect && Array.isArray(connect.agentDirectory) ? connect.agentDirectory : [];
        const headcount = connect && Array.isArray(connect.headcountRecommendations) ? connect.headcountRecommendations : [];
        const skills = connect && Array.isArray(connect.skills) ? connect.skills : [];
        return (
          renderWorkspaceHero({
            eyebrow: t("mailSetupEyebrow"),
            title: t("mailSetupTitle"),
            copy: t("mailSetupCopy"),
            actions:
              '<a class="btn primary" href="' + escapeHtmlClient((connect && connect.browserPath) || routeBasePath()) + '">' + escapeHtmlClient(t("openMail")) + '</a>' +
              '<a class="btn" href="' + escapeHtmlClient((connect && connect.onboardingApiPath) || ((config.apiBasePath || "/api") + "/connect/onboarding")) + '" target="_blank" rel="noreferrer">' + escapeHtmlClient(t("onboardingApi")) + '</a>',
            summaryItems: [
              { label: t("providersLabel"), value: String(providerCount) },
              { label: t("accounts"), value: String((state.data && state.data.accounts ? state.data.accounts.length : 0)) },
              { label: t("rooms"), value: String((state.data && state.data.rooms ? state.data.rooms.length : 0)) },
              { label: t("approvalsLabel"), value: String((state.data && state.data.approvals ? state.data.approvals.length : 0)) }
            ]
          }) +
          renderConnectRuntimePanel(setup) +
          renderConnectMailboxPanel(setup) +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("cliFallback")) + '</h3><span class="muted">' + escapeHtmlClient(t("sameRuntimeModel")) + '</span></div>' +
          '<div class="panel-body">' +
          '<div class="detail">' + escapeHtmlClient(t("sameSetupPaths")) + '</div>' +
          '<div class="mono-block">' + escapeHtmlClient((connect && connect.recommendedStartCommand) || "mailclaws dashboard") + "</div>" +
          '<div class="mono-block">' + escapeHtmlClient(loginCommand) + "</div>" +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("agentTemplates")) + '</h3><span class="muted">' + escapeHtmlClient(t("presetsCount", { count: String(templates.length) })) + '</span></div><div class="panel-body">' +
          (templates.length > 0
            ? '<div class="mailbox-feed">' + templates.map(function(template) { return renderAgentTemplateCard(template, connect); }).join("") + "</div>"
            : '<div class="empty">' + escapeHtmlClient(t("noAgentTemplatesAvailable")) + '</div>') +
          "</div></div>" +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("customAgent")) + '</h3><span class="muted">' + escapeHtmlClient(t("durableSoulMailbox")) + '</span></div><div class="panel-body">' +
          '<div class="detail">' + escapeHtmlClient(t("createDurableAgentCopy")) + '</div>' +
          '<div class="detail-grid">' +
          '<label><div class="section-label">' + escapeHtmlClient(t("agentIdLabel")) + '</div><input class="console-input" data-custom-agent-field="agentId" placeholder="assistant-ops" /></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("displayNameLabel")) + '</div><input class="console-input" data-custom-agent-field="displayName" placeholder="Assistant Ops" /></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("publicMailboxLabel")) + '</div><input class="console-input" data-custom-agent-field="publicMailboxId" placeholder="public:assistant-ops" /></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("collaboratorsLabel")) + '</div><input class="console-input" data-custom-agent-field="collaboratorAgentIds" placeholder="assistant,research" /></label>' +
          '</div>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("purposeLabel")) + '</div><textarea class="console-textarea" data-custom-agent-field="purpose" placeholder="Own escalations, coordinate approvals, and feed final-ready packets back to the front desk."></textarea></label>' +
          (((connect && connect.templateApplyAccountId) || "").length > 0
            ? '<div class="actions-inline"><button class="btn" data-action="create-custom-agent" data-account-id="' + escapeHtmlClient(connect.templateApplyAccountId || "") + '" data-tenant-id="' + escapeHtmlClient((connect && connect.templateApplyTenantId) || connect.templateApplyAccountId || "") + '">' + escapeHtmlClient(t("createAgent")) + '</button></div>'
            : '<div class="detail">' + escapeHtmlClient(t("createCustomAgentAfterConnect")) + '</div>') +
          "</div></div>" +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("agentDirectory")) + '</h3><span class="muted">' + escapeHtmlClient(t("durableAgentsCount", { count: String(directory.length) })) + '</span></div><div class="panel-body">' +
          (directory.length > 0
            ? '<div class="mailbox-feed">' + directory.map(renderAgentDirectoryCard).join("") + "</div>"
            : '<div class="empty">' + escapeHtmlClient(t("noDurableSouls")) + '</div>') +
          "</div></div>" +
          renderSkillInstallPanel(connect) +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("skillsPanel")) + '</h3><span class="muted">' + escapeHtmlClient(t("visibleSkillsCount", { count: String(skills.reduce(function(total, entry) { return total + ((entry.skills || []).length || 0); }, 0)) })) + '</span></div><div class="panel-body">' +
          '<div class="detail">' + escapeHtmlClient(t("builtInSkillsNote")) + '</div>' +
          '<div class="mono-block">mailclaws skills list ' + escapeHtmlClient((connect && connect.templateApplyAccountId) || "[accountId]") + "</div>" +
          (skills.length > 0
            ? '<div class="mailbox-feed">' + skills.map(renderAgentSkillGroup).join("") + "</div>"
            : '<div class="empty">' + escapeHtmlClient(t("noDurableAgentSkills")) + '</div>') +
          "</div></div>" +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("headcount")) + '</h3><span class="muted">' + escapeHtmlClient(t("recommendedShapes")) + '</span></div><div class="panel-body">' +
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
            : '<div class="empty">' + escapeHtmlClient(t("headcountWaiting")) + '</div>') +
          "</div></div>"
        );
      }

      function renderHomeOverview() {
        const setup = getConnectSetupState();
        const connect = setup.connect;
        const rooms = state.data && state.data.rooms ? state.data.rooms : [];
        const directory = connect && Array.isArray(connect.agentDirectory) ? connect.agentDirectory : [];
        const skills = connect && Array.isArray(connect.skills) ? connect.skills : [];
        const visibleSkillCount = skills.reduce(function(total, entry) {
          return total + ((entry.skills || []).length || 0);
        }, 0);
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: t("home"),
            title: t("homeTitle"),
            copy: t("homeCopy"),
            actions:
              '<a class="btn primary" href="' + escapeHtmlClient(hrefForRoute({ mode: "rooms", accountId: null, inboxId: null, roomKey: null, mailboxId: null })) + '">' + escapeHtmlClient(t("openRooms")) + '</a>' +
              '<a class="btn" href="' + escapeHtmlClient(hrefForRoute({ mode: "accounts", accountId: null, inboxId: null, roomKey: null, mailboxId: null })) + '">' + escapeHtmlClient(t("connectMailbox")) + '</a>',
            summaryItems: [
              { label: t("accounts"), value: String((state.data && state.data.accounts ? state.data.accounts.length : 0)) },
              { label: t("rooms"), value: String(rooms.length) },
              { label: t("agents"), value: String(directory.length) },
              { label: t("skills"), value: String(visibleSkillCount) }
            ]
          }) +
          renderConnectRuntimePanel(setup) +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("recentRooms")) + '</h3><span class="muted">' + escapeHtmlClient(t("recentShown", { count: Math.min(rooms.length, 6) })) + '</span></div><div class="panel-body">' +
          (rooms.length > 0 ? '<div class="list">' + rooms.slice(0, 6).map(renderRoomCard).join("") + '</div>' : '<div class="empty">' + escapeHtmlClient(t("noRoomsYet")) + '</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderAgentsHome() {
        const setup = getConnectSetupState();
        const connect = setup.connect;
        const templates = connect && Array.isArray(connect.agentTemplates) ? connect.agentTemplates : [];
        const directory = connect && Array.isArray(connect.agentDirectory) ? connect.agentDirectory : [];
        const headcount = connect && Array.isArray(connect.headcountRecommendations) ? connect.headcountRecommendations : [];
        const selectedAgentPanel = renderSelectedAgentPanel(connect);
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: t("agents"),
            title: t("agentsTitle"),
            copy: t("agentsCopy"),
            summaryItems: [
              { label: t("templatesLabel"), value: String(templates.length) },
              { label: t("agents"), value: String(directory.length) },
              { label: t("withSoulLabel"), value: String(directory.filter(function(entry) { return Boolean(entry.soulPath); }).length) },
              { label: t("recommendedLabel"), value: String(headcount.length) }
            ]
          }) +
          '<div class="workspace-split">' +
          '<div class="workspace-split__main">' +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("agentDirectory")) + '</h3><span class="muted">' + escapeHtmlClient(t("durableAgentsCount", { count: String(directory.length) })) + '</span></div><div class="panel-body">' +
          (directory.length > 0
            ? '<div class="mailbox-feed">' + directory.map(function(entry) { return renderAgentDirectoryCard(entry, connect); }).join("") + "</div>"
            : '<div class="empty">' + escapeHtmlClient(t("noDurableSouls")) + '</div>') +
          "</div></div>" +
          '</div>' +
          '<div class="workspace-split__side">' +
          selectedAgentPanel +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("agentTemplates")) + '</h3><span class="muted">' + escapeHtmlClient(t("presetsCount", { count: String(templates.length) })) + '</span></div><div class="panel-body">' +
          (templates.length > 0
            ? '<div class="mailbox-feed">' + templates.map(function(template) { return renderAgentTemplateCard(template, connect); }).join("") + "</div>"
            : '<div class="empty">' + escapeHtmlClient(t("noAgentTemplatesAvailable")) + '</div>') +
          "</div></div>" +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("customAgent")) + '</h3><span class="muted">' + escapeHtmlClient(t("durableSoulMailbox")) + '</span></div><div class="panel-body">' +
          '<div class="detail">' + escapeHtmlClient(t("createDurableAgentCopy")) + '</div>' +
          '<div class="detail-grid">' +
          '<label><div class="section-label">' + escapeHtmlClient(t("agentIdLabel")) + '</div><input class="console-input" data-custom-agent-field="agentId" placeholder="assistant-ops" /></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("displayNameLabel")) + '</div><input class="console-input" data-custom-agent-field="displayName" placeholder="Assistant Ops" /></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("publicMailboxLabel")) + '</div><input class="console-input" data-custom-agent-field="publicMailboxId" placeholder="public:assistant-ops" /></label>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("collaboratorsLabel")) + '</div><input class="console-input" data-custom-agent-field="collaboratorAgentIds" placeholder="assistant,research" /></label>' +
          '</div>' +
          '<label><div class="section-label">' + escapeHtmlClient(t("purposeLabel")) + '</div><textarea class="console-textarea" data-custom-agent-field="purpose" placeholder="Own escalations, coordinate approvals, and feed final-ready packets back to the front desk."></textarea></label>' +
          (((connect && connect.templateApplyAccountId) || "").length > 0
            ? '<div class="actions-inline"><button class="btn" data-action="create-custom-agent" data-account-id="' + escapeHtmlClient(connect.templateApplyAccountId || "") + '" data-tenant-id="' + escapeHtmlClient((connect && connect.templateApplyTenantId) || connect.templateApplyAccountId || "") + '">' + escapeHtmlClient(t("createAgent")) + '</button></div>'
            : '<div class="detail">' + escapeHtmlClient(t("createCustomAgentAfterConnect")) + '</div>') +
          "</div></div>" +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("headcount")) + '</h3><span class="muted">' + escapeHtmlClient(t("recommendedShapes")) + '</span></div><div class="panel-body">' +
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
            : '<div class="empty">' + escapeHtmlClient(t("headcountWaiting")) + '</div>') +
          "</div></div>" +
          '</div>' +
          '</div>' +
          '</div>'
        );
      }

      function renderSkillsHome() {
        const connect = getConnectSetupState().connect;
        const skills = connect && Array.isArray(connect.skills) ? connect.skills : [];
        const reusableSkills = connect && Array.isArray(connect.reusableSkills) ? connect.reusableSkills : [];
        const sharedSkills = connect && Array.isArray(connect.sharedSkills) ? connect.sharedSkills : [];
        const reusableSkillSources = reusableSkills.filter(function(skill) {
          return typeof skill.path === "string" && skill.path.trim().length > 0;
        });
        const targetAgentId =
          state.connect && typeof state.connect.skillTargetAgentId === "string" && state.connect.skillTargetAgentId.trim().length > 0
            ? state.connect.skillTargetAgentId
            : (connect && connect.agentDirectory && connect.agentDirectory[0] ? connect.agentDirectory[0].agentId : "");
        const canInstallAll = Boolean(
          connect &&
          connect.templateApplyAccountId &&
          targetAgentId &&
          reusableSkillSources.length > 0
        );
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: t("skills"),
            title: t("skillsTitle"),
            copy: t("skillsCopy"),
            summaryItems: [
              { label: t("agents"), value: String(skills.length) },
              { label: t("skills"), value: String(skills.reduce(function(total, entry) { return total + ((entry.skills || []).length || 0); }, 0)) },
              { label: t("builtInLabel"), value: "2" },
              { label: t("sharedLabel"), value: String(sharedSkills.length) }
            ]
          }) +
          '<div class="workspace-split">' +
          '<div class="workspace-split__main">' +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("availableSkills")) + '</h3><span class="muted">' + escapeHtmlClient(t("visibleSkillsCount", { count: String(skills.reduce(function(total, entry) { return total + ((entry.skills || []).length || 0); }, 0)) })) + '</span></div><div class="panel-body">' +
          '<div class="detail">' + escapeHtmlClient(t("builtInSkillsNote")) + '</div>' +
          (skills.length > 0
            ? '<div class="mailbox-feed">' + skills.map(renderAgentSkillGroup).join("") + "</div>"
            : '<div class="empty">' + escapeHtmlClient(t("noDurableAgentSkills")) + '</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("sharedSkillsPanel")) + '</h3><span class="muted">' + escapeHtmlClient(String(sharedSkills.length)) + '</span></div><div class="panel-body">' +
          (sharedSkills.length > 0
            ? '<div class="mailbox-feed">' + sharedSkills.map(renderSharedSkillCard).join("") + "</div>"
            : '<div class="empty">' + escapeHtmlClient(t("noSharedSkillsYet")) + '</div>') +
          '</div></div>' +
          '</div>' +
          '<div class="workspace-split__side">' +
          renderSkillInstallPanel(connect) +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("reusableSkillSources")) + '</h3><span class="muted">' + escapeHtmlClient(String(reusableSkills.length)) + '</span></div><div class="panel-body">' +
          '<div class="detail">' + escapeHtmlClient(t("reusableSkillSourcesCopy")) + '</div>' +
          '<div class="detail">' + escapeHtmlClient(t("installAllSkillsHelp")) + '</div>' +
          (canInstallAll
            ? '<div class="actions-inline"><button class="btn primary" data-action="quick-install-all-reusable-skills" data-account-id="' + escapeHtmlClient(connect.templateApplyAccountId || "") + '" data-tenant-id="' + escapeHtmlClient((connect && connect.templateApplyTenantId) || connect.templateApplyAccountId || "") + '" data-agent-id="' + escapeHtmlClient(targetAgentId || "") + '">' + escapeHtmlClient(t("installAllSkills")) + '</button></div>'
            : '') +
          (reusableSkills.length > 0
            ? '<div class="mailbox-feed">' + reusableSkills.map(function(skill) { return renderReusableSkillCard(skill, connect); }).join("") + "</div>"
            : '<div class="empty">' + escapeHtmlClient(t("noReusableSkillSources")) + '</div>') +
          '</div></div>' +
          renderSharedSkillCreatePanel(connect) +
          '</div>' +
          '</div>' +
          '</div>'
        );
      }

      function renderProviderPanel() {
        if (!state.data || !state.data.mailboxConsole || !state.data.mailboxConsole.providerState) {
          return '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("providerState")) + '</h3></div><div class="panel-body"><div class="empty">' + escapeHtmlClient(t("providerEmpty")) + '</div></div></div>';
        }
        const summary = state.data.mailboxConsole.providerState.summary || {};
        return (
          '<div class="panel">' +
          '<div class="panel-header"><h3>' + escapeHtmlClient(t("providerState")) + '</h3><span class="muted">' + escapeHtmlClient((summary.watch && summary.watch.state) || "idle") + "</span></div>" +
          '<div class="panel-body">' +
          '<div class="detail-grid">' +
          renderMetric(t("ingress"), (summary.ingress && summary.ingress.mode) || "unknown") +
          renderMetric(t("outbound"), (summary.outbound && summary.outbound.mode) || "unknown") +
          renderMetric(t("watch"), (summary.watch && summary.watch.state) || "idle") +
          renderMetric(t("lastEvent"), summary.lastEventType || "none") +
          '</div>' +
          '<div class="detail">' + escapeHtmlClient(t("providerObserveCopy")) + '</div>' +
          '</div>' +
          '</div>'
        );
      }

      function renderAccountDetail() {
        if (!state.data || !state.data.accountDetail) {
          return '<div class="empty">' + escapeHtmlClient(t("selectAccountHint")) + '</div>';
        }
        const detail = state.data.accountDetail;
        const account = detail.account || {};
        const inboxes = detail.inboxes || [];
        const mailboxes = detail.mailboxes || [];
        const rooms = detail.rooms || [];
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: t("accounts"),
            title: account.displayName || account.emailAddress || account.accountId || t("mailboxAccount"),
            copy: t("statusAccount"),
            summaryItems: [
              { label: "rooms", value: String(account.roomCount || 0) },
              { label: "active", value: String(account.activeRoomCount || 0) },
              { label: "mailboxes", value: String(account.mailboxCount || 0) },
              { label: "inboxes", value: String(account.inboxCount || 0) }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("mailboxAccount")) + '</h3><span class="muted code">' + escapeHtmlClient(account.accountId || state.route.accountId || "") + '</span></div><div class="panel-body">' +
          '<div class="chips">' +
          renderPill(account.provider || "provider", "") +
          renderPill(account.health || "healthy", "") +
          renderPill(account.status || "active", "") +
          '</div>' +
          '<div class="detail">' + escapeHtmlClient(account.displayName || account.emailAddress || "") + '</div>' +
          '<div class="detail">' + escapeHtmlClient(t("latestActivity")) + ' ' + escapeHtmlClient(formatTime(account.latestActivityAt)) + '</div>' +
          '</div></div>' +
          renderProviderPanel() +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("publicInboxes")) + '</h3><span class="muted">' + escapeHtmlClient(t("configuredCount", { count: inboxes.length })) + '</span></div><div class="panel-body">' +
          (inboxes.length > 0
            ? '<div class="list">' + inboxes.map(function(inbox) { return renderInboxCard({ inbox: inbox, items: [] }); }).join("") + '</div>'
            : '<div class="empty">' + escapeHtmlClient(t("noPublicInboxProjection")) + '</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("recentMailboxes")) + '</h3><span class="muted">' + escapeHtmlClient(t("shownCount", { count: Math.min(mailboxes.length, 6) })) + '</span></div><div class="panel-body">' +
          (mailboxes.length > 0 ? '<div class="list">' + mailboxes.slice(0, 6).map(renderMailboxCard).join("") + '</div>' : '<div class="empty">' + escapeHtmlClient(t("noVirtualMailboxesForAccount")) + '</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("recentConversations")) + '</h3><span class="muted">' + escapeHtmlClient(t("shownCount", { count: Math.min(rooms.length, 6) })) + '</span></div><div class="panel-body">' +
          (rooms.length > 0 ? '<div class="list">' + rooms.slice(0, 6).map(renderRoomCard).join("") + '</div>' : '<div class="empty">' + escapeHtmlClient(t("noAccountRoomActivity")) + '</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderInboxDetail() {
        const mailboxConsole = state.data && state.data.mailboxConsole ? state.data.mailboxConsole : null;
        if (!mailboxConsole || !state.route.inboxId) {
          return '<div class="empty">' + escapeHtmlClient(t("selectInboxHint")) + '</div>';
        }
        const projection = (mailboxConsole.publicAgentInboxes || []).find(function(entry) {
          return entry.inbox && entry.inbox.inboxId === state.route.inboxId;
        });
        if (!projection) {
          return '<div class="empty">' + escapeHtmlClient(t("inboxNotVisible")) + '</div>';
        }
        const inbox = projection.inbox || {};
        const items = projection.items || [];
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: t("publicInbox"),
            title: inbox.inboxId || state.route.inboxId || "Inbox",
            copy: t("inboxCopy"),
            summaryItems: [
              { label: t("rooms"), value: String(items.length) },
              { label: "ack sla", value: String(inbox.ackSlaSeconds || 0) + "s" },
              { label: "active limit", value: String(inbox.activeRoomLimit || 0) },
              { label: "burst", value: String(inbox.burstCoalesceSeconds || 0) + "s" }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("inboxSummary")) + '</h3><span class="muted code">' + escapeHtmlClient(inbox.inboxId || state.route.inboxId) + '</span></div><div class="panel-body">' +
          '<div class="chips">' +
          renderPill(inbox.agentId || "agent", "") +
          renderPill("account " + (inbox.accountId || state.route.accountId || ""), "") +
          '</div>' +
          '<div class="detail">' + escapeHtmlClient(t("selectRoomHint")) + '</div>' +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("inboxItems")) + '</h3><span class="muted">' + escapeHtmlClient(items.length) + ' rooms</span></div><div class="panel-body">' +
          (items.length > 0
            ? '<div class="mailbox-feed">' + items.map(function(item) {
                const roomSummary = findRoomByKey(item.roomKey);
                return (
                  '<button class="feed-entry" data-action="select-room" data-room-key="' + escapeHtmlClient(item.roomKey) + '" data-account-id="' + escapeHtmlClient(item.accountId || state.route.accountId || "") + '">' +
                  '<div class="meta"><span>' + escapeHtmlClient(item.state || "new") + " / " + escapeHtmlClient(item.participantRole || "participant") + '</span><span>' + escapeHtmlClient(formatTime(item.newestMessageAt)) + '</span></div>' +
                  '<div class="title">' + escapeHtmlClient(roomSummary ? getRoomDisplayTitle(roomSummary) : item.roomKey) + '</div>' +
                  '<div class="detail code">' + escapeHtmlClient(item.roomKey) + '</div>' +
                  '<div class="detail">Unread ' + escapeHtmlClient(item.unreadCount || 0) + ", urgency " + escapeHtmlClient(item.urgency || "normal") + ", effort " + escapeHtmlClient(item.estimatedEffort || "medium") + '.</div>' +
                  '<div class="chips">' +
                  renderPill("priority " + escapeHtmlClient(item.priority || 0), "") +
                  (item.needsAckBy ? renderPill("ack by " + formatTime(item.needsAckBy), "pill--warn") : "") +
                  '</div>' +
                  '</button>'
                );
              }).join("") + '</div>'
            : '<div class="empty">' + escapeHtmlClient(t("noInboxRoomProjection")) + '</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderMailboxWorkspaceHome() {
        const mailboxConsole = state.data && state.data.mailboxConsole ? state.data.mailboxConsole : null;
        if (!mailboxConsole) {
          return '<div class="empty">' + escapeHtmlClient(t("selectAccountForMailboxes")) + '</div>';
        }
        const mailboxes = mailboxConsole.virtualMailboxes || [];
        const inboxes = mailboxConsole.publicAgentInboxes || [];
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: t("mailboxWorkspace"),
            title: t("mailboxesAndRoutes"),
            copy: t("mailboxWorkspaceCopy"),
            summaryItems: [
              { label: t("mailboxCountLabel"), value: String(mailboxes.length) },
              { label: "inboxes", value: String(inboxes.length) },
              { label: "active", value: String(mailboxes.filter(function(entry) { return entry.active; }).length) },
              { label: t("rooms"), value: String((state.data && state.data.rooms ? state.data.rooms.length : 0)) }
            ]
          }) +
          renderProviderPanel() +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("publicInboxes")) + '</h3><span class="muted">' + escapeHtmlClient(t("projectedCount", { count: inboxes.length })) + '</span></div><div class="panel-body">' +
          (inboxes.length > 0 ? '<div class="list">' + inboxes.map(renderInboxCard).join("") + '</div>' : '<div class="empty">' + escapeHtmlClient(t("noPublicInboxProjection")) + '</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("virtualMailboxes")) + '</h3><span class="muted">' + escapeHtmlClient(t("visibleCount", { count: mailboxes.length })) + '</span></div><div class="panel-body">' +
          (mailboxes.length > 0 ? '<div class="list">' + mailboxes.map(renderMailboxCard).join("") + '</div>' : '<div class="empty">' + escapeHtmlClient(t("noVirtualMailboxAttached")) + '</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderAccountsHome() {
        const setup = getConnectSetupState();
        const accounts = state.data && state.data.accounts ? state.data.accounts : [];
        return (
          '<div class="mail-workbench-main">' +
          renderConnectMailboxPanel(setup) +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("accountsPanel")) + '</h3><span class="muted">' + escapeHtmlClient(t("connectedCount", { count: accounts.length })) + '</span></div><div class="panel-body">' +
          (accounts.length > 0 ? '<div class="list">' + accounts.map(renderAccountCard).join("") + '</div>' : '<div class="empty">' + escapeHtmlClient(t("noMailboxAccountsConnected")) + '</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderRoomsHome() {
        const rooms = state.data && state.data.rooms ? state.data.rooms : [];
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: t("rooms"),
            title: t("roomsTitle"),
            copy: t("roomsCopy"),
            summaryItems: [
              { label: t("rooms"), value: String(rooms.length) },
              { label: "active", value: String(rooms.filter(function(room) { return !["done", "failed"].includes(room.state || ""); }).length) },
              { label: "approvals", value: String(rooms.reduce(function(total, room) { return total + Number(room.pendingApprovalCount || 0); }, 0)) },
              { label: "resources", value: String(rooms.reduce(function(total, room) { return total + Number(room.resourceCount || 0); }, 0)) }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("roomsPanel")) + '</h3><span class="muted">' + escapeHtmlClient(t("visibleCount", { count: rooms.length })) + '</span></div><div class="panel-body">' +
          (rooms.length > 0 ? '<div class="list">' + rooms.map(renderRoomCard).join("") + '</div>' : '<div class="empty">' + escapeHtmlClient(t("roomsEmptyFiltered")) + '</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderApprovalsHome() {
        const approvals = state.data && state.data.approvals ? state.data.approvals : [];
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: t("approvalRequests"),
            title: t("approvalTitle"),
            copy: t("approvalCopy"),
            summaryItems: [
              { label: t("requests"), value: String(approvals.length) },
              { label: t("requested"), value: String(approvals.filter(function(approval) { return (approval.status || "") === "requested"; }).length) },
              { label: t("approved"), value: String(approvals.filter(function(approval) { return (approval.status || "") === "approved"; }).length) },
              { label: t("rejected"), value: String(approvals.filter(function(approval) { return (approval.status || "") === "rejected"; }).length) }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("approvalRequests")) + '</h3><span class="muted">' + escapeHtmlClient(t("visibleCount", { count: approvals.length })) + '</span></div><div class="panel-body">' +
          (approvals.length > 0 ? '<div class="list">' + approvals.map(renderApprovalCard).join("") + '</div>' : '<div class="empty">' + escapeHtmlClient(t("noApprovalsVisible")) + '</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderMailboxDetail() {
        const mailboxConsole = state.data && state.data.mailboxConsole ? state.data.mailboxConsole : null;
        if (!mailboxConsole || !state.route.mailboxId) {
          return '<div class="empty">' + escapeHtmlClient(t("selectMailboxHint")) + '</div>';
        }
        const mailbox = (mailboxConsole.virtualMailboxes || []).find(function(entry) {
          return entry.mailboxId === state.route.mailboxId;
        });
        if (!mailbox) {
          return '<div class="empty">' + escapeHtmlClient(t("mailboxNotVisible")) + '</div>';
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
            eyebrow: t("virtualMailbox"),
            title: mailbox.mailboxId,
            copy: t("virtualMailboxCopy"),
            summaryItems: [
              { label: "messages", value: String(mailbox.messageCount || 0) },
              { label: "rooms", value: String(mailbox.roomCount || 0) },
              { label: "inboxes", value: String(linkedInboxes.length) },
              { label: t("latestRoom"), value: String(mailbox.latestRoomKey || "n/a") }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("mailboxSummary")) + '</h3><span class="muted code">' + escapeHtmlClient(mailbox.mailboxId) + '</span></div><div class="panel-body">' +
          '<div class="chips">' +
          renderPill(mailbox.kind || "mailbox", "") +
          (mailbox.role ? renderPill(mailbox.role, "") : "") +
          renderPill(mailbox.active ? "active" : "inactive", mailbox.active ? "pill--ok" : "pill--warn") +
          ((mailbox.originKinds || []).map(function(kind) { return renderPill(kind, ""); }).join("")) +
          '</div>' +
          '<div class="detail">' + escapeHtmlClient(t("latestMessage")) + ' ' + escapeHtmlClient(formatTime(mailbox.latestMessageAt)) + '</div>' +
          '<div class="detail">' + escapeHtmlClient(t("latestRoom")) + ' ' + escapeHtmlClient(mailbox.latestRoomKey || "n/a") + '</div>' +
          (linkedInboxes.length > 0
            ? '<div class="list">' + linkedInboxes.map(renderInboxCard).join("") + '</div>'
            : '<div class="detail">' + escapeHtmlClient(t("noPublicInboxBinding")) + '</div>') +
          '</div></div>' +
          (roomKey
            ? '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("roomThreadInMailbox")) + '</h3><span class="muted code">' + escapeHtmlClient(roomKey) + '</span></div><div class="panel-body">' +
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
                : '<div class="empty">' + escapeHtmlClient(t("noMailboxRoomProjection")) + '</div>') +
              '</div></div>'
            : '') +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("mailboxFeed")) + '</h3><span class="muted">' + escapeHtmlClient(t("itemsLoaded", { count: feed.length })) + '</span></div><div class="panel-body">' +
          (feed.length > 0 ? '<div class="mailbox-feed">' + feed.map(renderFeedEntry).join("") + '</div>' : '<div class="empty">' + escapeHtmlClient(t("noMailboxMessagesProjected")) + '</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderRoomDetail() {
        const roomDetail = state.data && state.data.roomDetail ? state.data.roomDetail : null;
        if (!roomDetail || !roomDetail.room) {
          return '<div class="empty">' + escapeHtmlClient(t("selectRoomHint")) + '</div>';
        }
        const room = roomDetail.room;
        const taskMail = roomDetail.taskMail || null;
        const publicMails = Array.isArray(roomDetail.publicMails) ? roomDetail.publicMails : [];
        const latestRun = roomDetail.latestRun || null;
        const visibleAgents = getRoomVisibleAgents(room);
        const roomAgentEntries = getRoomAgentMailboxEntries(roomDetail);
        const currentAgentCount = roomAgentEntries.length > 0 ? roomAgentEntries.length : visibleAgents.length;
        return (
          '<div class="mail-workbench-main">' +
          renderWorkspaceHero({
            eyebrow: t("roomTitleDetail"),
            title: getRoomDisplayTitle(room),
            copy: t("roomFocusCopy"),
            summaryItems: [
              { label: t("taskMailPanel"), value: taskMail ? "1" : "0" },
              { label: t("publicMailPanel"), value: String(publicMails.length) },
              { label: t("agents"), value: String(currentAgentCount) },
              { label: t("runtimeDurationLabel"), value: latestRun ? formatDurationMs(latestRun.durationMs) : t("durationNotAvailable") }
            ]
          }) +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("roomSummary")) + '</h3><span class="muted code">' + escapeHtmlClient(room.roomKey) + '</span></div><div class="panel-body">' +
          '<div class="detail">' + escapeHtmlClient(t("roomFocusCopy")) + '</div>' +
          '<div class="detail-grid">' +
          renderMetric(t("runtimeStatusLabel"), latestRun ? t(latestRun.status === "running" ? "runtimeRunning" : latestRun.status === "failed" ? "runtimeFailed" : "runtimeCompleted") : t("durationNotAvailable")) +
          renderMetric(t("runtimeDurationLabel"), latestRun ? formatDurationMs(latestRun.durationMs) : t("durationNotAvailable")) +
          renderMetric(t("agents"), currentAgentCount) +
          renderMetric(t("publicMailPanel"), publicMails.length) +
          '</div>' +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("taskMailPanel")) + '</h3></div><div class="panel-body">' +
          '<div class="detail">' + escapeHtmlClient(t("taskMailCopy")) + '</div>' +
          (taskMail
            ? renderSourceMailCard(taskMail, { expanded: true })
            : '<div class="empty">' + escapeHtmlClient(t("noTaskMail")) + '</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("publicMailPanel")) + '</h3><span class="muted">' + escapeHtmlClient(String(publicMails.length)) + '</span></div><div class="panel-body">' +
          '<div class="detail">' + escapeHtmlClient(t("publicMailCopy")) + '</div>' +
          (publicMails.length > 0
            ? '<div class="source-mail-list">' + publicMails.map(function(mail) {
                return renderSourceMailCard(mail, { expanded: false });
              }).join("") + '</div>'
            : '<div class="empty">' + escapeHtmlClient(t("noPublicMail")) + '</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("currentAgentsPanel")) + '</h3></div><div class="panel-body">' +
          '<div class="detail">' + escapeHtmlClient(t("currentAgentsCopy")) + '</div>' +
          (roomAgentEntries.length > 0
            ? '<div class="source-mail-list">' + roomAgentEntries.map(function(entry) {
                return renderRoomAgentMailboxCard(entry, room);
              }).join("") + '</div>'
            : visibleAgents.length > 0
              ? '<div class="chips">' + visibleAgents.map(function(agent) { return renderPill(agent, ""); }).join("") + '</div>'
            : '<div class="empty">' + escapeHtmlClient(t("noAgentsVisible")) + '</div>') +
          '</div></div>' +
          '<div class="panel"><div class="panel-header"><h3>' + escapeHtmlClient(t("latestRuntimePanel")) + '</h3></div><div class="panel-body">' +
          '<div class="detail">' + escapeHtmlClient(t("latestRuntimeCopy")) + '</div>' +
          (latestRun
            ? '<div class="detail-grid">' +
              renderMetric(t("runtimeStatusLabel"), t(latestRun.status === "running" ? "runtimeRunning" : latestRun.status === "failed" ? "runtimeFailed" : "runtimeCompleted")) +
              renderMetric(t("runtimeDurationLabel"), formatDurationMs(latestRun.durationMs)) +
              renderMetric(t("runtimeStartedAtLabel"), formatTime(latestRun.startedAt)) +
              renderMetric(t("runtimeCompletedAtLabel"), latestRun.completedAt ? formatTime(latestRun.completedAt) : t("durationNotAvailable")) +
              '</div>'
            : '<div class="empty">' + escapeHtmlClient(t("noRuntimeYet")) + '</div>') +
          '</div></div>' +
          '</div>'
        );
      }

      function renderMainContent() {
        if (state.loading) {
          return '<div class="loading">' + escapeHtmlClient(t("loadingWorkspace")) + '</div>';
        }
        if (state.error) {
          return '<div class="error-banner">' + escapeHtmlClient(state.error) + '</div>';
        }
        if (!state.data) {
          return '<div class="empty">' + escapeHtmlClient(t("noWorkbenchPayload")) + '</div>';
        }
        let primary = renderHomeOverview();
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
        } else if (state.route.mode === "agents") {
          primary = renderAgentsHome();
        } else if (state.route.mode === "skills") {
          primary = renderSkillsHome();
        } else if (state.route.accountId) {
          primary = renderAccountDetail();
        }
        return '<div class="mail-workbench-grid">' + primary + '</div>';
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
          const icon = ICONS[tab.id] || ICONS.home;
          const label = tab.id === "home"
            ? t("home")
            : tab.id === "accounts"
              ? t("accounts")
              : tab.id === "rooms"
                ? t("rooms")
                : tab.id === "agents"
                  ? t("agents")
                  : tab.id === "skills"
                    ? t("skills")
                    : tab.label;
          return (
            '<a class="nav-item ' + (tab.active ? 'nav-item--active' : '') + '" href="' + escapeHtmlClient(tab.href) + '">' +
            '<span class="nav-item__icon" aria-hidden="true">' + icon + '</span>' +
            '<span class="nav-item__text">' + escapeHtmlClient(label) + '</span>' +
            '</a>'
          );
        }).join("");
      }

      function renderHeader() {
        const workspace = state.data && state.data.workspace ? state.data.workspace : null;
        const activeTab = workspace && workspace.activeTab ? workspace.activeTab : "home";
        const pageTitle = document.getElementById("page-title");
        const pageSub = document.getElementById("page-sub");
        const breadcrumb = document.getElementById("breadcrumb-current");
        const pageMeta = document.getElementById("page-meta");
        if (pageTitle) {
          pageTitle.textContent =
            activeTab === "rooms" ? t("pageRooms") :
            activeTab === "accounts" ? t("pageAccounts") :
            activeTab === "agents" ? t("pageAgents") :
            activeTab === "skills" ? t("pageSkills") :
            activeTab === "mailboxes" ? t("pageMailboxes") :
            t("pageHome");
        }
        if (pageSub) {
          pageSub.textContent =
            state.route.roomKey
              ? t("statusRoom")
              : state.route.mailboxId
                ? t("statusMailbox")
                : state.route.accountId
                  ? t("statusAccount")
                  : activeTab === "agents"
                    ? t("statusAgents")
                    : activeTab === "skills"
                      ? t("statusSkills")
                      : activeTab === "accounts"
                        ? t("statusAccount")
                        : t("statusOverview");
        }
        if (breadcrumb) {
          breadcrumb.textContent =
            state.route.roomKey ||
            state.route.mailboxId ||
            state.route.inboxId ||
            state.route.accountId ||
            (activeTab === "agents" ? t("agents") : activeTab === "skills" ? t("skills") : activeTab === "accounts" ? t("accounts") : activeTab === "rooms" ? t("rooms") : t("home"));
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
          routeMode: state.route.mode || "home",
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
          const responses = await Promise.all([
            requestJson((config.apiBasePath || "/api") + "/console/workbench" + (params.toString() ? "?" + params.toString() : "")),
            requestJson((config.apiBasePath || "/api") + "/runtime/execution")
          ]);
          const payload = responses[0];
          const runtimePayload = responses[1];
          state.data = payload;
          state.runtime = runtimePayload;
          state.connect = {
            ...(state.connect || {}),
            ...(payload && payload.workspace && payload.workspace.connect && payload.workspace.connect.defaultPlan
              ? {
                  plan: state.connect && state.connect.plan ? state.connect.plan : payload.workspace.connect.defaultPlan,
                  provider:
                    state.connect && state.connect.provider
                      ? state.connect.provider
                      : payload.workspace.connect.defaultPlan.recommendation
                        ? payload.workspace.connect.defaultPlan.recommendation.provider
                        : null,
                  providerId:
                    state.connect && typeof state.connect.providerId === "string" && state.connect.providerId.trim().length > 0
                      ? state.connect.providerId
                      : payload.workspace.connect.defaultPlan.recommendation && payload.workspace.connect.defaultPlan.recommendation.provider
                        ? payload.workspace.connect.defaultPlan.recommendation.provider.id
                        : "imap"
                }
              : {})
          };
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
            routeMode: state.route.mode || "home",
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
          mode: nextRoute.mode || state.route.mode || "home",
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
        } else if (state.route.accountId && !["agents", "skills"].includes(state.route.mode || "")) {
          state.route.mode = "accounts";
        }
        void refresh(false);
      }

      function applyThemeMode(mode) {
        state.themeMode = mode === "light" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme-mode", state.themeMode);
        document.querySelectorAll("[data-theme-mode]").forEach(function(button) {
          button.classList.toggle("topbar-theme-mode__btn--active", button.getAttribute("data-theme-mode") === state.themeMode);
        });
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, state.themeMode);
        } catch {}
      }

      function applyLocale(locale) {
        state.locale = locale === "zh-CN" || locale === "fr" ? locale : "en";
        document.documentElement.setAttribute("lang", state.locale === "zh-CN" ? "zh-CN" : state.locale === "fr" ? "fr" : "en");
        document.querySelectorAll("[data-locale]").forEach(function(button) {
          button.classList.toggle("topbar-locale__btn--active", button.getAttribute("data-locale") === state.locale);
        });
        try {
          window.localStorage.setItem(LOCALE_STORAGE_KEY, state.locale);
        } catch {}
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

      function readSkillInstallPayload(target) {
        const root = target.closest(".panel") || document;
        function readField(name) {
          const element = root.querySelector('[data-skill-install-field="' + name + '"]');
          return element && "value" in element ? String(element.value || "").trim() : "";
        }
        return {
          agentId: readField("agentId"),
          source: readField("source"),
          skillId: readField("skillId"),
          title: readField("title")
        };
      }

      function rememberSkillInstallPayload(target, overrides) {
        const payload = {
          ...readSkillInstallPayload(target),
          ...(overrides || {})
        };
        state.connect = {
          ...(state.connect || {}),
          skillTargetAgentId: payload.agentId,
          skillSource: payload.source,
          skillId: payload.skillId,
          skillTitle: payload.title
        };
        return payload;
      }

      function parseDelimitedInput(value) {
        return value
          ? value.split(",").map(function(entry) { return entry.trim(); }).filter(Boolean)
          : undefined;
      }

      function readAgentSoulPayload(target) {
        const root = target.closest(".panel") || document;
        const element = root.querySelector('[data-agent-soul-field="content"]');
        return {
          content: element && "value" in element ? String(element.value || "") : ""
        };
      }

      function readSharedSkillPayload(target) {
        const root = target.closest(".panel") || document;
        function readField(name) {
          const element = root.querySelector('[data-shared-skill-field="' + name + '"]');
          return element && "value" in element ? String(element.value || "") : "";
        }
        return {
          skillId: readField("skillId").trim(),
          title: readField("title").trim(),
          content: readField("content")
        };
      }

      function parsePortValue(value, fallback) {
        const parsed = Number.parseInt(String(value || ""), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
      }

      document.addEventListener("click", function(event) {
        const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
        if (!target) return;
        const action = target.getAttribute("data-action");
        if (action === "prepare-connect-plan") {
          event.preventDefault();
          const draft = rememberConnectFormState(target);
          if (!draft.emailAddress) {
            state.connect = {
              ...(state.connect || {}),
              status: {
                tone: "danger",
                message: t("emailRequiredForSetup")
              }
            };
            render();
            return;
          }
          state.loading = true;
          state.error = "";
          render();
          const params = new URLSearchParams();
          params.set("emailAddress", draft.emailAddress);
          if (draft.providerId) {
            params.set("provider", draft.providerId);
          }
          void requestJson((config.apiBasePath || "/api") + "/connect/onboarding?" + params.toString())
            .then(function(plan) {
              const recommended = plan && plan.recommendation ? plan.recommendation.provider : null;
              const nextAccountId =
                draft.accountId ||
                (plan && plan.input && typeof plan.input.accountIdSuggestion === "string" && plan.input.accountIdSuggestion !== "<accountId>"
                  ? plan.input.accountIdSuggestion
                  : "");
              const nextDisplayName =
                draft.displayName ||
                (plan && plan.input && typeof plan.input.displayNameSuggestion === "string"
                  ? plan.input.displayNameSuggestion
                  : "");
              state.connect = {
                ...(state.connect || {}),
                ...draft,
                plan: plan,
                provider: recommended,
                providerId: recommended && recommended.id ? recommended.id : draft.providerId,
                autoconfig: plan && plan.autoconfig ? plan.autoconfig : null,
                accountId: nextAccountId,
                displayName: nextDisplayName,
                smtpFrom: draft.smtpFrom || draft.emailAddress,
                status: {
                  tone: "ok",
                  message:
                    recommended && recommended.displayName
                      ? t("loadedSetupGuidanceFor", { provider: recommended.displayName })
                      : t("loadedSetupGuidance")
                }
              };
              if (recommended && recommended.setupKind === "browser_oauth" && recommended.id && nextAccountId) {
                return requestJson((config.apiBasePath || "/api") + "/auth/" + encodeURIComponent(recommended.id) + "/start", {
                  method: "POST",
                  headers: {
                    "content-type": "application/json"
                  },
                  body: JSON.stringify({
                    accountId: nextAccountId,
                    displayName: nextDisplayName || undefined,
                    loginHint: draft.emailAddress || undefined
                  })
                }).then(function(result) {
                  if (!result || typeof result.authorizeUrl !== "string" || result.authorizeUrl.trim().length === 0) {
                    throw new Error(t("oauthAuthorizeUrlMissing"));
                  }
                  window.location.assign(result.authorizeUrl);
                });
              }
            })
            .catch(function(error) {
              state.connect = {
                ...(state.connect || {}),
                ...draft,
                status: {
                  tone: "danger",
                  message: error instanceof Error ? error.message : String(error)
                }
              };
            })
            .finally(function() {
              state.loading = false;
              render();
            });
          return;
        }
        if (action === "start-oauth-connect") {
          event.preventDefault();
          const draft = rememberConnectFormState(target);
          const providerId = target.getAttribute("data-provider-id") || draft.providerId;
          if (!providerId || !draft.accountId) {
            state.connect = {
              ...(state.connect || {}),
              ...draft,
              status: {
                tone: "danger",
                message: t("providerAccountRequired")
              }
            };
            render();
            return;
          }
          state.loading = true;
          state.error = "";
          render();
          void requestJson((config.apiBasePath || "/api") + "/auth/" + encodeURIComponent(providerId) + "/start", {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              accountId: draft.accountId,
              displayName: draft.displayName || undefined,
              loginHint: draft.emailAddress || undefined,
              clientId: draft.clientId || undefined,
              clientSecret: draft.clientSecret || undefined,
              tenant: draft.tenant || undefined,
              topicName: draft.topicName || undefined,
              userId: draft.userId || undefined,
              labelIds: parseDelimitedInput(draft.labelIds),
              scopes: parseDelimitedInput(draft.scopes)
            })
          })
            .then(function(result) {
              if (!result || typeof result.authorizeUrl !== "string" || result.authorizeUrl.trim().length === 0) {
                throw new Error(t("oauthAuthorizeUrlMissing"));
              }
              window.location.assign(result.authorizeUrl);
            })
            .catch(function(error) {
              state.loading = false;
              state.connect = {
                ...(state.connect || {}),
                ...draft,
                status: {
                  tone: "danger",
                  message: error instanceof Error ? error.message : String(error)
                }
              };
              render();
            });
          return;
        }
        if (action === "save-password-mailbox") {
          event.preventDefault();
          const draft = rememberConnectFormState(target);
          if (!draft.emailAddress || !draft.accountId || !draft.password || !draft.imapHost || !draft.smtpHost) {
            state.connect = {
              ...(state.connect || {}),
              ...draft,
              status: {
                tone: "danger",
                message: t("passwordConfigRequired")
              }
            };
            render();
            return;
          }
          state.loading = true;
          state.error = "";
          render();
          void requestJson((config.apiBasePath || "/api") + "/accounts", {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              accountId: draft.accountId,
              provider: "imap",
              emailAddress: draft.emailAddress,
              displayName: draft.displayName || undefined,
              status: "active",
              settings: {
                imap: {
                  host: draft.imapHost,
                  port: parsePortValue(draft.imapPort, 993),
                  secure: draft.imapSecure !== "no",
                  username: draft.emailAddress,
                  password: draft.password,
                  mailbox: draft.imapMailbox || "INBOX"
                },
                smtp: {
                  host: draft.smtpHost,
                  port: parsePortValue(draft.smtpPort, 587),
                  secure: draft.smtpSecure === "yes",
                  username: draft.emailAddress,
                  password: draft.password,
                  from: draft.smtpFrom || draft.emailAddress
                }
              }
            })
          })
            .then(function(account) {
              state.connect = {
                ...(state.connect || {}),
                ...draft,
                status: {
                  tone: "ok",
                  message: t("mailboxSaved", { email: account && account.emailAddress ? account.emailAddress : draft.emailAddress })
                }
              };
              navigate({
                accountId: account && account.accountId ? account.accountId : draft.accountId,
                inboxId: null,
                roomKey: null,
                mailboxId: null,
                mode: "accounts"
              });
            })
            .catch(function(error) {
              state.loading = false;
              state.connect = {
                ...(state.connect || {}),
                ...draft,
                status: {
                  tone: "danger",
                  message: error instanceof Error ? error.message : String(error)
                }
              };
              render();
            });
          return;
        }
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
        if (action === "select-agent") {
          event.preventDefault();
          const agentId = target.getAttribute("data-agent-id") || "";
          state.connect = {
            ...(state.connect || {}),
            selectedAgentId: agentId
          };
          if (state.connect && state.connect.agentSoulAgentId === agentId) {
            render();
            return;
          }
          target.setAttribute("data-action", "load-agent-soul");
        }
        if (action === "load-agent-soul") {
          event.preventDefault();
          const agentId = target.getAttribute("data-agent-id") || "";
          const accountId = (state.data && state.data.selection && state.data.selection.accountId) || (state.route && state.route.accountId) || "";
          const tenantId = (state.data && state.data.workspace && state.data.workspace.connect && state.data.workspace.connect.templateApplyTenantId) || accountId || "default";
          state.loading = true;
          render();
          void requestJson((config.apiBasePath || "/api") + "/console/agents/" + encodeURIComponent(agentId) + "/soul?tenantId=" + encodeURIComponent(tenantId) + (accountId ? "&accountId=" + encodeURIComponent(accountId) : ""))
            .then(function(result) {
              state.connect = {
                ...(state.connect || {}),
                selectedAgentId: agentId,
                agentSoulAgentId: agentId,
                agentSoulContent: result && typeof result.content === "string" ? result.content : "",
                agentSoulStatus: {
                  tone: "ok",
                  message: t("soulLoadedMessage")
                }
              };
            })
            .catch(function(error) {
              state.connect = {
                ...(state.connect || {}),
                selectedAgentId: agentId,
                agentSoulStatus: {
                  tone: "danger",
                  message: error instanceof Error ? error.message : String(error)
                }
              };
            })
            .finally(function() {
              state.loading = false;
              render();
            });
          return;
        }
        if (action === "save-agent-soul") {
          event.preventDefault();
          const agentId = target.getAttribute("data-agent-id") || "";
          const accountId = (state.data && state.data.selection && state.data.selection.accountId) || (state.route && state.route.accountId) || "";
          const tenantId = (state.data && state.data.workspace && state.data.workspace.connect && state.data.workspace.connect.templateApplyTenantId) || accountId || "default";
          const payload = readAgentSoulPayload(target);
          state.loading = true;
          render();
          void requestJson((config.apiBasePath || "/api") + "/console/agents/" + encodeURIComponent(agentId) + "/soul", {
            method: "PUT",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              tenantId: tenantId,
              accountId: accountId || undefined,
              content: payload.content
            })
          })
            .then(function(result) {
              state.connect = {
                ...(state.connect || {}),
                selectedAgentId: agentId,
                agentSoulAgentId: agentId,
                agentSoulContent: result && typeof result.content === "string" ? result.content : payload.content,
                agentSoulStatus: {
                  tone: "ok",
                  message: t("soulSavedMessage")
                }
              };
            })
            .catch(function(error) {
              state.connect = {
                ...(state.connect || {}),
                selectedAgentId: agentId,
                agentSoulStatus: {
                  tone: "danger",
                  message: error instanceof Error ? error.message : String(error)
                }
              };
            })
            .finally(function() {
              state.loading = false;
              render();
            });
          return;
        }
        if (action === "delete-agent") {
          event.preventDefault();
          const agentId = target.getAttribute("data-agent-id") || "";
          const accountId = (state.data && state.data.selection && state.data.selection.accountId) || (state.route && state.route.accountId) || "";
          const tenantId = (state.data && state.data.workspace && state.data.workspace.connect && state.data.workspace.connect.templateApplyTenantId) || accountId || "default";
          if (!agentId || !accountId) {
            return;
          }
          state.loading = true;
          render();
          void requestJson((config.apiBasePath || "/api") + "/console/agents/" + encodeURIComponent(agentId) + "?accountId=" + encodeURIComponent(accountId) + "&tenantId=" + encodeURIComponent(tenantId), {
            method: "DELETE"
          })
            .then(function() {
              state.connect = {
                ...(state.connect || {}),
                selectedAgentId: "",
                agentSoulAgentId: "",
                agentSoulContent: "",
                agentSoulStatus: {
                  tone: "ok",
                  message: t("agentDeletedMessage")
                }
              };
              return refresh(true);
            })
            .catch(function(error) {
              state.connect = {
                ...(state.connect || {}),
                agentSoulStatus: {
                  tone: "danger",
                  message: error instanceof Error ? error.message : String(error)
                }
              };
            })
            .finally(function() {
              state.loading = false;
              render();
            });
          return;
        }
        if (action === "prefill-skill-install") {
          event.preventDefault();
          const source = target.getAttribute("data-skill-source") || "";
          const skillId = target.getAttribute("data-skill-id") || "";
          const title = target.getAttribute("data-skill-title") || skillId;
          const agentId = target.getAttribute("data-agent-id") || "";
          state.connect = {
            ...(state.connect || {}),
            skillTargetAgentId:
              state.connect && typeof state.connect.skillTargetAgentId === "string" && state.connect.skillTargetAgentId.trim().length > 0
                ? state.connect.skillTargetAgentId
                : agentId,
            skillSource: source,
            skillId: skillId,
            skillTitle: title,
            skillStatus: {
              tone: source ? "ok" : "danger",
              message: source ? t("sourceCopiedMessage") : t("sourceNotReusableMessage")
            }
          };
          render();
          return;
        }
        if (action === "quick-install-reusable-skill") {
          event.preventDefault();
          const accountId = target.getAttribute("data-account-id") || "";
          const tenantId = target.getAttribute("data-tenant-id") || accountId;
          const agentId = target.getAttribute("data-agent-id") || "";
          const source = target.getAttribute("data-skill-source") || "";
          const skillId = target.getAttribute("data-skill-id") || "";
          const title = target.getAttribute("data-skill-title") || skillId;
          if (!accountId || !agentId || !source) {
            return;
          }
          state.loading = true;
          render();
          void requestJson((config.apiBasePath || "/api") + "/skills/install", {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              accountId: accountId,
              tenantId: tenantId,
              agentId: agentId,
              source: source,
              skillId: skillId || undefined,
              title: title || undefined
            })
          })
            .then(function() {
              state.connect = {
                ...(state.connect || {}),
                skillTargetAgentId: agentId,
                skillSource: source,
                skillId: skillId,
                skillTitle: title,
                skillStatus: {
                  tone: "ok",
                  message: t("skillInstalledMessage")
                }
              };
              return refresh(true);
            })
            .catch(function(error) {
              state.connect = {
                ...(state.connect || {}),
                skillStatus: {
                  tone: "danger",
                  message: error instanceof Error ? error.message : String(error)
                }
              };
            })
            .finally(function() {
              state.loading = false;
              render();
            });
          return;
        }
        if (action === "quick-install-all-reusable-skills") {
          event.preventDefault();
          const accountId = target.getAttribute("data-account-id") || "";
          const tenantId = target.getAttribute("data-tenant-id") || accountId;
          const agentId = target.getAttribute("data-agent-id") || "";
          const connect = getConnectWorkspace();
          const reusableSkills = connect && Array.isArray(connect.reusableSkills) ? connect.reusableSkills : [];
          const installable = reusableSkills.filter(function(skill) {
            return typeof skill.path === "string" && skill.path.trim().length > 0;
          });
          if (!accountId || !agentId || installable.length === 0) {
            state.connect = {
              ...(state.connect || {}),
              skillStatus: {
                tone: "danger",
                message: t("batchInstallRequiresTarget")
              }
            };
            render();
            return;
          }
          state.loading = true;
          render();
          void (async function() {
            let installedCount = 0;
            try {
              for (const skill of installable) {
                await requestJson((config.apiBasePath || "/api") + "/skills/install", {
                  method: "POST",
                  headers: {
                    "content-type": "application/json"
                  },
                  body: JSON.stringify({
                    accountId: accountId,
                    tenantId: tenantId,
                    agentId: agentId,
                    source: skill.path,
                    skillId: skill.skillId || undefined,
                    title: skill.title || undefined
                  })
                });
                installedCount += 1;
              }
              state.connect = {
                ...(state.connect || {}),
                skillTargetAgentId: agentId,
                skillStatus: {
                  tone: "ok",
                  message: t("installAllSkillsDone", {
                    count: installedCount,
                    agentId: agentId
                  })
                }
              };
              await refresh(true);
            } catch (error) {
              const failedSkill = installable[installedCount];
              state.connect = {
                ...(state.connect || {}),
                skillTargetAgentId: agentId,
                skillStatus: {
                  tone: "danger",
                  message:
                    error instanceof Error
                      ? t("installAllSkillsPartial", {
                          done: installedCount,
                          total: installable.length,
                          agentId: agentId,
                          skillId: (failedSkill && (failedSkill.skillId || failedSkill.title)) || "skill"
                        }) + " " + error.message
                      : String(error)
                }
              };
            } finally {
              state.loading = false;
              render();
            }
          })();
          return;
        }
        if (action === "install-agent-skill") {
          event.preventDefault();
          const accountId = target.getAttribute("data-account-id");
          const tenantId = target.getAttribute("data-tenant-id");
          const payload = rememberSkillInstallPayload(target);
          if (!accountId || !payload.agentId || !payload.source) {
            state.connect = {
              ...(state.connect || {}),
              skillStatus: {
                tone: "danger",
                message: t("skillInstallRequiresTarget")
              }
            };
            render();
            return;
          }
          state.loading = true;
          state.error = "";
          render();
          void requestJson((config.apiBasePath || "/api") + "/skills/install", {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              accountId: accountId,
              tenantId: tenantId || accountId,
              agentId: payload.agentId,
              source: payload.source,
              skillId: payload.skillId || undefined,
              title: payload.title || undefined
            })
          })
            .then(function(installed) {
              return refresh(true).then(function() {
                state.connect = {
                  ...(state.connect || {}),
                  skillTargetAgentId: payload.agentId,
                  skillSource: payload.source,
                  skillId: payload.skillId || (installed && installed.skillId ? installed.skillId : ""),
                  skillTitle: payload.title || (installed && installed.title ? installed.title : ""),
                  skillStatus: {
                    tone: "ok",
                    message:
                      t("installedSkillForAgent", {
                        skillId: String((installed && installed.skillId) || payload.skillId || "skill"),
                        agentId: payload.agentId
                      })
                  }
                };
                render();
              });
            })
            .catch(function(error) {
              state.connect = {
                ...(state.connect || {}),
                skillTargetAgentId: payload.agentId,
                skillSource: payload.source,
                skillId: payload.skillId,
                skillTitle: payload.title,
                skillStatus: {
                  tone: "danger",
                  message: error instanceof Error ? error.message : String(error)
                }
              };
            })
            .finally(function() {
              state.loading = false;
              render();
            });
          return;
        }
        if (action === "create-shared-skill") {
          event.preventDefault();
          const tenantId = target.getAttribute("data-tenant-id") || "default";
          const accountId = target.getAttribute("data-account-id") || "";
          const payload = readSharedSkillPayload(target);
          state.loading = true;
          render();
          void requestJson((config.apiBasePath || "/api") + "/skills/library", {
            method: "POST",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({
              tenantId: tenantId,
              accountId: accountId || undefined,
              skillId: payload.skillId || undefined,
              title: payload.title || undefined,
              content: payload.content
            })
          })
            .then(function(created) {
              state.connect = {
                ...(state.connect || {}),
                sharedSkillId: created && created.skillId ? created.skillId : payload.skillId,
                sharedSkillTitle: created && created.title ? created.title : payload.title,
                sharedSkillContent: payload.content,
                sharedSkillStatus: {
                  tone: "ok",
                  message: t("sharedSkillSavedMessage")
                },
                skillSource: created && created.path ? created.path : "",
                skillId: created && created.skillId ? created.skillId : payload.skillId,
                skillTitle: created && created.title ? created.title : payload.title
              };
              return refresh(true);
            })
            .catch(function(error) {
              state.connect = {
                ...(state.connect || {}),
                sharedSkillId: payload.skillId,
                sharedSkillTitle: payload.title,
                sharedSkillContent: payload.content,
                sharedSkillStatus: {
                  tone: "danger",
                  message: error instanceof Error ? error.message : String(error)
                }
              };
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

      document.querySelectorAll("[data-locale]").forEach(function(button) {
        button.addEventListener("click", function() {
          applyLocale(button.getAttribute("data-locale") || "en");
          render();
        });
      });

      window.addEventListener("popstate", function() {
        state.route = parseRoute(window.location.pathname, window.location.search);
        void refresh(true);
      });

      state.locale = resolveInitialLocale();
      state.themeMode = resolveInitialThemeMode();
      state.route = parseRoute(window.location.pathname, window.location.search);
      applyLocale(state.locale);
      applyThemeMode(state.themeMode);
      notifyHost("mailclaws.workbench.ready", {
        embeddedShell: Boolean(config.embeddedShell),
        href: window.location.pathname + window.location.search
      });
      void refresh(true);
    </script>
  </body>
</html>`;
}
