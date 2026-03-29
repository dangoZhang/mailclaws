# Operators Guide

This page is for people responsible for keeping MailClaw healthy in daily use.

It focuses on what to check when users say:

- “I sent an email, did the system receive it?”
- “Why did this room not reply?”
- “Why is outbound mail still waiting?”

## The Main Objects To Check

MailClaw operations are easiest when you follow the same object model the runtime uses:

- `account`: one connected mailbox and its provider posture
- `room`: the durable truth boundary for one conversation
- `mailbox`: the internal or public collaboration view
- `approval`: gated external side effects

## First-Line Triage

When a user says “I sent an email, what happened?”, check in this order.

### 1. Account

Confirm the connected mailbox exists and looks healthy.

Useful commands:

```bash
mailclaw accounts
mailclaw accounts show <accountId>
```

Useful API:

- `GET /api/accounts/:accountId/provider-state`

### 2. Room

Confirm MailClaw created or updated the room.

Useful commands:

```bash
mailclaw rooms
mailclaw replay <roomKey>
```

### 3. Mailbox View

If the room exists but behavior is unclear, inspect the related mailbox or inbox view.

Useful commands:

```bash
mailclaw inboxes <accountId>
mailctl observe mailbox-feed <accountId> <mailboxId>
mailctl observe mailbox-view <roomKey> <mailboxId>
```

### 4. Approval State

If the system prepared an answer but did not send it, check approval state next.

Useful commands:

```bash
mailctl observe approvals room <roomKey>
mailctl operate deliver-outbox
```

## Workbench Path

The browser workbench mirrors the same triage flow:

1. open `Accounts`
2. open the mailbox account
3. open the room
4. jump into a mailbox if collaboration detail is needed
5. open `Approvals` if delivery is blocked

Useful deep links:

- `/workbench/mail?mode=accounts`
- `/workbench/mail?mode=rooms`
- `/workbench/mail?mode=mailboxes`
- `/workbench/mail?mode=approvals&approvalStatus=requested`
- `/workbench/mail/accounts/:accountId`
- `/workbench/mail/rooms/:roomKey`
- `/workbench/mail/mailboxes/:accountId/:mailboxId`

## Common Situations

### Mail Was Sent But No Room Appears

Check:

- account/provider posture
- inbound path configuration
- whether the message reached MailClaw at all

Start with:

```bash
mailclaw accounts show <accountId>
mailclaw rooms
```

### Room Exists But There Is No Reply Yet

Check:

- the room replay
- internal mailbox activity
- approval state

Start with:

```bash
mailclaw replay <roomKey>
mailctl observe mailbox-view <roomKey> <mailboxId>
mailctl observe approvals room <roomKey>
```

### Outbound Delivery Looks Stuck

Check:

- whether approval is still pending
- whether delivery has been attempted
- whether the chosen provider path is healthy

Start with:

```bash
mailctl operate deliver-outbox
mailctl observe approvals room <roomKey>
```

## Useful APIs

Room and mailbox inspection:

- `GET /api/rooms/:roomKey/replay`
- `GET /api/rooms/:roomKey/approvals`
- `GET /api/rooms/:roomKey/mailboxes/:mailboxId`
- `GET /api/accounts/:accountId/inboxes`
- `GET /api/accounts/:accountId/mailbox-console`
- `GET /api/accounts/:accountId/mailboxes/:mailboxId/feed`

Console read models:

- `GET /api/console/workbench`
- `GET /api/console/accounts`
- `GET /api/console/rooms`
- `GET /api/console/approvals`

Delivery and recovery:

- `POST /api/outbox/:outboxId/approve`
- `POST /api/outbox/:outboxId/reject`
- `POST /api/outbox/deliver`
- `POST /api/recovery/room-queue`

## Practical Rule

If something is unclear, inspect in this order:

1. account
2. room
3. mailbox
4. approval

That order matches the way MailClaw itself is structured, so it usually gets you to the answer faster than starting from raw execution traces.
