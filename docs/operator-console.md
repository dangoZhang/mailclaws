# Mail Workbench

The Mail workbench is the user-facing surface for MailClaws.

In the intended setup, it appears as the `Mail` tab inside OpenClaw/Gateway. The direct `/workbench/mail` route exists as a fallback and deep-link target.

## Open It

Preferred path:

```bash
mailclaws dashboard
```

Then sign in to OpenClaw/Gateway and click `Mail`.

Direct fallback:

```bash
mailclaws open
```

## What Each Tab Means

### Mail

The entry surface for setup and mailbox connection.

Use it when:

- you are connecting a mailbox for the first time
- you want the recommended provider path
- you want one-click agent templates
- you want to create a custom durable agent
- you want to inspect the current agent directory and HeadCount suggestions
- you want the shortest path back into the Mail tab

### Accounts

The account-level view.

Use it when:

- you want to confirm a mailbox is connected
- you want to check provider posture and general health
- you want to jump into recent rooms or mailbox views for that account

### Rooms

The room-level view.

Use it when:

- you want to inspect a conversation as durable state
- you want to see revision, participants, approvals, and replay-visible timeline
- you want to understand why the latest reply looks the way it does
- you want to inspect virtual mail, mailbox deliveries, and governed outbox state for one room

### Mailboxes

The internal collaboration view.

Use it when:

- you want to inspect one public or internal mailbox
- you want to understand what one agent role saw
- you want to inspect internal collaboration without reading the whole room timeline first

### Approvals

The governed side-effects view.

Use it when:

- you want to inspect pending outbound approval work
- you want to review or trace what must happen before external delivery

## Typical User Flow

The most common path is:

1. open `Accounts`
2. select the connected mailbox account
3. open the new room
4. if needed, jump to one mailbox participant
5. if needed, inspect `Approvals` before delivery

This mirrors the runtime model:

- account gives you provider and mailbox scope
- room gives you durable truth
- mailbox gives you collaboration detail
- approvals give you side-effect control

## Multi-Agent Collaboration In One Room

When you open a room, read these sections in order:

1. `Room Summary`
2. `Virtual Mail`
3. `Mailbox Deliveries`
4. `Governed Outbox`
5. `Gateway Projection`

This gives you a clean explanation of:

- which internal roles participated
- which mailbox received which task or reply
- whether delivery rows were consumed or marked stale
- which internal result became an external send candidate

If you then want one mailbox-local view, click a mailbox chip from the room.

## Deep Links

Useful direct routes:

- `/workbench/mail`
- `/workbench/mail?mode=accounts`
- `/workbench/mail?mode=rooms`
- `/workbench/mail?mode=mailboxes`
- `/workbench/mail?mode=approvals&approvalStatus=requested`
- `/workbench/mail/accounts/:accountId`
- `/workbench/mail/rooms/:roomKey`
- `/workbench/mail/mailboxes/:accountId/:mailboxId`

These routes are meant to make navigation stable whether you entered from Gateway or from the direct fallback URL.

## What This Surface Is For

The Mail workbench is designed to explain the system in operationally useful terms:

- connected accounts
- durable rooms
- internal/public mailboxes
- approval state

It is not meant to be just another generic chat transcript viewer.

## Related Reading

- [Core Concepts](./concepts.md)
- [Multi-Agent Collaboration](./multi-agent-workflows.md)
- [Getting Started](./getting-started.md)
- [Integrations](./integrations.md)
