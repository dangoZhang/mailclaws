# Integrations

<p align="center">
  <a href="./integrations.md"><strong>English</strong></a> ·
  <a href="./integrations.zh-CN.md">简体中文</a> ·
  <a href="./integrations.fr.md">Français</a>
</p>

This guide describes currently supported integration paths and their boundaries.

## Compatibility Positioning

MailClaw is OpenClaw-ecosystem compatible and keeps Gateway entry compatibility. In this split:

- OpenClaw remains the upstream substrate for Gateway/runtime/agent packaging.
- MailClaw owns room truth, virtual-mail collaboration semantics, approval/outbox governance, and replay/recovery projection surfaces.

## Mailbox User Onboarding Strategy

For regular mailbox users, choose integration paths in this order:

1. Gmail/Outlook OAuth (`mailctl connect login gmail|outlook`) for lowest setup friction.
2. Password/IMAP preset login (`mailctl connect login imap|qq|icloud|yahoo|163|126`) when OAuth is not available.
3. Forward/raw MIME fallback (`provider: "forward"` + `POST /api/inbound/raw`) when provider-native integration is not feasible yet.

This order matches current `plan12` closeout priorities and keeps migration into future guided onboarding (`plan13`) straightforward.

If you know the mailbox address but do not know which path to choose yet, start with:

- `pnpm mailctl connect start you@example.com`
- `GET /api/connect/onboarding?emailAddress=you@example.com`

If you already operate OpenClaw, keep bridge mode on first and use MailClaw as the room/approval/replay layer:

- `MAILCLAW_FEATURE_OPENCLAW_BRIDGE=true MAILCLAW_FEATURE_MAIL_INGEST=true pnpm dev`
- `pnpm mailctl observe runtime`
- `pnpm mailctl observe workbench <accountId>`

## Inbound Integration Paths

Provider-driven ingress:

- Built-in IMAP fetch and watcher controllers
- Gmail watch/history recovery ingestion

API-driven ingress:

- Normalized message ingress: `POST /api/inbound`
- Raw RFC822/MIME ingress: `POST /api/inbound/raw`

Gateway-driven ingress:

- Single event/batch ingress seam: `POST /api/gateway/events`
- Resolve/bind session to room: `GET /api/gateway/sessions/:sessionKey`, `POST /api/gateway/sessions/:sessionKey/bind`
- Project Gateway turn to virtual mail: `POST /api/gateway/project`
- Gateway-bound room outcomes now auto-record `gateway.outcome.projected` entries for eligible `final_ready / progress / handoff / approval / system_notice` message kinds

Boundary note: room outcome projection is now automatic once a room is Gateway-bound, but full automatic upstream Gateway event-stream wiring is still incomplete in this repo.

## Outbound Integration Paths

MailClaw outbound control is governance-first:

- Approve/reject pending outbox entries: `POST /api/outbox/:outboxId/approve|reject`
- Deliver queued outbound messages: `POST /api/outbox/deliver`
- Resend flows are available through CLI (`mailctl resend <outboxId>`)

Provider delivery backends:

- Gmail API send path for Gmail OAuth accounts
- SMTP send path (process-global and account-scoped)

Gateway outcome projection:

- `POST /api/gateway/outcome` projects room outcomes for external Gateway-side handling.
- Outcome classification exists, but upstream delivery/notification adapter wiring remains partial.

## OAuth, Account, And Provider Setup

Gmail OAuth variables:

- `MAILCLAW_GMAIL_OAUTH_CLIENT_ID`
- `MAILCLAW_GMAIL_OAUTH_TOPIC_NAME` (for immediate watch/recovery readiness)
- Optional: `MAILCLAW_GMAIL_OAUTH_CLIENT_SECRET`, `MAILCLAW_GMAIL_OAUTH_USER_ID`, `MAILCLAW_GMAIL_OAUTH_LABEL_IDS`, `MAILCLAW_GMAIL_OAUTH_SCOPES`

Outlook/Microsoft OAuth variables:

- `MAILCLAW_MICROSOFT_OAUTH_CLIENT_ID`
- Optional: `MAILCLAW_MICROSOFT_OAUTH_CLIENT_SECRET`, `MAILCLAW_MICROSOFT_OAUTH_TENANT`, `MAILCLAW_MICROSOFT_OAUTH_SCOPES`

CLI setup commands:

```bash
pnpm mailctl connect providers [provider]
pnpm mailctl connect login
pnpm mailctl connect login gmail <accountId> [displayName]
pnpm mailctl connect login outlook <accountId> [displayName]
```

API setup endpoint:

- `GET /api/connect`
- `GET /api/connect/providers`
- `GET /api/connect/providers/:provider`
- `POST /api/accounts`
- `GET /api/auth/:provider/start` for browser redirects
- `POST /api/auth/:provider/start` for secret-bearing or programmatic starts

Release note:

- Query-string `clientSecret` is intentionally rejected on `GET /api/auth/:provider/start`; use POST or env-backed CLI flows instead.

For forward/export inbound setups, use `provider: "forward"` and configure account-level `settings.smtp` for outbound delivery.

## Inspection And Projection Surfaces

Account and provider state:

- `GET /api/accounts`
- `GET /api/accounts/:accountId/provider-state`

Room, mailbox, and approval projections:

- `GET /api/rooms/:roomKey/replay`
- `GET /api/rooms/:roomKey/approvals`
- `GET /api/rooms/:roomKey/mailboxes/:mailboxId`
- `GET /api/accounts/:accountId/inboxes`
- `GET /api/accounts/:accountId/mailbox-console`
- `GET /api/accounts/:accountId/mailboxes/:mailboxId/feed`

Gateway projection trace:

- `GET /api/rooms/:roomKey/gateway-projection-trace`

## Current Integration Gaps

- A first-party read-only MailClaw operator console is shipped at `/console`, but it is not a full mailbox client.
- No OpenClaw Workbench mailbox tab integration is shipped yet.
- Gateway auto-ingress/egress production wiring is still incomplete.
- Provider coverage is broader than early versions, but still not the full long-term target set.
- Upstream embedded runtime/session-manager first-class integration and full backend policy enforcement closeout are still pending (`plan12`).
