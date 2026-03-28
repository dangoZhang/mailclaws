# MailClaw

<p align="center">
  Email-native runtime for durable, auditable, multi-agent work.
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.fr.md">Français</a>
</p>

<p align="center">
  <a href="https://github.com/dangoZhang/mailclaw/actions/workflows/ci.yml">CI</a> ·
  <a href="https://github.com/dangoZhang/mailclaw/actions/workflows/release.yml">Release</a>
</p>

MailClaw turns email threads into durable rooms with explicit state, replay, approvals, retrieval, and governed delivery. It started on top of [OpenClaw](https://github.com/openclaw/openclaw), but it is built as an email-native runtime rather than a thin transport plugin.

## Fastest Way To Try It

If you only want the shortest path:

1. `pnpm install`
2. `pnpm dev`
3. `pnpm mailctl connect login`
4. Send one email from another mailbox to the connected mailbox
5. Open `http://127.0.0.1:3000/console`
6. Run `pnpm mailctl observe rooms`

That is the current happy path: log in one mailbox, send one real test email, inspect the room, then inspect internal agent mailboxes from the console or CLI.

## What MailClaw Is

MailClaw is currently a backend runtime plus operator surfaces. It is designed for durable thread continuity, virtual-mail-based internal collaboration, replayable operations, and approval-gated outbound delivery.

## Relationship With OpenClaw

MailClaw reuses OpenClaw ecosystem entry points (Gateway, runtime substrate, and agent packaging) and keeps Gateway compatibility. MailClaw defines the room truth layer, virtual mail collaboration semantics, approval/outbox governance, and replay/recovery operator model.

## What Works Today

- Thread-first room kernel backed by SQLite
- Deterministic room/session identity from reply headers and provider thread hints
- Durable replay, recovery, quarantine, dead-letter, resend, approve, and reject flows
- Virtual mail plane for internal orchestration/worker collaboration with durable projection state
- Pre-first room memory with durable room pre snapshots, replay-visible summaries, and mail rendering from persisted Pre state
- Built-in IMAP fetch, IMAP/Gmail watcher controllers, Gmail history recovery/watch ingestion, SMTP/Gmail outbound delivery
- Account-scoped SMTP delivery settings for non-Gmail accounts
- Forward-style raw RFC822 ingest through `POST /api/inbound/raw`
- Gmail and Outlook OAuth mailbox login via `mailctl` and `/api/auth/:provider/*`
- Provider setup catalog via `mailctl connect providers` and `GET /api/connect/providers` covering Gmail, Outlook, QQ, iCloud, Yahoo, 163/126, generic IMAP, and forward/raw MIME fallback
- Each agent workspace auto-bootstraps `SOUL.md`, `AGENTS.md`, `MEMORY.md`, plus default `roles/mail-read.default.md` and `roles/mail-write.default.md` guidance that is summarized into orchestration turns
- Gateway-linked rooms now auto-record outcome projections for `final_ready` style results, expose a unified `POST /api/gateway/events` ingress seam, and show those traces in replay/API/console views
- HTTP and CLI inspection surfaces for rooms, approvals, provider state, inbox projections, mailbox console/feed, gateway projection traces, and runtime execution boundaries / embedded sessions
- Read-only operator console at `/console` for accounts, rooms, approvals, mailboxes, and gateway trace inspection

## Agent Defaults

MailClaw agents now start from mail-aware defaults instead of accumulating a long transcript blindly:

- `mail-read`: read the latest inbound first, then pull older room context only by reference
- `mail-write`: preserve ACK, progress, and final semantics, and keep external replies RFC-safe
- Persistent room memory keeps Pre snapshots, facts, questions, and decisions; scratch traces and failed attempts stay out of long-lived memory by default

## Measured Prompt Footprint

A repository-local benchmark now ships in both `pnpm benchmark:prompt-footprint` and `mailctl benchmark prompt-footprint`. It compares the current pre-first prompt assembly against a conservative session-first/full-transcript baseline using the same room data.

Measured on `2026-03-28` in this repo:

- Long-thread follow-ups: average orchestrator prompt footprint was `755` estimated tokens vs `2006` for the transcript-first baseline, a `62.3%` reduction.
- Late long-thread follow-up: by turn 6 the orchestrator prompt was `752` estimated tokens vs `2868`, a `73.8%` reduction.
- Multi-agent reducer handoff: with 5 workers, the orchestrator prompt was `750` estimated tokens vs `3444` when replaying raw worker transcripts, a `78.2%` reduction.

Interpretation:

- Compared with a session-first OpenClaw-style baseline, the current presentation/pre-first architecture should usually cut main-turn prompt volume by roughly `60%` to `75%` on longer rooms.
- In fan-out/fan-in runs, reducer summaries keep the front orchestrator closer to a `75%` to `80%` reduction instead of paying to reread every worker transcript.

Reproduce locally:

```bash
mailctl benchmark prompt-footprint
mailctl --json benchmark prompt-footprint
pnpm benchmark:prompt-footprint
pnpm vitest run tests/prompt-footprint-benchmark.test.ts
```

The benchmark uses `ceil(characters / 4)` as an estimated token heuristic. Treat it as prompt-footprint guidance, not provider-billed token accounting.

## 3-Minute First Inbox Flow

If you are used to normal mail clients, treat MailClaw setup as "log in account -> send a mail -> check the conversation":

1. Start runtime: `pnpm dev`
2. Ask MailClaw for the easiest path first: `pnpm mailctl connect start you@example.com`
3. Log in a mailbox account: `pnpm mailctl connect login`
4. Verify account and address info: `pnpm mailctl connect accounts show <accountId>`
5. Send one test mail from another mailbox (or from your own second address) to that connected mailbox
6. Inspect the room and inbox:
   - `pnpm mailctl observe rooms`
   - `pnpm mailctl observe inboxes <accountId>`
   - `pnpm mailctl replay <roomKey>`
   - open `http://127.0.0.1:3000/console/connect` for mailbox-first onboarding and `http://127.0.0.1:3000/console/accounts/<accountId>` for the connected account workbench

The same recommendation flow is also exposed at `GET /api/connect/onboarding?emailAddress=you@example.com`.

If you already use OpenClaw, start in bridge mode and inspect MailClaw truth instead of session transcript truth:

- `MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true MAILCLAW_FEATURE_MAIL_INGEST=true pnpm dev`
- `pnpm mailctl observe runtime`
- `pnpm mailctl observe workbench <accountId>`

To inspect internal agent collaboration mail for a room:

- `pnpm mailctl observe mailbox-view <roomKey> <mailboxId> virtual_internal`
- `pnpm mailctl observe mailbox-feed <accountId> <mailboxId> 50 virtual_internal`

To inspect the durable room summary that agents actually carry forward:

- `pnpm mailctl replay <roomKey>`
- open `http://127.0.0.1:3000/console/rooms/<roomKey>` and review the latest room memory / pre snapshot state

## Current Boundaries

- A read-only operator console is shipped at `/console`, but no full Outlook-like mailbox client is shipped yet.
- No OpenClaw Workbench mailbox tab is shipped yet.
- Gateway outcome traces now auto-project once a room is Gateway-bound, but full upstream Gateway ingress/Workbench automation is still incomplete in this repo.
- Mailbox connection guidance now exists in CLI/API form, but MailClaw still does not provision provider-side DNS, Pub/Sub topics, forwarding rules, or mailbox policies for you.
- Upstream OpenClaw embedded runtime/session-manager first-class integration and stricter backend enforcement still need follow-up repo work; the shipped documentation only claims the boundaries implemented here.

## Documentation

- [Docs Index (English)](./docs/index.md)
- [Getting Started (English)](./docs/getting-started.md)
- [Operator Console (English)](./docs/operator-console.md)
- [Operators Guide (English)](./docs/operators-guide.md)
- [Integrations (English)](./docs/integrations.md)
- [Release Notes v0.1.0 (English)](./docs/release-notes-v0.1.0.md)
- [Release Assets (English)](./docs/release-assets.md)

For Chinese and French docs, use the language links at the top of each page.

Run the docs website locally:

```bash
pnpm docs:dev
```

Build the static docs site:

```bash
pnpm docs:build
```

Build a release bundle with runtime, CLI, and static docs:

```bash
pnpm package:release
```

This writes:

- `output/release/mailclaw-v<version>/`
- `output/release/mailclaw-v<version>.tar.gz`

The bundle contains:

- compiled runtime under `dist/`
- `mailctl` and `mailioctl` entrypoints
- `mailclaw` server entrypoint
- static docs site under `docs-site/`
- `README.md`, `LICENSE`, `.env.example`, and a release manifest
- an npm install tarball under `output/release/npm/`
- a local Homebrew formula under `output/release/homebrew/`

## Quick Start

Install dependencies:

```bash
pnpm install
```

Start with OpenClaw bridge mode:

```bash
MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON='{"toolPolicies":["mail-orchestrator","mail-attachment-reader","mail-researcher","mail-drafter","mail-reviewer","mail-guard"],"sandboxPolicies":["mail-room-orchestrator","mail-room-worker"],"networkAccess":"allowlisted","filesystemAccess":"workspace-read","outboundMode":"approval_required"}' \
MAILCLAW_FEATURE_MAIL_INGEST=true \
MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true \
MAILCLAW_OPENCLAW_GATEWAY_TOKEN=dev-token \
pnpm dev
```

Then follow [Getting Started](./docs/getting-started.md) for account connection and end-to-end smoke paths.

Bootstrap a mailbox connection (recommended order):

```bash
pnpm mailctl connect providers
pnpm mailctl connect login
pnpm mailctl observe accounts
```

If you want a distributable artifact instead of running from source:

```bash
pnpm package:release
cd output/release/mailclaw-v<version>
pnpm install --prod
pnpm start
```

Local one-line installs from the generated release assets:

```bash
npm install -g ./output/release/npm/mailclaw-<version>.tgz
pnpm setup
pnpm add -g "file://$PWD/output/release/npm/mailclaw-<version>.tgz"
brew install ./output/release/homebrew/mailclaw.rb
```

Notes:

- `pnpm add -g` should use an absolute or `file://` path for a local tarball; a relative path can fail in a fresh global-store setup.
- On a fresh machine, run `pnpm setup` once so `PNPM_HOME` is added to `PATH`.
- Local `brew install ./output/release/homebrew/mailclaw.rb` still depends on Homebrew being able to reach its own infrastructure such as `ghcr.io` for portable Ruby.

After publish to a registry/tap, the same package layout is ready for:

```bash
npm install -g mailclaw
pnpm setup
pnpm add -g mailclaw
npx mailclaw@latest
pnpm dlx mailclaw@latest
brew install mailclaw
```

`npx mailclaw@latest` and `pnpm dlx mailclaw@latest` launch the default `mailclaw` runtime entrypoint. If you want the operator CLI, install the package first and then run `mailctl`.

## GitHub Automation

This repository now includes GitHub Actions for both automatic verification and release asset publishing:

- `CI`: runs lint, tests, runtime build, docs build, and release-bundle generation on push/PR
- `Release`: on `v*` tags or manual dispatch, builds the release bundle and uploads:
  - runtime tarball
  - npm package tarball
  - Homebrew formula
  - checksums
  - release manifest

One-click release from a clean local checkout:

```bash
pnpm release:ship
```

This runs `pnpm check`, builds the release bundle, tags `v<package.json version>`, pushes `main`, and pushes the release tag so the GitHub Release workflow can upload the assets.

For headless OAuth login flows:

```bash
pnpm mailctl connect login oauth gmail <accountId> [displayName] --no-browser
pnpm mailctl connect login oauth outlook <accountId> [displayName] --no-browser
```

## Release Verification

Run the release baseline checks before publishing:

```bash
pnpm build
pnpm test:workflow
pnpm test:security
pnpm docs:build
```

Optional live-provider smoke (requires real credentials):

```bash
pnpm test:live-providers
```

## License

MailClaw uses the [MIT License](./LICENSE), aligned with [OpenClaw](https://github.com/openclaw/openclaw).
