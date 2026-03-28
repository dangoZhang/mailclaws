# Operator Console

<p align="center">
  <a href="./operator-console.md"><strong>English</strong></a> ·
  <a href="./operator-console.zh-CN.md">简体中文</a> ·
  <a href="./operator-console.fr.md">Français</a>
</p>

MailClaw now ships a read-only operator console at `/console`. It is an operator/workbench surface for inspecting rooms, approvals, provider state, mailbox projections, and Gateway traces from one browser view.

The console also now includes a stable mailbox-first entry at `/console/connect`, so a user can start from a mailbox address and get onboarding guidance before diving into rooms or mailbox feeds.

## Entry Points

- `/console`
- `/console/connect`
- `/console/accounts/:accountId`
- `/console/inboxes/:accountId/:inboxId`
- `/console/rooms/:roomKey`
- `/console/mailboxes/:accountId/:mailboxId`

These routes are deep-link stable. Query parameters currently cover the first UI filter set:

- `status`
- `originKind`
- `mailboxId`
- `approvalStatus`

## 30-Second Mailbox Discovery Path

For email-native operators, the fastest way to find internal agent collaboration is:

1. Open `/console/accounts/:accountId`
2. Click a room that just received mail
3. From room detail, open one mailbox participant
4. Land on `/console/mailboxes/:accountId/:mailboxId` to inspect delivery/feed state

CLI mirrors the same inspection path:

- `pnpm mailctl mailbox feed <accountId> <mailboxId>`
- `pnpm mailctl mailbox view <roomKey> <mailboxId>`

## What The First Slice Covers

- `Accounts`: health, provider mode, room counts, pending approvals
- `Rooms`: room list with state, attention level, origins, approvals, and delivery counts
- `Detail`: room summary, timeline, gateway projection trace including automatic outcome projection records, mailbox participation, inbox-first detail when opened from a public inbox deep link, or mailbox-first detail when opened from a mailbox deep link
- `Provider + Mailboxes`: provider state summary, inbox policy summary, mailbox cards, mailbox feed
- `Approvals`: pending or historical approval items with room jump links

Release polish in this slice:

- The hero now includes an explicit boundary status strip (read-only surface, mailbox-client boundary, Workbench tab status, gateway round-trip status).
- A workbench-style tab strip now exposes `Connect`, `Accounts`, `Rooms`, `Mailboxes`, and `Approvals` as stable top-level console views.
- Room detail now includes timeline category counters (`provider`, `ledger`, `virtual_mail`, `approval`, `delivery`) to speed incident triage.
- Room cards now surface an explicit attention label (`stable | watch | critical`) so operators can prioritize quickly.

## Data Sources

The console is kernel-first and API-first:

- `GET /api/console/workbench`
- `GET /api/console/terminology`
- `GET /api/console/accounts`
- `GET /api/console/rooms`
- `GET /api/console/approvals`
- `GET /api/accounts/:accountId/mailbox-console`
- `GET /api/accounts/:accountId/mailboxes/:mailboxId/feed`

The page does not read storage tables directly and does not depend on Gateway transcript state as truth.
The latest UI slice can hydrate from the aggregated `GET /api/console/workbench` read model while the narrower endpoints remain available for inspection and compatibility.

## Current Boundaries

- The console is read-only in this phase.
- It is an operator console, not a full Outlook-like mailbox client.
- No OpenClaw Workbench mailbox tab is shipped yet.
- Gateway outcome traces are visible once a room is Gateway-bound, but full Gateway auto-ingress/Workbench production wiring is still incomplete.
