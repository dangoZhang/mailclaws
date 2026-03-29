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
  <a href="./docs/index.md">Docs</a> ·
  <a href="https://github.com/dangoZhang/mailclaw/actions/workflows/ci.yml">CI</a> ·
  <a href="https://github.com/dangoZhang/mailclaw/actions/workflows/release.yml">Release</a>
</p>

MailClaw turns email conversations into durable rooms. It keeps room truth, internal agent mail, approvals, replay, and governed outbound delivery in one runtime that can live beside OpenClaw.

MailClaw does not assume one mailbox vendor. Start with the email address you already use, let MailClaw recommend the provider path, and connect it. The built-in paths cover common hosted providers plus generic IMAP/SMTP.

## Why MailClaw

- keep one external conversation as one durable room
- let agents collaborate through internal mail instead of sharing one giant transcript
- keep long-term memory as compact Pre snapshots instead of raw scratch traces
- inspect approvals, outbox, replay, and internal agent mail from the same workbench
- mount Mail as a tab inside the OpenClaw-style Gateway workbench

## Install

Runtime requirement: Node.js 22+.

```bash
./install.sh
```

You can also use the package managers described in the docs:

- npm
- pnpm
- Homebrew

## First Run

```bash
pnpm install
MAILCLAW_FEATURE_MAIL_INGEST=true pnpm mailclaw
```

Then in a second terminal:

```bash
pnpm mailclaw onboard you@example.com
pnpm mailclaw login
pnpm mailclaw dashboard
```

Recommended first-run flow:

1. Start MailClaw.
2. Connect one mailbox you already use.
3. Send one test email from another mailbox.
4. Open the `Mail` tab in the Gateway-style workbench.
5. Inspect the room, internal agent mail, and delivery state.

If you only want a local demo first:

```bash
pnpm demo:mail
```

Then open `http://127.0.0.1:3020/workbench/mail`.

## What You See In The Workbench

- `Accounts`: connected mailboxes and provider state
- `Rooms`: durable external conversations
- `Mailboxes`: virtual mailboxes for public agents and internal roles
- `Approvals`: outbound mail waiting for approval
- `Mail`: the OpenClaw-style integrated Mail tab

MailClaw keeps internal collaboration visible. You can inspect which agent took a task, which worker replied, which review blocked a draft, and which approved result finally reached the outbox.

## Multi-Agent Model

MailClaw separates three things:

- `Room`: durable truth for one external conversation
- `Virtual Mail`: internal communication between agents
- `Pre`: compact state that survives after each round of work

Durable agents keep their own `SOUL.md`, role mailboxes, and collaboration rules. One-off subagents are burst workers. Their output only becomes business truth after it is normalized into internal reply mail and merged back into the room.

## Relationship With OpenClaw

MailClaw is designed to sit on top of the OpenClaw ecosystem, not replace it. It reuses Gateway-style entry points and workbench patterns, while adding:

- room-first truth instead of session-first truth
- email-native threading and provider ingestion
- virtual mail between agents
- approval and outbox governance
- replay and recovery for mail operations

## Documentation

The docs are the canonical product guide:

- Docs index: [docs/index.md](./docs/index.md)
- Getting started: [docs/getting-started.md](./docs/getting-started.md)
- Core concepts: [docs/concepts.md](./docs/concepts.md)
- Multi-agent workflows: [docs/multi-agent-workflows.md](./docs/multi-agent-workflows.md)
- Operator console: [docs/operator-console.md](./docs/operator-console.md)

The repository already includes a GitHub Pages workflow. Once the repository plan supports Pages for this repo, the same docs will publish as a static site without changing the docs source.

Run the docs locally:

```bash
pnpm docs:dev
```

Build the static docs site:

```bash
pnpm docs:build
```

## Status

MailClaw already ships:

- room kernel and replay
- provider onboarding and mailbox login
- IMAP, SMTP, Gmail, and raw RFC822 ingress paths
- virtual mailboxes and internal mail projection
- approval-gated outbound delivery
- OpenClaw-style embedded Mail workbench integration

Current boundaries are documented here:

- [docs/security-boundaries.md](./docs/security-boundaries.md)

## License

MIT. See [LICENSE](./LICENSE).
