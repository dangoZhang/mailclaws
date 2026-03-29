---
layout: home

hero:
  name: MailClaw
  text: Email Work That Keeps Its Shape
  tagline: MailClaw turns email conversations into durable rooms, lets agents collaborate through internal mail, and keeps long-term memory as compact Pre state instead of a growing transcript.
  actions:
    - theme: brand
      text: Start In 3 Minutes
      link: /getting-started#three-minute-first-mail
    - theme: alt
      text: Core Concepts
      link: /concepts
    - theme: alt
      text: Mail Workbench
      link: /operator-console

features:
  - title: Rooms Are The Truth Boundary
    details: Each real conversation becomes a room with revisioned state, replayable history, and stable continuity across inbound mail, drafts, approvals, and delivery.
  - title: Internal Agent Mail Uses Mail Semantics
    details: Agents do not share one giant transcript. They collaborate through virtual mailboxes, work threads, single-parent replies, and reducer-based fan-in.
  - title: Pre-First Memory Stays Small
    details: MailClaw keeps durable summaries, facts, decisions, and commitments as Pre state. Scratch traces and failed attempts stay out of long-term memory by default.
  - title: Outbound Is Governed
    details: External side effects go through drafts, review, approval, and outbox intents. Worker runs and internal mail cannot bypass that gate.
  - title: One Mail Tab For The Whole Story
    details: Accounts, rooms, mailboxes, and approvals stay visible from the same OpenClaw-aligned Mail tab, with direct deep links when you need them.
---

## Why MailClaw

Most agent systems treat email as just another transport. MailClaw does not.

MailClaw treats email as the working surface itself:

- external email becomes durable room state
- internal multi-agent collaboration becomes virtual mail
- memory becomes compact Pre snapshots instead of raw transcript accumulation
- outbound delivery stays behind approval and outbox control

That gives you a model that fits how email users already work, while still staying inspectable for operators and extensible for multi-agent systems.

## The Core Loop

1. Connect one mailbox you already use.
2. A new inbound message opens or updates a room.
3. Agents work through internal mailboxes and work threads.
4. Durable Pre state records what should be carried forward.
5. The Mail tab lets you inspect rooms, mailboxes, and approvals in one place.

See [Getting Started](./getting-started.md) for the shortest setup path.

## The Four Core Ideas

### 1. Room

A room is the durable context for one external conversation.

- continuity comes from reply structure and provider hints, not a chat transcript
- the room carries revision, participants, artifacts, approvals, and replay history
- when a new reply arrives, old stale work is invalidated instead of silently merged

### 2. Virtual Mail

Agents collaborate through virtual mail, not a shared blob of context.

- each agent can have public and internal mailboxes
- internal replies are single-parent
- fan-out and fan-in are explicit, with reducers responsible for convergence
- internal collaboration is inspectable without polluting the external thread

### 3. Pre

MailClaw uses a pre-first memory model.

- agents work in temporary scratch space
- at the end of a turn, the useful result is compressed into durable Pre state
- the next turn loads latest inbound + latest room Pre + selected refs
- this keeps prompts smaller and memory cleaner over long-running rooms

### 4. Governed Delivery

MailClaw separates thinking from side effects.

- workers can produce drafts, evidence, and recommendations
- real external delivery only happens through review, approval, and outbox
- replay, audit, and approval lineage stay attached to the room

## Start Here

- [Getting Started](./getting-started.md): install, connect one mailbox, send one email, and read the thread
- [Core Concepts](./concepts.md): room, virtual mail, Pre, approval, and workbench model
- [Multi-Agent Collaboration](./multi-agent-workflows.md): how internal mailboxes, work threads, deliveries, and reducers appear in the workbench
- [Mail Workbench](./operator-console.md): what each tab shows and how to navigate it
- [Integrations](./integrations.md): provider coverage, OAuth, and OpenClaw/Gateway fit

## For OpenClaw Users

MailClaw is designed to fit into an OpenClaw-shaped workflow:

- start the runtime with `mailclaw` or `mailclaw gateway`
- open the host console with `mailclaw dashboard`
- click `Mail` to enter the MailClaw workbench
- use `mailclaw open` only as the direct fallback route

The goal is not to replace the OpenClaw shell. The goal is to add an email-native runtime and Mail tab that understands rooms, virtual mail, Pre memory, and governed delivery.
