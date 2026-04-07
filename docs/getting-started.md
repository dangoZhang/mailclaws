# Getting Started

This page is the shortest path from zero to one working mailbox conversation.

If you already know what MailClaws is, jump to [Send Your First Real Email](#three-minute-first-mail).

## What You Need

- Node.js 22+
- one mailbox you want MailClaws to connect
- another mailbox or mail client to send a test email from

MailClaws does not assume one provider. Built-in connection paths cover Gmail, Outlook, QQ, iCloud, Yahoo, 163/126, and generic IMAP/SMTP accounts.

## Install

Recommended:

```bash
./install.sh
```

Other supported paths:

```bash
npm install -g mailclaws
pnpm setup && pnpm add -g mailclaws
brew install mailclaws
```

If you are running from source:

```bash
pnpm install
```

## Start MailClaws

```bash
MAILCLAW_FEATURE_MAIL_INGEST=true \
mailclaws
```

This starts the local runtime and the Mail tab backend.

## Connect One Mailbox

Recommended path:

```bash
mailclaws onboard you@example.com
mailclaws login
```

What these do:

- `mailclaws onboard` recommends the easiest provider path from the mailbox address
- `mailclaws login` walks you through the actual account connection flow

If you already know the provider path you want, use:

```bash
mailclaws providers
```

## Open The Mail Tab

Preferred host flow:

```bash
mailclaws dashboard
```

Then sign in to OpenClaw/Gateway and click `Mail`.

Direct fallback:

```bash
mailclaws open
```

or open:

```text
http://127.0.0.1:3000/workbench/mail
```

<a id="three-minute-first-mail"></a>

## Send Your First Real Email {#three-minute-first-mail}

1. Connect one mailbox with `mailclaws login`.
2. Copy the connected address from the Mail tab or `mailclaws accounts`.
3. Send one email to that address from another mailbox.
4. Open the Mail tab.
5. Open the connected account, then the new room.

That is the core MailClaws loop:

- a new outside thread creates a new room
- replies on that thread return to the same room
- the front desk agent works inside that room and recruits help through virtual mail
- you inspect the result from the Mail tab

## What You Will See

After the first message arrives, the Mail tab gives you four useful views:

- `Accounts`: which mailboxes are connected and healthy
- `Rooms`: the durable conversation state
- `Mailboxes`: internal and public mailbox views for agent collaboration
- `Approvals`: gated outbound work waiting for review

If you want to inspect internal agent collaboration after the first message:

- open a room
- inspect `Virtual Mail`, `Mailbox Deliveries`, and `Governed Outbox`
- click a mailbox participant if you want one role-local feed
- inspect the mailbox feed and room-local collaboration state

By default, the room is the working memory. Durable agents keep their `SOUL.md`, routing identities, and long-term memory, but they do not own the live context outside the room.

## For OpenClaw Users

If you already use OpenClaw, keep the same outer workflow:

1. start MailClaws
2. run `mailclaws dashboard`
3. enter the host console
4. click `Mail`

MailClaws is meant to feel like an extra Mail tab inside the existing OpenClaw shell, not like a separate console you have to learn first.

## Next Steps

- [Core Concepts](./concepts.md)
- [Multi-Agent Collaboration](./multi-agent-workflows.md)
- [Mail Workbench](./operator-console.md)
- [Integrations](./integrations.md)
