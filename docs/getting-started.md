# Getting Started

<p align="center">
  <a href="./getting-started.md"><strong>English</strong></a> ·
  <a href="./getting-started.zh-CN.md">简体中文</a> ·
  <a href="./getting-started.fr.md">Français</a>
</p>

This guide is for the current operator/developer-facing MailClaw runtime. It includes the read-only `/console` operator surface, but it does not assume a full mailbox UI.

## Prerequisites

- Node.js and `pnpm`
- A checkout of this repository
- Optional real mailbox credentials (for live provider tests)

Install dependencies:

```bash
pnpm install
```

<a id="release-bundle"></a>

## 0. Choose Source Run Or Release Bundle {#release-bundle}

You can start MailClaw in two ways:

- Source checkout:
  use `pnpm install`, `pnpm dev`, and `pnpm mailctl ...`
- Release bundle:
  use `pnpm package:release` to produce a runtime bundle plus static docs site

Build the release bundle:

```bash
pnpm package:release
```

This creates:

- `output/release/mailclaw-v<version>/`
- `output/release/mailclaw-v<version>.tar.gz`

Run the packaged build:

```bash
cd output/release/mailclaw-v<version>
pnpm install --prod
pnpm start
```

The packaged bundle also includes:

- `docs-site/` for static documentation hosting
- `dist/cli/mailclaw.js`
- `dist/cli/mailctl.js`
- `dist/cli/mailioctl.js`
- `.env.example`, `README.md`, and `release-manifest.json`

Local one-command installs from those generated assets:

```bash
npm install -g ./output/release/npm/mailclaw-<version>.tgz
pnpm add -g ./output/release/npm/mailclaw-<version>.tgz
brew install ./output/release/homebrew/mailclaw.rb
```

When the same artifact layout is published upstream, the intended install commands are:

```bash
npm install -g mailclaw
pnpm add -g mailclaw
npx mailclaw@latest
pnpm dlx mailclaw@latest
brew install mailclaw
```

## 1. Start The Runtime

Bridge mode (OpenClaw-compatible):

```bash
MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON='{"toolPolicies":["mail-orchestrator","mail-attachment-reader","mail-researcher","mail-drafter","mail-reviewer","mail-guard"],"sandboxPolicies":["mail-room-orchestrator","mail-room-worker"],"networkAccess":"allowlisted","filesystemAccess":"workspace-read","outboundMode":"approval_required"}' \
MAILCLAW_FEATURE_MAIL_INGEST=true \
MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true \
MAILCLAW_OPENCLAW_GATEWAY_TOKEN=dev-token \
pnpm dev
```

Command mode (local runtime command):

```bash
MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON='{"toolPolicies":["mail-orchestrator","mail-attachment-reader","mail-researcher","mail-drafter","mail-reviewer","mail-guard"],"sandboxPolicies":["mail-room-orchestrator","mail-room-worker"],"networkAccess":"allowlisted","filesystemAccess":"workspace-read","outboundMode":"approval_required"}' \
MAILCLAW_RUNTIME_MODE=command \
MAILCLAW_RUNTIME_COMMAND='mail-runtime --stdio' \
MAILCLAW_FEATURE_MAIL_INGEST=true \
pnpm dev
```

`MAILCLAW_RUNTIME_POLICY_MANIFEST_JSON` is required whenever runtime turns carry `executionPolicy` metadata.

Open the read-only operator console after boot:

```text
http://127.0.0.1:3000/console
```

On the first turn for an agent workspace, MailClaw also bootstraps:

- `SOUL.md`
- `AGENTS.md`
- `MEMORY.md`
- `roles/mail-read.default.md`
- `roles/mail-write.default.md`

These defaults are summarized into orchestration turns so mail handling starts with "latest inbound first" and "ACK/progress/final stay distinct" behavior.

## 2. Connect An Account

Choose one path:

- Inspect the provider/setup matrix first: `pnpm mailctl connect providers [provider]`
- Ask MailClaw for a mailbox-first recommendation: `pnpm mailctl connect start you@example.com`
- Interactive terminal wizard: `pnpm mailctl connect login`
- Gmail OAuth: `pnpm mailctl connect login gmail <accountId> [displayName]`
- Outlook OAuth: `pnpm mailctl connect login outlook <accountId> [displayName]`
- Headless OAuth: `pnpm mailctl connect login oauth gmail <accountId> [displayName] --no-browser`
- Headless Outlook OAuth: `pnpm mailctl connect login oauth outlook <accountId> [displayName] --no-browser`
- API account registration: `POST /api/accounts`

Recommended bootstrap order:

```bash
pnpm mailctl connect providers
pnpm mailctl connect login
pnpm mailctl observe accounts
```

You can inspect connected accounts with:

```bash
pnpm mailctl observe accounts
```

Provider setup catalog APIs:

```bash
curl -s http://127.0.0.1:3000/api/connect
curl -s "http://127.0.0.1:3000/api/connect/onboarding?emailAddress=you@example.com"
curl -s http://127.0.0.1:3000/api/connect/providers
curl -s http://127.0.0.1:3000/api/connect/providers/gmail
```

<a id="three-minute-first-mail"></a>

## 3. Send Your First Real Email (Mailbox User Path) {#three-minute-first-mail}

After account login, use your normal mail habit first:

1. Copy the connected mailbox address from:
   - `pnpm mailctl connect accounts show <accountId>`
2. Send one email to that address from another mailbox client/account.
3. Inspect the created room and inbox:
   - `pnpm mailctl observe rooms`
   - `pnpm mailctl observe inboxes <accountId>`
   - `pnpm mailctl observe room <roomKey>`
4. Open console views:
   - `http://127.0.0.1:3000/console/accounts/<accountId>`
   - `http://127.0.0.1:3000/console/rooms/<roomKey>`
5. Inspect internal agent collaboration messages:
   - `pnpm mailctl observe mailbox-view <roomKey> <mailboxId>`
   - `pnpm mailctl observe mailbox-feed <accountId> <mailboxId>`
6. Inspect the durable room summary carried across turns:
   - `pnpm mailctl replay <roomKey>`
   - verify `preSnapshots` and `roomNotes.latestSnapshot`

This is the shortest "login -> receive -> inspect -> governance" path for real mailbox users.

Behavior note: MailClaw agents do not reload an entire transcript by default. The normal turn assembly is latest inbound + latest room pre snapshot + referenced facts/artifacts.

## 4. Path A: provider mail -> room -> approval -> delivery

Inject a normalized inbound message:

```bash
curl -X POST 'http://127.0.0.1:3000/api/inbound?processImmediately=true' \
  -H 'content-type: application/json' \
  -d '{
    "accountId": "acct-1",
    "mailboxAddress": "mailclaw@example.com",
    "envelope": {
      "providerMessageId": "provider-1",
      "messageId": "<msg-1@example.com>",
      "subject": "API room",
      "from": { "email": "sender@example.com" },
      "to": [{ "email": "mailclaw@example.com" }],
      "text": "Hello from the API",
      "headers": [{ "name": "Message-ID", "value": "<msg-1@example.com>" }]
    }
  }'
```

Inspect room and approval state:

```bash
pnpm mailctl observe rooms
pnpm mailctl observe room <roomKey>
pnpm mailctl observe approvals room <roomKey>
```

Deliver pending outbox messages:

```bash
pnpm mailctl operate deliver-outbox
```

## 5. Path B: Gateway turn -> virtual mail -> room -> final outcome

Project a Gateway turn into MailClaw:

```bash
curl -X POST 'http://127.0.0.1:3000/api/gateway/project' \
  -H 'content-type: application/json' \
  -d '{
    "sessionKey": "gw-session-1",
    "sourceControlPlane": "openclaw",
    "fromPrincipalId": "agent:front",
    "fromMailboxId": "front-mailbox",
    "toMailboxIds": ["mail-orchestrator"],
    "kind": "claim",
    "visibility": "internal",
    "subject": "Gateway projection smoke",
    "bodyRef": "gateway message body",
    "inputsHash": "smoke-hash-1"
  }'
```

Inspect projection trace and room timeline:

```bash
pnpm mailctl gateway trace <roomKey>
pnpm mailctl replay <roomKey>
```

Boundary note: projection APIs are implemented, but automatic upstream Gateway event-stream wiring is not complete in this repository.

## 6. Path C: internal multi-agent -> reducer/reviewer/guard -> projected outcome

Enable worker/governance flags for local runs:

```bash
MAILCLAW_FEATURE_SWARM_WORKERS=true \
MAILCLAW_FEATURE_APPROVAL_GATE=true \
MAILCLAW_FEATURE_IDENTITY_TRUST_GATE=true \
pnpm dev
```

Then inspect internal collaboration artifacts via room mailboxes/feed:

```bash
pnpm mailctl observe mailbox-view <roomKey> <mailboxId>
pnpm mailctl observe mailbox-feed <accountId> <mailboxId>
pnpm mailctl approvals trace <roomKey>
```

You can filter mailbox views by origin kinds (`provider_mail`, `gateway_chat`, `virtual_internal`) to verify internal multi-agent transitions.

## 7. Next Steps

- Operator workflows and troubleshooting: [Operators Guide](./operators-guide.md)
- Provider/Gateway/OpenClaw wiring: [Integrations](./integrations.md)
- Real credential smoke procedures: [Live Provider Smoke](./live-provider-smoke.md)

Release verification baseline:

```bash
pnpm build
pnpm test:workflow
pnpm test:security
pnpm docs:build
```
