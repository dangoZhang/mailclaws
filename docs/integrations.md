# Integrations

This page explains how MailClaw connects to the outside world.

MailClaw is built to sit on top of real email systems and, when needed, inside an OpenClaw/Gateway host workflow.

## Integration Model

MailClaw separates responsibilities:

- providers move mail in and out
- rooms keep durable truth
- virtual mail handles internal agent collaboration
- approvals and outbox govern external side effects
- the Mail tab lets users inspect the whole system

That means MailClaw can connect to existing mailbox providers without treating any one provider as the system of record.

## Which Mailbox Paths Are Supported

MailClaw currently supports three practical connection paths.

### 1. OAuth Mailboxes

Best choice when available.

Supported:

- Gmail
- Outlook / Microsoft 365

Why choose this path:

- lowest setup friction
- better provider-native delivery and watch integration
- best fit for normal end users

### 2. IMAP / SMTP Mailboxes

Best choice when OAuth is unavailable or inconvenient.

Common presets include:

- QQ
- iCloud
- Yahoo
- 163 / 126
- generic IMAP / SMTP

Why choose this path:

- works across many traditional mail providers
- useful for teams using existing mailbox credentials

### 3. Forward / Raw MIME Ingress

Best choice when you cannot yet use provider-native mailbox integration.

Why choose this path:

- simple migration path
- useful for staged adoption
- lets MailClaw receive mail even when native watch support is not available yet

## Recommended Order For Users

If you only know the mailbox address and want the easiest path:

```bash
mailclaw onboard you@example.com
mailclaw login
```

If you want to inspect supported paths first:

```bash
mailclaw providers
```

General recommendation:

1. use Gmail or Outlook OAuth when possible
2. use IMAP / SMTP when OAuth is not available
3. use forward/raw MIME as the fallback path

## OpenClaw / Gateway Fit

MailClaw is designed to fit into an OpenClaw-shaped workflow.

Use it like this:

1. start MailClaw
2. run `mailclaw dashboard`
3. sign in to OpenClaw/Gateway
4. click `Mail`

In that setup:

- OpenClaw/Gateway remains the host shell
- MailClaw provides the Mail tab and email-native runtime semantics
- direct `/workbench/mail` access remains available as a fallback

## Inbound Paths

MailClaw can receive mail through:

- provider-native watchers and fetchers
- normalized API ingress
- raw MIME ingress
- Gateway event projection

Typical examples:

- Gmail watch/history
- IMAP fetch and polling
- `POST /api/inbound`
- `POST /api/inbound/raw`
- `POST /api/gateway/events`

## Outbound Paths

MailClaw can deliver external mail through:

- Gmail API send
- SMTP
- governed outbox delivery flows

The key design rule is constant:

real external send happens through approval and outbox control, not directly from worker execution.

## OAuth And Account Setup

Useful commands:

```bash
mailclaw providers
mailclaw login
mailctl connect providers [provider]
mailctl connect login gmail <accountId> [displayName]
mailctl connect login outlook <accountId> [displayName]
```

Useful APIs:

- `GET /api/connect`
- `GET /api/connect/providers`
- `GET /api/connect/providers/:provider`
- `POST /api/accounts`
- `GET /api/auth/:provider/start`
- `POST /api/auth/:provider/start`

## What To Read Next

- [Getting Started](./getting-started.md)
- [Core Concepts](./concepts.md)
- [Mail Workbench](./operator-console.md)
- [Operators Guide](./operators-guide.md)
