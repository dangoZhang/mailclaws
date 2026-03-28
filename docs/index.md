---
layout: home

hero:
  name: MailClaw
  text: Connect A Mailbox And Send A First Test Mail In 3 Minutes
  tagline: MailClaw keeps email context durable in rooms, runs multi-agent collaboration with virtual mail, and lets operators inspect everything from one console.
  actions:
    - theme: brand
      text: 3-Min First Mail
      link: /getting-started#three-minute-first-mail
    - theme: alt
      text: Open Operator Console
      link: /operator-console
    - theme: alt
      text: Release Bundle
      link: /getting-started#release-bundle

features:
  - title: Email Context That Sticks
    details: Every inbound email lands in a room with revision history, replay, approvals, and delivery traces.
  - title: Pre-First Room Memory
    details: Agents carry forward durable room pre snapshots and facts, not an ever-growing transcript.
  - title: Internal Agent Mailboxes
    details: Agents collaborate through virtual mailbox threads, so you can inspect internal collaboration without polluting external email threads.
  - title: Safe Outbound By Default
    details: Real sends are governed by outbox intents and approval flow, not direct worker side effects.
  - title: One Operator Surface
    details: "`/console` and `mailctl` expose rooms, inboxes, mailbox feeds, approvals, and gateway projection traces in one workflow."
---

## Start Here (3 Minutes)

1. Start runtime: `pnpm dev`
2. Connect your mailbox: `pnpm mailctl connect login`
3. Verify account and open console:
   - `pnpm mailctl observe accounts`
   - `http://127.0.0.1:3000/console`
   - `http://127.0.0.1:3000/console/connect`
4. After the first inbound, inspect the durable room summary with `pnpm mailctl replay <roomKey>`

Then run the first-mail flow in [Getting Started](./getting-started.md#three-minute-first-mail).

## Fastest Install Choices

- From source:
  `pnpm install && pnpm dev`
- Build static docs locally:
  `pnpm docs:build`
- Build a distributable runtime bundle:
  `pnpm package:release`
- Install from the generated local artifacts:
  `npm install -g ./output/release/npm/mailclaw-<version>.tgz`
  `pnpm setup && pnpm add -g "file://$PWD/output/release/npm/mailclaw-<version>.tgz"`
  `brew install ./output/release/homebrew/mailclaw.rb`

The release bundle writes both an unpacked directory and a `.tar.gz` archive under `output/release/`.

## Discover Internal Agent Mailboxes

- Open `/console/accounts/:accountId` to pick an account and jump into room or mailbox detail.
- Open `/console/connect` to start from a mailbox address and get a recommended provider path.
- Open `/console/mailboxes/:accountId/:mailboxId` to inspect one agent mailbox feed.
- Open `/console/rooms/:roomKey` to correlate external mail state with internal agent collaboration traces.
- CLI mirror:
  - `pnpm mailctl observe mailbox-feed <accountId> <mailboxId>`
  - `pnpm mailctl observe mailbox-view <roomKey> <mailboxId>`

## Agent Behavior Defaults

- Every agent workspace auto-creates `SOUL.md`, `AGENTS.md`, `MEMORY.md`, plus `roles/mail-read.default.md` and `roles/mail-write.default.md`.
- Prompt assembly now favors latest inbound + latest room pre snapshot + refs, instead of replaying a full transcript by default.
- ACK, progress, and final messages are rendered from persisted Pre state so replay and operator views line up with what the agent actually carried forward.
- The shipped prompt-footprint benchmark currently measures roughly `62%` to `78%` less orchestrator prompt volume than conservative transcript-first baselines. See [Prompt Footprint](./prompt-footprint.md).

## Reference Paths

- [Getting Started](./getting-started.md): 3-minute path plus provider/gateway/internal-agent smoke paths.
- [Prompt Footprint](./prompt-footprint.md): reproducible benchmark for prompt-volume savings versus transcript-first baselines.
- [Operator Console](./operator-console.md): `/console` routes, filters, and inbox/mailbox inspection model.
- [Operators Guide](./operators-guide.md): day-2 operations, replay, resend, approvals, recovery, and troubleshooting.
- [Integrations](./integrations.md): provider coverage, OAuth, inbound/outbound wiring, and OpenClaw compatibility.
- [Security Boundaries](./security-boundaries.md): trust model, redaction scope, and what is intentionally not isolated yet.

## Release Reality

- Shipped now: runtime kernel, provider ingestion/delivery seams, gateway projection APIs, replay and approval flows, and a read-only `/console` operator surface.
- Not shipped yet: a full Outlook-like mailbox client, Workbench mailbox tab integration, and automatic end-to-end Gateway round-trip wiring.
- Validate before release: run [Live Provider Smoke](./live-provider-smoke.md) and review [ADR-001 Architecture](./adr/ADR-001-architecture.md) for design constraints.

## Current Boundary

- A documentation website now ships from this repository via `pnpm docs:dev` and `pnpm docs:build`.
- The runtime and read-only operator console are documented; a full Outlook-like mailbox client inside OpenClaw Workbench is still not shipped in this repository.
