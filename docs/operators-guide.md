# Operators Guide

<p align="center">
  <a href="./operators-guide.md"><strong>English</strong></a> ·
  <a href="./operators-guide.zh-CN.md">简体中文</a> ·
  <a href="./operators-guide.fr.md">Français</a>
</p>

This guide documents currently implemented operator workflows. It covers the `/console` operator surface plus runtime and CLI/API operations; it is not a full mailbox-client guide.

## Scope And Terminology

MailClaw operator surfaces are organized around:

- `room`: durable collaboration boundary
- `virtual mail`: internal/external message projection model
- `mailbox`: projected view over room messages
- `projection`: mapping from provider/Gateway/internal sources into room truth
- `approval` and `delivery`: governance over outbound effects
- `provider state`: account-level cursor/watch/checkpoint health

## First-Response Runbook (Mailbox-Style)

Use this when a mailbox user says "I sent mail, did the system receive it?".

1. Confirm account and provider health:
   - `pnpm mailctl observe accounts show <accountId>`
   - `GET /api/accounts/:accountId/provider-state`
2. Confirm room creation:
   - `pnpm mailctl observe rooms`
   - `pnpm mailctl observe room <roomKey>`
3. Confirm inbox projection:
   - `pnpm mailctl observe inboxes <accountId>`
   - `pnpm mailctl observe mailbox-feed <accountId> <mailboxId>`
4. Confirm internal agent collaboration mail:
   - `pnpm mailctl observe mailbox-view <roomKey> <mailboxId> virtual_internal`
5. Confirm outbound governance state:
   - `pnpm mailctl observe approvals room <roomKey>`
   - `pnpm mailctl operate deliver-outbox`

Console path for the same checks:

- `/console/accounts/:accountId`
- `/console/rooms/:roomKey`
- `/console/mailboxes/:accountId/:mailboxId`

## Daily Readiness Checks

Basic service checks:

```bash
curl -s http://127.0.0.1:3000/healthz
curl -s http://127.0.0.1:3000/readyz
```

Runtime inventory:

```bash
pnpm mailctl observe accounts
pnpm mailctl observe rooms
pnpm mailctl operate quarantine
pnpm mailctl operate dead-letter
```

Console-grade API snapshots:

- `GET /api/console/terminology`
- `GET /api/console/accounts`
- `GET /api/console/rooms`
- `GET /api/console/approvals`
- `GET /api/runtime/execution`
- `GET /api/runtime/embedded-sessions`

Browser console:

- `GET /console`
- deep links under `/console/accounts/:accountId`, `/console/inboxes/:accountId/:inboxId`, `/console/rooms/:roomKey`, `/console/mailboxes/:accountId/:mailboxId`

Runtime/operator inspection:

```bash
pnpm mailctl observe runtime
pnpm mailctl observe embedded-sessions [sessionKey]
```

## Account, Provider, And Ingest Operations

Connect or update accounts:

```bash
pnpm mailctl connect providers [provider]
pnpm mailctl connect login
pnpm mailctl connect login gmail <accountId> [displayName]
pnpm mailctl connect login outlook <accountId> [displayName]
```

Inspect account/provider state:

```bash
pnpm mailctl observe accounts show <accountId>
curl -s http://127.0.0.1:3000/api/accounts/<accountId>/provider-state
curl -s http://127.0.0.1:3000/api/connect
curl -s http://127.0.0.1:3000/api/connect/providers
```

Ingest paths:

- Normalized payload: `POST /api/inbound?processImmediately=true`
- Raw MIME payload: `POST /api/inbound/raw?processImmediately=true`
- Gmail Pub/Sub + recovery hooks: `POST /api/accounts/:accountId/gmail/notifications`, `POST /api/accounts/:accountId/gmail/recover`

## Room, Timeline, Mailbox, And Projection Inspection

Primary room inspection:

```bash
pnpm mailctl observe room <roomKey>
pnpm mailctl observe approvals room <roomKey>
pnpm mailctl observe mailbox-view <roomKey> <mailboxId>
```

Cross-room mailbox and inbox surfaces:

```bash
pnpm mailctl observe inboxes <accountId>
pnpm mailctl inboxes project <accountId> <agentId>
pnpm mailctl inboxes console <accountId>
pnpm mailctl observe mailbox-feed <accountId> <mailboxId>
```

Gateway projection inspection:

```bash
pnpm mailctl observe projection <roomKey>
pnpm mailctl gateway resolve <sessionKey> [roomKey]
```

Related APIs:

- `GET /api/rooms/:roomKey/replay`
- `GET /api/rooms/:roomKey/approvals`
- `GET /api/rooms/:roomKey/mailboxes/:mailboxId`
- `GET /api/rooms/:roomKey/gateway-projection-trace`
- `GET /api/accounts/:accountId/inboxes`
- `GET /api/accounts/:accountId/mailbox-console`
- `GET /api/accounts/:accountId/mailboxes/:mailboxId/feed`

## Approval, Outbox, Recovery, And Queue Control

Approval/outbox actions:

```bash
pnpm mailctl operate approve <outboxId>
pnpm mailctl operate reject <outboxId>
pnpm mailctl operate resend <outboxId>
pnpm mailctl operate deliver-outbox
```

Recovery and queue actions:

```bash
pnpm mailctl operate recover [timestamp]
pnpm mailctl operate drain [limit]
pnpm mailctl operate dead-letter retry <jobId>
```

HTTP equivalents:

- `POST /api/outbox/:outboxId/approve`
- `POST /api/outbox/:outboxId/reject`
- `POST /api/outbox/deliver`
- `POST /api/recovery/room-queue`
- `POST /api/dead-letter/room-jobs/:jobId/retry`

## Troubleshooting Shortcuts

- Outbound stuck in pending approvals: check `mailctl approvals trace <roomKey>` and run `approve`/`reject`.
- Room state unclear: use `mailctl replay <roomKey>` and mailbox view/feed inspection.
- Provider sync unclear: check account provider state and watcher/recovery endpoints.
- Gateway lineage unclear: inspect `gateway trace` and room replay together.

## Known Operator Gaps

- A first-party read-only operator console is shipped at `/console`, but it is not yet a write-capable mailbox client.
- CLI output is still mostly JSON and command-tree ergonomics are still evolving.
- Gateway ingress/egress projection is available through APIs, but not yet fully auto-wired to upstream Workbench event flows.
- Upstream embedded runtime/session-manager first-class wiring and full backend enforcement closeout remain residual work (`plan12`).
